import type { SitePage } from "./site-types";

export const resourcePages: SitePage[] = [
  {
    path: "/about",
    title: "One place for the entire trading team.",
    navLabel: "About Azuriya",
    eyebrow: "About Azuriya",
    description:
      "Azuriya brings brokerage operations, prop firm programs and community tools into a shared portal built around the people who lead trading communities.",
    kind: "company",
    visual: "network",
    highlights: [
      {
        title: "Built around your community",
        text: "Connect the influencer, the operations team and the individual trader through one workspace.",
      },
      {
        title: "An A-book approach",
        text: "The proposed execution model routes orders to configured liquidity providers, with administration and reporting in the portal.",
      },
      {
        title: "Clear operational control",
        text: "Give teams relevant access to accounts, payments, copy trading and program settings without losing the wider view.",
      },
    ],
    sections: [
      {
        id: "purpose",
        title: "Turn a following into a connected trading workspace.",
        paragraphs: [
          "A trading community needs more than a place to post updates. Members need account visibility, a clear funding journey and a way to understand who can help. Operators need a consistent view of accounts, program rules and the systems behind them.",
          "Azuriya’s proposition is free brokerage and prop firm solutions for influencers, with a shared portal for the entire team. The visitor experience shows how those workflows can fit together before a production configuration is agreed.",
        ],
        links: [
          {
            label: "Solutions for influencers",
            href: "/solutions/influencers",
          },
        ],
      },
      {
        id: "workspace",
        title: "Trading operations and team communication belong together.",
        paragraphs: [
          "The portal demonstration connects account management, cross-account copying, deposits and withdrawals with channels, direct messages, shared resources and member roles. Teams can move from a discussion to the account or operational context it concerns.",
          "Dedicated brokerage, prop firm and administration views show routing choices, group leverage, commission markups and program controls. Each view has its own information and settings so the workspace stays readable.",
        ],
        bullets: [
          "A shared view of trading groups and connected account examples.",
          "Separate workspaces for community activity and business controls.",
          "Permission boundaries that distinguish discussion access from account authority.",
        ],
        links: [{ label: "Explore the platform", href: "/platform" }],
      },
      {
        id: "execution",
        title: "A-book infrastructure with visible configuration.",
        paragraphs: [
          "The intended infrastructure connects directly with liquidity providers. Routing, symbols, pricing and platform connections are presented as configuration choices that operators can inspect in one place.",
          "Provider and platform marks identify options in the intended ecosystem. They do not establish endorsements, signed partnerships or active connectors in this local preview. A production launch needs provider selection, agreements and technical validation.",
        ],
        links: [
          { label: "Liquidity options", href: "/liquidity" },
          { label: "Trading platform ecosystem", href: "/trading-platforms" },
        ],
      },
      {
        id: "preview",
        title: "Explore the product with clear boundaries.",
        paragraphs: [
          "The dashboard is an interactive demonstration. Charts, accounts and financial values are examples; messages and settings are local drafts. Voice controls show interface states without starting a call, and the funding walkthrough does not move money.",
          "The existing terminal uses authenticated, simulated execution. A live service would require connected infrastructure and agreed commercial, operational and legal arrangements. The preview is designed to make those conversations concrete.",
        ],
        links: [
          { label: "Open the dashboard demonstration", href: "/#platform" },
          {
            label: "View launch considerations",
            href: "/resources/getting-started",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Who is Azuriya designed for?",
        answer:
          "The primary audience is influencers and trading community leaders. The proposed workspaces also cover brokerage operators, prop firm teams and educators who need connected account and community workflows.",
      },
      {
        question: "Is the website a live brokerage service?",
        answer:
          "This version is a product preview with local dashboard interactions and simulated terminal execution. It does not establish a live brokerage relationship or make deposits, withdrawals or live trades available.",
      },
      {
        question: "Where can I see the commercial model?",
        answer:
          "The pricing page explains the free solution proposition and the illustrative commission structure. Production scope and third-party costs need to be confirmed for the intended launch.",
      },
    ],
    related: ["/platform", "/solutions/influencers", "/pricing", "/contact"],
    cta: { label: "Explore your launch requirements", href: "/contact" },
  },
  {
    path: "/contact",
    title: "Start with the launch you have in mind.",
    navLabel: "Contact",
    eyebrow: "Launch planning",
    description:
      "Outline your community, operating model and technical requirements. Build a concise inquiry that gives a future partnership or implementation conversation a useful starting point.",
    kind: "company",
    visual: "portal",
    highlights: [
      {
        title: "Partnership scope",
        text: "Describe an influencer community, brokerage operation, prop program or technology integration.",
      },
      {
        title: "Technical context",
        text: "List your trading platforms, account workflows, liquidity needs and payment requirements.",
      },
      {
        title: "A useful brief",
        text: "The inquiry builder prepares a local summary. This preview does not send or submit it externally.",
      },
    ],
    sections: [
      {
        id: "partnership",
        title: "Choose the conversation that fits your business.",
        paragraphs: [
          "Influencers can describe the community they want to bring into a shared trading portal. Brokerage and prop firm teams can explain which operational controls they need and who will manage them.",
          "Technology and service providers can outline the integration they want to explore. Include the type of connection, documentation availability and intended ownership of the production relationship.",
        ],
        bullets: [
          "Community launch and influencer partnership planning.",
          "Brokerage operations, account groups and liquidity routing.",
          "Prop firm evaluation rules, account lifecycle and payouts.",
          "Platform, payment and service-provider integration scope.",
        ],
      },
      {
        id: "technical",
        title: "Give the technical team enough context to assess the scope.",
        paragraphs: [
          "Platform names alone do not define an integration. Account access, trade permissions, symbol mapping, funding events and reporting needs all affect how a connected workflow should be designed.",
          "Keep the initial brief focused on requirements. Do not include account passwords, API keys, card details or private member records. Integration credentials belong in an agreed secure setup process.",
        ],
        bullets: [
          "Trading platforms and the account actions your team needs.",
          "Copy trading sources, destinations and individual risk rules.",
          "Payment providers, currencies and approval workflows.",
          "Operator roles, member roles and reporting requirements.",
        ],
        links: [
          {
            label: "Read the launch checklist",
            href: "/resources/getting-started",
          },
        ],
      },
      {
        id: "commercial",
        title: "Make the operating model explicit.",
        paragraphs: [
          "Describe who owns the community, who manages accounts and who is responsible for brokerage or prop program operations. Include how you expect commissions, markups and other commercial terms to work.",
          "The free brokerage and prop firm solution proposition does not mean every third-party service is free. Liquidity, platform licensing, payments and other production arrangements should be assessed as part of the launch scope.",
        ],
        links: [
          { label: "Review the pricing model", href: "/pricing" },
          { label: "Explore partner integration types", href: "/partners" },
        ],
      },
      {
        id: "local-inquiry",
        title: "Prepare a local inquiry summary.",
        paragraphs: [
          "Use the inquiry builder on this page to select a topic and describe your requirements. Its output is a draft you can review and keep for a future conversation.",
          "This preview has no external contact submission or confirmed published contact details. Creating a summary does not send a message, open a support ticket or promise a response time.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does this page submit my inquiry?",
        answer:
          "No. The builder creates a local summary only. It does not send data to a contact service or notify another person.",
      },
      {
        question: "Can I use the inquiry to request technical support?",
        answer:
          "You can prepare the technical context for a future support conversation. For help navigating this preview, use the help center and the product guides linked there.",
      },
      {
        question: "What should I prepare before a launch discussion?",
        answer:
          "Start with your target members, operating responsibility, trading platforms, account and funding workflows, program rules and commercial assumptions. The getting started guide organizes these into a practical brief.",
      },
    ],
    related: ["/resources/getting-started", "/solutions", "/partners", "/help"],
    cta: {
      label: "Read the launch checklist",
      href: "/resources/getting-started",
    },
  },
  {
    path: "/partners",
    title: "Build a connected operating ecosystem.",
    navLabel: "Partners",
    eyebrow: "Integration ecosystem",
    description:
      "Explore the provider relationships behind a shared trading portal: platform connectivity, liquidity routing, funding and operational services.",
    kind: "company",
    visual: "network",
    highlights: [
      {
        title: "Trading platforms",
        text: "Assess account access, trade operations and event handling for each intended platform connection.",
      },
      {
        title: "Liquidity providers",
        text: "Define routing, instrument coverage and commercial requirements for the intended A-book model.",
      },
      {
        title: "Payments and operations",
        text: "Connect funding journeys with provider processing, broker approvals and operational records.",
      },
    ],
    sections: [
      {
        id: "platform-connections",
        title: "A common portal needs platform-specific connections.",
        paragraphs: [
          "The website includes an intended ecosystem of more than 25 trading platforms. A shared interface can make account and trade workflows easier to operate, while each platform still has its own capabilities and access requirements.",
          "An integration assessment should cover account discovery, permitted trade actions, symbol mapping, event consistency and reconnection behavior. Displaying a platform logo does not certify an active production connector.",
        ],
        links: [
          { label: "Explore the platform catalog", href: "/trading-platforms" },
        ],
      },
      {
        id: "liquidity-connections",
        title: "Configure the provider relationship behind execution.",
        paragraphs: [
          "Azuriya’s proposed A-book model connects directly with liquidity providers. The supplied provider directory presents options to consider for instrument coverage, routing and an intended production relationship.",
          "Availability depends on provider requirements, agreements and infrastructure configuration. The preview does not claim that the listed providers endorse Azuriya, have signed a partnership or are currently carrying orders.",
        ],
        links: [
          { label: "View liquidity options", href: "/liquidity" },
          {
            label: "Understand A-book execution",
            href: "/resources/a-book-execution",
          },
        ],
      },
      {
        id: "funding-connections",
        title: "Keep payment processing and account credit connected.",
        paragraphs: [
          "Funding integrations need a clear handoff between the trading platform, payment provider and broker approval process. Native MT5 deposits illustrate how a member can start from the platform when the broker has enabled the feature.",
          "Provider-supported methods, currencies, processing states and commission rules must be configured for the operating model. Account balances should follow confirmed processing and the required approval workflow.",
        ],
        bullets: [
          "Provider setup and supported payment methods.",
          "Deposit and withdrawal rules by group or region.",
          "Processing updates, approval states and reconciliation.",
        ],
        links: [{ label: "Explore native MT5 funding", href: "/mt5-deposits" }],
      },
      {
        id: "integration-brief",
        title: "Start an integration conversation with a defined scope.",
        paragraphs: [
          "A useful partner brief identifies the integration type, supported capabilities, documentation and the proposed production responsibilities. It should also explain how the connection fits the account, risk and reporting workflows.",
          "The contact page can help organize that brief locally. It does not submit a partnership application or establish commercial terms.",
        ],
        links: [{ label: "Prepare an integration inquiry", href: "/contact" }],
      },
    ],
    faqs: [
      {
        question: "Are the listed providers confirmed Azuriya partners?",
        answer:
          "The directory describes supplied provider options and an intended integration ecosystem. It does not represent signed partnerships, endorsements or currently active connections.",
      },
      {
        question: "Can a platform or payment provider propose a connection?",
        answer:
          "The contact page includes a local inquiry builder for technical and partnership scope. Use it to prepare a clear brief; this preview does not submit it externally.",
      },
      {
        question: "What determines whether an integration can launch?",
        answer:
          "The provider’s capabilities and terms, platform access, configuration, testing and the agreed operational responsibilities all need to fit the intended service.",
      },
    ],
    related: ["/trading-platforms", "/liquidity", "/funding", "/contact"],
    cta: { label: "Prepare a partnership brief", href: "/contact" },
  },
  {
    path: "/resources",
    title: "Understand the system before you configure it.",
    navLabel: "Resources",
    eyebrow: "Product guides",
    description:
      "Practical guides to launching a connected trading community, understanding A-book routing and planning native MT5 funding.",
    kind: "index",
    visual: "portal",
    highlights: [
      {
        title: "Getting started",
        text: "Turn your community and operating requirements into a clear launch brief.",
      },
      {
        title: "A-book execution",
        text: "Understand where routing, liquidity configuration and operational controls meet.",
      },
      {
        title: "Native MT5 funding",
        text: "Follow the member journey and the broker configuration behind platform deposits.",
      },
    ],
    sections: [
      {
        id: "launch-planning",
        title: "Plan the workspace around your operating model.",
        paragraphs: [
          "Start with the people and responsibilities behind your community. The launch guide helps you define account workflows, permissions, program rules and the provider connections a production service would need.",
          "This is a planning guide for the proposed Azuriya experience. It is useful both when exploring the demonstration and when preparing requirements for a future implementation.",
        ],
        links: [
          {
            label: "Read the getting started guide",
            href: "/resources/getting-started",
          },
        ],
      },
      {
        id: "execution-guide",
        title: "Read the execution model with its configuration context.",
        paragraphs: [
          "The A-book guide explains the proposed path from account validation to configured liquidity routing and trade reporting. It separates an execution approach from the assumptions that still require provider selection and technical verification.",
          "Use it alongside the brokerage, liquidity and risk pages to see how the operational views fit together.",
        ],
        links: [
          {
            label: "Read the A-book execution guide",
            href: "/resources/a-book-execution",
          },
          { label: "Explore brokerage controls", href: "/brokerage" },
        ],
      },
      {
        id: "funding-guide",
        title: "Explore deposits from the trader’s point of view.",
        paragraphs: [
          "Native MT5 payments can let members begin a deposit within their trading platform when the broker has enabled and configured the feature. The funding guide follows that journey and explains the handoff to provider processing and account approval.",
          "The dedicated product page includes desktop and mobile examples plus an illustrative walkthrough. Neither page takes card details or creates a payment.",
        ],
        links: [
          {
            label: "Read the MT5 funding guide",
            href: "/resources/mt5-funding",
          },
          { label: "View the MT5 deposits experience", href: "/mt5-deposits" },
        ],
      },
      {
        id: "product-reference",
        title: "Find the detail for the workspace you need.",
        paragraphs: [
          "Product pages explain the workflows behind the portal demonstration. Use them to compare account administration, copying, communication, program controls and funding requirements before exploring the local mock.",
          "The help center answers navigation questions and explains which interactions are local demonstrations. The status page describes the current preview boundary without presenting third-party infrastructure as connected.",
        ],
        links: [
          { label: "Browse the platform", href: "/platform" },
          { label: "Open the help center", href: "/help" },
          { label: "View preview status", href: "/status" },
        ],
      },
    ],
    related: [
      "/resources/getting-started",
      "/resources/a-book-execution",
      "/resources/mt5-funding",
      "/help",
    ],
    cta: { label: "Explore the dashboard", href: "/#platform" },
  },
  {
    path: "/resources/getting-started",
    title: "Plan your trading community launch.",
    navLabel: "Getting started",
    eyebrow: "Launch guide",
    description:
      "A practical starting point for influencers, brokerage teams and prop operators who want accounts, trading workflows and communication in one portal.",
    kind: "article",
    visual: "portal",
    highlights: [
      {
        title: "Define the offer",
        text: "Clarify the audience, account journey and responsibility behind the service you want to launch.",
      },
      {
        title: "Map the workflows",
        text: "Connect platforms, copying, funding, community access and operating permissions.",
      },
      {
        title: "Validate the setup",
        text: "Review provider connections, rules, commercial terms and production readiness before launch.",
      },
    ],
    sections: [
      {
        id: "offer",
        title: "1. Define who the workspace serves.",
        paragraphs: [
          "Begin with your members and the experience you want to offer them. An influencer community, a brokerage operation and a prop evaluation program can share infrastructure while needing different account lifecycles and support workflows.",
          "Write down who owns the service, who operates it and who can approve account or payment actions. Community leadership and trading-account authority should be explicit rather than inferred from a chat role.",
        ],
        bullets: [
          "Target members and the purpose of each trading group.",
          "Brokerage or prop program responsibility and account ownership.",
          "Onboarding, member support and escalation expectations.",
        ],
        links: [{ label: "Compare the solution paths", href: "/solutions" }],
      },
      {
        id: "platforms",
        title: "2. Map platforms, accounts and copied trades.",
        paragraphs: [
          "List the trading platforms you want to connect and the actions each account needs. Account visibility, trade execution, copy destinations and reporting are separate capabilities that should be checked for each connection.",
          "For copying, define the source account and destination groups, then document how individual risk rules affect allocation. A common symbol name or a shared interface does not remove platform differences or risk checks.",
        ],
        bullets: [
          "Source and destination accounts, with authenticated ownership.",
          "Instrument mapping, trade permissions and allocation rules.",
          "Connection states, error handling and reconciliation needs.",
        ],
        links: [
          { label: "Explore copy trading", href: "/copy-trading" },
          {
            label: "Review the platform ecosystem",
            href: "/trading-platforms",
          },
        ],
      },
      {
        id: "operational-rules",
        title: "3. Specify funding, pricing and program rules.",
        paragraphs: [
          "Plan deposit and withdrawal methods with the relevant provider and broker settings. Include supported currencies, approval rules, fee disclosure and the processing states members should see.",
          "For a brokerage, specify group leverage and commission configuration. For a prop program, define evaluation stages, daily-loss and drawdown rules, payout conditions and who can review exceptions. Keep the rules visible to the people responsible for applying them.",
        ],
        links: [
          { label: "Funding workflows", href: "/funding" },
          { label: "Administration controls", href: "/admin-portal" },
          { label: "Prop firm programs", href: "/prop-firm" },
        ],
      },
      {
        id: "community",
        title: "4. Structure communication around the team.",
        paragraphs: [
          "Use announcements for shared context, trading channels for session discussions and support channels for account questions. Define moderator, mentor, trader and guest responsibilities so members understand where to post and who can help.",
          "The local Community and Teams demonstrations let you try channels, direct messages, threads, pins, roles and events. They help review the interaction model; they do not publish messages or change production account permissions.",
        ],
        links: [{ label: "Explore community tools", href: "/community" }],
      },
      {
        id: "readiness",
        title: "5. Review the production requirements.",
        paragraphs: [
          "Before offering a live service, confirm the provider relationships, platform access, operational rules and applicable commercial and legal arrangements for the intended launch. Verify the account journey, permissions, risk enforcement, funding and records through the full workflow.",
          "Use the contact inquiry builder to gather your requirements into a local brief. The current website remains a product preview with simulated execution and unconnected third-party integrations.",
        ],
        links: [
          { label: "Prepare a launch inquiry", href: "/contact" },
          { label: "Read the current preview status", href: "/status" },
        ],
      },
    ],
    faqs: [
      {
        question: "Can I launch a live brokerage from this preview?",
        answer:
          "The preview helps you review the product and prepare requirements. Live operation needs connected providers, verified workflows and the agreed operational, commercial and legal setup.",
      },
      {
        question: "Does a community role provide trading-account access?",
        answer:
          "A communication role and authenticated account authority are separate concerns. Production account actions must preserve ownership checks, permissions and risk enforcement.",
      },
      {
        question:
          "Where should I start if my technical scope is still unclear?",
        answer:
          "Start with the member journey and operating responsibilities. Then list required platforms, account actions, copying, payments and program rules. The contact page can organize these into a local inquiry draft.",
      },
    ],
    related: ["/solutions", "/admin-portal", "/risk-management", "/contact"],
    cta: { label: "Prepare your launch brief", href: "/contact" },
  },
  {
    path: "/resources/a-book-execution",
    title: "Understand the A-book execution model.",
    navLabel: "A-book execution guide",
    eyebrow: "Infrastructure guide",
    description:
      "A guide to the proposed account-to-liquidity workflow, the configuration behind routing and the controls that remain essential around execution.",
    kind: "article",
    visual: "liquidity",
    highlights: [
      {
        title: "Direct provider routing",
        text: "The intended model connects the execution workflow with configured liquidity providers.",
      },
      {
        title: "Visible configuration",
        text: "Inspect routing choices, symbols, pricing and group settings through the operational portal.",
      },
      {
        title: "Validated account actions",
        text: "Authentication, ownership checks and risk enforcement still apply before any authorized trade action.",
      },
    ],
    sections: [
      {
        id: "routing-model",
        title: "What Azuriya means by an A-book approach.",
        paragraphs: [
          "The proposed Azuriya model routes trading activity to configured liquidity providers. The visitor message, “No more B-Book. Only A-book,” describes that intended execution approach.",
          "The current local portal illustrates the routing path and administration controls. It does not route live orders, prove a provider connection or make the reference screenshots’ connection states current Azuriya measurements.",
        ],
        links: [
          { label: "View the liquidity architecture", href: "/liquidity" },
        ],
      },
      {
        id: "configuration",
        title: "The route depends on a configured provider relationship.",
        paragraphs: [
          "A production setup needs provider selection, supported instruments, symbol mapping and an agreed routing configuration. These choices should align with the account groups and trading platforms the service intends to operate.",
          "The portal preview exposes regional routing choices, selected instruments and market-depth graphics so visitors can understand that structure. Provider availability and production terms still require confirmation.",
        ],
        bullets: [
          "Liquidity provider selection and connection configuration.",
          "Instrument coverage, symbol mapping and quote handling.",
          "Account groups, pricing rules and permitted trade actions.",
        ],
        links: [{ label: "Explore brokerage controls", href: "/brokerage" }],
      },
      {
        id: "trade-lifecycle",
        title: "Follow the trade through its operational lifecycle.",
        paragraphs: [
          "An account action begins with authenticated access and validation. Required ownership and risk checks should remain in place before the action reaches an execution adapter or configured route.",
          "Execution updates then need a consistent account and reporting view. Trading transitions and their records should be persisted before events are published so teams can inspect what occurred and reconcile the resulting state.",
        ],
        bullets: [
          "Validate the account, instrument and requested action.",
          "Apply account and program risk rules.",
          "Route through the configured execution connection.",
          "Record transitions and surface execution results.",
        ],
        links: [
          { label: "Read about risk controls", href: "/risk-management" },
        ],
      },
      {
        id: "pricing",
        title: "Routing and commission configuration are separate choices.",
        paragraphs: [
          "The administration preview includes group leverage and commission markups. Its exact illustration uses a $2.00 base commission per lot with up to $5.00 additional markup, producing a $7.00 total when the full example markup is selected.",
          "That example explains the interface and the fee split. It is not a quoted provider contract, guaranteed earnings or a statement that all instruments and services use the same pricing.",
        ],
        links: [
          { label: "Review commission configuration", href: "/admin-portal" },
          { label: "Explore the pricing model", href: "/pricing" },
        ],
      },
    ],
    steps: [
      {
        title: "Validate",
        text: "Confirm authenticated account access and the requested action.",
      },
      {
        title: "Check risk",
        text: "Apply the configured account and program constraints.",
      },
      {
        title: "Route",
        text: "Pass the authorized action to the configured liquidity connection.",
      },
      {
        title: "Record",
        text: "Persist the outcome and surface the resulting execution state.",
      },
    ],
    faqs: [
      {
        question: "Does A-book routing guarantee a trading result?",
        answer:
          "No. A routing model does not guarantee profitability, a specific fill price or any particular trading outcome. The page explains the intended infrastructure rather than a performance promise.",
      },
      {
        question: "Are the displayed latency figures live measurements?",
        answer:
          "The supplied infrastructure screenshots contain reference values. They are not live Azuriya latency measurements or service-level commitments.",
      },
      {
        question: "Is the local terminal connected to a liquidity provider?",
        answer:
          "The existing terminal uses authenticated simulated execution. Third-party production execution is not connected in this preview.",
      },
    ],
    related: [
      "/liquidity",
      "/brokerage",
      "/risk-management",
      "/resources/getting-started",
    ],
    cta: { label: "Explore the routing preview", href: "/#infrastructure" },
  },
  {
    path: "/resources/mt5-funding",
    title: "Plan deposits directly from MetaTrader 5.",
    navLabel: "MT5 funding guide",
    eyebrow: "Funding guide",
    description:
      "Understand the member journey, payment-provider handoff and broker configuration behind native MT5 deposits.",
    kind: "article",
    visual: "funding",
    highlights: [
      {
        title: "Start in the platform",
        text: "Members can begin from MT5’s payment interface when their broker has enabled native funding.",
      },
      {
        title: "Process with a provider",
        text: "Payment details and processing follow the selected provider’s flow and supported methods.",
      },
      {
        title: "Credit after confirmation",
        text: "The account update follows successful processing and the configured broker approval rules.",
      },
    ],
    sections: [
      {
        id: "member-journey",
        title: "Keep the funding entry point close to the trading account.",
        paragraphs: [
          "A member can open the payment interface in MT5, select an amount and choose an available method when native payments have been enabled by the broker. The experience can include the supported currency, applicable commission and the approximate charge before continuing.",
          "The dedicated deposits page presents desktop and mobile references plus a local walkthrough. It shows the intended user journey without collecting card data or making a payment request.",
        ],
        links: [{ label: "View the MT5 deposits page", href: "/mt5-deposits" }],
      },
      {
        id: "provider",
        title: "Let the payment provider handle its checkout.",
        paragraphs: [
          "The selected provider processes the payment through its own flow. The configured integration communicates the processing outcome back to the broker’s system so it can determine the next account action.",
          "Available methods, currencies, conversion, fees and processing time depend on the provider terms and broker configuration. A familiar payment logo alone does not establish availability for every member or region.",
        ],
        bullets: [
          "Show only methods enabled for the relevant member and account group.",
          "Present configured fees and currency information before proceeding.",
          "Keep payment credentials within the provider’s processing flow.",
        ],
      },
      {
        id: "broker-controls",
        title: "Configure the approval and account rules behind the interface.",
        paragraphs: [
          "Broker administration can define payment wallets, supported currencies, country and group availability, commission rules and processing conditions. Deposit and withdrawal rules determine whether an action requires review or can follow the configured automatic path.",
          "A payment marked successful should still follow the required approval process before the corresponding account credit is reflected. Operational records should make the processing and approval states clear.",
        ],
        bullets: [
          "Provider and wallet configuration.",
          "Currency, country and account-group availability.",
          "Deposit limits, withdrawal limits and commission rules.",
          "Approval conditions, processing notifications and reconciliation.",
        ],
        links: [
          { label: "Explore funding controls", href: "/funding" },
          { label: "View the administration portal", href: "/admin-portal" },
        ],
      },
      {
        id: "launch-checks",
        title: "Review the full funding journey before production use.",
        paragraphs: [
          "Confirm that the broker and provider configuration supports the intended member groups. Check displayed methods and fees, processing updates, approval behavior, failed-payment states and the resulting account records.",
          "The local preview changes illustrative steps only. It does not connect to a payment provider, accept deposits, initiate withdrawals or commit an account balance update.",
        ],
        links: [
          { label: "Prepare your funding requirements", href: "/contact" },
        ],
      },
    ],
    steps: [
      {
        title: "Open Payments",
        text: "Start from the enabled payment interface in MetaTrader 5.",
      },
      {
        title: "Choose the amount",
        text: "Review the currency, available method and configured commission.",
      },
      {
        title: "Complete provider checkout",
        text: "Continue through the selected payment provider’s flow.",
      },
      {
        title: "Confirm account credit",
        text: "Follow successful processing and the broker’s approval rules.",
      },
    ],
    faqs: [
      {
        question: "Can every MT5 user deposit directly from the platform?",
        answer:
          "Native funding depends on the broker enabling the feature and configuring a payment provider. Available methods and currencies depend on that setup and the relevant provider terms.",
      },
      {
        question: "Is account credit always immediate?",
        answer:
          "Processing and account credit depend on the payment method, provider status and configured broker approval rules. This preview makes no fixed processing-time promise.",
      },
      {
        question: "Can I try a real deposit in this website?",
        answer:
          "No. The MT5 walkthrough is illustrative. It collects no card details, sends no payment request and moves no funds.",
      },
    ],
    related: ["/mt5-deposits", "/funding", "/admin-portal", "/help"],
    cta: { label: "Explore the funding walkthrough", href: "/mt5-deposits" },
  },
  {
    path: "/help",
    title: "Find your way around Azuriya.",
    navLabel: "Help center",
    eyebrow: "Help center",
    description:
      "Explore the dashboard, understand local demo interactions and find the product guides for account, funding and community workflows.",
    kind: "company",
    visual: "community",
    highlights: [
      {
        title: "Dashboard navigation",
        text: "Use dedicated workspace and business-control views instead of searching one crowded screen.",
      },
      {
        title: "Local interactions",
        text: "Try drafts, filters and previews with clear boundaries around what changes in this demonstration.",
      },
      {
        title: "Product context",
        text: "Read practical guides for launch planning, execution and platform-native funding.",
      },
    ],
    sections: [
      {
        id: "dashboard-help",
        title: "Navigate the dashboard by the task you need.",
        paragraphs: [
          "Open the home-page dashboard and use its sidebar to move between Overview, Teams, Accounts, Copy trading, Funding, Community, Risk and Analytics. Administration, Prop firm, Brokerage and Platforms contain the operational previews.",
          "Overview is the place for workspace totals and the activity graphic. Other views show their relevant information directly. Team and transaction filters affect the example data where those filters apply.",
        ],
        links: [
          { label: "Open the dashboard", href: "/#platform" },
          { label: "Read the platform overview", href: "/platform" },
        ],
      },
      {
        id: "community-help",
        title: "Explore communication and team controls.",
        paragraphs: [
          "Community contains text channels, direct conversations, message search, threads, pinned context, reactions, charts and files. Channel settings, moderation and event controls let you review the interaction model.",
          "Teams adds a member directory, presence filters, local role drafts and a permission matrix. Shared resources open their stated community channel. Drafts remain available when you switch dashboard views during the current visit.",
        ],
        bullets: [
          "Select a channel or direct conversation before composing a message.",
          "Open a thread to keep a reply attached to its original context.",
          "Use the member panel and Teams view to inspect roles and presence.",
          "Voice-room controls show local states and do not start a real call.",
        ],
        links: [{ label: "Read about community tools", href: "/community" }],
      },
      {
        id: "trading-funding-help",
        title: "Understand accounts, trading and funding in the preview.",
        paragraphs: [
          "The dashboard’s account, trade, commission and funding figures are examples. Its configuration forms prepare local summaries and do not execute trades, change a server or move money.",
          "The terminal is a separate authenticated simulated trading application. The MT5 deposits page explains broker-enabled native funding through a provider, with a walkthrough that sends no payment requests.",
        ],
        links: [
          { label: "Open the simulated terminal", href: "/terminal" },
          {
            label: "Read the MT5 funding guide",
            href: "/resources/mt5-funding",
          },
          { label: "View preview status", href: "/status" },
        ],
      },
      {
        id: "planning-help",
        title: "Gather the context for an implementation question.",
        paragraphs: [
          "If you are evaluating a launch, start with the workflow you need, the trading platforms involved and the role of the person taking the action. A useful technical question describes the account or funding state and the expected outcome without exposing credentials.",
          "The contact page helps prepare this context as a local inquiry summary. It does not send a support request or provide a confirmed external support channel.",
        ],
        links: [
          {
            label: "Read the launch guide",
            href: "/resources/getting-started",
          },
          { label: "Prepare an inquiry", href: "/contact" },
        ],
      },
    ],
    faqs: [
      {
        question: "Will my dashboard message be delivered to another person?",
        answer:
          "Messages and replies are local demonstration state. They do not publish to a live community service or notify other users.",
      },
      {
        question: "Can I use the voice controls for a real meeting?",
        answer:
          "The voice controls demonstrate join, mute, deafen and screen-sharing states. They do not request a microphone or camera, transmit media or start a call.",
      },
      {
        question:
          "Do dashboard settings change the terminal or a trading server?",
        answer:
          "Dashboard role, program and administration settings are local drafts. They do not alter authenticated account ownership, terminal risk rules or production server configuration.",
      },
      {
        question:
          "Why does a listed platform or provider show no live connection?",
        answer:
          "The catalog presents an intended integration ecosystem. This preview does not connect third-party trading platforms, liquidity providers or payment providers.",
      },
      {
        question: "Where can I learn about deposits directly from MT5?",
        answer:
          "Open the MT5 deposits product page or the MT5 funding guide. They explain the enabled-platform journey, provider checkout and broker approval requirements.",
      },
    ],
    related: ["/resources", "/platform", "/mt5-deposits", "/contact"],
    cta: { label: "Explore the dashboard", href: "/#platform" },
  },
  {
    path: "/status",
    title: "Know what this preview connects to.",
    navLabel: "Preview status",
    eyebrow: "Preview status",
    description:
      "A clear view of the local demonstration, the authenticated simulated terminal and the third-party services that are not connected in this version.",
    kind: "status",
    visual: "network",
    highlights: [
      {
        title: "Local product preview",
        text: "Visitor pages and dashboard interactions run in the current development preview.",
      },
      {
        title: "Simulated terminal",
        text: "The existing terminal uses authenticated simulated execution rather than live provider routing.",
      },
      {
        title: "External services unconnected",
        text: "Production trading platforms, liquidity, payments and live communications are not connected here.",
      },
    ],
    sections: [
      {
        id: "product-preview",
        title: "Dashboard: local demonstration.",
        paragraphs: [
          "The dashboard uses example accounts, charts and financial figures. Its filters, navigation and graphical previews demonstrate how the proposed portal can organize trading and operational tasks.",
          "Messages, replies, settings, event selections and permission changes stay in local demonstration state. They do not send messages to another person, modify a trading server or commit a financial transaction.",
        ],
        bullets: [
          "Account and financial displays: illustrative fixtures.",
          "Community and team actions: local interface state.",
          "Administration and program settings: demonstration drafts.",
        ],
        links: [{ label: "Explore the dashboard", href: "/#platform" }],
      },
      {
        id: "terminal-status",
        title: "Terminal: authenticated simulated execution.",
        paragraphs: [
          "The existing terminal is separate from the marketing dashboard mock. It retains authenticated account workflows and a simulated execution model, with validation and risk checks required for account actions.",
          "This description is an implementation boundary. It is not a real-time health monitor, an uptime measurement or confirmation that a service is reachable from every device.",
        ],
        links: [{ label: "Open the terminal", href: "/terminal" }],
      },
      {
        id: "external-status",
        title: "Third-party connections: not connected in this preview.",
        paragraphs: [
          "Platform and liquidity-provider logos identify the intended ecosystem and supplied options. The website does not establish an active trading connection, an executed provider agreement or a current latency measurement.",
          "The MT5 deposits walkthrough is also illustrative. Payment checkout, funds movement, live voice calls and external contact submissions are not connected to production services in this version.",
        ],
        bullets: [
          "Live trading-platform adapters and liquidity-provider routing: not connected.",
          "Payment processing, deposits and withdrawals: not connected.",
          "Live messaging, voice and screen sharing: not connected.",
          "External inquiry delivery: not connected.",
        ],
        links: [
          { label: "Integration ecosystem", href: "/partners" },
          { label: "Native MT5 deposit explanation", href: "/mt5-deposits" },
        ],
      },
      {
        id: "status-boundary",
        title: "Production monitoring requires the production service.",
        paragraphs: [
          "This page publishes no uptime percentage, service-level commitment or incident history. A production status service would need live monitoring sources and a defined scope for each connected system.",
          "Use the help center for preview navigation and the launch guide to understand the configuration and validation work required before a live service is offered.",
        ],
        links: [
          { label: "Open the help center", href: "/help" },
          {
            label: "Review launch requirements",
            href: "/resources/getting-started",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Is this a live service-status dashboard?",
        answer:
          "No. It explains the current product preview and connection boundaries. It does not poll production infrastructure or report real-time availability.",
      },
      {
        question:
          "Do the provider screenshot latency values apply to Azuriya now?",
        answer:
          "No. The screenshots are supplied infrastructure references. Their latency and connection statuses are not current Azuriya measurements.",
      },
      {
        question: "What happens if I click a deposit or voice control?",
        answer:
          "The interface changes its local demonstration state. It does not initiate a real payment, transfer funds or establish a voice connection.",
      },
    ],
    related: ["/help", "/partners", "/resources/getting-started", "/contact"],
    cta: { label: "Read the launch guide", href: "/resources/getting-started" },
  },
  {
    path: "/solutions",
    title: "Choose the workspace for your operating model.",
    navLabel: "Solutions",
    eyebrow: "Solutions",
    description:
      "Free brokerage and prop firm solutions for influencers, with connected workflows for brokers, prop operators and trading educators.",
    kind: "index",
    visual: "network",
    highlights: [
      {
        title: "Community-led launches",
        text: "Bring members, account visibility, copying and communication into one branded operating experience.",
      },
      {
        title: "Operational workspaces",
        text: "Give brokerage and prop teams clear views of configuration, program rules and account activity.",
      },
      {
        title: "A shared foundation",
        text: "Connect team collaboration with the platform, funding and risk workflows behind the service.",
      },
    ],
    sections: [
      {
        id: "influencers",
        title: "For influencers and community leaders.",
        paragraphs: [
          "Build the trading workspace around your community. The proposed experience brings account context, copy trading, funding visibility and Discord-style team communication together so members have a clear place to participate.",
          "The free brokerage and prop firm solution proposition is explained alongside the configurable commission model. Production terms and third-party requirements should be assessed for the launch you intend to operate.",
        ],
        bullets: [
          "Team spaces, announcements and member roles.",
          "Account visibility and cross-account copying.",
          "A clear member journey from onboarding to support.",
        ],
        links: [
          {
            label: "Explore influencer solutions",
            href: "/solutions/influencers",
          },
        ],
      },
      {
        id: "brokers",
        title: "For brokerage operations.",
        paragraphs: [
          "Inspect the proposed A-book architecture through dedicated routing, instrument, account and monitoring controls. Administration brings group leverage, commission markups and operational configuration into the shared portal.",
          "The demonstrated views show how teams could manage platform backends in one place. Live adapters, provider agreements and operational setup remain production requirements.",
        ],
        links: [
          { label: "Explore broker solutions", href: "/solutions/brokers" },
          { label: "View brokerage controls", href: "/brokerage" },
        ],
      },
      {
        id: "prop-operators",
        title: "For prop firm program teams.",
        paragraphs: [
          "Organize evaluations, funded-account progression and payouts around explicit program rules. The prop workspace demonstrates account sizes, challenge stages, daily-loss and drawdown rails, payout conditions and a local configuration review.",
          "Combine those controls with team permissions and member communication so program context stays connected to the people operating it. The example challenge states and values do not establish a live funded-account offer.",
        ],
        links: [
          {
            label: "Explore prop firm solutions",
            href: "/solutions/prop-firms",
          },
          { label: "View program controls", href: "/prop-firm" },
        ],
      },
      {
        id: "educators",
        title: "For trading educators and mentors.",
        paragraphs: [
          "Keep session preparation, market discussion and shared learning resources in an organized community workspace. Threads, pinned context, charts and team events give members a useful structure for following a session.",
          "Mentor and moderator roles can be planned separately from authenticated account authority. The local demonstration lets you assess the communication model without publishing messages or starting live voice sessions.",
        ],
        links: [
          { label: "Explore educator solutions", href: "/solutions/educators" },
          { label: "View community tools", href: "/community" },
        ],
      },
    ],
    faqs: [
      {
        question: "Can different business teams share the portal?",
        answer:
          "The proposed portal separates community activity, account work and business controls into dedicated views. The exact production access model should match the team roles and authenticated account responsibilities.",
      },
      {
        question: "What does the free solution proposition cover?",
        answer:
          "The pricing page presents the brokerage and prop firm solution proposition and the illustrative commission model. Production scope, provider terms, platform licensing and other third-party costs need to be confirmed for a specific launch.",
      },
      {
        question: "How do I explore the full experience?",
        answer:
          "Start with the dashboard on the home page, then open the product and solution pages relevant to your operating model. The getting started guide helps turn that exploration into a launch brief.",
      },
    ],
    related: [
      "/solutions/influencers",
      "/solutions/brokers",
      "/solutions/prop-firms",
      "/solutions/educators",
    ],
    cta: { label: "Plan your launch", href: "/resources/getting-started" },
  },
];
