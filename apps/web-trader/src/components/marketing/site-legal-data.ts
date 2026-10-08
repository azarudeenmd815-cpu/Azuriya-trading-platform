import type { SitePage } from "./site-types";

const privacyReference = {
  label: "ICO: preparing a privacy notice (UK guidance)",
  href: "https://ico.org.uk/for-organisations/advice-for-small-organisations/privacy-notices-and-cookies/how-to-write-a-privacy-notice-and-what-goes-in-it/",
};
const transparencyReference = {
  label: "ICO: information to include in a privacy notice (UK guidance)",
  href: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/",
};
const storageReference = {
  label: "ICO: explaining cookies and device storage (UK guidance)",
  href: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-comply-with-the-pecr-rules/",
};
const riskReference = {
  label: "FCA: information about contracts for difference (UK guidance)",
  href: "https://www.fca.org.uk/firms/contract-for-differences",
};

export const legalPages: SitePage[] = [
  {
    path: "/legal",
    title: "Legal & transparency centre",
    navLabel: "Legal centre",
    eyebrow: "LEGAL & TRANSPARENCY",
    description:
      "Understand the preview, its data practices and the agreements required before a live brokerage or prop firm launch.",
    kind: "legal",
    highlights: [
      {
        title: "Clear scope",
        text: "Public previews and simulated trading are identified throughout the site.",
      },
      {
        title: "Readable policies",
        text: "Find terms, privacy, storage, execution and complaint information in one place.",
      },
      {
        title: "Operator review",
        text: "Policy frameworks await the legal entity, jurisdiction and approved service terms.",
      },
    ],
    sections: [
      {
        id: "document-status",
        title: "Document status",
        paragraphs: [
          "This centre contains draft policy frameworks for the current Azuriya preview. The operating legal entity, registered address, jurisdiction and designated contact channels are being confirmed. These drafts have no stated effective date and have not been approved as live customer agreements.",
          "Each document explains the current implementation and the decisions needed for a live service. A production version must be reviewed against the operator’s actual activities and the laws that apply to its customers.",
        ],
      },
      {
        id: "website-and-data",
        title: "Website use & personal information",
        paragraphs: [
          "Start with the website terms for acceptable use, the privacy notice for data flows and the storage notice for authentication and device preferences.",
        ],
        links: [
          { label: "Website & demo terms", href: "/legal/terms" },
          { label: "Privacy notice", href: "/legal/privacy" },
          { label: "Cookies & device storage", href: "/legal/cookies" },
        ],
      },
      {
        id: "trading-and-platforms",
        title: "Trading, funding & platform boundaries",
        paragraphs: [
          "The public dashboard is an interactive illustration. The authenticated native terminal uses simulated funds and execution. Live platform connections, brokerage accounts and payment services depend on separately approved providers and agreements.",
        ],
        links: [
          { label: "Risk disclosure", href: "/legal/risk-disclosure" },
          { label: "Execution & routing disclosure", href: "/legal/execution" },
          {
            label: "Platform & integration disclaimer",
            href: "/legal/platform-disclaimer",
          },
        ],
      },
      {
        id: "verification-and-resolution",
        title: "Verification & issue resolution",
        paragraphs: [
          "A production onboarding programme must define its identity checks and customer support responsibilities. The complaint framework sets out the evidence and review process to establish before accepting live customers.",
        ],
        links: [
          {
            label: "AML & identity verification framework",
            href: "/legal/aml-kyc",
          },
          { label: "Complaints framework", href: "/legal/complaints" },
        ],
      },
      {
        id: "operator-details",
        title: "Operator details required for launch",
        paragraphs: [
          "The following details must be verified and published before these frameworks become effective policies. A brand name and a platform logo do not establish an operating entity or permission to offer regulated services.",
        ],
        bullets: [
          "Legal entity, registration details, registered address and operating jurisdiction.",
          "Support, privacy and complaints contact channels with accountable owners.",
          "Relevant authorisations, permitted territories and service restrictions, where applicable.",
          "Approved commercial agreements, provider arrangements and policy versions.",
        ],
      },
      {
        id: "document-questions",
        title: "Questions about these documents",
        paragraphs: [
          "Use the contact page to prepare a question about a document or a proposed launch. Its inquiry builder creates a local draft; it does not send a message. A monitored operator contact channel must be supplied before live customer support can be offered.",
        ],
        links: [{ label: "Prepare an inquiry", href: "/contact" }],
      },
    ],
    related: ["/legal/privacy", "/legal/risk-disclosure", "/legal/execution"],
  },
  {
    path: "/legal/terms",
    title: "Website & demo terms",
    navLabel: "Terms of use",
    eyebrow: "LEGAL / TERMS",
    description:
      "A draft framework for exploring the website, using the simulated terminal and understanding the scope of its examples.",
    kind: "legal",
    highlights: [
      {
        title: "Preview use",
        text: "Explore product workflows without placing live trades or moving real funds.",
      },
      {
        title: "Account responsibility",
        text: "Protect credentials and access only the accounts you are authorised to use.",
      },
      {
        title: "Separate agreements",
        text: "Live brokerage, prop firm and payment terms require explicit provider agreements.",
      },
    ],
    sections: [
      {
        id: "scope",
        title: "1. Status & scope",
        paragraphs: [
          "These draft terms describe the current website and demo. They await operator and jurisdiction review. They do not create a live brokerage agreement, a funded-account offer or a contract with a liquidity provider.",
          "The public dashboard uses example data and local controls. Registration, where the configured backend is available, creates a simulated trading workspace. Neither route accepts real investment capital.",
        ],
      },
      {
        id: "responsible-use",
        title: "2. Responsible use",
        paragraphs: [
          "Use the preview to assess product workflows. Protect other people’s information and respect account access boundaries. Avoid entering confidential business records, identity documents or payment credentials into public demo fields.",
        ],
        bullets: [
          "Do not impersonate members or misrepresent example performance as a live result.",
          "Do not attempt to bypass authentication, ownership, order validation or risk controls.",
          "Do not introduce malicious content, misuse credentials or interfere with service availability.",
          "Use chart attachments, community posts and invite examples only within their stated demo scope.",
        ],
      },
      {
        id: "accounts-and-access",
        title: "3. Accounts & team access",
        paragraphs: [
          "Authenticated resources are scoped to the signed-in user and tenant. Keep login credentials private and sign out on shared devices. Community role changes in the public mock do not grant permissions to backend accounts.",
          "The live service must define eligibility, team administration, delegated authority and account recovery before onboarding. Any age or territorial restrictions must be set for the actual operator and product.",
        ],
      },
      {
        id: "commercial-examples",
        title: "4. Prices, commissions & prop firm examples",
        paragraphs: [
          "A calculator result is an illustration of the entered values. For example, a $2 base commission plus a $5 community markup produces $7 on the same per-lot basis. It does not establish a charge, a revenue entitlement or a settlement schedule.",
          "Live terms must specify whether amounts apply per side or round turn, qualifying volume, taxes, adjustments and settlement. Prop firm challenge parameters, drawdown rules and profit splits shown in the mock are example settings until confirmed in a programme agreement.",
        ],
      },
      {
        id: "launch-offer",
        title: "5. Standard package & launch-offer terms",
        paragraphs: [
          "The standard Azuriya package is offered with a $0 fixed monthly subscription and a 35% share of eligible business revenue. The written service agreement defines the included modules, configuration, reporting and settlement schedule before activation.",
          "The agreement must define eligible revenue, its currency and reporting period, treatment of refunds, taxes and adjustments, and the settlement process. Trader deposits and account balances are not themselves business revenue. The website's $10,000 example divides eligible revenue into $3,500 for Azuriya and $6,500 for the business before other agreed costs; it does not guarantee revenue.",
          "Third-party trading-platform licences, liquidity and payment-provider charges are separate from the $0 Azuriya subscription. Custom development, additional services and changes outside the standard package require an agreed scope.",
          "The release is limited to 100 launch slots. The published allocation is 97 of 100, leaving 3 slots. Eligibility, a signed service agreement and deployment readiness are required. Sending an enquiry does not reserve a slot, and the allocation is updated when the operator confirms a change.",
          "Service availability, operating permissions, support, termination, data export and ongoing responsibilities are defined in the final service agreement. The current website and terminal remain a simulated or illustrative preview until a configured deployment is activated.",
        ],
        links: [{ label: "Pricing & offer scope", href: "/pricing" }],
      },
      {
        id: "content-and-brands",
        title: "6. Content & third-party brands",
        paragraphs: [
          "Trading-platform and provider marks identify the products and reference material shown. Their inclusion does not establish endorsement, a partnership or an active connection. Rights in those marks remain with their respective owners.",
          "Community discussions and chart examples are illustrative. A production community must define member content permissions and moderation responsibilities before enabling real publishing.",
        ],
      },
      {
        id: "availability-and-legal-review",
        title: "7. Availability, disputes & final review",
        paragraphs: [
          "Demo functions may change as the product develops. Connectivity indicators describe the displayed system state; they do not promise uninterrupted access or execution. Confirm important actions against an authoritative account record in a live environment.",
          "The final agreement must identify the parties, service commitments, applicable law and proportionate dispute and liability provisions. This framework does not select a court or arbitration process, waive mandatory customer rights or set a contractual liability cap.",
        ],
        links: [{ label: "Complaints framework", href: "/legal/complaints" }],
      },
    ],
    related: [
      "/legal/privacy",
      "/legal/platform-disclaimer",
      "/legal/risk-disclosure",
    ],
  },
  {
    path: "/legal/privacy",
    title: "Privacy notice",
    navLabel: "Privacy",
    eyebrow: "LEGAL / PRIVACY",
    description:
      "What the current preview handles, how authenticated workspaces differ and which production data practices still require confirmation.",
    kind: "legal",
    highlights: [
      {
        title: "Local demo drafts",
        text: "Public community messages and inquiry drafts stay in page memory during the visit.",
      },
      {
        title: "Authenticated data",
        text: "The configured backend handles registration, sessions and owned simulated account records.",
      },
      {
        title: "Transparent scope",
        text: "Controller identity, recipients, retention and applicable rights await production review.",
      },
    ],
    sections: [
      {
        id: "notice-status",
        title: "1. Status & responsible organisation",
        paragraphs: [
          "This draft records the current implementation. The identity and contact details of the organisation responsible for personal data must be confirmed before an effective production notice can be issued.",
          "Hosting locations, service providers and operational data flows depend on the eventual deployment. This page does not certify a jurisdiction, a compliance programme or an unverified security standard.",
        ],
      },
      {
        id: "public-preview-data",
        title: "2. Public website & preview data",
        paragraphs: [
          "The public community mock holds message drafts, replies, role edits and event selections in page memory. It does not publish them to a messaging backend or upload example attachments. Voice controls do not request microphone, camera or screen capture access.",
          "The contact inquiry builder holds the name, email, project topic and message you enter in page memory. Preparing a draft does not deliver it. If you choose Copy inquiry, the text is copied to your device’s clipboard. Reloading the page clears these in-memory drafts.",
          "The language suggestion uses a country code supplied with the request by the hosting platform when available, with the browser language as a fallback. The application uses the country only to suggest a language and does not request precise device location. A language is saved on this device only after you choose to save it.",
          "The decorative globe loads an external renderer from tkartik.com when it is visible and motion is enabled. That host receives normal connection information such as your IP address. Azuriya does not pass account, trading or inquiry data to the globe. A local graphic is used when motion is reduced or the renderer is unavailable.",
        ],
        bullets: [
          "Example member identities, chart values and account rows are demonstration content.",
          "A remembered privacy choice is stored only when you select that option.",
          "No advertising or optional analytics integration is included in the current website code.",
        ],
      },
      {
        id: "authenticated-workspace-data",
        title: "3. Authenticated workspace data",
        paragraphs: [
          "When you register through the configured API, it receives your email, password and workspace name. The backend stores a password hash and issues a session cookie. It maintains user and tenant identifiers, membership information and simulated account records.",
          "Workspace configurations, submitted orders, fills, positions, ledger entries and audit events support the authenticated terminal. Access is checked against tenant and account ownership. A selected workspace identifier is remembered in browser storage for that user.",
        ],
      },
      {
        id: "purposes-and-recipients",
        title: "4. Purposes, recipients & transfers",
        paragraphs: [
          "Current backend data supports sign-in, workspace preferences, simulated trading, validation and account history. The public preview does not transmit community drafts or inquiry drafts to a provider.",
          "Before live processing, the operator must document the legal basis for each purpose, approved hosting and service recipients, international transfers where relevant, and the role of any broker, verification or payment provider. Provider logos on this site do not establish a data-sharing arrangement.",
        ],
      },
      {
        id: "retention-and-protection",
        title: "5. Retention & protection",
        paragraphs: [
          "Authentication sessions expire after 12 hours in the current backend and are revoked on sign-out. Browser language and workspace preferences remain until cleared. The consent cookie lasts up to one year, while its local preference record remains until cleared. This is separate from the retention of account and operational records on the server.",
          "Server retention periods are not finalised. Production review must set schedules by data category, including deletion, backup handling and any required audit retention. Append-only trading records preserve transaction history; a deletion request must be assessed against applicable duties rather than silently altering that history.",
        ],
        bullets: [
          "Passwords are hashed; session token digests are kept out of public API responses.",
          "Authenticated APIs enforce user and tenant boundaries.",
          "Production HTTPS, cookie settings, access operations and incident procedures require deployment verification.",
        ],
      },
      {
        id: "requests-and-final-notice",
        title: "6. Privacy requests & final notice",
        paragraphs: [
          "The operator must publish a monitored privacy contact and the request process applicable to its jurisdiction. Relevant rights may include access, correction, deletion, objection and other controls, subject to the law and purpose involved. No statutory response period is specified in this draft.",
          "The references below help structure operator review. They describe UK requirements; they do not establish that UK law governs Azuriya or that the current preview satisfies those requirements.",
        ],
        links: [privacyReference, transparencyReference],
      },
    ],
    related: ["/legal/cookies", "/legal/complaints", "/legal"],
  },
  {
    path: "/legal/cookies",
    title: "Cookies & device storage",
    navLabel: "Cookies & storage",
    eyebrow: "LEGAL / DEVICE STORAGE",
    description:
      "A concrete inventory of the sign-in session, language and cookie preferences, and workspace storage used in the current implementation.",
    kind: "legal",
    highlights: [
      {
        title: "Session access",
        text: "The authenticated API uses a session cookie with a 12-hour lifetime.",
      },
      {
        title: "Device preferences",
        text: "Language, cookie choice and workspace selection use browser storage.",
      },
      {
        title: "No optional analytics",
        text: "The present website has no advertising or optional analytics integration.",
      },
    ],
    sections: [
      {
        id: "storage-status",
        title: "1. Scope of this inventory",
        paragraphs: [
          "This draft inventory reflects the current local implementation. A production deployment must audit its host, embedded services and provider flows before the operator approves a final storage notice.",
          "Cookies and local storage are different technologies. A cookie can accompany a request to its server. Local storage remains in the browser until site code reads it or you clear it.",
        ],
      },
      {
        id: "authentication-cookie",
        title: "2. Authentication session cookie",
        paragraphs: [
          "The configured backend sets azuriya_session after sign-in or registration. It keeps requests associated with the authenticated user and expires after 12 hours. Sign-out revokes the server session and clears the cookie.",
          "The cookie is HttpOnly and SameSite=Strict in the backend. Its Secure flag is controlled by deployment configuration; production deployment must verify HTTPS and the secure setting. The public dashboard mock does not require a signed-in API session.",
        ],
      },
      {
        id: "workspace-preference",
        title: "3. Remembered workspace",
        paragraphs: [
          "The authenticated terminal uses a local storage entry named azuriya:workspace:<userId> to remember the selected workspace identifier. The identifier is a preference, not a login token or a grant of account access.",
          "The entry has no automatic browser expiry and remains until cleared or replaced. Removing it makes the application choose an available workspace again; it does not delete the server-side workspace.",
        ],
      },
      {
        id: "privacy-preference",
        title: "4. Language and cookie preferences",
        paragraphs: [
          "The first-visit language and cookie dialog stores the selected language in local storage as azuriya:language. It stores the cookie choice in local storage as azuriya:site-consent and in the first-party azuriya_site_consent cookie for up to one year. The consent cookie is SameSite=Lax and does not contain account or trading data.",
          "Essential storage is always enabled. You can allow optional analytics cookies or choose essential only. Optional analytics and advertising scripts are not currently loaded by this preview, so accepting the optional category records your choice but does not activate a tracker. The footer lets you reopen these settings.",
          "If the consent dialog is dismissed without saving, a session-only browser entry prevents it from reopening during that browser session. It does not set consent or enable optional storage.",
        ],
      },
      {
        id: "temporary-state-and-external-links",
        title: "5. Temporary state & external websites",
        paragraphs: [
          "Public dashboard messages, role selections and contact inquiry drafts stay in page memory during the visit. They are cleared by reloading and are not written to a messaging database by these controls.",
          "Opening an external platform or provider website takes you to that organisation’s service. Its cookie and privacy practices must be reviewed there. A listed logo does not cause this website to load that provider’s tracking script.",
        ],
      },
      {
        id: "controls-and-review",
        title: "6. Controls & production review",
        paragraphs: [
          "You can remove cookies and local storage through your browser’s site-data controls. Blocking the session cookie can prevent authenticated API access. Clearing a preference changes the local selection without removing authoritative account records.",
          "Any future analytics, advertising or embedded service needs a revised inventory and a consent or exception assessment under applicable law before activation. The linked UK guidance is a review reference; the operator’s jurisdiction remains unconfirmed.",
        ],
        links: [storageReference],
      },
    ],
    related: ["/legal/privacy", "/legal/terms", "/legal"],
  },
  {
    path: "/legal/risk-disclosure",
    title: "Trading risk disclosure",
    navLabel: "Risk disclosure",
    eyebrow: "LEGAL / TRADING RISK",
    description:
      "Understand the difference between an illustrative result and live trading, including leverage, copying, execution and programme risk.",
    kind: "legal",
    highlights: [
      {
        title: "Capital at risk",
        text: "Live leveraged products can produce substantial losses and require a suitable risk assessment.",
      },
      {
        title: "Examples are simulated",
        text: "Displayed balances and performance do not establish a live track record.",
      },
      {
        title: "No guaranteed outcome",
        text: "A-book routing, copy rules and controls cannot eliminate market or operational risk.",
      },
    ],
    sections: [
      {
        id: "risk-document-status",
        title: "1. Status & product scope",
        paragraphs: [
          "This draft describes risks relevant to the proposed product and the current preview. A live provider must supply disclosures for the instruments, customer classification and jurisdiction actually offered.",
          "The native terminal uses simulated funds and execution. The public dashboard uses example data. Neither demonstrates realised customer returns, available withdrawal funds or confirmed live liquidity.",
        ],
      },
      {
        id: "leverage-and-market-risk",
        title: "2. Market movement & leverage",
        paragraphs: [
          "Leverage increases exposure relative to committed margin. It magnifies both gains and losses, and relatively small price changes can materially affect equity. Market gaps and fast movement can make a planned exit different from the eventual fill.",
          "Before any live trade, understand the contract size, tick value, margin rules and the provider’s close-out policy. Customer protections differ by provider, product and jurisdiction; negative balance protection is not promised by this preview.",
        ],
      },
      {
        id: "copy-trading-risk",
        title: "3. Copy trading & community signals",
        paragraphs: [
          "Copying a master account reproduces decisions, including losing decisions. A follower may have a different balance, leverage, instrument specification, lot step or execution price. Synchronised animations do not establish identical live fills.",
          "Risk caps and allocation rules can limit an instruction or reject a copy. They cannot guarantee profit or prevent every loss. Assess a strategy independently; a community leader’s popularity is not evidence of suitability or future performance.",
        ],
      },
      {
        id: "execution-and-costs",
        title: "4. Execution, liquidity & costs",
        paragraphs: [
          "A-book describes routing exposure to external liquidity. It does not guarantee a price, immediate execution or unlimited available depth. Orders can be rejected, partially filled or executed with slippage, depending on the provider and market.",
          "Spreads, commission, community markups, financing, currency conversion and payment fees can affect results. Confirm the basis and timing of each charge before accepting live terms. Example latency values and provider reference images are not a service guarantee.",
        ],
      },
      {
        id: "programme-and-technology-risk",
        title: "5. Prop programmes & technology",
        paragraphs: [
          "A prop firm evaluation may have drawdown, daily loss, eligible-strategy and payout conditions. Passing an example challenge in the mock does not confer a funded account or an entitlement to a payout.",
          "Connections, devices and provider systems can fail or become unavailable. Delayed data may affect decisions. Server-side validation and protection controls reduce specific operational risks, but they do not make live trading risk free.",
        ],
        bullets: [
          "Check programme rules, refund conditions and payout eligibility in the approved agreement.",
          "Confirm order status against authoritative records after any connection failure.",
          "Understand instrument concentration, correlation and currency exposure across copied accounts.",
        ],
      },
      {
        id: "informed-assessment",
        title: "6. Make an informed assessment",
        paragraphs: [
          "Website demonstrations and community content do not establish personalised investment advice. Evaluate your experience, financial circumstances and capacity for loss before using any live leveraged service.",
          "The linked FCA material provides UK information about CFDs. It supports risk review, without asserting UK authorisation, jurisdiction or a particular retail loss percentage for Azuriya.",
        ],
        links: [riskReference],
      },
    ],
    related: ["/legal/execution", "/legal/terms", "/legal/platform-disclaimer"],
  },
  {
    path: "/legal/execution",
    title: "Execution & routing disclosure",
    navLabel: "Execution & routing",
    eyebrow: "LEGAL / EXECUTION",
    description:
      "How the simulated terminal records trading actions and what must be confirmed before live A-book routing is enabled.",
    kind: "legal",
    highlights: [
      {
        title: "Simulation first",
        text: "Current native orders do not reach an external liquidity provider.",
      },
      {
        title: "Authoritative controls",
        text: "Authentication, ownership, validation and risk checks govern backend trading actions.",
      },
      {
        title: "Provider-specific routing",
        text: "Live venues, fees and order handling require an approved execution agreement.",
      },
    ],
    sections: [
      {
        id: "execution-status",
        title: "1. Current execution status",
        paragraphs: [
          "This draft disclosure covers the current simulated implementation and the proposed live routing model. It is not a final execution policy for a licensed brokerage.",
          "Native orders are handled by the simulation engine. Provider directories, routing diagrams and dashboard status badges illustrate the intended infrastructure; they are not evidence that an order was transmitted to an LP.",
        ],
      },
      {
        id: "validation-and-records",
        title: "2. Validation & account records",
        paragraphs: [
          "Authenticated trading requests use versioned APIs. The server checks tenant and account ownership, instruction validity and relevant risk conditions. A client estimate or a locally edited dashboard control does not override those checks.",
          "Financial values use exact decimal arithmetic and decimal strings in the API. Committed trading transitions are persisted before events are published. Ledger and audit records are append-only; client charts and animations are visual representations of data.",
        ],
      },
      {
        id: "proposed-a-book-model",
        title: "3. Proposed A-book model",
        paragraphs: [
          "The proposed commercial model routes eligible trading flow to external liquidity through configured infrastructure. Actual venue selection, aggregation, symbol mapping and failover depend on the approved provider arrangement.",
          "Before launch, the operator must identify available venues, order acceptance rules, pricing sources and execution priorities. The availability of a displayed brand does not establish a signed agreement or a live connection.",
        ],
      },
      {
        id: "price-and-order-handling",
        title: "4. Prices, fills & order handling",
        paragraphs: [
          "A quote is not an unconditional promise of a fill. Market conditions, available liquidity, provider rules and connection quality may affect the accepted quantity and execution price. A stop level can be crossed during a gap.",
          "A final policy must explain market and pending orders, partial fills, rejections, cancellations, protection instructions and trading interruptions. It must also identify any circumstances that require manual review.",
        ],
        bullets: [
          "Reconcile orders and fills using authoritative account history.",
          "A failed request must not be treated as an accepted trade.",
          "Retrying a backend instruction must preserve its command identity to avoid duplicate actions.",
        ],
      },
      {
        id: "commissions-and-conflicts",
        title: "5. Commissions, markups & incentives",
        paragraphs: [
          "The mock allows a community markup of up to $5 above a $2 example base commission. The resulting $7 uses the same per-lot basis. These values demonstrate a calculation, not a live tariff.",
          "Production disclosure must explain per-side or round-turn treatment, spread or commission markups, rebates and revenue recipients. Relevant incentives and conflicts must be assessed and disclosed under the operator’s applicable obligations.",
        ],
      },
      {
        id: "connections-and-policy-review",
        title: "6. Connectivity & policy review",
        paragraphs: [
          "Realtime events are delivery updates, not the sole account record. After reconnecting, the authenticated terminal refreshes canonical snapshots. A LIVE data indicator refers to connectivity and does not change simulated execution into real-money trading.",
          "Before enabling live routing, verify platform credentials, venue permissions, risk rules, record reconciliation, outage procedures and the final execution policy. No best-execution certification or uninterrupted service commitment is made by this draft.",
        ],
      },
    ],
    related: [
      "/legal/risk-disclosure",
      "/legal/platform-disclaimer",
      "/legal/terms",
    ],
  },
  {
    path: "/legal/aml-kyc",
    title: "AML & identity verification framework",
    navLabel: "AML & KYC",
    eyebrow: "LEGAL / ONBOARDING",
    description:
      "A draft operating framework for identity verification and financial crime controls before a brokerage or prop firm launch.",
    kind: "legal",
    highlights: [
      {
        title: "Operator responsibilities",
        text: "The legal entity and providers must allocate onboarding and monitoring duties.",
      },
      {
        title: "No public document upload",
        text: "The present marketing preview does not collect identity evidence.",
      },
      {
        title: "Risk-based design",
        text: "Checks must match the live product, jurisdiction and customer relationship.",
      },
    ],
    sections: [
      {
        id: "verification-status",
        title: "1. Framework status",
        paragraphs: [
          "This is a proposed operating framework, pending legal and compliance review. It does not claim that Azuriya runs an approved AML programme or has completed customer verification.",
          "The public dashboard shows example onboarding controls. It does not upload identity documents, perform sanctions screening or submit a regulatory report. Registration in the native terminal creates a simulated workspace rather than a verified live brokerage account.",
        ],
      },
      {
        id: "responsibilities-and-eligibility",
        title: "2. Responsibilities & eligibility",
        paragraphs: [
          "Before launch, the operator must determine which services and territories it can offer and which verification duties belong to the broker, payment provider, verification provider and community operator.",
          "A named responsible function must own the policy, review escalations and maintain an auditable decision process. Eligibility criteria and any restricted countries or customer categories must follow the actual legal and provider requirements.",
        ],
      },
      {
        id: "identity-and-ownership",
        title: "3. Identity & beneficial ownership",
        paragraphs: [
          "A live workflow may require evidence of identity, residence and authority to act. Business relationships may require entity information and evidence of ownership or control. The required evidence must be defined before collection and explained in the privacy notice.",
          "Verification must use an approved secure workflow. Do not send passports, payment cards or account credentials through the public inquiry builder or community demo.",
        ],
        bullets: [
          "Identify the person or organisation opening the relationship.",
          "Verify authority over the requested account or business relationship.",
          "Record review outcomes and the reasons for any additional checks.",
          "Limit collected evidence to what the approved purpose requires.",
        ],
      },
      {
        id: "risk-and-monitoring",
        title: "4. Risk assessment & monitoring",
        paragraphs: [
          "The live programme must define how customer, geographic, product and transaction risks are assessed. Sanctions, politically exposed person checks and enhanced review must follow the requirements applicable to the operator and providers.",
          "Monitoring should provide a documented route for investigating inconsistent information or unusual activity. A review flag is not a finding of wrongdoing. Automated and manual decisions require appropriate oversight and records.",
        ],
      },
      {
        id: "payments-and-escalation",
        title: "5. Payments & escalation",
        paragraphs: [
          "Payment acceptance and withdrawal checks depend on the broker and payment-provider agreement. The production workflow must define account ownership checks, permitted funding sources, review triggers and provider escalation.",
          "Any required reporting, record retention or restrictions on communication must be determined under applicable law. This draft does not invent a reporting authority, a mandatory holding period or a blanket power to retain customer funds.",
        ],
      },
      {
        id: "launch-approval",
        title: "6. Review before launch",
        paragraphs: [
          "Approve the policy only after the legal entity, jurisdiction, provider allocation, verification system and accountable reviewer are established. Test evidence access, exception handling and complaint escalation with representative cases.",
          "The final policy must explain the customer steps, information requested, privacy arrangements and how incomplete or disputed checks are handled. Operational checks must remain separate from cosmetic status changes in the public mock.",
        ],
      },
    ],
    related: [
      "/legal/privacy",
      "/legal/complaints",
      "/legal/platform-disclaimer",
    ],
  },
  {
    path: "/legal/complaints",
    title: "Complaints & resolution framework",
    navLabel: "Complaints",
    eyebrow: "LEGAL / RESOLUTION",
    description:
      "A clear review framework for website issues, account concerns and provider disputes, ready for operator contact details and jurisdiction review.",
    kind: "legal",
    highlights: [
      {
        title: "Clear ownership",
        text: "Route website, account and payment concerns to the responsible service.",
      },
      {
        title: "Evidence-led review",
        text: "Record the issue, relevant references and the outcome requested.",
      },
      {
        title: "Defined escalation",
        text: "Final contact channels, time limits and external review routes await confirmation.",
      },
    ],
    sections: [
      {
        id: "complaints-status",
        title: "1. Status & contact channel",
        paragraphs: [
          "This draft describes the complaint process to establish for the live service. A monitored complaints contact, accountable team and jurisdiction-specific procedures must be published before it becomes an effective policy.",
          "The contact page currently prepares a local inquiry draft. It does not submit a complaint or start a response period. Public community channels and direct-message previews are not monitored complaint channels.",
        ],
      },
      {
        id: "information-to-provide",
        title: "2. Information to include",
        paragraphs: [
          "A useful report describes what happened, when it occurred and which service was involved. Provide enough detail to locate the relevant records without sharing passwords, card security codes or unnecessary identity documents.",
        ],
        bullets: [
          "Your preferred reply channel and an account or workspace reference, where relevant.",
          "The date, time and time zone of the event.",
          "Order, transaction or provider references and the displayed error message.",
          "The effect on you and the resolution you are seeking.",
          "Relevant screenshots with private credentials and unrelated personal data removed.",
        ],
      },
      {
        id: "triage-and-ownership",
        title: "3. Triage & responsible service",
        paragraphs: [
          "Website behaviour and local mock issues belong to the platform review process. A live trade execution dispute belongs to the contracting broker or execution provider. A payment concern may require the broker and payment provider to review their records together.",
          "The production process should explain any referral and identify the party responsible for the next step. Displaying a provider logo does not make Azuriya responsible for that provider’s independent customer agreement.",
        ],
      },
      {
        id: "investigation-and-records",
        title: "4. Investigation & records",
        paragraphs: [
          "Review the submitted evidence against authoritative account records, system events and applicable service terms. Keep a record of the issue, reviewer, findings and communication so the reasoning can be checked.",
          "For the simulated terminal, distinguish a rejected request, a committed action and a delayed client update. Ledger and audit history should remain intact during investigation. A correction must be handled through the appropriate recorded process rather than rewriting transaction history.",
        ],
      },
      {
        id: "response-and-escalation",
        title: "5. Response & escalation",
        paragraphs: [
          "The final procedure must set acknowledgement and response commitments that match the operator’s obligations. This draft makes no statutory or contractual response-time promise.",
          "A response should explain the findings, any remedy or corrective action and the available escalation route. Access to an ombudsman, regulator or external dispute scheme depends on the legal entity, product and jurisdiction; no specific scheme is asserted here.",
        ],
      },
      {
        id: "privacy-and-other-rights",
        title: "6. Privacy concerns & other rights",
        paragraphs: [
          "A privacy concern must be routed to the designated privacy contact and handled under the applicable request process. The final notice must identify any relevant supervisory authority and explain its role.",
          "This framework does not waive customer rights, require arbitration or prevent another remedy available under applicable law. The operator must confirm the complaint policy and customer agreement together before launch.",
        ],
        links: [
          { label: "Privacy notice", href: "/legal/privacy" },
          { label: "Prepare a local inquiry", href: "/contact" },
        ],
      },
    ],
    related: ["/legal/privacy", "/legal/terms", "/legal/execution"],
  },
  {
    path: "/legal/platform-disclaimer",
    title: "Platform & integration disclaimer",
    navLabel: "Platform disclaimer",
    eyebrow: "LEGAL / PLATFORM SCOPE",
    description:
      "What logos, dashboard demonstrations, direct MT5 funding and the proposed commercial model mean in the current preview.",
    kind: "legal",
    highlights: [
      {
        title: "Catalogue context",
        text: "Brand marks identify products and provider references without implying a partnership.",
      },
      {
        title: "Broker-enabled funding",
        text: "Native MT5 payments depend on broker configuration and an approved provider.",
      },
      {
        title: "Defined demo scope",
        text: "Public admin, prop firm and communication controls are local illustrations.",
      },
    ],
    sections: [
      {
        id: "disclaimer-status",
        title: "1. Current platform scope",
        paragraphs: [
          "This draft explains the boundary between product demonstrations and live services. It awaits operator review alongside the final customer terms.",
          "The public landing page presents the proposed brokerage, prop firm, account and community workflows. Its dashboard controls use local example state. The authenticated native terminal performs simulated trading through its configured backend.",
        ],
      },
      {
        id: "platforms-and-provider-marks",
        title: "2. Trading platforms & provider marks",
        paragraphs: [
          "A platform entry or logo describes an integration category or supplied reference. It does not establish that a working connector is enabled, that every workflow is supported, or that the trademark owner endorses Azuriya.",
          "An actual connection must be confirmed for the selected platform version, account type, API permissions and provider agreement. Liquidity-provider screenshots, logos and example latency figures are reference material rather than a verified inventory of live counterparties.",
        ],
      },
      {
        id: "mt5-payments",
        title: "3. Deposits from MetaTrader 5",
        paragraphs: [
          "Native MT5 payments are available only when the broker configures the feature and an approved payment provider supports the account. Available methods, currencies, limits, fees, verification and withdrawals depend on that arrangement.",
          "The MT5 deposit page explains the workflow with supplied examples and an interactive preview. This website does not process a deposit, store card credentials, create a payment wallet or credit a real trading account.",
        ],
      },
      {
        id: "community-and-admin-previews",
        title: "4. Community, admin & prop firm previews",
        paragraphs: [
          "Messages, reactions, channels, role changes, invitations and events in the public community are local demonstrations. Voice buttons do not establish a call, access a microphone or share a screen. Example attachments are preview assets rather than uploads.",
          "Admin leverage, markup, payout, verification and prop firm settings in the public dashboard illustrate possible controls. They do not change a real trading account, approve an identity check or grant a payout entitlement. Real account changes require authenticated, authorised backend actions.",
        ],
      },
      {
        id: "commercial-positioning",
        title: "5. Free solution positioning & example economics",
        paragraphs: [
          "The proposed free brokerage and prop firm solution is a commercial positioning statement. It does not confirm that every provider service, transaction, challenge or account feature is free.",
          "Live proposals must identify the included software, provider costs, commission markups, payment charges, taxes and any programme fees. Dashboard revenue and the commission calculator are illustrations; they do not guarantee earnings or define a binding tariff.",
        ],
      },
      {
        id: "integration-confirmation",
        title: "6. Confirming a live implementation",
        paragraphs: [
          "Before launch, confirm the operating entity, permitted services, provider agreements, tested platform capabilities and approved customer documents. Validate authentication, account ownership, order risk, payment reconciliation and operational support against the chosen deployment.",
          "Availability is specific to the configured environment. The website does not assert brokerage authorisation, a regulatory licence, insured deposits, guaranteed execution or a live partnership through its illustrations.",
        ],
      },
    ],
    related: ["/legal/execution", "/legal/terms", "/legal/risk-disclosure"],
  },
];
