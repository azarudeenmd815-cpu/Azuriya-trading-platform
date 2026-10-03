import type { SitePage } from "./site-types";

export const operationsArticles: SitePage[] = [
  {
    path: "/insights/mt5-manager-account-groups",
    title:
      "MT5 account groups: a controlled process for changing trading conditions.",
    navLabel: "MT5 Manager account groups",
    seoTitle: "MT5 Manager Account Groups and Change Controls | Azuriya",
    eyebrow: "Brokerage · Account administration",
    description:
      "Plan MT5 account groups with clear ownership, leverage and commission settings, approval records, migration checks and a practical acceptance checklist.",
    kind: "article",
    article: {
      category: "Brokerage",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Define the group",
        text: "Give each account group an approved purpose, conditions and responsible owner.",
      },
      {
        title: "Review the change",
        text: "Check the accounts, open exposure and pricing affected before applying a new configuration.",
      },
      {
        title: "Verify the result",
        text: "Compare effective platform settings with the approved request and retain the evidence.",
      },
    ],
    sections: [
      {
        id: "group-purpose",
        title: "Treat an account group as an operating specification",
        paragraphs: [
          "An account group should describe an approved set of trading conditions. Start with its purpose, eligible account population, trading server, account currency, instruments and responsible operator. A short label such as VIP or evaluation is useful in a menu, but it does not tell a reviewer what conditions a member will receive.",
          "Maintain a group register alongside the portal. Record the configuration version, approval reference and environment for each entry. Separate demonstration accounts, evaluation accounts and production accounts explicitly. The same group name on two servers should never be treated as the same configuration without checking the server identity and effective settings.",
        ],
        links: [
          { label: "Explore brokerage account operations", href: "/brokerage" },
        ],
      },
      {
        id: "effective-conditions",
        title: "Inspect effective leverage, permissions and pricing",
        paragraphs: [
          "Specify the leverage policy, available instruments, execution permissions and commission basis together. Confirm which settings come from the group and which can be overridden for an individual account. A requested leverage change needs a margin-impact review against the broker's actual configuration; copying a number from a marketing table does not establish the resulting margin requirement.",
          "MetaQuotes' AccountInfoInteger reference exposes account leverage and trading permission properties. Those readouts provide useful evidence about an account's effective state; they do not grant Manager authority to change it. For commission configuration, record the currency, charging event and per-side or round-turn basis before testing the charge on an approved test account.",
        ],
        bullets: [
          "Identify every inherited setting and any account-specific override.",
          "Confirm instrument permissions and margin behavior in the intended environment.",
          "Keep the $2.00 base plus $5.00 markup example on one agreed charging basis.",
        ],
        links: [
          {
            label: "Read the per-lot commission guide",
            href: "/insights/commission-markups-per-lot",
          },
        ],
      },
      {
        id: "change-authority",
        title: "Separate a requested change from permission to apply it",
        paragraphs: [
          "Define who can propose, approve and apply group changes. Community moderators may gather a request, while authorized account operators review its effect. The service must check the authenticated tenant, account ownership and permitted administrative action. A channel role or an influencer's display name should not authorize changes to someone else's trading conditions.",
          "Capture the reason, before-and-after values, affected account list and proposed effective time. Give the approver enough context to assess open positions, pending orders, copied strategies and payment rules linked to the group. High-impact changes benefit from a second authorized reviewer and a named person responsible for verifying completion.",
        ],
        links: [
          { label: "Inspect the admin portal preview", href: "/admin-portal" },
          {
            label: "Plan community and account permissions",
            href: "/insights/trading-community-team-permissions",
          },
        ],
      },
      {
        id: "migration-window",
        title: "Plan account moves and automatic triggers explicitly",
        paragraphs: [
          "Before moving accounts, check the destination group's conditions and any linked services. Decide what happens to outstanding withdrawals, copying permissions and account-specific settings. Select a controlled change window, record the initial account state and define when the operation must stop because a required check cannot be completed.",
          "MetaQuotes documents a group-change automation triggered by a qualifying deposit and recommends verifying destination settings before enabling it. If a broker uses an automatic rule, review its eligibility criteria, exclusions and notification behavior. An automated trigger needs the same documented configuration and acceptance evidence as a manually initiated change.",
        ],
      },
      {
        id: "acceptance-tests",
        title: "Test a representative account before a wider rollout",
        paragraphs: [
          "Use an approved test environment to validate the change on representative accounts. Include an empty account, an account with pending orders, and any relevant hedged or netted account model. Compare permissions, displayed conditions and permitted trading actions with the approved specification. Keep expected failures in the test plan, including an unauthorized operator and a stale configuration version.",
          "After applying the change, retrieve the effective state again. A successful submission is insufficient evidence that every account received the requested settings. Record partial completion and failed accounts separately. A recovery plan should specify compensating changes and a fresh risk review; reversing a leverage setting does not automatically undo the effects of trades placed in between.",
        ],
      },
      {
        id: "group-record",
        title: "Make the final account record understandable to support",
        paragraphs: [
          "Retain an append-only record of the request, approval, application outcome and verification. Support should be able to answer which conditions applied to an account at a particular time. Avoid overwriting the old values or editing a previous audit entry to make the latest configuration appear continuous.",
          "Azuriya's local admin and brokerage previews illustrate how these controls can be organized. Their execution and account data are simulated. Production MT5 Manager operations require the broker's authorized access and a tested connector. Use the preview to agree the permission model and acceptance checklist before enabling administrative writes.",
        ],
        bullets: [
          "Keep the original configuration and the approved change reference.",
          "Show effective conditions, unresolved exceptions and the responsible operator.",
          "Recheck automated rules when their destination group changes.",
        ],
      },
    ],
    related: [
      "/admin-portal",
      "/insights/brokerage-crm-account-operations",
      "/insights/trading-platform-integration-checklist",
    ],
    cta: { label: "Explore account administration", href: "/admin-portal" },
    sources: [
      {
        label: "MetaQuotes: MT5 account leverage and permission properties",
        href: "https://www.mql5.com/en/docs/account/accountinfointeger",
      },
      {
        label: "MetaQuotes: MT5 automation workflows and account group changes",
        href: "https://www.metatrader5.com/en/brokers/automations/popular-automation-workflows",
      },
    ],
  },
  {
    path: "/insights/brokerage-deposit-withdrawal-controls",
    title: "Brokerage deposits and withdrawals: build a clear control queue.",
    navLabel: "Deposit and withdrawal controls",
    seoTitle: "Brokerage Deposit and Withdrawal Controls | Azuriya",
    eyebrow: "Brokerage · Funding operations",
    description:
      "Design brokerage deposit and withdrawal controls with approval roles, currency limits, exception queues, account ownership checks and traceable records.",
    kind: "article",
    article: {
      category: "Brokerage",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Use separate workflows",
        text: "A confirmed incoming payment and an approved outgoing transfer need different evidence.",
      },
      {
        title: "Make reviews explicit",
        text: "Give each exception a reason, owner and next action instead of a generic pending badge.",
      },
      {
        title: "Preserve the trail",
        text: "Link requests, provider outcomes and account movements without rewriting history.",
      },
    ],
    sections: [
      {
        id: "separate-flows",
        title: "Define deposits and withdrawals as different processes",
        paragraphs: [
          "A funding screen can present incoming and outgoing payments together, while the underlying workflows remain distinct. A deposit asks whether an incoming payment is confirmed and which account should receive it. A withdrawal asks whether an authenticated owner may request an outgoing transfer, whether the destination is permitted and whether funds can be reserved without conflicting commitments.",
          "Write separate state definitions for both. Deposits might be initiated, awaiting confirmation, confirmed, credited or under review. Withdrawals might be requested, reviewed, reserved, submitted, paid, failed or cancelled. Agree what each label means and what evidence permits the next step; the provider's terminology should be mapped explicitly to your internal states.",
        ],
        links: [
          { label: "Explore portal funding workflows", href: "/funding" },
        ],
      },
      {
        id: "funding-policy",
        title: "Put limits and eligibility into a versioned policy",
        paragraphs: [
          "Record eligible accounts, providers, currencies, minimums, maximums and approval thresholds for each payment method. Specify how fees and currency conversion are disclosed and where the authoritative conversion amount is obtained. Keep exact decimal values and currency codes in the policy; a display rounded for readability must not become the accounting input.",
          "State the checks required for account ownership and payment destination under the broker's approved procedures. Assign unresolved eligibility questions to the responsible team. A community subscription or successful sign-in does not establish permission to move funds from any linked account. Changing a policy should leave an effective date and the version used for existing requests.",
        ],
        bullets: [
          "Separate per-request limits from account or period limits.",
          "Name the currency and charging basis for every amount.",
          "Define how existing pending requests are handled after a policy change.",
        ],
      },
      {
        id: "deposit-evidence",
        title: "Approve deposit credit from verified payment evidence",
        paragraphs: [
          "A browser return page is useful for the member journey, but it should not authorize an account credit. Verify the provider's server-side confirmation, account reference, amount and currency. Match it to the intended funding request and persist the resulting accounting transition before announcing that the funds are available.",
          "Stripe's webhook documentation requires signature verification and explains that event deliveries can be duplicated or arrive out of order. This is a concrete provider example, not a claim that Stripe is configured for Azuriya. Check your selected provider's equivalent rules and retain both the event identity and the internal credit reference so repeated notifications cannot create repeated credit.",
        ],
        links: [
          {
            label: "Read the MT5 reconciliation guide",
            href: "/insights/mt5-deposit-reconciliation",
          },
          { label: "See native MT5 deposit steps", href: "/mt5-deposits" },
        ],
      },
      {
        id: "withdrawal-approval",
        title: "Keep withdrawal approval separate from payment completion",
        paragraphs: [
          "At submission, validate the authenticated owner, current account state and applicable policy. Reserve eligible funds atomically so another withdrawal or trading action cannot consume the same availability. The exact available amount depends on the authoritative account and risk rules; a dashboard balance alone is insufficient for the decision.",
          "Give authorized reviewers the request reference, permitted destination, policy result and supporting evidence. Record their decision and reason. An approved withdrawal is still awaiting the provider's outcome until a confirmed payment result arrives. If submission fails or its response is lost, investigate before releasing the reservation or creating another transfer. A retry button should show the current evidence and permitted next action.",
        ],
        links: [
          {
            label: "Explore risk and account controls",
            href: "/risk-management",
          },
        ],
      },
      {
        id: "exception-queue",
        title: "Design the exception queue around decisions",
        paragraphs: [
          "Replace an undifferentiated pending list with clear reasons: missing confirmation, amount mismatch, destination review, duplicate notification, failed submission or uncertain outcome. Each item needs an owner, age, last evidence check and required next step. Escalation rules should make stalled requests visible without automatically overriding financial or ownership checks.",
          "Support agents need a safe explanation they can give the member, plus an internal path to the decision maker. Keep secrets and full payment credentials out of channel messages and general case notes. When evidence arrives, append the new information and decision instead of altering the original request. This makes a later investigation possible without relying on an operator's memory.",
        ],
        bullets: [
          "Show the precise blocker and who can resolve it.",
          "Distinguish customer action from provider or internal action.",
          "Escalate age and uncertainty without bypassing the approval policy.",
        ],
      },
      {
        id: "funding-review",
        title: "Rehearse failure paths and review the accounting trail",
        paragraphs: [
          "Test duplicate confirmations, a currency mismatch, two simultaneous withdrawal requests, rejected approval, provider failure and a lost response after submission. Check the member message, reserved amount, accounting record and audit entry for each case. Review completed transfers against provider records and investigate differences through an exception process.",
          "Azuriya's funding preview demonstrates the interface using simulated data. It does not process deposits or send withdrawals. Before a production launch, agree provider availability, authorized operating procedures and test evidence with the responsible broker team. The useful outcome is a queue in which every amount and unresolved decision can be traced.",
        ],
      },
    ],
    related: [
      "/funding",
      "/insights/mt5-deposit-reconciliation",
      "/insights/trading-community-support-workflows",
    ],
    cta: { label: "Explore funding operations", href: "/funding" },
    sources: [
      {
        label:
          "Stripe: verified webhook events, duplicates and delivery ordering",
        href: "https://docs.stripe.com/webhooks",
      },
    ],
  },
  {
    path: "/insights/trading-platform-integration-checklist",
    title:
      "Trading platform integrations: prove the connector behind the logo.",
    navLabel: "Trading platform integration checklist",
    seoTitle: "Trading Platform Integration Checklist | Azuriya",
    eyebrow: "Infrastructure · Connector readiness",
    description:
      "Assess trading platform integrations with a capability matrix, account authorization, API version records, symbol mapping and acceptance tests for each route.",
    kind: "article",
    article: {
      category: "Infrastructure",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Define the capability",
        text: "Account reads, trade execution, administration and funding are separate integration requirements.",
      },
      {
        title: "Verify the account",
        text: "Authenticate the application and confirm permission for the specific destination account.",
      },
      {
        title: "Test the lifecycle",
        text: "Record recovery and failure evidence alongside successful connection tests.",
      },
    ],
    sections: [
      {
        id: "capability-matrix",
        title: "Create a capability matrix for the intended workflow",
        paragraphs: [
          "Start with actions the business needs, rather than a list of platform names. Account information, live prices, order entry, amendments, cancellations, deal history, account administration and payment operations are separate capabilities. A connector that reads positions may have no authority to open an account or move funds.",
          "For every platform and broker environment, record each capability as verified, restricted, planned or unavailable. Attach the interface used, required permission, test evidence and owner. Azuriya's catalog presents 32 platform ecosystem entries for evaluating options. That catalog does not establish 32 implemented production connectors or identical capabilities across the listed applications.",
        ],
        links: [
          {
            label: "Explore the trading platform ecosystem",
            href: "/trading-platforms",
          },
        ],
      },
      {
        id: "authorization-scope",
        title: "Check authorization at the account boundary",
        paragraphs: [
          "Document application registration, credential storage, account selection, permission scopes and revocation. Confirm how the service proves that the signed-in portal member owns or is authorized to operate the selected account. An account login supplied in a request is an identifier, not permission. Recheck tenant and account ownership on every protected action.",
          "Spotware documents separate cTrader application authentication and account authentication steps. MetaTrader 5 distinguishes master access from investor access; investor authorization permits viewing account status but not trading. These examples show why access modes need explicit capability checks. Do not interpret a successful connection as authorization for every action exposed by the portal.",
        ],
        bullets: [
          "Test wrong-account, revoked-permission and expired-credential requests.",
          "Keep integration secrets in the authorized server environment.",
          "Make unavailable actions explicit in the account interface.",
        ],
      },
      {
        id: "environment-version",
        title: "Record the environment and interface version",
        paragraphs: [
          "Name the broker server, endpoint, test or production status, API version and adapter release in the integration record. Record request limits, supported event types and maintenance dependencies from the provider's current documentation. A test performed against one broker environment should not automatically approve another server or configuration.",
          "cTrader's documentation separates demo and live endpoints and requires separate connections when an application serves both environments. Carry the environment identity through account records, event processing and audit references. At the portal boundary, expose versioned APIs and events so a platform adapter can change without moving authoritative trading rules into the browser.",
        ],
      },
      {
        id: "mapping-contract",
        title: "Define the mapping contract before sending an order",
        paragraphs: [
          "Record how platform account IDs, symbol IDs, volume units, price precision, currencies, order types and position models map to the portal's domain records. Keep each platform's conversion rules inside its adapter. Native trading rules should operate on validated internal values rather than depending directly on a third-party platform's package or object model.",
          "Use exact decimal values for financial calculations and documented serialization at the boundary. Reject missing specifications or unsupported actions explicitly. A familiar symbol label cannot substitute for an approved contract mapping. For copied orders, validate every destination's permissions, volume boundaries, margin and exposure before dispatching its action.",
        ],
        links: [
          {
            label: "Read cross-platform copy trading controls",
            href: "/insights/cross-platform-copy-trading-risk-controls",
          },
        ],
      },
      {
        id: "acceptance-evidence",
        title: "Test the complete request and event lifecycle",
        paragraphs: [
          "Build an acceptance checklist for each supported action. Include the intended success, an explicit reject, a partial outcome where relevant, repeated events, reconnect behavior and a missing response. Check how platform references correlate with the original request. Verify that a reconnect does not mark unresolved actions as completed or trigger an unreviewed duplicate instruction.",
          "Use a controlled test account and record expected results before running the cases. Capture adapter logs with sensitive fields removed, confirmed platform records and the portal's audit trail. Approval should identify the tested account model and limitations. A screenshot of a connected badge is useful presentation material but weak evidence of execution or administrative correctness.",
        ],
        bullets: [
          "Verify permitted actions and explicit failures for each account type.",
          "Reconcile orders, deals and positions after a disconnect.",
          "Retest boundary mappings after platform or adapter changes.",
        ],
      },
      {
        id: "connector-release",
        title: "Release with an owner, limits and a recovery plan",
        paragraphs: [
          "Publish a connector readiness record with verified capabilities, unsupported operations, known limits and escalation contacts. Define which failure conditions pause new actions and how an operator inspects uncertain outcomes. Keep the last accepted adapter version and configuration available for investigation; recovery still needs current account and risk checks.",
          "Azuriya's local trading and admin previews use simulated execution. Production connectivity requires the relevant provider agreement, broker access and connector acceptance. A precise capability record helps visitors understand the available workflow and gives engineering, operations and support the same reference when a platform changes.",
        ],
        links: [
          {
            label: "Prepare a trading incident procedure",
            href: "/insights/trading-operations-incident-response",
          },
        ],
      },
    ],
    related: [
      "/trading-platforms",
      "/insights/cross-platform-copy-trading-risk-controls",
      "/insights/trading-operations-incident-response",
    ],
    cta: { label: "Review the platform ecosystem", href: "/trading-platforms" },
    sources: [
      {
        label: "Spotware: application and account authentication",
        href: "https://help.ctrader.com/open-api/account-authentication/",
      },
      {
        label: "Spotware: separate demo and live endpoints",
        href: "https://help.ctrader.com/open-api/proxies-endpoints/",
      },
      {
        label: "MetaQuotes: MT5 master and investor access",
        href: "https://www.metatrader5.com/en/terminal/help/startworking/authorization",
      },
    ],
  },
  {
    path: "/insights/trading-operations-incident-response",
    title:
      "Trading operations incident response: resolve uncertainty before recovery.",
    navLabel: "Trading operations incident response",
    seoTitle: "Trading Operations Incident Response Guide | Azuriya",
    eyebrow: "Infrastructure · Service recovery",
    description:
      "Prepare trading operations incident response with scoped pauses, lost-response checks, execution reconciliation, recovery criteria and clear member updates.",
    kind: "article",
    article: {
      category: "Infrastructure",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Scope the incident",
        text: "Identify the affected accounts, routes and uncertain actions before changing service behavior.",
      },
      {
        title: "Reconcile first",
        text: "A missing response does not prove that an order or payment failed.",
      },
      {
        title: "Recover with evidence",
        text: "Resume affected actions after permissions, risk checks and recorded outcomes are verified.",
      },
    ],
    sections: [
      {
        id: "incident-scope",
        title: "Name the failure and the affected workflow",
        paragraphs: [
          "An incident report should say what stopped working: stale prices, rejected orders, lost connector responses, delayed payment confirmation or an unavailable account service. Identify the affected server, instruments, accounts and time window. A broad service-down label can hide that only one route or operation is impaired.",
          "Assign an incident lead and separate technical investigation, account operations and member communication responsibilities. Start a timestamped record containing observed symptoms, configuration changes and confirmed facts. Preserve the original evidence. The team needs one reliable account of what happened, particularly when a later provider message changes an earlier assumption.",
        ],
      },
      {
        id: "scoped-containment",
        title:
          "Contain unsafe actions without losing control of existing exposure",
        paragraphs: [
          "Define the smallest supported pause that prevents new unsafe activity. A copying route might stop new entries while operators continue inspecting existing positions. A funding workflow might suspend new submissions while already-confirmed transactions are reconciled. Record exactly which actions remain permitted and communicate that scope to the team.",
          "An emergency action still requires an authenticated operator, account ownership checks and the relevant order and risk validation. Do not bypass controls to clear a queue faster. If the platform cannot reliably validate or submit an action, record it as unavailable and escalate. Closing positions, cancelling orders and disconnecting a copy relationship have different effects and need separate decisions.",
        ],
        links: [
          {
            label: "Explore risk management controls",
            href: "/risk-management",
          },
          {
            label: "Read cross-platform copy trading controls",
            href: "/insights/cross-platform-copy-trading-risk-controls",
          },
        ],
      },
      {
        id: "uncertain-response",
        title: "Treat a lost response as an uncertain outcome",
        paragraphs: [
          "A request may reach the platform even if its response never reaches your service. Mark that action as uncertain and retain the original request reference. Repeating the same instruction immediately can create another order or transfer. First inspect confirmed platform state and the relevant transaction history to determine what happened.",
          "AWS's Builders' Library explains how caller-provided identifiers can make retries safe when an API supports idempotency, meaning repeated requests represent one intended action. Confirm the actual semantics of your connector. An internal identifier alone does not make a remote trading API idempotent; it still needs correlation, provider support where available, and reconciliation before an ambiguous retry.",
        ],
        bullets: [
          "Keep the original account, action, time and correlation reference.",
          "Distinguish a confirmed rejection from a missing acknowledgment.",
          "Require evidence before retrying an action that could create new exposure.",
        ],
      },
      {
        id: "recovery-reconciliation",
        title: "Reconcile orders, positions and accounting records",
        paragraphs: [
          "Retrieve current positions, pending orders and the available execution history for affected accounts. Compare confirmed external records with persisted internal intentions and outcomes. Account for partial fills, cancellations and actions performed outside the portal. Current open positions alone cannot explain an order that filled and then closed during the interruption.",
          "cTrader Open API exposes a reconciliation request for current open positions and pending orders, plus order-history requests. These are useful building blocks for an adapter's recovery procedure; they do not replace the full comparison. For payment incidents, reconcile provider confirmations against account movements separately and investigate duplicate or missing credit through the funding exception queue.",
        ],
        links: [
          {
            label: "Review deposit and withdrawal controls",
            href: "/insights/brokerage-deposit-withdrawal-controls",
          },
        ],
      },
      {
        id: "resume-criteria",
        title: "Agree measurable conditions before resuming service",
        paragraphs: [
          "Recovery should depend on evidence about the affected workflow. Verify connector authentication, fresh required data, account permissions, accepted configuration and completed reconciliation. Record any unresolved accounts and keep their actions paused. Restore a controlled subset first when the architecture supports it, then observe confirmed outcomes before expanding the scope.",
          "Persist accepted state transitions atomically before publishing recovery events. Keep historical audit and accounting entries append-only. Corrections need a new authorized record explaining the reason and links to the original entries. A healthy connection badge should not erase unresolved exposure, a failed payment or the evidence of a temporary configuration change.",
        ],
        bullets: [
          "Name the recovery approver and the evidence they reviewed.",
          "List unresolved exceptions and the controls that remain active.",
          "Verify one complete permitted workflow after the recovery change.",
        ],
      },
      {
        id: "communication-review",
        title: "Close the incident with a useful account of the outcome",
        paragraphs: [
          "Give members a concise update covering affected functions, current status and the next expected communication time. Distinguish confirmed facts from matters still under investigation. Keep account-specific details in private support cases. Avoid promising that an order was unaffected until execution evidence supports that statement.",
          "After resolution, review detection, containment, reconciliation and communication. Assign concrete fixes with owners and acceptance checks, then rehearse the failure again in an approved test environment. Azuriya's local interface uses simulated execution and illustrative incident states. Its preview can help teams agree the procedure; it is not a record of a live outage or proof of production recovery capability.",
        ],
        links: [
          {
            label: "Plan member support workflows",
            href: "/insights/trading-community-support-workflows",
          },
          {
            label: "Review connector acceptance",
            href: "/insights/trading-platform-integration-checklist",
          },
        ],
      },
    ],
    related: [
      "/risk-management",
      "/insights/trading-platform-integration-checklist",
      "/insights/trading-community-support-workflows",
    ],
    cta: {
      label: "Explore risk and operating controls",
      href: "/risk-management",
    },
    sources: [
      {
        label: "AWS Builders' Library: safe retries and idempotent APIs",
        href: "https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/",
      },
      {
        label: "Spotware: reconciliation and order-history messages",
        href: "https://help.ctrader.com/open-api/messages/",
      },
    ],
  },
];
