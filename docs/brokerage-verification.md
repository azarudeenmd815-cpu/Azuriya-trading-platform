resume
# Brokerage CRM final verification

Verified locally on **4 October 2026**. This report separates regression tests, real PostgreSQL/API acceptance, browser interactions and responsive measurements. It records a working Brokerage CRM operational implementation; it does not certify production capacity, regulatory compliance, external account creation or actual settlement.

The implementation and ownership boundaries are documented in [Brokerage CRM](brokerage-crm.md). The reproducible PostgreSQL runner, its controls and measured API baseline are documented in [Brokerage acceptance](brokerage-acceptance.md). The implementation security findings are documented in [Security review](brokerage-security-review.md).

## Regression and release checks

| Check | Result and evidence |
| --- | --- |
| Complete regression suite | **190 of 190 tests passed across 16 files.** The final suite log records start time `07:15:46` and duration **66.09 seconds**. Evidence: `artifacts/brokerage-final-tests.log`. |
| Preserved baseline | The original Prompt 1/2 test coverage remains in the passing suite. Applied migrations 001–008 remain preserved; Brokerage uses forward migrations 009–015. |
| TypeScript | `npm run typecheck` passed again as part of the final release build. |
| Targeted table lint | ESLint passed for `src/client/components/ResourceView.tsx` after its local filtering/pagination correction. |
| Full final lint | `npm run lint` passed after all final frontend corrections, including the table containment fix. Evidence: `artifacts/brokerage-final-lint.log`. |
| Final production build | `npm run build` passed: full TypeScript check, Vite production client build and server compilation. Vite completed in **6.03 seconds**. Evidence: `artifacts/brokerage-final-build.log`. |
| Production dependency audit | `npm audit --omit=dev` reported **zero vulnerabilities**. |

The complete suite includes the original Core foundation and Brokerage clients, accounts/KYC, finance/IB, HTTP authorization, idempotency, encrypted credentials/destinations, RLS and worker boundaries. The last frontend-only changes do not replace the passing server regression evidence.

## Real PostgreSQL and two-business acceptance

The runner used **PostgreSQL 16 over verified TLS**, with separate migration and runtime logins. The runtime has `NOSUPERUSER` and `NOBYPASSRLS`, does not own application tables, and assumes the restricted `azuriya_app` role.

**ABC Markets and XYZ Markets** were independently provisioned through Core. Their branding, organizations, brands, environments, product instances, staff, invited clients, offerings, provider connections and payment records are separate. Each business completed the persisted API workflow with three distinct staff identities enrolled through the real MFA endpoints.

Verified API operations include invited-client registration and profile linking; exact versioned consent; manual KYC review/approval with an evidence reference; eligibility and client activation; encrypted/redacted provider credentials; provider-pending account requests and evidenced external-account linkage; exact-decimal deposit review and manual confirmation; withdrawal review, separate approval and manual payment recording; tags, assignments, tasks and immutable note revisions; IB application approval, first-touch attribution, commission accrual and reviewed payout allocation.

All **28 Brokerage tables** had positive-control data and enabled, forced RLS. For each table, **ten unauthorized contexts** returned zero rows, covering missing scope, mismatched subordinate scope, valid sibling hierarchy and a different product instance in the same hierarchy. Foreign-scope insertion was denied with `42501`; foreign updates returned zero rows or were denied by append-only privileges. Composite foreign-key tests rejected mismatched client/account and foreign-client ownership with `23503`.

HTTP adversarial checks rejected foreign staff resources, client use of staff routes, foreign portals/clients/accounts, ownership overposting and finance-owner manipulation with the expected `400`, `403` or `404`. Positive controls establish that these denials protect existing data rather than empty fixtures.

This acceptance records manual CRM decisions and operational observations. It did not provision external trading accounts, execute trades, move provider balances, settle funds or deliver email through a configured external provider.

## Calendar-date regression

The real PostgreSQL date driver exposed a calendar-date defect in the `Asia/Kolkata` timezone: a stored `1990-01-01` SQL `DATE` could be serialized through a local-midnight JavaScript `Date` as a UTC timestamp on **31 December 1989**. That could display the wrong birth date or cause an unchanged profile save to appear to change verified identity.

Brokerage client queries and mutation projections now return `birth_date::text AS birth_date`. Eligibility compares calendar dates rather than a timezone-shifted date object. The regression using the actual PostgreSQL driver date parser failed before the fix and passes in the complete 190-test suite. A read-only real PostgreSQL check verified `1990-01-01` through staff list/detail, client profile and onboarding projections for both businesses. Browser verification confirmed that an unchanged profile save preserved **Active / Approved** state.

## Browser interactions

