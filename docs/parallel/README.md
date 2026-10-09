# Azuriya Core parallel development

This directory is the lightweight coordination record for the ten-worker model.

## Baseline

- Prompt 3 checkpoint commit: `ed3a8fb560d64a413580ac4e2fec2ca99dca4f95`
- Tag: `azuriya-prompt3-complete`
- Integration authority: `codex/integration` (W01)
- All development branches start at the tagged checkpoint and must preserve Core tenancy, security, RLS, RBAC, and Prompt 1–3 behavior.

The checkout contained migrations `001`–`020` before bootstrap, although the supplied Prompt 3 summary named `001`–`015`. Migration `021_prompt3_schema_repair.sql` is a forward-only baseline repair for the connector trading-observation column. Migrations `001`–`021` are immutable after this checkpoint.

## Workers and branches

| Worker | Branch | Ownership | Migration range |
|---|---|---|---|
| W01 | `codex/integration` | Integration, canonical contracts, merge and acceptance authority | 110–119 only for genuine shared changes |
| W02 | `codex/trading-admin` | Trading administration and configuration | 020–029; 020 and 021 are already consumed, so use 022–029 |
| W03 | `codex/trading-accounts` | Native trading accounts and lifecycle | 030–039 |
| W04 | `codex/orders-positions` | Orders, positions, fills and lifecycle contracts | 040–049 |
| W05 | `codex/ledger-margin` | Ledger, P&L, equity and margin | 050–059 |
| W06 | `codex/market-data` | Quotes, ticks, candles and subscriptions | 060–069 |
| W07 | `codex/execution-risk` | Pre-trade risk, routing and execution | 070–079 |
| W08 | `codex/advanced-api` | Public trading API, CRM connectivity and webhooks | 080–089 |
| W09 | `codex/web-terminal` | Web Trading Terminal and realtime client UI | 090–099 |
| W10 | `codex/provider-integrations` | Provider runtime, adapters and reconciliation | 100–109 |

## Handoff and integration

Each worker receives one major task, works only on its branch, and stops after returning the standard `AZURIYA_WORKER_REPORT` with scope, files, migrations, contracts, events, tests, typecheck, lint, build, security findings, dependencies, merge notes and known issues.

W01 integrates completed branches one at a time. After each merge it runs migrations, the full test suite, typecheck, lint, production build, applicable PostgreSQL acceptance, tenant-isolation checks and shared-contract checks. A worker receives another major task only after that gate passes.

Workers must consume existing canonical shared contracts where available. If a proposal is required, document the smallest interface in the handoff and leave canonical resolution to W01. No worker may modify migrations `001`–`021` or use another worker's range.
