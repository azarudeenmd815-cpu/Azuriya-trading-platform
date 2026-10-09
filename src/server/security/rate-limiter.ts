import { createHash } from 'node:crypto';
import type { Database } from '../db/database.js';
import { AppError } from '../domain/errors.js';
export interface RatePolicy { key: string; limit: number; windowSeconds: number }
export class PostgresRateLimiter {
  constructor(private db: Database) {}
  async consume(policies: RatePolicy[]): Promise<{ remaining: number; reset: number; limit: number }> {
    try {
      const result = await this.db.transaction({ core: true }, async tx => {
        let remaining = Infinity; let reset = 0; let limit = Infinity; let denied = false;
        for (const policy of [...policies].sort((a, b) => a.key.localeCompare(b.key))) {
          const key = createHash('sha256').update(policy.key).digest('hex');
          const row = (await tx.query<{ hits: number; resets_at: Date | string }>(`INSERT INTO rate_limit_buckets(key,hits,resets_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limit_buckets.resets_at<=now() THEN 1 ELSE rate_limit_buckets.hits+1 END,resets_at=CASE WHEN rate_limit_buckets.resets_at<=now() THEN now()+$2*interval '1 second' ELSE rate_limit_buckets.resets_at END RETURNING hits,resets_at`, [key, policy.windowSeconds])).rows[0];
          remaining = Math.min(remaining, Math.max(0, policy.limit - row.hits)); limit = Math.min(limit, policy.limit);
          reset = Math.max(reset, Math.ceil(new Date(row.resets_at).getTime() / 1000)); denied ||= row.hits > policy.limit;
        }
        return { remaining, reset, limit, denied };
      });
      if (result.denied) throw new AppError(429, 'RATE_LIMITED', 'Request limit exceeded. Try again shortly.');
      return result;
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'RATE_LIMIT_UNAVAILABLE', 'Request protection is temporarily unavailable.'); }
  }
  async cleanup(): Promise<void> { await this.db.transaction({ core: true }, tx => tx.query("DELETE FROM rate_limit_buckets WHERE resets_at<now()-interval '1 hour'")).then(() => {}); }
}
