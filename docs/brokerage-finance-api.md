# Brokerage finance and partner API

Staff base: `/api/v1/instances/:instanceId/brokerage`. Client base: `/api/v1/client/instances/:instanceId/brokerage`.

Responses use `{data: ...}`. Lists use `{data: [...], pagination: {total, limit, offset}}`; filter `limit`, `offset`, `status`, `client_id` (staff only) and `currency`. All monetary values are decimal strings, never JSON numbers. Every monetary POST requires `Idempotency-Key`. Mutations are atomic with audit and outbox events. Tenant, brand, environment, instance and client ownership apply to every operation.

| Resource | Staff operations | Client operations |
| --- | --- | --- |
| `/payment-methods` | GET, POST `{name,kind:manual\|provider,currencies:["USD"],deposit_enabled,withdrawal_enabled,enabled,provider_id?}`; PATCH `/:id` same fields | GET enabled public methods |
| `/finance-settings` | GET/PATCH `{maker_checker_required:boolean,referral_window_hours:integer}` | None |
| `/deposits` | GET; POST `{client_id,account_id,payment_method_id,amount,currency}`; POST `/:id/review` `{decision:clear\|reject,reason}`; POST `/:id/status` `{status,reason,reference?}` | GET own; POST same fields except `client_id`; POST `/:id/status` only cancellation |
| `/withdrawals` | Same as deposits; GET `/:id/destination` with high-risk confirmation | GET own; POST `{account_id,payment_method_id,amount,currency,destination:{beneficiary,account_number?,iban?,bank_name?,routing_number?,wallet_address?,network?}}`; cancellation only |
| `/transfers` | GET; POST `{client_id,source_account_id,destination_account_id,amount,currency}`; cancellation/rejection only while connector unavailable | GET own; POST same except client ID; cancellation only |
| `/transactions` | GET immutable workflow observations | GET own immutable observations |
| `/partners` | GET; POST `{client_id,campaign?}`; POST `/:id/status` `{status,reason}` | GET `/ib`; POST `/ib/apply` `{campaign?}` |
| `/referrals` | GET; POST `{client_id,referral_code,source?,campaign?}` | POST `/ib/attribution` `{referral_code,source?,campaign?}`; GET own attributed referrals inside `/ib` |
| `/commission-plans` | GET; POST/PATCH `/:id` `{name,kind:cpa\|revenue_share\|per_lot\|hybrid,currency,configuration:{cpa_amount?,revenue_share_percent?,per_lot_amount?},enabled}` | GET own assigned plan inside `/ib` |
| `/partners/:id/plan` | POST `{commission_plan_id}` | None |
| `/accruals` | GET; POST `{partner_id,commission_plan_id,client_id?,amount,currency,source_reference,reason}` | GET own via `/ib` |
| `/payouts` | GET; POST `{partner_id,accrual_ids:[UUID],destination}`; POST `/:id/review` `{decision,reason}`; POST `/:id/status` `{status,reason,reference?}`; GET `/:id/destination` | GET own; POST `{accrual_ids,destination}`; cancellation only |

Deposit flow: `pending → processing/requires_action → completed` or `failed/cancelled`; `completed → reversed` needs a new confirmed reference. Withdrawal/payout flow: `requested → review → approved → processing → paid`, with rejection/cancellation/failure paths. Reviews require a reason and create durable clearance. With maker/checker enabled by default, the maker, reviewer and approver must be distinct where applicable; the payment operator cannot be the maker. Approve/process/pay/completion/reversal and destination reveal require enrolled recent session MFA plus `x-reauth-password`; API credentials cannot perform these actions. A provider method never becomes completed/paid through manual status changes.

Transfers persist `provider_pending` intents and cannot be completed without an implemented provider. No balance is credited/debited. Transactions are immutable payment-workflow observations, not a financial ledger, trading P&L or evidence that a provider balance changed. Manual completion acknowledges an independently confirmed offline payment reference. Provider IDs identify catalog adapters; no payment provider executes in this phase.

The partner response includes referral code/link, status, assigned plan and real immutable accruals. Referral attribution is first-touch, unique per client, within the configured window after client creation and disallows self-referral. It cannot be overwritten by normal application requests. Accruals require explicit staff evidence and are never computed from unavailable trading data. Payout amounts are summed exactly in PostgreSQL from selected, unallocated accruals; an accrual cannot back two payout requests. Cancelled/rejected requests release allocations while preserving immutable allocation history.

Permissions: `brokerage.finance.read/write/approve/process` and `brokerage.partners.read/write`. Staff lists require appropriate read permissions. Review requires approve, processing requires process, and partner decisions require partners.write. Destinations are encrypted at rest and redacted from lists, normal responses, audit, outbox and idempotency responses.
