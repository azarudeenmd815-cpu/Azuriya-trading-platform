import type { SitePage } from "./site-types";

export const infrastructureArticles: SitePage[] = [
  {
    path: "/insights/cross-platform-copy-trading-risk-controls",
    title:
      "Cross-platform copy trading: the controls behind every copied order.",
    navLabel: "Copy trading risk controls",
    seoTitle: "Cross-Platform Copy Trading Risk Controls | Azuriya",
    eyebrow: "Copy trading · Operations guide",
    description:
      "Plan cross-platform copy trading with symbol mapping, follower sizing, account permissions, execution reconciliation and a practical launch checklist.",
    kind: "article",
    article: {
      category: "Copy trading",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Map the contract",
        text: "A familiar symbol name does not establish equivalent trading specifications.",
      },
      {
        title: "Validate every follower",
        text: "Size, permissions and exposure limits belong to each destination account.",
      },
      {
        title: "Reconcile the outcome",
        text: "Track confirmed fills and exceptions separately from requests that were sent.",
      },
    ],
    sections: [
      {
        id: "define-copy-policy",
        title: "Start with a written copy policy",
        paragraphs: [
          "A copy trading service needs a precise definition of what it copies. Decide whether follower accounts receive new entries, amendments, partial closes, pending orders and exits. Explain what happens when a follower joins while the master already has positions. Copying existing exposure and copying only future trades are different products, with different onboarding decisions.",
          "Record the master account, permitted followers, policy version and effective time. Changing the policy should leave an audit trail. A community membership or channel role alone should never authorize trading on an account; the account owner needs an explicit, revocable permission that the trading service checks.",
        ],
      },
      {
        id: "map-symbols",
        title: "Map specifications, rather than matching labels",
        paragraphs: [
          "Two brokers can label an instrument XAUUSD while using different contract specifications or trading conditions. Build an approved mapping for each source and destination: platform symbol identifier, contract size, quote precision, minimum volume, volume increment, trading session and supported order types. Pause the mapping when any required specification is unavailable or has changed.",
          "Spotware's cTrader Open API documentation exposes symbol volume boundaries and increments, illustrating why an adapter must interpret platform data before accepting a destination size. Its account model also distinguishes hedged and netted accounts. Test how a copied close behaves under the destination account's position model before enabling that route.",
        ],
        bullets: [
          "Reject an unknown instrument instead of selecting a similarly named substitute.",
          "Version mappings and retest them after broker or platform configuration changes.",
          "Keep connector capability checks separate from the public platform logo catalog.",
        ],
        links: [
          {
            label: "Review the platform ecosystem",
            href: "/trading-platforms",
          },
        ],
      },
      {
        id: "follower-sizing",
        title: "Apply sizing and limits to the destination account",
        paragraphs: [
          "Choose a sizing method that the follower understands: a fixed volume, a defined master multiplier, or an approved account-based allocation. State the rounding policy and maximum exposure. For an illustrative 1.00-lot master entry, a fixed 0.10-lot follower instruction is a separate order decision; it does not promise equivalent risk or performance.",
          "The server should validate ownership, available margin, account state, instrument permissions and portfolio limits before every action. Use exact decimal amounts for calculations and store the approved input values with the decision. A minimum volume restriction should produce an explicit skip or rejection, rather than silently increasing an order above the follower's configured limit.",
        ],
        links: [
          {
            label: "Explore risk management controls",
            href: "/risk-management",
          },
        ],
      },
      {
        id: "execution-reconciliation",
        title: "Reconcile execution before attempting a retry",
        paragraphs: [
          "Assign one stable reference to each intended follower action and correlate it with the platform's orders and deals. Persist the action before dispatch. An acknowledgment means the request was received; a confirmed fill establishes executed exposure. These states should appear separately in the operator view.",
          "A timeout creates uncertainty. Query the platform's current state and execution history before sending another instruction, because the first request may already have filled. Record partial fills, rejects and missing responses explicitly. After a disconnect, compare intended follower exposure with confirmed positions and send unresolved differences to an exception queue. Never describe an unresolved action as synced.",
        ],
      },
      {
        id: "pause-and-exit",
        title: "Define pause, exit and incident behavior",
        paragraphs: [
          "Give followers a clear distinction between pausing new entries, disconnecting the master and closing existing copied positions. Specify who retains responsibility for stop and target updates after each action. A disconnected follower should not accidentally receive fresh exposure when a connector recovers.",
          "Prepare an incident procedure for stale quotes, unavailable symbols, expired permissions and repeated rejections. Operators need to see affected accounts, confirmed exposure, last successful reconciliation and the reason copying stopped. Risk-reducing actions still require validation; an emergency label should not bypass account ownership or send an unverified order.",
        ],
      },
      {
        id: "copy-launch-checklist",
        title: "Run a destination-by-destination acceptance test",
        paragraphs: [
          "Test the complete lifecycle in the broker's approved test environment before enabling a route. Include below-minimum sizes, partial fills, repeated messages, a lost response, a closed market and a revoked account permission. Check the user-visible explanation and audit record for each failure, not just the successful entry animation.",
          "Azuriya's local copy trading experience illustrates master-to-engine-to-follower flow using simulated execution. The platform catalog describes an ecosystem; production copying requires verified connectors, broker access, account permissions and tested controls for each route. Use the preview to agree the workflow and acceptance criteria before committing to a live integration.",
        ],
        links: [
          { label: "Open the copy trading preview", href: "/copy-trading" },
        ],
      },
    ],
    related: [
      "/copy-trading",
      "/insights/trading-community-team-permissions",
      "/insights/prop-firm-challenge-risk-rules",
    ],
    cta: { label: "Explore copy trading", href: "/copy-trading" },
    sources: [
      {
        label:
          "Spotware: cTrader Open API symbol, account and execution models",
        href: "https://help.ctrader.com/open-api/model-messages/",
      },
      {
        label: "Spotware: cTrader Open API integration overview",
        href: "https://help.ctrader.com/open-api/",
      },
    ],
  },
  {
    path: "/insights/a-book-liquidity-provider-checklist",
    title: "An A-book liquidity provider checklist for brokerage operators.",
    navLabel: "Liquidity provider checklist",
    seoTitle: "A-Book Liquidity Provider Checklist for Brokers | Azuriya",
    eyebrow: "Infrastructure · Provider selection",
    description:
      "Evaluate A-book liquidity providers with a practical checklist for contracts, routing, execution reports, collateral, failover and operational support.",
    kind: "article",
    article: {
      category: "Infrastructure",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Verify the arrangement",
        text: "Confirm the contracting entity, market access and permitted client flow.",
      },
      {
        title: "Inspect real execution",
        text: "Assess fills, rejects and slippage across the instruments you intend to offer.",
      },
      {
        title: "Plan for exceptions",
        text: "Define collateral, disconnect handling and named escalation contacts.",
      },
    ],
    sections: [
      {
        id: "a-book-definition",
        title: "Translate A-book positioning into an execution policy",
        paragraphs: [
          "For an A-book model, specify how customer exposure is routed to external liquidity and how the resulting execution is reconciled. Document the order path, eligible instruments and treatment of partial fills, rejects and market closures. An A-book label alone does not establish the terms of an individual customer fill.",
          "Keep the client order and external execution references linked so operations can investigate a disputed trade. Azuriya's A-book positioning describes its intended operating model. Production routing requires approved provider arrangements and configured connectivity; the local preview's execution is simulated. Provider logos and supplied screenshots do not establish a live counterparty agreement.",
        ],
        links: [
          {
            label: "Read the A-book execution overview",
            href: "/resources/a-book-execution",
          },
        ],
      },
      {
        id: "counterparty-diligence",
        title: "Confirm who supplies liquidity and under which contract",
        paragraphs: [
          "Ask for the provider's contracting entity, relevant authorizations, supported client categories and service jurisdictions. Verify those details through the appropriate official registers and signed documentation. A recognizable brand may operate through several entities, so a name on a directory is insufficient for the decision.",
          "Clarify whether your counterparty is a prime broker, prime-of-prime, executing broker or another liquidity intermediary. Request the products, settlement arrangements, permitted order flow and termination provisions that apply to your account. Have the responsible legal and compliance teams assess the arrangement before onboarding. This guide is an operational checklist, not a determination of regulatory eligibility.",
        ],
        bullets: [
          "Identify the exact legal entity and the entity receiving collateral.",
          "Obtain the current agreement and instrument schedule.",
          "Confirm restrictions on client location, trading strategies and redistribution.",
        ],
      },
      {
        id: "execution-quality",
        title: "Compare execution under representative conditions",
        paragraphs: [
          "Use a consistent test plan across providers. Compare the same instruments, order sizes, trading sessions and connectivity locations. Inspect available depth, accepted volume, partial fills, rejects and the difference between the requested and executed price. An average spread or a single latency number hides the conditions in which orders fail.",
          "Ask how quotes are formed, how long a quote remains actionable and whether any review or rejection conditions apply. Separate quote delivery time, order round-trip time and confirmed execution time in reports. Record the sample period and environment, and avoid presenting a test result as a guarantee of future execution.",
        ],
      },
      {
        id: "routing-configuration",
        title: "Review symbol routing and markup controls",
        paragraphs: [
          "Build a configuration matrix that links each client instrument to its provider symbol, contract specifications, execution route and approved pricing adjustments. Confirm where spread adjustments and per-lot commissions are applied so the same charge is not introduced twice. Review changes with a second authorized operator and retain the previous configuration.",
          "MetaQuotes documents that its Ultency matching engine can aggregate multiple liquidity sources and configure providers by instrument and client group. Those platform capabilities do not replace your provider contract or your own acceptance tests. Confirm the capabilities enabled in the broker environment you will actually use.",
        ],
        links: [
          { label: "Explore liquidity infrastructure", href: "/liquidity" },
          {
            label: "Understand per-lot commission markups",
            href: "/insights/commission-markups-per-lot",
          },
        ],
      },
      {
        id: "collateral-and-failover",
        title: "Agree collateral and disconnect procedures",
        paragraphs: [
          "Document collateral requirements, margin thresholds, funding deadlines and the process for resolving an unexpected balance difference. Assign an owner to monitor the provider account and define the action required when its capacity falls. Client-facing availability should reflect the capacity of the route that actually executes their orders.",
          "Test a provider disconnect before launch. Define whether new orders are rejected or routed to an approved alternative, what happens to orders with uncertain outcomes, and how open exposure is reconciled. A failover must not silently change execution terms. Include support contacts, escalation times and a method for obtaining a complete execution report during an incident.",
        ],
      },
      {
        id: "provider-sign-off",
        title: "Keep a provider acceptance record",
        paragraphs: [
          "Create one acceptance record per provider with the signed commercial terms, approved instruments, configuration version, test evidence and responsible reviewers. Give unresolved exceptions an owner and due date. Revisit the record when the contract, connectivity location or instrument schedule changes.",
          "The decision should explain why the route fits your intended business, which limitations remain and what evidence will be monitored after launch. This creates a useful operational baseline for future reviews. It also gives support and treasury teams information they can use without inferring business terms from a marketing logo or a screenshot.",
        ],
      },
    ],
    related: [
      "/liquidity",
      "/insights/commission-markups-per-lot",
      "/insights/influencer-brokerage-launch-checklist",
    ],
    cta: { label: "Explore liquidity operations", href: "/liquidity" },
    sources: [
      {
        label: "MetaQuotes: Ultency matching engine and routing configuration",
        href: "https://www.metatrader5.com/en/brokers/ultency",
      },
      {
        label: "MetaQuotes: liquidity provider connectivity overview",
        href: "https://www.metatrader5.com/en/stocks-ecns/liquidity_providers_ecns",
      },
    ],
  },
  {
    path: "/insights/prop-firm-challenge-risk-rules",
    title:
      "Prop firm challenge rules: define the calculation before the limit.",
    navLabel: "Prop firm risk rule guide",
    seoTitle: "Prop Firm Challenge Risk Rules and Drawdown Controls | Azuriya",
    eyebrow: "Prop firms · Rule design",
    description:
      "Define prop firm challenge rules clearly: daily loss, equity drawdown, reset time, payout eligibility, breach handling and reproducible audit records.",
    kind: "article",
    article: {
      category: "Prop firms",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Name the reference",
        text: "Balance, equity and a high-water mark produce different rule behavior.",
      },
      {
        title: "Publish the boundary",
        text: "Specify the clock, comparison operator and treatment of costs.",
      },
      {
        title: "Preserve the evidence",
        text: "A rule outcome should be reproducible from the stored inputs and version.",
      },
    ],
    sections: [
      {
        id: "rule-definition",
        title: "Write rules as an operator and a trader can read them",
        paragraphs: [
          "A challenge rule needs more than a percentage. Specify the account stage, monitored metric, reference amount, time window, threshold, comparison operator and resulting action. State whether the environment is simulated or live and which entity operates the program. Give the trader a worked example that matches the actual configuration.",
          "Keep the published rule version attached to each enrolled account. A later edit should not silently change the terms of an existing challenge. Separate permissions to propose, approve and activate a rule change, and record the effective time. Operators and customer support should be able to identify exactly which policy governed a disputed event.",
        ],
      },
      {
        id: "balance-equity",
        title: "Choose balance or equity explicitly",
        paragraphs: [
          "MetaTrader exposes balance and equity as distinct account properties. A balance-based rule and an equity-based rule can therefore produce different outcomes while a position remains open. Define how floating profit or loss, commission, swaps, credits and other balance operations affect your chosen metric.",
          "For a purely illustrative challenge, take a starting reference of $100,000.00 and a fixed daily allowance of $5,000.00. An equity floor of $95,000.00 follows from those stated inputs. You must still decide whether equity equal to that floor is allowed or is a breach. These figures are a rule-design example, not Azuriya's offered challenge terms or a recommended risk limit.",
        ],
        bullets: [
          "Store monetary inputs and calculated thresholds as exact decimal values.",
          "State which fees and adjustments count toward each metric.",
          "Keep the authoritative calculation on the server, with versioned inputs.",
        ],
      },
      {
        id: "daily-reset",
        title: "Define the daily reset and overnight treatment",
        paragraphs: [
          "Publish the named time zone and reset time rather than using an ambiguous phrase such as end of day. Explain daylight-saving behavior, holidays and how delayed platform events are assigned to a rule period. Keep the original event time as well as the time your service received it.",
          "Describe what happens to an open position across the reset boundary. If the next day's reference uses a snapshot, identify whether it captures balance, equity or another metric. Test a profitable open position before reset that becomes a loss afterward. The user-visible dashboard should show the reference amount, current monitored value, remaining allowance and next reset time together.",
        ],
      },
      {
        id: "drawdown-model",
        title: "Separate fixed and trailing drawdown models",
        paragraphs: [
          "A fixed floor remains tied to a specified starting reference. A trailing floor changes when its defined high-water mark increases. State whether the high-water mark uses balance or equity, when it updates, whether it ever stops trailing, and how withdrawals or approved adjustments affect it. A chart alone is not a definition.",
          "For a separate illustrative trailing model with a $10,000.00 allowance, a recorded high-water mark of $102,500.00 would produce a $92,500.00 floor if the rule subtracts that allowance. Record the high-water mark event that established the floor. Do not substitute this example for the operator's published policy; different reference and update rules create different results.",
        ],
        links: [
          {
            label: "Inspect the risk management workspace",
            href: "/risk-management",
          },
        ],
      },
      {
        id: "breach-and-progression",
        title: "Define breach actions and progression separately",
        paragraphs: [
          "Decide whether a confirmed breach blocks new exposure, changes the account stage, triggers an operator review or invokes an approved position-handling procedure. Identify the exact permissions needed for each action. Do not leave support staff to infer a close-all policy from a failed challenge badge.",
          "Passing a trading target does not automatically establish payout eligibility. Treat minimum activity, prohibited behavior review, identity checks and payout approval as separate conditions where applicable. Show which condition is pending and who can resolve it. A disputed breach needs the triggering metric, threshold, event time, policy version and review history, with corrections added as new records.",
        ],
      },
      {
        id: "risk-rule-testing",
        title: "Test the boundaries before enrolling traders",
        paragraphs: [
          "Create deterministic cases immediately below, at and above each limit. Cover overnight positions, cost postings, duplicate events, late events, a platform outage and an approved account adjustment. Verify both the calculation and the resulting account transition. Repeat the same stored inputs and confirm that the decision can be reproduced.",
          "Azuriya's prop firm preview presents challenge administration and risk workflows using illustrative data. Production rules require approved program terms, a verified platform integration and server-side enforcement. Use the preview to agree the rule specification, review permissions and operator evidence before implementing a program that accepts participants.",
        ],
        links: [
          { label: "Explore the prop firm workspace", href: "/prop-firm" },
        ],
      },
    ],
    related: [
      "/prop-firm",
      "/risk-management",
      "/insights/trading-community-team-permissions",
    ],
    cta: { label: "Explore prop firm controls", href: "/prop-firm" },
    sources: [
      {
        label: "MetaQuotes: MQL5 account balance, equity and margin properties",
        href: "https://www.mql5.com/en/docs/constants/environment_state/accountinformation",
      },
    ],
  },
  {
    path: "/insights/mt5-deposit-reconciliation",
    title:
      "MT5 deposit reconciliation: connect checkout to the account ledger.",
    navLabel: "MT5 deposit reconciliation",
    seoTitle: "MT5 Deposit Reconciliation and Funding Controls | Azuriya",
    eyebrow: "Infrastructure · Funding operations",
    description:
      "Design MT5 funding reconciliation with payment references, verified callbacks, ledger posting, exception handling and separate withdrawal controls.",
    kind: "article",
    article: {
      category: "Infrastructure",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Follow one reference",
        text: "Link the funding request, provider transaction and account posting.",
      },
      {
        title: "Credit exactly once",
        text: "A repeated notification should not create a second balance entry.",
      },
      {
        title: "Reconcile exceptions",
        text: "Account credit and provider settlement need separate confirmation.",
      },
    ],
    sections: [
      {
        id: "native-mt5-funding",
        title: "Understand what native MT5 funding changes",
        paragraphs: [
          "MetaTrader 5 can display deposit and withdrawal operations inside the terminal when the broker enables them. MetaQuotes' help documentation explains that available methods and providers depend on the broker and that the active account is the account being funded. This can shorten the path to checkout, but it does not remove the broker's operational responsibility for a payment.",
          "A separate broker-website deposit link is a different implementation from an enabled native Payments section. Confirm which experience is configured before describing it to clients. Azuriya's local MT5 deposits page is a walkthrough; it does not process payments or establish an active payment provider integration.",
        ],
        links: [
          { label: "See the MT5 deposit walkthrough", href: "/mt5-deposits" },
          {
            label: "Read the MT5 funding introduction",
            href: "/resources/mt5-funding",
          },
        ],
      },
      {
        id: "funding-reference",
        title: "Create a funding instruction with a stable reference",
        paragraphs: [
          "Before checkout, create a server-side instruction that records the authenticated client, tenant, destination account, requested amount, currency and selected provider. Validate account ownership and funding eligibility. Assign an internal reference and correlate it with the provider's transaction identifier and the trading platform's balance-operation reference.",
          "Keep requested amount, charged amount, fee, credited amount and any currency conversion separate. Use exact decimal values and retain the approved conversion inputs. An illustrative $1,000.00 request with a $10.00 fee does not tell you whether the client is charged $1,010.00 or the account receives $990.00; the configured fee treatment must say which applies.",
        ],
      },
      {
        id: "callback-verification",
        title: "Verify notifications and make posting idempotent",
        paragraphs: [
          "A browser returning to a success page is not sufficient evidence to credit an account. Verify the provider notification using that provider's documented authentication method, validate its transaction reference and compare the amount and currency with the expected instruction. Where notification status remains uncertain, obtain an authoritative provider result before posting.",
          "Design processing so the same successful transaction can be received more than once without being credited more than once. Persist the verified result and the ledger transition atomically, then publish the account event. Record repeated notifications and invalid messages as operational evidence. Keep provider-specific verification inside the payment adapter rather than relying on a React checkout screen.",
        ],
        bullets: [
          "Reject a notification that belongs to another tenant or funding instruction.",
          "Preserve the original provider reference and verified event time.",
          "Use a unique posting reference to prevent duplicate credit.",
        ],
      },
      {
        id: "reconciliation-view",
        title: "Reconcile provider, ledger and trading account states",
        paragraphs: [
          "Build a reconciliation view that compares the provider transaction, internal ledger entry and trading account posting. Keep payment authorization, capture, account credit and provider settlement as distinct statuses when the provider's workflow uses them. A deposit visible in a trading account is not itself evidence that the provider has settled funds to the operator.",
          "Give each mismatch a reason, age, assigned owner and next action. Examples include a successful provider transaction without account credit, a pending bank transfer, a rejected conversion, or a settlement difference after fees. Preserve correction entries instead of rewriting the original ledger record. The operator should be able to trace the full sequence from the initial request.",
        ],
        links: [{ label: "Explore funding operations", href: "/funding" }],
      },
      {
        id: "withdrawal-controls",
        title: "Apply withdrawal controls as a separate workflow",
        paragraphs: [
          "A working deposit integration does not establish a complete withdrawal process. Define available methods, account eligibility, verified ownership, available funds, approval roles and provider restrictions. Explain the status of a withdrawal to the client, including whether it is awaiting review, submitted to the provider, paid, rejected or reversed.",
          "Prevent a pending payout from being approved twice, and reconcile the debit with the provider's confirmed result. Set a review path for a changed destination or an account ownership mismatch. Access to a community channel should never authorize a payout. Record the initiating user, approving operator and final transaction reference with each decision.",
        ],
      },
      {
        id: "funding-acceptance-tests",
        title: "Test failure paths alongside successful checkout",
        paragraphs: [
          "Use the provider's approved testing environment to cover duplicate callbacks, failed authentication, incorrect currency, a cancelled checkout, delayed success, missing account credit and a provider outage. Test an account disabled after checkout starts. Confirm that each case leads to a visible, actionable state and does not bypass account checks.",
          "Agree reconciliation responsibility with finance, support and the broker integration team before activation. Document provider processing terms and the schedule for settlement checks. Azuriya's funding and Admin Portal previews can help define these queues and permissions, while actual availability depends on broker configuration, provider approval and a verified production implementation.",
        ],
        links: [
          { label: "Inspect Admin Portal controls", href: "/admin-portal" },
        ],
      },
    ],
    related: [
      "/mt5-deposits",
      "/funding",
      "/insights/brokerage-crm-account-operations",
    ],
    cta: { label: "Explore MT5 deposits", href: "/mt5-deposits" },
    sources: [
      {
        label:
          "MetaQuotes: MT5 deposits, withdrawals and broker-enabled payment methods",
        href: "https://www.metatrader5.com/en/terminal/help/startworking/payments",
      },
      {
        label: "MetaQuotes: integrated payments for brokerage operators",
        href: "https://www.metatrader5.com/en/brokers/payments",
      },
    ],
  },
];
