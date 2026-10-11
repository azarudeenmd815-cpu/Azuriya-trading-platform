import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TenantContext } from '../../shared/types.js';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import { scopeValues, scopeWhere } from './common.js';

const amountPattern = /^-?(?:0|[1-9]\d{0,27})(?:\.\d{1,8})?$/;
const idempotencyPattern = /^[A-Za-z0-9_.:-]{8,128}$/;
const uuid = z.uuid();
const kinds = ['opening_balance', 'deposit', 'withdrawal', 'transfer', 'realized_pnl', 'unrealized_pnl', 'commission', 'fee', 'swap', 'adjustment', 'reversal'] as const;
export type LedgerEntryKind = typeof kinds[number];
export type ReconciliationStatus = 'MATCHED' | 'MISMATCHED' | 'NOT_COMPARABLE';
export interface LedgerEntryInput { account_id: string; currency: string; amount: string; kind: LedgerEntryKind; idempotency_key: string; reference?: string; status?: 'posted' | 'pending' | 'void' | 'rejected' }
export interface LedgerEntry { id: string; account_id: string; currency: string; kind: LedgerEntryKind; amount: string; status: string; sequence: string; idempotency_key: string; reference: string | null; created_at: string }
export interface BalanceResult { account_id: string; currency: string; balance: string; entry_count: number; watermark: string | null; evaluated_at: string }
export interface ReconciliationResult extends BalanceResult { organization_id: string; ledger_derived_balance: string; stored_balance: string | null; difference: string | null; status: ReconciliationStatus }
interface AccountSnapshot {
  account_currency: string;
  balance: string;
  entry_count: number;
  watermark: string | null;
  evaluated_at: string;
  stored_balance: string | null;
  difference: string | null;
}

