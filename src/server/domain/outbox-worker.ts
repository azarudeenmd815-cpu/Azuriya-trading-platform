import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '../db/database.js';
export interface OutboxEvent { id: string; organization_id: string | null; event_type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; lease_token: string }
export type EventHandler = (event: OutboxEvent) => Promise<void>;
export function retryDelay(attempt: number, random = Math.random): number { return Math.min(3600_000, 1000 * 2 ** Math.min(attempt, 12)) * (0.75 + random() * 0.5); }
export class OutboxWorker {
  readonly id: string;
  constructor(private db: Database, private handlers: Record<string, EventHandler>, private options: { id?: string; leaseMs?: number; fanout?: (tx: Executor, event: OutboxEvent) => Promise<void> } = {}) { this.id = options.id ?? `worker_${randomUUID()}`; }
  async claim(): Promise<OutboxEvent | undefined> {
    return this.db.transaction({ core: true }, async tx => {
      await tx.query("UPDATE outbox_events SET state='dead_letter',last_error='LEASE_EXHAUSTED',lease_until=NULL,lease_token=NULL WHERE state='processing' AND lease_until<=now() AND attempts>=max_attempts");
      return (await tx.query<OutboxEvent>(`WITH candidate AS(SELECT id FROM outbox_events WHERE attempts<max_attempts AND ((state='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=now())) OR (state='processing' AND lease_until<=now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE outbox_events e SET state='processing',attempts=e.attempts+1,last_attempt_at=now(),lease_token=$1,lease_until=now()+$2*interval '1 millisecond' FROM candidate c WHERE e.id=c.id RETURNING e.*`, [randomUUID(), this.options.leaseMs ?? 30_000])).rows[0];
    });
  }
  async runOnce(): Promise<boolean> {
    await this.db.transaction({ core: true }, tx => tx.query("INSERT INTO worker_heartbeats(id,seen_at,status) VALUES($1,now(),'running') ON CONFLICT(id) DO UPDATE SET seen_at=now(),status='running'", [this.id]));
    const event = await this.claim(); if (!event) return false;
    try {
      const handler = this.handlers[event.event_type];
      if (handler) await handler(event);
      else if (!this.options.fanout || ['invitation.email','brokerage.email'].includes(event.event_type)) throw new Error('HANDLER_UNAVAILABLE');
      await this.db.transaction({ core: true }, async tx => {
        const owned = (await tx.query('SELECT id FROM outbox_events WHERE id=$1 AND state=\'processing\' AND lease_token=$2 AND lease_until>now() FOR UPDATE', [event.id, event.lease_token])).rows[0];
        if (!owned) return;
        if (this.options.fanout) await this.options.fanout(tx, event);
        await tx.query("UPDATE outbox_events SET state='completed',published_at=now(),processed_at=now(),last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [event.id, event.lease_token]);
      });
    } catch {
      await this.db.transaction({ core: true }, async tx => {
        await tx.query("UPDATE outbox_events SET state=CASE WHEN attempts>=max_attempts THEN 'dead_letter' ELSE 'pending' END,last_error='HANDLER_FAILED',next_attempt_at=$1,lease_token=NULL,lease_until=NULL WHERE id=$2 AND lease_token=$3 AND lease_until>now()", [new Date(Date.now() + retryDelay(event.attempts)).toISOString(), event.id, event.lease_token]);
      });
    }
    return true;
  }
  async stop(): Promise<void> { await this.db.transaction({ core: true }, tx => tx.query("UPDATE worker_heartbeats SET status='stopped',seen_at=now() WHERE id=$1", [this.id])).then(() => {}); }
}
