import type { SitePage } from "./site-types";

export const productPages: SitePage[] = [
  {
    path: "/platform",
    title: "One workspace for your entire trading operation.",
    navLabel: "Platform overview",
    eyebrow: "The Azuriya platform",
    description:
      "Bring accounts, copied trades, funding, community and business controls into a shared portal. Give each person a clear view of the work they own.",
    kind: "product",
    visual: "portal",
    highlights: [
      {
        title: "A connected workspace",
        text: "Move from a team to its accounts, conversations and operational tools without losing context.",
      },
      {
        title: "Purposeful controls",
        text: "Dedicated views for community activity, brokerage configuration and prop firm programs.",
      },
      {
        title: "Explore before you configure",
        text: "Try the interactive portal with clearly labelled example accounts and simulated execution.",
      },
    ],
    sections: [
      {
        id: "platform-workspace",
        title: "Follow the work from one place.",
        paragraphs: [
          "A trading operation spans people, platforms and processes. Azuriya brings these into a common workspace while keeping each area focused on its own task.",
        ],
        bullets: [
          "Overview for activity, positions, funding and commission examples.",
          "Teams and Accounts for people, account groups and platform context.",
          "Copy trading, Community and Analytics for day-to-day coordination.",
          "Administration, Brokerage and Prop firm for business controls.",
        ],
      },
      {
        id: "platform-context",
        title: "Useful detail without a crowded dashboard.",
        paragraphs: [
          "Start with the information that helps you decide what to do next. Open the relevant workspace for account tables, configuration drafts, community threads or execution details.",
          "The preview keeps workspace totals on Overview. Team filters, chart periods and operational disclosures reveal detail where it belongs.",
        ],
      },
      {
        id: "platform-connections",
        title: "A management layer for your configured trading stack.",
        paragraphs: [
          "Trading platforms, payment providers and liquidity connections have different capabilities. A deployment needs agreed connectors, access permissions and reconciliation rules for each service.",
        ],
        bullets: [
          "Confirm supported account and order actions for each connector.",
          "Define funding states and approval responsibilities.",
          "Keep platform activity and operator changes traceable.",
        ],
        links: [
          {
            label: "Explore the platform ecosystem",
            href: "/trading-platforms",
          },
          { label: "Review administration controls", href: "/admin-portal" },
        ],
      },
      {
        id: "platform-preview",
        title: "A working demonstration of the experience.",
        paragraphs: [
          "The public portal demonstrates navigation, charts, community interactions and configuration reviews. Messages and settings are local drafts; trading execution is simulated.",
          "Opening a real operation requires configured infrastructure and the appropriate platform, provider and operator arrangements. The preview does not move money or establish external trading connections.",
        ],
      },
    ],
    steps: [
      {
        title: "Explore",
        text: "Walk through the twelve portal views and identify the workflows your team needs.",
      },
      {
        title: "Define",
        text: "Agree account groups, operator roles, platform connectors and funding responsibilities.",
      },
      {
        title: "Configure",
        text: "Review infrastructure and commercial scope before planning a deployment.",
      },
    ],
    faqs: [
      {
        question: "Can I try the portal now?",
        answer:
          "Yes. The landing page includes an interactive light portal with example data and local settings. Its execution and communication states are demonstrations.",
      },
      {
        question: "Does the portal replace my trading platform?",
        answer:
          "The concept provides a common management workspace around your configured platforms. Available trading actions depend on the connector and platform access agreed for the deployment.",
      },
      {
        question: "Which workspaces can I explore?",
        answer:
          "Overview, Teams, Accounts, Copy trading, Funding, Community, Risk, Analytics, Administration, Prop firm, Brokerage and Platforms are available in the public preview.",
      },
    ],
    related: ["/admin-portal", "/community", "/brokerage", "/prop-firm"],
    cta: { label: "Explore the portal", href: "/#platform" },
  },
  {
    path: "/brokerage",
    title: "Build a brokerage operation around your community.",
    navLabel: "Brokerage",
    eyebrow: "Brokerage solutions",
    description:
      "Connect your front office, trading accounts and operational controls. Plan an A-book model with external liquidity, clear account policies and visible pricing.",
    kind: "product",
    visual: "brokerage",
    highlights: [
      {
        title: "A-book direction",
        text: "An external liquidity routing design that keeps execution architecture visible.",
      },
      {
        title: "Group-level configuration",
        text: "Inspect leverage, symbols, commissions and account policies in one operational view.",
      },
      {
        title: "People and payments",
        text: "Keep community support connected to account and funding context.",
      },
    ],
    sections: [
      {
        id: "brokerage-execution",
        title: "No more B-Book. Only A-book.",
        paragraphs: [
          "Azuriya's brokerage proposition is built around routing to external liquidity providers. Provider selection, account arrangements and routing configuration are part of deployment planning.",
          "The public preview illustrates regional routes, market depth and order states. It does not have live liquidity connections or route orders to an external provider.",
        ],
        links: [{ label: "Explore liquidity options", href: "/liquidity" }],
      },
      {
        id: "brokerage-configuration",
        title: "Set the policy for each account group.",
        paragraphs: [
          "The Brokerage workspace makes routing, instrument pricing and server configuration easier to inspect together. Draft changes have a review step so operators can see the scope before applying a configuration in a connected deployment.",
        ],
        bullets: [
          "Regional route and provider preference examples.",
          "Symbol precision, sessions, order sizes and pricing settings.",
          "Account group leverage and commission markup controls.",
          "Adapter, synchronization and execution monitoring preferences.",
        ],
      },
      {
        id: "brokerage-pricing",
        title: "Show the commission structure clearly.",
        paragraphs: [
          "The preview separates the underlying commission from the additional markup. Its example uses a $2.00 base plus up to $5.00 extra, for a maximum displayed total of $7.00 per lot.",
          "Actual commission, spreads, provider charges and billing arrangements need to be agreed for your operation. The calculator illustrates the split and does not promise revenue.",
        ],
      },
      {
        id: "brokerage-operations",
        title: "Keep the operational handoff visible.",
        paragraphs: [
          "Account support, funding requests and execution questions involve different people. Use role-scoped workspaces and clear review queues so the community team knows when to involve operations.",
        ],
        bullets: [
          "Separate community moderation from account administration.",
          "Review funding status before marking a request complete.",
          "Investigate rejected or delayed execution with platform context.",
        ],
      },
    ],
    faqs: [
      {
        question: "Are liquidity providers connected in the demo?",
        answer:
          "No. The demo shows the intended routing architecture and supplied provider options. Live connectivity requires provider arrangements and a configured execution environment.",
      },
      {
        question: "Can I inspect brokerage settings?",
        answer:
          "Yes. The Brokerage and Administration views include local configuration drafts for routing, pricing, symbols, accounts and operations. Reviewing a draft does not change a trading server.",
      },
      {
        question: "What does the free solution offer cover?",
        answer:
          "The offer introduces Azuriya's brokerage solution for influencers. Platform licences, provider costs, setup work and other commercial charges are scoped separately before a launch.",
      },
    ],
    related: ["/liquidity", "/admin-portal", "/funding", "/solutions/brokers"],
    cta: { label: "Plan your brokerage workspace", href: "/contact" },
  },
  {
    path: "/prop-firm",
    title: "Manage the full prop program lifecycle.",
    navLabel: "Prop firm",
    eyebrow: "Prop firm solutions",
    description:
      "Bring evaluation rules, account progress and payout reviews into a shared operator workspace. Make the program's rules as clear as its dashboard.",
    kind: "product",
    visual: "prop",
    highlights: [
      {
        title: "Program design",
        text: "Inspect evaluation stages, account sizes and trading requirements together.",
      },
      {
        title: "Visible risk rules",
        text: "Show daily loss, drawdown and account headroom with a clear rule context.",
      },
      {
        title: "Payout oversight",
        text: "Review eligibility, profit-share settings and payout conditions in the program workspace.",
      },
    ],
    sections: [
      {
        id: "prop-lifecycle",
        title: "From evaluation to the next stage.",
        paragraphs: [
          "Define a program with understandable stages and explain what participants must complete at each transition. The preview shows evaluation, verification and funded-stage examples.",
        ],
        bullets: [
          "One-step and two-step evaluation models.",
          "Example account sizes of $25,000.00, $50,000.00 and $100,000.00.",
          "Profit targets, minimum trading days and evaluation time limits.",
          "Platform, leverage and reset policy drafts.",
        ],
      },
      {
        id: "prop-risk",
        title: "Put the limit beside the current usage.",
        paragraphs: [
          "Daily loss and maximum loss are different constraints. The program view shows each limit, its example usage and remaining headroom, alongside equity and drawdown charts.",
          "Static and trailing drawdown settings change how a rule is interpreted. A deployed program needs server-calculated decisions and published definitions for reset times, equity treatment and breach handling.",
        ],
        links: [
          { label: "Read about risk controls", href: "/risk-management" },
        ],
      },
      {
        id: "prop-payouts",
        title: "Make payout eligibility easy to review.",
        paragraphs: [
          "A profit-share setting alone does not explain when a payout becomes available. The preview groups the share, timing and review conditions so operators can inspect them as one policy.",
        ],
        bullets: [
          "Profit-share and payout-cycle examples.",
          "Minimum payout and verification requirements.",
          "Operator review and destination confirmation.",
        ],
      },
      {
        id: "prop-participant-experience",
        title: "Give participants a place to ask and understand.",
        paragraphs: [
          "Use dedicated channels for program announcements, account support and session discussions. Keep community roles separate from permission to change a program or review a payout.",
          "All program balances, progress and payouts in the public experience are illustrative. The demo does not issue funded capital, accept challenge fees or make payout decisions.",
        ],
      },
    ],
    steps: [
      {
        title: "Define the program",
        text: "Agree stages, account sizes and participant requirements in plain terms.",
      },
      {
        title: "Review the rules",
        text: "Check loss calculations, timing conventions and payout eligibility against the intended operation.",
      },
      {
        title: "Configure the workflow",
        text: "Plan platform access, operator permissions and participant support before launch.",
      },
    ],
    faqs: [
      {
        question: "Can I change program settings in the preview?",
        answer:
          "Yes. Program setup, risk and payout settings are local drafts with example graphics and review summaries. They do not change a live program.",
      },
      {
        question: "Are the example account sizes available as funded accounts?",
        answer:
          "The displayed sizes are demonstration fixtures. Account issuance, capital arrangements and participant terms must be established for the actual prop firm.",
      },
      {
        question: "Can the community team manage challenge rules?",
        answer:
          "Community access and program administration should have separate permissions. The preview helps you inspect that separation before defining production roles.",
      },
    ],
    related: [
      "/risk-management",
      "/admin-portal",
      "/community",
      "/solutions/prop-firms",
    ],
    cta: { label: "Plan your prop program", href: "/contact" },
  },
  {
    path: "/copy-trading",
    title: "One master account. Individual account controls.",
    navLabel: "Copy trading",
    eyebrow: "Cross-account copy workflow",
    description:
      "See how a trade moves from the master account through the Azuriya copy engine to follower accounts, with separate sizing and risk settings for each participant.",
    kind: "product",
    visual: "copy",
    highlights: [
      {
        title: "A visible trade path",
        text: "Follow the animated route through the engine and every follower branch.",
      },
      {
        title: "Account-level sizing",
        text: "Inspect different follower volumes for the same master trade.",
      },
      {
        title: "Platform context",
        text: "Keep the master and follower platform labels beside their account information.",
      },
    ],
    sections: [
      {
        id: "copy-route",
        title: "Understand the route before enabling it.",
        paragraphs: [
          "The demonstration follows a master order into the copy engine, then distributes it to three follower accounts. Each track shows the direction of travel and can be paused for inspection.",
          "The illustrated master trades 1.00 lot. Its followers show 0.10, 0.30 and 0.15 lot examples, making separate account sizing visible rather than implying every follower receives the same volume.",
        ],
      },
      {
        id: "copy-account-policy",
        title: "Treat each follower as its own account.",
        paragraphs: [
          "A copied instruction still needs an eligible account, a valid instrument and risk checks. The management concept keeps copy settings alongside the account's platform and leverage context.",
        ],
        bullets: [
          "Identify the master relationship and assigned team.",
          "Review follower volume and account limits.",
          "Distinguish synchronized, paused and exception states.",
          "Preserve account ownership and order validation.",
        ],
      },
      {
        id: "copy-platform-differences",
        title: "Cross-platform copying needs a configured connector.",
        paragraphs: [
          "Platform symbols, volume steps and supported order actions can differ. A deployment must define those mappings and confirm the connector's capabilities for both the master and followers.",
          "The public examples use MetaTrader 5, cTrader and TradeLocker labels. They explain the workflow and do not certify live copy connectivity between those services.",
        ],
        links: [
          { label: "Explore the platform catalog", href: "/trading-platforms" },
        ],
      },
      {
        id: "copy-exceptions",
        title: "Leave room for exceptions and review.",
        paragraphs: [
          "A follower can differ from the master because of sizing, account restrictions, pricing or execution conditions. Operators need to see the result for each account instead of treating the master result as confirmation for everyone.",
          "The preview's copy switches and animations affect only the local demonstration. They submit no external orders and make no claim about profitability or execution timing.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does the demo place copied trades?",
        answer:
          "No. It illustrates distribution paths, follower sizes and local pause states. External orders require a connected, authenticated execution environment.",
      },
      {
        question: "Can followers use different platforms?",
        answer:
          "That is part of the cross-platform concept. Actual availability depends on the agreed connectors, symbol mappings and supported order operations for each platform.",
      },
      {
        question: "Will a follower receive the master's exact result?",
        answer:
          "No identical result is promised. Account sizing, prices, trading restrictions and execution conditions can produce different outcomes for each follower.",
      },
    ],
    related: [
      "/platform",
      "/risk-management",
      "/trading-platforms",
      "/solutions/influencers",
    ],
    cta: { label: "Try the copy workflow", href: "/#platform" },
  },
  {
    path: "/community",
    title: "A trading team needs more than a group chat.",
    navLabel: "Team & communication",
    eyebrow: "Community workspace",
    description:
      "Give your team organized channels, direct conversations, shared charts and member context. Bring the discussion closer to the accounts and workflows it supports.",
    kind: "product",
    visual: "community",
    highlights: [
      {
        title: "Organized conversations",
        text: "Separate announcements, market discussions and account support into purposeful channels.",
      },
      {
        title: "Context that stays visible",
        text: "Use pinned messages, threads, chart attachments and shared resources to keep useful information findable.",
      },
      {
        title: "People and permissions",
        text: "Review member presence, community roles and team-specific capability drafts.",
      },
    ],
    sections: [
      {
        id: "community-conversations",
        title: "Give each conversation a home.",
        paragraphs: [
          "The Community view uses a familiar channel rail, message feed and member directory. Announcements have their own space; trading discussion and account support have theirs.",
        ],
        bullets: [
          "Text channels and direct conversations.",
          "Threads, replies, reactions and pinned messages.",
          "Channel search and notification preferences.",
          "Emoji, example attachments and session polls.",
        ],
      },
      {
        id: "community-shared-context",
        title: "Make the message more useful.",
        paragraphs: [
          "A trading discussion benefits from a chart and the explanation around it. The preview includes an annotated candlestick attachment, document previews and reply threads that keep follow-up questions beside the original post.",
          "Composer drafts, attachments and poll selections survive navigation during the current visit. Shared team resources open the channel and pinned context they describe.",
        ],
      },
      {
        id: "community-team-controls",
        title: "Manage the team around the conversation.",
        paragraphs: [
          "The Teams view connects the directory to trading groups and platform account context. Operators can inspect community roles without confusing them with ownership of a trading account.",
        ],
        bullets: [
          "Name and presence filters for the member directory.",
          "Separate permission drafts for each team.",
          "Channel creation, slow-mode and moderation previews.",
          "Example invitations, events and member interest.",
        ],
      },
      {
        id: "community-voice-preview",
        title: "Explore a session room without starting a call.",
        paragraphs: [
          "Voice rooms include join, leave, microphone mute, deafen and screen-sharing states. These demonstrate the controls and their placement alongside the community's text channels.",
          "The public community is a local interaction preview. It does not request microphone access, connect a voice call, publish messages to other users or send real invitations.",
        ],
      },
    ],
    faqs: [
      {
        question: "Are other members receiving my messages?",
        answer:
          "No. Messages, replies and community settings are local demo interactions. The visible members and their posts are example data.",
      },
      {
        question: "Can I use voice or screen sharing in the demo?",
        answer:
          "You can try the control states. The preview does not open your microphone, capture your screen or connect a call.",
      },
      {
        question: "Does a community role grant trading account access?",
        answer:
          "Community roles and account access are separate concerns. Changing a role in the preview does not alter authenticated account ownership or trading permissions.",
      },
    ],
    related: [
      "/platform",
      "/admin-portal",
      "/solutions/educators",
      "/solutions/influencers",
    ],
    cta: { label: "Explore the community workspace", href: "/#platform" },
  },
  {
    path: "/admin-portal",
    title: "Detailed controls. Clear operator responsibility.",
    navLabel: "Admin portal",
    eyebrow: "Administration & MT5 Manager",
    description:
      "Inspect account group policies, instruments, payments and backend settings in one portal. Review what changes, who owns it and which accounts it affects.",
    kind: "product",
    visual: "admin",
    highlights: [
      {
        title: "Scope before settings",
        text: "Choose the account group first, then review its policy and configuration draft.",
      },
      {
        title: "Delegated capabilities",
        text: "Compare community owner, operations manager and analyst access in a role matrix.",
      },
      {
        title: "Review before applying",
        text: "See a before-and-after summary of local draft changes.",
      },
    ],
    sections: [
      {
        id: "admin-group-policy",
        title: "Give each account group an explicit policy.",
        paragraphs: [
          "The account group is the scope for the Administration preview. It ties the leverage and commission example to the selected group, so operators can inspect which configuration they are editing.",
          "The commission example keeps a $2.00 base separate from an additional markup of up to $5.00. At the upper limit, the displayed total is $7.00 per lot.",
        ],
      },
      {
        id: "admin-control-categories",
        title: "Four focused areas of administration.",
        paragraphs: [
          "The preview includes 35 local settings organized by operational responsibility. Related graphics explain the selected instruments, funding policies and adapter relationships.",
        ],
        bullets: [
          "Access & roles: visibility, sessions and delegated capabilities.",
          "Instruments: precision, volume steps, sessions and order policies.",
          "Payments: currencies, methods, review thresholds and receipts.",
          "Operations: adapters, synchronization, event delivery and statements.",
        ],
      },
      {
        id: "admin-manager-connection",
        title: "Plan the bridge to platform administration.",
        paragraphs: [
          "MT5 Manager access and other platform administration interfaces need to be configured for the relevant server and account groups. A connector's permissions determine which actions the portal can perform.",
          "The architecture shows those relationships on demand. Credentials, server permissions and provider configuration belong in a controlled deployment, outside the public demonstration.",
        ],
        links: [
          {
            label: "Read the integration approach",
            href: "/trading-platforms",
          },
        ],
      },
      {
        id: "admin-safeguards",
        title: "Preserve the checks behind every action.",
        paragraphs: [
          "Account ownership, authenticated access, order validation and risk checks remain required safeguards. Operator convenience should not bypass them.",
          "The demo's review actions show configuration summaries only. They do not apply server changes, execute trades, change real permissions or update payment rules.",
        ],
      },
    ],
    faqs: [
      {
        question: "Will a reviewed draft update my MT5 server?",
        answer:
          "No. The public Administration view produces a local review summary. Server changes require an authenticated, configured platform connection and an authorized operator.",
      },
      {
        question: "Can I delegate reporting without full administration?",
        answer:
          "The preview includes an analyst role with reporting access and a role matrix for comparison. Production permissions need to be defined and enforced for your operation.",
      },
      {
        question: "How is the markup example presented?",
        answer:
          "It shows a $2.00 base and a separate additional markup, capped at $5.00 in the preview. The maximum displayed total is $7.00 per lot.",
      },
    ],
    related: ["/brokerage", "/prop-firm", "/funding", "/risk-management"],
    cta: { label: "Inspect the administration preview", href: "/#platform" },
  },
  {
    path: "/liquidity",
    title: "External liquidity. A clear routing design.",
    navLabel: "Liquidity infrastructure",
    eyebrow: "A-book infrastructure",
    description:
      "Explore the liquidity options and routing concept behind Azuriya's A-book proposition. Choose the infrastructure around your instruments, platforms and operating scope.",
    kind: "product",
    visual: "liquidity",
    highlights: [
      {
        title: "External execution model",
        text: "The intended route connects trading accounts through configured infrastructure to liquidity providers.",
      },
      {
        title: "Provider choice",
        text: "The landing page presents 23 distinct provider marks from the supplied option collections.",
      },
      {
        title: "Visible configuration",
        text: "Inspect regions, symbol routing, quote aggregation and markup examples.",
      },
    ],
    sections: [
      {
        id: "liquidity-a-book",
        title: "No more B-Book. Only A-book.",
        paragraphs: [
          "The proposition focuses on external liquidity routing. A suitable deployment needs agreed provider accounts, instrument coverage, execution settings and platform connections.",
          "A-book describes the execution model. It does not remove trading risk or promise a price, fill, profit or processing time.",
        ],
      },
      {
        id: "liquidity-options",
        title: "Inspect options with their own identity.",
        paragraphs: [
          "The supplied collections include provider marks such as Luramic, FxPro, RoboMarkets, CMS Prime, GBE Prime, Scope Prime, Axi Prime and BitDelta. Original collections remain available in the infrastructure references.",
          "These marks identify options supplied for planning. Displaying a logo does not establish a current commercial partnership, connected account or endorsement of Azuriya.",
        ],
        links: [
          {
            label: "View the supplied provider collection",
            href: "/#liquidity",
          },
        ],
      },
      {
        id: "liquidity-routing",
        title: "Plan routing at the instrument level.",
        paragraphs: [
          "Regional infrastructure and symbol settings belong in the same discussion as provider choice. Review where a route terminates, which instruments it serves and how exceptions should be handled.",
        ],
        bullets: [
          "Provider instrument coverage and symbol mappings.",
          "Quote aggregation, price precision and market-depth settings.",
          "Regional route preferences and execution policies.",
          "Monitoring, reconciliation and provider escalation responsibilities.",
        ],
      },
      {
        id: "liquidity-references",
        title: "Separate reference measurements from live status.",
        paragraphs: [
          "The infrastructure section includes native diagrams and the original administrator screenshots. Connection labels and latency figures in those screenshots belong to the supplied references.",
          "The local Azuriya preview uses simulated execution. It has no live provider connections and does not present the reference measurements as current Azuriya performance.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I select a liquidity provider from the catalog?",
        answer:
          "The catalog helps with planning. Provider eligibility, commercial terms and account setup need to be confirmed directly as part of a configured deployment.",
      },
      {
        question: "Are the displayed latency figures Azuriya measurements?",
        answer:
          "No. Any figures visible in supplied screenshots belong to those reference images. The local preview does not measure a live liquidity connection.",
      },
      {
        question: "Does A-book execution guarantee my order will fill?",
        answer:
          "No. A-book describes external routing. Available liquidity, provider rules, prices and market conditions still affect execution.",
      },
    ],
    related: ["/brokerage", "/trading-platforms", "/risk-management"],
    cta: { label: "Discuss your liquidity requirements", href: "/contact" },
  },
  {
    path: "/trading-platforms",
    title: "Build around the platforms your team uses.",
    navLabel: "Trading platforms",
    eyebrow: "Integration ecosystem",
    description:
      "Explore a 32-platform catalog and the management architecture around it. Confirm the connector, permissions and supported actions for every platform in your operation.",
    kind: "product",
    visual: "platforms",
    highlights: [
      {
        title: "32 catalog entries",
        text: "Real platform identities and links to their official websites help you explore the ecosystem.",
      },
      {
        title: "One management concept",
        text: "Accounts, trades, copy settings, funding and community share a portal context.",
      },
      {
        title: "Capability-led planning",
        text: "Platform access and connector configuration determine the actions available in a deployment.",
      },
    ],
    sections: [
      {
        id: "platforms-catalog",
        title: "An ecosystem catalog with recognizable tools.",
        paragraphs: [
          "The landing catalog includes MetaTrader 5, MetaTrader 4, cTrader, TradeLocker, DXtrade, Match-Trader and other trading platforms. Each entry preserves the platform's identity and links to its official website.",
          "The catalog describes the intended ecosystem. It is not a certification that 32 live integrations have been implemented or that every platform supports the same features.",
        ],
        links: [
          {
            label: "Browse all 32 platform entries",
            href: "/#trading-platforms",
          },
        ],
      },
      {
        id: "platforms-capabilities",
        title: "Check the action, not just the platform name.",
        paragraphs: [
          "A platform logo cannot tell you whether an integration supports account creation, order changes, copy execution or payment status. Those capabilities need to be reviewed for the available API and connector.",
        ],
        bullets: [
          "Account discovery, balances and position synchronization.",
          "Supported order types and modification actions.",
          "Symbol precision, volume rules and instrument identifiers.",
          "Permissions, event delivery and reconciliation behavior.",
        ],
      },
      {
        id: "platforms-architecture",
        title: "Keep platform-specific work at the connection boundary.",
        paragraphs: [
          "The management architecture separates the shared portal from platform connectors. That makes it possible to present a consistent workflow while accounting for each platform's capabilities.",
          "Native trading safeguards remain in place. A connector needs to preserve authenticated account ownership, order validation and risk checks rather than treating a portal request as automatic permission to trade.",
        ],
      },
      {
        id: "platforms-launch-scope",
        title: "Start with an explicit integration scope.",
        paragraphs: [
          "Choose the first platforms and the specific workflows that matter for your launch. Record the access required, the actions supported and the behavior when a connection is unavailable.",
          "The public preview uses example platform labels and simulated execution. Live availability must be confirmed before it is represented to your members or clients.",
        ],
      },
    ],
    steps: [
      {
        title: "Name the platform",
        text: "Identify the platform, provider arrangement and administration access available to your operation.",
      },
      {
        title: "Define the actions",
        text: "List account, trading, copy and funding actions that the connector must support.",
      },
      {
        title: "Verify the connection",
        text: "Confirm permissions, mappings and exception handling before enabling the workflow.",
      },
    ],
    faqs: [
      {
        question: "Does the catalog mean every integration is live?",
        answer:
          "No. The 32 entries describe the platform ecosystem. Live connectors, supported features and deployment availability must be confirmed for your scope.",
      },
      {
        question: "Can the portal manage MT5 and other platforms?",
        answer:
          "The architecture is intended to manage configured platform connections from one portal. The available actions depend on each platform API, provider and connector.",
      },
      {
        question: "Why do some actions vary by platform?",
        answer:
          "Platforms expose different APIs, administration permissions and order rules. A connector must account for those differences instead of promising identical support everywhere.",
      },
    ],
    related: ["/platform", "/copy-trading", "/admin-portal", "/mt5-deposits"],
    cta: { label: "Plan your platform connections", href: "/contact" },
  },
  {
    path: "/funding",
    title: "Bring deposits and withdrawals into the workflow.",
    navLabel: "Funding & payments",
    eyebrow: "Funding operations",
    description:
      "Give traders a clear way to follow funding requests and give operators a place to review them. Explore native MT5 deposits and the portal's funding view.",
    kind: "product",
    visual: "funding",
    highlights: [
      {
        title: "Native MT5 deposits",
        text: "Explain a broker-enabled payment journey that starts inside the trading platform.",
      },
      {
        title: "Request visibility",
        text: "Inspect deposit and withdrawal examples with account, currency and status context.",
      },
      {
        title: "Operator review",
        text: "Place methods, fees and approval settings beside the funding policy.",
      },
    ],
    sections: [
      {
        id: "funding-mt5",
        title: "Deposit directly from MT5 when payments are enabled.",
        paragraphs: [
          "Native MT5 funding lets a trader start a deposit from the platform's payment interface. The broker must enable payments and configure an appropriate payment provider.",
          "The payment is processed through the provider's flow. Account credit follows successful processing and any broker approval required by the configuration.",
        ],
        links: [
          { label: "Explore MT5 deposits in detail", href: "/mt5-deposits" },
        ],
      },
      {
        id: "funding-request-states",
        title: "A request needs more than a single balance number.",
        paragraphs: [
          "The Funding preview separates deposits from withdrawals and allows example transactions to be filtered. Each request has an account context and a visible state so operators can inspect the right queue.",
        ],
        bullets: [
          "Distinguish pending, completed and rejected examples.",
          "Review the currency, method and destination context.",
          "Keep withdrawal questions connected to account support.",
          "Confirm completion against the configured provider workflow.",
        ],
      },
      {
        id: "funding-provider-terms",
        title: "Show the terms that apply to the payment.",
        paragraphs: [
          "Methods, accepted currencies, fees and processing times depend on the payment provider and broker settings. Availability can differ by region and account group.",
          "Administration examples include minimum deposits, manual review thresholds, fee disclosure and receipt preferences. These are local policy drafts rather than instructions to a payment service.",
        ],
      },
      {
        id: "funding-demo-boundary",
        title: "Explore the experience without submitting a payment.",
        paragraphs: [
          "The public walkthrough demonstrates the steps from method selection to an illustrative result. It collects no card details, sends no payment request and moves no funds.",
          "A real funding operation needs provider configuration, authenticated account access and a reconciliation process that confirms the payment outcome before updating the authoritative account state.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I make a real deposit from this website?",
        answer:
          "No. The public walkthrough and funding dashboard use illustrative states. They do not collect card information, submit payments or credit an account.",
      },
      {
        question: "What enables deposits inside MT5?",
        answer:
          "The broker needs to enable the platform's payment functionality and configure a payment provider. Supported methods and regions depend on that setup.",
      },
      {
        question: "Are withdrawals automatic?",
        answer:
          "No automatic processing is promised. Withdrawal review, verification, destinations and timing depend on the broker's policy and configured provider.",
      },
    ],
    related: ["/mt5-deposits", "/admin-portal", "/brokerage", "/community"],
    cta: { label: "Explore the funding preview", href: "/#platform" },
  },
  {
    path: "/risk-management",
    title: "Put the rule, the exposure and the decision together.",
    navLabel: "Risk management",
    eyebrow: "Account & program controls",
    description:
      "Inspect account limits, prop program rules and execution safeguards in context. Make the distinction between a dashboard indicator and an enforced trading decision clear.",
    kind: "product",
    visual: "risk",
    highlights: [
      {
        title: "Account context",
        text: "Review leverage, positions and risk limits alongside the account they affect.",
      },
      {
        title: "Program headroom",
        text: "Inspect daily-loss and drawdown examples with their limits and remaining room.",
      },
      {
        title: "Required validation",
        text: "Authentication, ownership, order validation and risk checks remain part of the execution path.",
      },
    ],
    sections: [
      {
        id: "risk-account-policy",
        title: "A limit belongs to a defined scope.",
        paragraphs: [
          "Trading teams can use different platforms, account sizes and leverage policies. The portal concept keeps risk information with the account or program instead of presenting one global indicator as a complete picture.",
        ],
        bullets: [
          "Account group and platform identification.",
          "Leverage, order volume and open position context.",
          "Follower-specific sizing for copied instructions.",
          "Operator access separate from trading account ownership.",
        ],
      },
      {
        id: "risk-prop-definitions",
        title: "Define how a prop rule is calculated.",
        paragraphs: [
          "Daily-loss and drawdown rules need an explicit baseline, reset convention and treatment of equity. Static and trailing models should not be presented as interchangeable.",
          "The preview's program view uses precomputed example values and rule usage rails. A connected deployment must obtain authoritative calculations and breach decisions from the server.",
        ],
        links: [{ label: "Explore prop program controls", href: "/prop-firm" }],
      },
      {
        id: "risk-execution-safeguards",
        title: "Validate the action before publishing the result.",
        paragraphs: [
          "A valid workflow checks authenticated tenant and account ownership before accepting an instruction. Order validation and risk checks are part of the trading path, including for copied instructions.",
          "Authoritative transitions must be persisted before their result is distributed. The portal presents those results; a local interface control is not a substitute for enforcement.",
        ],
      },
      {
        id: "risk-human-review",
        title: "Keep exceptions visible to the operator.",
        paragraphs: [
          "A rejected order, a program limit or a funding review needs enough context for the next action. The preview brings status, account identity and related controls together so the operator can inspect the example.",
          "Risk indicators in the public dashboard are illustrative and do not provide investment advice or a promise that a trading strategy is safe. Trading can result in loss.",
        ],
      },
    ],
    faqs: [
      {
        question:
          "Do the preview's risk controls enforce limits on live accounts?",
        answer:
          "No. The public controls and values are examples. Actual enforcement requires authenticated account access, server-calculated limits and validated trading transitions.",
      },
      {
        question: "Does A-book routing remove account risk?",
        answer:
          "No. Routing an order to external liquidity does not remove market, leverage, execution or account risk.",
      },
      {
        question: "Can copied orders skip the follower's validation?",
        answer:
          "They should not. Each follower needs its own eligible account, instrument mapping, valid order parameters and risk checks.",
      },
    ],
    related: ["/prop-firm", "/copy-trading", "/admin-portal", "/brokerage"],
    cta: { label: "Inspect the risk preview", href: "/#platform" },
  },
  {
    path: "/pricing",
    title: "Start with the solution. Agree the operating costs.",
    navLabel: "Offer & commercial scope",
    eyebrow: "Pricing & launch planning",
    description:
      "Azuriya introduces free brokerage and prop firm solutions for influencers. Define the platform, provider and setup scope before committing to an operation.",
    kind: "product",
    visual: "commercial",
    highlights: [
      {
        title: "Free solution offer",
        text: "An entry point for influencers exploring a brokerage or prop firm workspace.",
      },
      {
        title: "Explicit external costs",
        text: "Platform licences, provider charges and setup work are reviewed separately.",
      },
      {
        title: "A visible commission example",
        text: "The preview separates a $2.00 base from up to $5.00 extra markup per lot.",
      },
    ],
    sections: [
      {
        id: "pricing-free-offer",
        title: "Understand what the offer describes.",
        paragraphs: [
          "The free solution offer introduces the Azuriya workspace concept for influencers. It is not a promise that running a brokerage or prop firm has no external or operational costs.",
          "Your launch scope should identify the services included, the configuration work required and any ongoing commercial obligations. Those details need a written agreement before a deployment.",
        ],
      },
      {
        id: "pricing-commercial-scope",
        title: "Review the parts that determine the quote.",
        paragraphs: [
          "A community using one configured platform has a different operating scope from a business using several platforms, multiple providers and separate program rules. A useful quote starts with those requirements.",
        ],
        bullets: [
          "Trading platform access and licensing arrangements.",
          "Liquidity and payment provider accounts and charges.",
          "Connector development, configuration and setup work.",
          "Hosting, operational support and the agreed service scope.",
        ],
      },
      {
        id: "pricing-markup-example",
        title: "$2.00 base + up to $5.00 extra = $7.00 total.",
        paragraphs: [
          "The commission calculator shows a separate base and additional markup. At its maximum preview setting, the displayed commission is $7.00 per lot: $2.00 base plus $5.00 additional markup.",
          "The example explains the structure. It is not a quoted provider rate, a guaranteed margin or an earnings forecast. Actual charges and revenue depend on the agreed operation and trading activity.",
        ],
        links: [{ label: "Try the commission example", href: "/#revenue" }],
      },
      {
        id: "pricing-planning",
        title: "Bring a concrete scope to the conversation.",
        paragraphs: [
          "Tell us which business model you are planning, the platforms you want to connect and the workflows your team needs. Include the regions, account groups and funding methods relevant to your launch.",
          "The public pages do not establish unlimited usage, a service-level commitment or a fixed deployment price. Commercial terms should be confirmed for the specific scope.",
        ],
      },
    ],
    steps: [
      {
        title: "Describe the operation",
        text: "Choose the brokerage, prop firm or community model you want to build.",
      },
      {
        title: "List the dependencies",
        text: "Identify platforms, providers, regions, account groups and setup requirements.",
      },
      {
        title: "Confirm the agreement",
        text: "Review the included services, external charges and ongoing responsibilities before launch.",
      },
    ],
    faqs: [
      {
        question: "Does free mean there are no launch costs?",
        answer:
          "No. The solution offer is distinct from platform licensing, provider charges, setup work and other commercial or operating costs. Those need to be scoped and agreed.",
      },
      {
        question: "Is $7.00 per lot my guaranteed revenue?",
        answer:
          "No. It is the calculator's total commission example, using a $2.00 base and $5.00 extra markup. It does not guarantee trading volume, earnings or margin.",
      },
      {
        question: "Is there a fixed deployment price on this page?",
        answer:
          "No fixed deployment price is published here. A quote needs the platform, provider, configuration and operating scope of your proposed launch.",
      },
    ],
    related: ["/brokerage", "/prop-firm", "/solutions/influencers"],
    cta: { label: "Discuss your launch scope", href: "/contact" },
  },
  {
    path: "/solutions/influencers",
    title: "Turn your audience into an organized trading community.",
    navLabel: "For influencers",
    eyebrow: "Solutions for influencers",
    description:
      "Explore free brokerage and prop firm solutions built around your community. Bring trading accounts, team conversations and business controls into one experience.",
    kind: "solution",
    visual: "network",
    highlights: [
      {
        title: "A home for the team",
        text: "Give members organized channels, shared resources and visible account context.",
      },
      {
        title: "Choose your business model",
        text: "Explore brokerage configuration, prop programs or a coordinated community workflow.",
      },
      {
        title: "Plan the launch clearly",
        text: "Scope provider, platform and setup arrangements before representing a service as live.",
      },
    ],
    sections: [
      {
        id: "influencer-community",
        title: "Give your audience somewhere to work together.",
        paragraphs: [
          "An audience becomes a team when people can find the right conversation and understand their own account context. Use dedicated spaces for announcements, market discussion, session resources and account support.",
        ],
        bullets: [
          "Community channels, threads and pinned resources.",
          "Member directories, roles and team-specific permissions.",
          "Account and platform context beside trading groups.",
          "Session events, example polls and voice-room controls.",
        ],
      },
      {
        id: "influencer-business-model",
        title: "Decide how the operation should work.",
        paragraphs: [
          "A brokerage, a prop firm and an educational community serve different needs. Azuriya's separate workspaces help you inspect those models before combining them into your launch plan.",
          "The brokerage proposition follows an A-book direction with external liquidity. The prop firm preview focuses on evaluation rules, account progress and payout review. Neither is a live service in the public demo.",
        ],
      },
      {
        id: "influencer-copy-workflow",
        title: "Explain the copy workflow to your members.",
        paragraphs: [
          "The copy illustration shows a master instruction flowing through the engine to follower accounts with different volumes. It gives the community a clearer picture of account sizing and platform relationships.",
          "Copied execution needs configured connectors, account consent and risk checks. Do not present the illustrative route or example results as a promise of identical performance.",
        ],
        links: [
          { label: "Explore the copy trading concept", href: "/copy-trading" },
        ],
      },
      {
        id: "influencer-launch",
        title: "Make the commercial and service scope explicit.",
        paragraphs: [
          "The free solution offer is a starting point. Platform licences, provider charges, setup and operational costs still need to be identified for your business model.",
          "Prepare the platforms, regions, team structure and funding requirements you want to support. Confirm actual availability before making those commitments to your audience.",
        ],
      },
    ],
    steps: [
      {
        title: "Understand your audience",
        text: "Identify the account, education and communication workflows members need.",
      },
      {
        title: "Choose the model",
        text: "Review brokerage, prop firm and community workspaces against your intended service.",
      },
      {
        title: "Define your launch",
        text: "Agree platform access, provider scope and operating responsibilities before activation.",
      },
    ],
    faqs: [
      {
        question: "Can I use the preview for my audience today?",
        answer:
          "You can explore and share the public demonstration. Its example accounts, local messages and simulated trading are not a live community or brokerage service.",
      },
      {
        question: "Can I combine community and business controls?",
        answer:
          "The portal concept brings those areas together while separating their permissions. The exact workflows and live connections need to be scoped for your deployment.",
      },
      {
        question: "What should I prepare for a launch discussion?",
        answer:
          "Bring your intended business model, audience regions, platform choices, account groups and funding needs. That helps define setup requirements and commercial terms.",
      },
    ],
    related: ["/brokerage", "/prop-firm", "/community", "/pricing"],
    cta: { label: "Plan your community launch", href: "/contact" },
  },
  {
    path: "/solutions/brokers",
    title: "Connect the trading operation to the people running it.",
    navLabel: "For brokers",
    eyebrow: "Solutions for brokerage teams",
    description:
      "Bring account groups, routing, pricing, funding and community support into a common operational view. Keep each operator's responsibility clear.",
    kind: "solution",
    visual: "brokerage",
    highlights: [
      {
        title: "Account group control",
        text: "Review leverage, instruments and commission policies for a defined scope.",
      },
      {
        title: "Execution context",
        text: "Inspect the external routing design, market depth and order state examples.",
      },
      {
        title: "Operational coordination",
        text: "Connect support questions to account and funding workflows.",
      },
    ],
    sections: [
      {
        id: "brokers-front-office",
        title: "Bring front-office context closer to operations.",
        paragraphs: [
          "A support team needs to know which account, platform and request a client is discussing. The portal concept links those details to dedicated workspaces without giving every operator full administration access.",
        ],
        bullets: [
          "Account groups and platform identification.",
          "Funding queues and account-support channels.",
          "Operational roles and report access.",
          "Execution details and exception review.",
        ],
      },
      {
        id: "brokers-routing-pricing",
        title: "Inspect routing and pricing as one operating policy.",
        paragraphs: [
          "The Brokerage preview brings regional route choices, instrument settings and commission context together. Its market-depth and execution graphics help explain the selected example configuration.",
          "The intended A-book setup routes to external liquidity. Provider connectivity, commercial accounts and supported instruments must be confirmed before a production launch.",
        ],
        links: [
          { label: "Explore brokerage infrastructure", href: "/brokerage" },
        ],
      },
      {
        id: "brokers-administration",
        title: "Delegate operational work with a defined scope.",
        paragraphs: [
          "Separate reporting, payment review and configuration capabilities. Administration drafts provide a way to review the proposed change and the affected account group before working with a connected server.",
          "Authenticated ownership, order validation and risk controls remain required. A broader portal view does not grant an operator authority over every account.",
        ],
      },
      {
        id: "brokers-rollout",
        title: "Plan a manageable first deployment.",
        paragraphs: [
          "Start with the platforms, provider arrangements and account groups you can verify. Define synchronization, reconciliation and escalation behavior alongside the user-facing workflow.",
          "The public environment is simulated and its administration settings are local drafts. External platform and provider connections are part of the deployment scope, not an assumed feature of the demo.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can this replace my existing platform manager?",
        answer:
          "The concept provides a shared management layer around configured platform administration interfaces. Which manager actions are available depends on the connector and permissions in your deployment.",
      },
      {
        question:
          "Can my analysts use the portal without configuration access?",
        answer:
          "The preview separates report access from broader administration roles. The production permission model must be defined for the relevant tenant, account groups and operator duties.",
      },
      {
        question: "Are route and pricing changes live in the preview?",
        answer:
          "No. They are illustrative drafts and graphics. The public site does not apply changes to a trading server or liquidity provider.",
      },
    ],
    related: ["/brokerage", "/liquidity", "/admin-portal", "/funding"],
    cta: { label: "Discuss your brokerage workflow", href: "/contact" },
  },
  {
    path: "/solutions/prop-firms",
    title: "Run evaluations with clearer rules and better context.",
    navLabel: "For prop firms",
    eyebrow: "Solutions for prop firm teams",
    description:
      "Connect program design, participant progress and operational review. Give the team a common view of account rules, support conversations and payout conditions.",
    kind: "solution",
    visual: "prop",
    highlights: [
      {
        title: "Structured programs",
        text: "Inspect stages, targets and account policies in a dedicated prop firm workspace.",
      },
      {
        title: "Rule visibility",
        text: "Show daily-loss usage, drawdown and equity context beside the program settings.",
      },
      {
        title: "Connected support",
        text: "Organize participant announcements, resources and account questions by channel.",
      },
    ],
    sections: [
      {
        id: "prop-firms-program-design",
        title: "Design the program as a complete policy.",
        paragraphs: [
          "Account size and a profit target are only part of an evaluation. Set the stage structure, trading requirements, leverage, reset behavior and eligibility rules together.",
        ],
        bullets: [
          "One-step or two-step evaluation examples.",
          "Profit targets, minimum trading days and deadlines.",
          "Account platform, leverage and permitted activity.",
          "Verification and progression review conditions.",
        ],
      },
      {
        id: "prop-firms-breach-policy",
        title: "Make breach handling explainable.",
        paragraphs: [
          "Participants need to understand how daily loss and drawdown are measured. Operators need the same definitions when investigating a disputed state or stage transition.",
          "The preview visualizes example headroom and equity. Server-calculated values, timing conventions and an agreed review process are needed for authoritative program decisions.",
        ],
        links: [
          {
            label: "Review the risk management approach",
            href: "/risk-management",
          },
        ],
      },
      {
        id: "prop-firms-payout-policy",
        title: "Review the payout conditions alongside the share.",
        paragraphs: [
          "Place payout timing, minimum amounts and verification requirements beside the example profit share. That makes the full policy easier for operators to review and explain.",
          "No funded capital or payout is issued by the demonstration. Participant terms, capital arrangements and payment processing must be established for the actual business.",
        ],
      },
      {
        id: "prop-firms-participant-support",
        title: "Keep participant support organized as the program grows.",
        paragraphs: [
          "Use announcements for program changes, resources for rule explanations and account-support channels for individual questions. Community role drafts help separate moderation from program administration.",
          "A launch plan should identify the platforms, operator roles, program definitions and provider arrangements needed before a live evaluation can be offered.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I configure more than one evaluation model?",
        answer:
          "The preview includes one-step and two-step choices with several account-size fixtures. Production program availability depends on the rules and platform scope agreed for the deployment.",
      },
      {
        question: "Does the dashboard decide whether a participant has passed?",
        answer:
          "The public dashboard shows illustrative progress. Authoritative stage and breach decisions need server-calculated program values and the actual participant terms.",
      },
      {
        question: "Can support staff change a participant's risk rules?",
        answer:
          "Support and program administration should have separate permissions. The role preview helps you plan those duties but does not change any real account.",
      },
    ],
    related: ["/prop-firm", "/risk-management", "/community", "/admin-portal"],
    cta: { label: "Plan your prop firm workflow", href: "/contact" },
  },
  {
    path: "/solutions/educators",
    title: "Give every trading lesson a place to continue.",
    navLabel: "For educators",
    eyebrow: "Solutions for educators & mentors",
    description:
      "Organize sessions, charts, shared resources and follow-up discussion in a trading team workspace. Keep educational conversation distinct from account administration.",
    kind: "solution",
    visual: "community",
    highlights: [
      {
        title: "Session context",
        text: "Keep a chart, its explanation and follow-up replies together.",
      },
      {
        title: "Findable resources",
        text: "Use pinned messages and team library links for material members return to.",
      },
      {
        title: "Mentor coordination",
        text: "Inspect role permissions, member presence and event interest in the team view.",
      },
    ],
    sections: [
      {
        id: "educators-session-workspace",
        title: "Build the discussion around the lesson.",
        paragraphs: [
          "Use a dedicated channel for a session's preparation, chart discussion and follow-up. Threads let learners ask about a particular point without losing the surrounding conversation.",
        ],
        bullets: [
          "Annotated chart attachments and document previews.",
          "Pinned preparation notes and shared team resources.",
          "Replies, reactions and example session polls.",
          "Direct conversations and organized account-support channels.",
        ],
      },
      {
        id: "educators-team-roles",
        title: "Give mentors the right community capabilities.",
        paragraphs: [
          "The Teams preview separates mentor, moderator, trader and guest capabilities. Inspect who can post, host a session or manage content without treating those permissions as trading account authority.",
          "Member search and presence filters help locate the relevant person. Permission drafts remain separate for each selected team during the current visit.",
        ],
      },
      {
        id: "educators-events",
        title: "Coordinate before and after the session.",
        paragraphs: [
          "Example events, interest controls and voice-room states show where live-session coordination would fit. A weekly communication graphic gives the dashboard a quick view of team activity.",
          "In the public demo, these controls are local examples. They do not send invitations, reserve a meeting, open a microphone or connect a voice call.",
        ],
        links: [
          { label: "Explore the communication workspace", href: "/community" },
        ],
      },
      {
        id: "educators-trading-boundary",
        title: "Keep education and trading responsibility clear.",
        paragraphs: [
          "An educational chart or example copied trade should be presented with its context and limitations. Trading decisions, account ownership and risk checks remain separate responsibilities.",
          "Azuriya's preview helps demonstrate the team experience. It does not provide investment advice, promise learner outcomes or turn an educational example into an executable instruction.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I share charts and session resources?",
        answer:
          "The public workspace demonstrates chart attachments, document previews, pinned posts and resource links. It uses example material and local messages rather than a live shared backend.",
      },
      {
        question: "Can mentors have different permissions from moderators?",
        answer:
          "Yes. The team capability matrix presents separate role drafts for posting, hosting sessions and managing content. Production enforcement requires a configured permission system.",
      },
      {
        question: "Are voice sessions connected in the preview?",
        answer:
          "No. Joining, muting, deafening and screen-sharing controls demonstrate the interface. No microphone, screen capture or live call is started.",
      },
    ],
    related: [
      "/community",
      "/platform",
      "/copy-trading",
      "/solutions/influencers",
    ],
    cta: { label: "Plan your learning community", href: "/contact" },
  },
];
