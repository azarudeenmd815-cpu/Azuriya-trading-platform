# Brokerage CRM implementation plan

The user's Prompt 3 is the approved product specification. Implement in the current shared checkout, preserving Core and the 113 existing tests. Brokerage owns operating records; Core owns identity, scopes, brands, membership, roles, API credentials, audit and durable delivery. Provider operations remain pending or require a recorded manual reference while connectors are unavailable.

## Architecture and rulings

- Every operating record carries organization, brand, environment and product instance. Composite foreign keys and forced row security enforce all four. Explicit scope predicates additionally protect domain reads and writes.
- Introduce granular brokerage permissions. Existing roles possessing every foundation permission gain the new product permissions because they already have authority to manage all roles. Limited roles gain none. New owners receive the full permission catalog through the existing organization service.
- A customer record is independent of Core identity. Own-client routes derive identity from authenticated membership and never accept ownership from a request body. Staff notes, risk details and assignments never enter client DTOs.
- Money is validated as decimal text and stored in numeric columns. Payment workflow history does not claim balances or ledger execution. Maker and checker are distinct by default. Approvals and processing require a recent authenticator session and password confirmation; service accounts and support grants cannot approve funds.
- Versioned consent records are immutable. A changed document requires fresh consent. External KYC/storage/provider interfaces report unavailable until actually configured. Private document metadata does not imply uploaded bytes.
- Domain mutations use the existing transaction-bound idempotency wrapper, locks and audit/outbox events. Secrets remain encrypted and scope-bound; public DTOs omit them.
- UI retains the established Euclid typography, black/white/blue palette, theme behavior, accessible dialogs and scrollable paginated tables. Tenant branding is resolved solely from its brand.

## Work packages and ownership

1. Root: migration009 permissions and communications; shared scope/auth/approval helpers; database transaction scope settings; route registration; administrator and customer screens; notifications/templates/reports; integration and acceptance docs.
2. Client agent: migration010; clients and onboarding service/routes; client status transitions, filters, tags, notes, history, staff assignment, tasks, versioned consents and basic eligibility. Own module tests and API contract.
3. Accounts agent: migration011; offerings, account requests/registry, manual KYC review and private document abstraction, encrypted connections and capability gating. Own module tests and API contract.
4. Finance agent: migration012; payment methods, deposits, withdrawals, transfers, immutable transaction states, encrypted payout destinations, IB attribution/plans/payout architecture. Own module tests and API contract.

## Validation and delivery

- Each agent runs focused domain/API tests. Root integrates and reviews scope, product gates, transition fences, redaction, consent, money and idempotency, then runs the complete suite, lint, typecheck and build.
- Add API adversarial checks for missing permission, cross-instance ownership, forged client IDs, private notes, payment replay and high-risk approvals. Run direct PostgreSQL row-security checks under the restricted runtime role for new tables, including same-organization sibling instances and missing scope.
- Create two isolated verification tenants (ABC Markets and XYZ Markets) with distinct brands/clients/offerings. Exercise administrator and client journeys. Record real p50/p95/p99 latency for scoped lists/profile/accounts/transactions/dashboard, and inspect responsive UI at the specified viewport widths.
- Update brokerage, API, architecture, integrations and security docs. Report actual results and remaining external provider/deployment limits in the user's requested 18-part order. Do not begin the trading execution phase.