The browser used the retained real PostgreSQL acceptance fixture. The user development workspace remains separate from the isolated browser acceptance workspace. The supplied Azuriya logo and Euclid Square application design remain in place; tenant workflows use their configured business branding.

| Surface | Browser evidence |
| --- | --- |
| ABC business authentication and branding | Real password sign-in and enrolled MFA; ABC-only business dashboard with persisted client/account/KYC/payment counts. |
| Client list | Server-side next-page navigation and search reset; exact email search returned the intended record. |
| Client creation and detail | Created a new ABC browser-verification client, reopened its persisted profile and verified the corrected calendar date. |
| XYZ offering and account request | Created a demo offering mapped to cTrader, submitted an admin account request and verified its persisted `provider_pending` state. |
| Internal notes | Created and edited a note; immutable history displayed the original and revised text. |
| Staff tasks | Created a follow-up assigned to another staff member, saved a local date/time, and verified the persisted due date. |
| Consolidated consent evidence | Opened the client's accepted business terms with version, timestamp and document fingerprint. |
| Customer onboarding and profile | Configured steps and exact business terms were displayed; current eligibility and approved verification were reflected. Saving an unchanged profile preserved its state. |
| Customer verification | Approved case and safe document details were displayed. Secure storage remained explicitly unavailable/awaiting upload, and an approved case offered no new-case or terminal-case document action. |
| Customer account request | Selected an eligible offering, saved the request and saw a new persisted `provider_pending` account. No provider login or successful external provisioning was fabricated. |
| Customer deposit and history | Requested **12.12345678** in the configured currency using the customer's eligible active account and offline method; saw Pending, cancelled with a reason, and verified separate Pending/Cancelled transaction observations. |
| XYZ finance requests | Created an admin deposit for **3.12345678** in Pending and a withdrawal for **4.23456789** in Requested; the normal withdrawal projection masked the destination with ending **6789**. |
| Customer withdrawal and history | Requested **5.34567891**, cancelled the request and verified separate Requested/Cancelled immutable history rows. |
| IB and referral | Displayed the actual plan, recorded commissions, masked payout history and referral relationship. A referral link survived sign-out/sign-in, returned to the correct business and prefilled the code. Self-referral was visibly rejected without replacing attribution. |
| XYZ business | Signed in with real staff MFA; verified XYZ branding and its independent customer/account/payment counts. Attempting to open ABC administration was denied, and the authorized-workspace link returned to XYZ. |
| XYZ customer | Verified XYZ-only customer branding and records. Marked a notification read; the saved read timestamp remained after reloading. |
| XYZ KYC review | Moved a referred lead's manual verification case from Submitted to In Review using the current password and recent MFA session. An approved case's documents dialog displayed no Add document action. |
| XYZ IB application | Submitted an introducing-partner application for a referred lead and verified Applicant state. |
| Integration request | Requested cTrader through the Core-owned marketplace and verified the persisted success response. No external provider operation was executed. |
| Email-template edit | Edited a persisted template successfully through its event-keyed upsert endpoint; its event identity was preserved. |

Manual finance completion/withdrawal approval, KYC approval, external-account linkage, IB approval and credential encryption are established by the persisted API acceptance above. The browser also performed the review/request transitions listed in the table; it did not repeat the API acceptance's completion or approval decisions.

Configuration-table review corrected unsupported controls: configuration collections without a pagination envelope now filter and paginate locally, while domain lists remain server-paginated. Notifications expose read receipts without a search control the endpoint does not implement. Terminal KYC cases do not offer document-registration actions. Provider payment-method edits preserve the existing execution strategy.

A mobile transaction table exposed an accessibility-layout defect: its absolutely positioned screen-reader-only Actions label used the viewport as its containing block and escaped the table's horizontal scroller. Giving `.table-scroll` a positioned containing block retained the accessible label while containing its overflow. The 375-pixel dark-theme browser check then showed a document scroll width of **351 pixels**, with the table's **321-pixel** scroller retaining its own **961-pixel** content width. The outer horizontal scrollbar disappeared; horizontal table access remained available.

## Responsive and theme verification

Business and customer dashboards were measured in **light and dark themes** at the eight requested widths plus a landscape viewport. These are actual browser documents inside the local responsive-preview iframe, with their own measured CSS viewport. The surrounding desktop browser's size is not substituted for the application viewport.

| Width | Height | Orientation/use |
| ---: | ---: | --- |
| 320 | 740 | Small mobile |
| 375 | 812 | Mobile |
| 390 | 844 | Mobile |
| 480 | 900 | Wide mobile |
| 768 | 1024 | Tablet |
| 1024 | 768 | Landscape tablet |
| 1280 | 900 | Desktop |
| 1440 | 900 | Wide desktop |
| 844 | 390 | Mobile landscape |