function validCurrency(currency: string): void { if (!/^[A-Z]{3}$/.test(currency)) throw new AppError(422, 'LEDGER_CURRENCY_INVALID', 'Currency must be a three-letter uppercase code.'); }
function validAccountId(accountId: string): void { if (typeof accountId !== 'string' || !uuid.safeParse(accountId).success) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.'); }
function validAmount(amount: string): void { if (typeof amount !== 'string' || !amountPattern.test(amount) || /^-?0(?:\.0{1,8})?$/.test(amount)) throw new AppError(422, 'LEDGER_AMOUNT_INVALID', 'Ledger amounts must be non-zero exact decimals with at most eight fractional places.'); }
function validIdempotency(key: string): void { if (typeof key !== 'string' || !idempotencyPattern.test(key)) throw new AppError(422, 'LEDGER_IDEMPOTENCY_INVALID', 'Ledger idempotency keys must contain 8-128 safe characters.'); }
function validReference(reference?: string): void { if (reference !== undefined && (!reference.trim() || reference.length > 200)) throw new AppError(422, 'LEDGER_REFERENCE_INVALID', 'Ledger references must contain between 1 and 200 characters.'); }
function normalize(value: string): string { const negative = value.startsWith('-'); const unsigned = negative ? value.slice(1) : value; const [whole, fraction = ''] = unsigned.split('.'); const normalized = `${whole}.${fraction.padEnd(8, '0')}`; return `${negative && normalized !== '0.00000000' ? '-' : ''}${normalized}`; }
function validateScope(scope: TenantContext): void {
  const candidate = scope as Partial<TenantContext> | null | undefined;
  const uuidFields = [candidate?.userId, candidate?.organizationId, candidate?.brandId, candidate?.environmentId, candidate?.productInstanceId];
  if (!candidate || candidate.core || candidate.productSlug !== 'brokerage-crm' || uuidFields.some(value => typeof value !== 'string' || !uuid.safeParse(value).success) || typeof candidate.requestId !== 'string' || candidate.requestId.length < 1 || candidate.requestId.length > 200 || !Array.isArray(candidate.permissions)) {
    throw new AppError(403, 'TENANT_CONTEXT_REQUIRED', 'A complete authenticated brokerage tenant context is required.');
  }
}

export class BrokerageLedgerService {
  constructor(private readonly db: Database) {}

  private async account(tx: Executor, scope: TenantContext, accountId: string, currency: string): Promise<void> {
    const row = (await tx.query<{ currency: string }>(`SELECT currency FROM brokerage_accounts WHERE ${scopeWhere()} AND id=$5`, [...scopeValues(scope), accountId])).rows[0];
    if (!row) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.');
    if (row.currency !== currency) throw new AppError(422, 'ACCOUNT_CURRENCY_MISMATCH', 'The account denomination does not match the requested ledger currency.');
  }

  async postEntry(scope: TenantContext, input: LedgerEntryInput): Promise<LedgerEntry> {
    validateScope(scope);
    validAccountId(input.account_id); validCurrency(input.currency); validAmount(input.amount); validIdempotency(input.idempotency_key); validReference(input.reference);
    if (!kinds.includes(input.kind)) throw new AppError(422, 'LEDGER_KIND_INVALID', 'The ledger entry kind is not supported.');
    const amount = normalize(input.amount);
    return this.db.transaction(scope, async tx => {
      await this.account(tx, scope, input.account_id, input.currency);
      const existing = (await tx.query<LedgerEntry>(`SELECT id,account_id,currency,kind,amount::text,status,sequence::text,idempotency_key,reference,created_at::text FROM brokerage_ledger_entries WHERE ${scopeWhere()} AND account_id=$5 AND currency=$6 AND idempotency_key=$7`, [...scopeValues(scope), input.account_id, input.currency, input.idempotency_key])).rows[0];
      if (existing) {
        if (existing.kind !== input.kind || normalize(existing.amount) !== amount || existing.status !== (input.status ?? 'posted') || existing.reference !== (input.reference ?? null)) throw new AppError(409, 'LEDGER_IDEMPOTENCY_CONFLICT', 'The ledger idempotency key was already used for different entry data.');
        return { ...existing, amount: normalize(existing.amount) };
      }
      const row = (await tx.query<LedgerEntry>(`INSERT INTO brokerage_ledger_entries(id,organization_id,brand_id,environment_id,product_instance_id,account_id,currency,kind,amount,status,idempotency_key,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,$13) ON CONFLICT(organization_id,brand_id,environment_id,product_instance_id,account_id,currency,idempotency_key) DO NOTHING RETURNING id,account_id,currency,kind,amount::text,status,sequence::text,idempotency_key,reference,created_at::text`, [randomUUID(), ...scopeValues(scope), input.account_id, input.currency, input.kind, amount, input.status ?? 'posted', input.idempotency_key, input.reference ?? null, scope.userId])).rows[0];
      if (row) return { ...row, amount: normalize(row.amount) };
      const replay = (await tx.query<LedgerEntry>(`SELECT id,account_id,currency,kind,amount::text,status,sequence::text,idempotency_key,reference,created_at::text FROM brokerage_ledger_entries WHERE ${scopeWhere()} AND account_id=$5 AND currency=$6 AND idempotency_key=$7`, [...scopeValues(scope), input.account_id, input.currency, input.idempotency_key])).rows[0];
      if (replay && replay.kind === input.kind && normalize(replay.amount) === amount && replay.status === (input.status ?? 'posted') && replay.reference === (input.reference ?? null)) return { ...replay, amount: normalize(replay.amount) };
      throw new AppError(409, 'LEDGER_IDEMPOTENCY_CONFLICT', 'The ledger idempotency key was already used for different entry data.');
    });
  }

  private async snapshot(tx: Executor, scope: TenantContext, accountId: string, currency: string, withProjection: boolean): Promise<AccountSnapshot> {
    // One statement gives account ownership, cash and projection a common
    // READ COMMITTED snapshot. Do not split these reads across queries.
    const row = (await tx.query<AccountSnapshot>(`
      SELECT a.currency AS account_currency, l.balance::text, l.entry_count, l.watermark,
        statement_timestamp()::text AS evaluated_at, p.balance::text AS stored_balance,
        (l.balance - p.balance)::numeric(38,8)::text AS difference
      FROM brokerage_accounts a
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(le.amount),0)::numeric(38,8) AS balance,
          COUNT(*)::int AS entry_count, MAX(le.sequence)::text AS watermark
        FROM brokerage_ledger_entries le
        WHERE ${scopeWhere('le')} AND le.account_id=a.id AND le.currency=a.currency
          AND a.currency=$6 AND le.status='posted' AND le.kind <> 'unrealized_pnl'
      ) l
      LEFT JOIN brokerage_account_balance_projections p
        ON ${scopeWhere('p')} AND p.account_id=a.id AND p.currency=a.currency
          AND a.currency=$6 AND $7::boolean
      WHERE ${scopeWhere('a')} AND a.id=$5`, [...scopeValues(scope), accountId, currency, withProjection])).rows[0];
    if (!row) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'The account does not exist in this scope.');
    if (row.account_currency !== currency) throw new AppError(422, 'ACCOUNT_CURRENCY_MISMATCH', 'The account denomination does not match the requested ledger currency.');
    return {
      ...row,
      balance: normalize(row.balance),
      stored_balance: row.stored_balance === null ? null : normalize(row.stored_balance),
      difference: row.difference === null ? null : normalize(row.difference),
    };
  }

  async balance(scope: TenantContext, accountId: string, currency: string): Promise<BalanceResult> {
    validateScope(scope);
    validAccountId(accountId); validCurrency(currency);
    return this.db.transaction(scope, async tx => {
      const { balance, entry_count, watermark, evaluated_at } = await this.snapshot(tx, scope, accountId, currency, false);
      return { account_id: accountId, currency, balance, entry_count, watermark, evaluated_at };
    });
  }

  async reconcile(scope: TenantContext, accountId: string, currency: string): Promise<ReconciliationResult> {
    validateScope(scope);
    validAccountId(accountId); validCurrency(currency);
    return this.db.transaction(scope, async tx => {
      const { balance, entry_count, watermark, evaluated_at, stored_balance, difference } = await this.snapshot(tx, scope, accountId, currency, true);
      return { account_id: accountId, organization_id: scope.organizationId, currency, balance, entry_count, watermark, evaluated_at, ledger_derived_balance: balance, stored_balance, difference, status: stored_balance === null ? 'NOT_COMPARABLE' : difference === '0.00000000' ? 'MATCHED' : 'MISMATCHED' };
    });
  }
}