DOM measurements confirmed that dashboard root scroll width did not exceed viewport width and that Euclid Square fonts were loaded. Theme checks used the application's actual theme attribute. At 390 pixels, keyboard interaction opened the mobile navigation, Escape closed it, focus returned to the trigger, and the theme control switched the displayed theme. The customer IB page also fitted the 390-pixel dark viewport after the referral-link presentation correction.

This matrix describes the dashboard checks. It does not claim every form and workflow was exercised at every viewport.

Saved visual evidence includes `artifacts/screenshots/brokerage-admin-1440-light.jpg` and `artifacts/screenshots/brokerage-client-390-dark.jpg`. The inspected captures show the actual application viewport and retain its header/navigation context. The responsive measurements are saved in `artifacts/brokerage-responsive-evidence.json`; earlier development captures are superseded by these final JPG files.

Final browser reload and navigation through the client transactions, notifications and dashboard produced **zero new console warnings or errors**. Notification search controls were absent as intended, and persisted data loaded successfully. Evidence: `artifacts/brokerage-browser-final-review.json`. Earlier development hot reloads produced a transient `createRoot` warning; it was absent after the final full reload. Deliberate logged-out authentication, self-referral validation and cross-business access checks are expected negative outcomes, separate from successful request workflows. Browser verification inspected visible request outcomes and console logs; it does not claim a complete network trace.

Keyboard verification at 375 pixels focused the transaction-table region and used the right arrow to move its internal scroll position from **0 to 64.52 pixels**, while document scroll position remained **0**. Both light and dark client dashboards were remeasured after final spacing changes, with no horizontal page overflow and loaded Euclid Square fonts.

## Client bundle baseline

Core, business administration, client pages and MFA are loaded in separate chunks. The final initial JavaScript chunk is **543.17 kB**, or **158.47 kB gzip**, compared with the earlier unsplit entry of **909.31 kB / 216.30 kB gzip**. This reduces initial compressed JavaScript by approximately **26.7%**. Separate chunks include Brokerage **133.42 kB / 25.70 kB gzip**, Client **74.60 / 9.72 kB**, Tenant **75.24 / 12.57 kB** and Core **26.50 / 6.43 kB**. These are build artifacts, not measured load-time or rendering improvements.

Vite still reports an advisory for the initial chunk exceeding 500 kB after minification. The production build succeeds; further dependency/chunk optimization remains a genuine improvement opportunity.

## Measured API performance

The PostgreSQL acceptance run made **250 measured requests**: **50 per operation**, in batches of **five concurrent requests**. The client-list fixture had **252 clients**. The successful run retained the normal authentication, authorization and rate limits and distributed read requests across the three staff sessions.

| Operation | p50 | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: |
| Filtered/sorted scoped client list | 56.23 ms | 227.43 ms | 247.01 ms | 0 |
| Client profile | 64.54 ms | 70.15 ms | 70.65 ms | 0 |
| Scoped account list | 48.12 ms | 52.73 ms | 55.08 ms | 0 |
| Scoped transaction list | 41.74 ms | 49.41 ms | 52.81 ms | 0 |
| Date-filtered dashboard aggregates | 45.50 ms | 61.73 ms | 65.92 ms | 0 |

Fastify injection includes authentication, tenant authorization, request limits, real PostgreSQL queries and serialization. It excludes network latency and browser rendering. Account and transaction fixtures are small. With 50 samples, p99 is the slowest observation. These measurements are a local baseline, not evidence of production-scale capacity.

## Remaining operational dependencies

- Trading and payment adapters remain unavailable. Requested connections, provider-pending provisioning and unavailable synchronization are deliberate states; external balances and settlement require configured connectors and reconciliation.
- Private KYC storage, upload receipts, scanning, retention and expiring audited access require the storage implementation. Current records are document metadata awaiting upload.
- External email needs a configured provider and verified sender. Local encrypted queue/worker tests do not prove external delivery.
- The marketplace preserves **100+ One-Click Integrations** and the Core-owned catalog architecture. The current six provider definitions are request-only; this report does not claim 100 implemented connectors.
- Public HTTPS/custom-domain staging, backup/restore operations, external webhook/provider idempotency and production load require deployment acceptance.
- The initial JavaScript chunk remains above Vite's 500 kB advisory threshold, despite the measured reduction from route splitting.

The next recommended phase is a separately authorized provider/storage integration release with real receipts, webhooks, reconciliation and public HTTPS multi-domain staging acceptance. Trading execution and Prop challenge logic remain in their separate product boundaries.
