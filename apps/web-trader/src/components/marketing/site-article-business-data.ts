import type { SitePage } from "./site-types";

export const businessArticles: SitePage[] = [
  {
    path: "/insights/influencer-brokerage-launch-checklist",
    title:
      "An influencer brokerage launch checklist, from audience to operations.",
    navLabel: "Influencer brokerage launch checklist",
    seoTitle: "Influencer Brokerage Launch Checklist | Azuriya",
    eyebrow: "Brokerage operations",
    description:
      "Plan an influencer brokerage launch with a practical checklist for operating responsibilities, account setup, execution, funding and member support.",
    kind: "article",
    article: {
      category: "Brokerage",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Define the offer",
        text: "Decide what members can actually access and who is responsible for delivering it.",
      },
      {
        title: "Prove the workflows",
        text: "Follow one member from joining the community through an account, a support issue and a withdrawal request.",
      },
      {
        title: "Launch in stages",
        text: "Agree readiness criteria before inviting a wider audience to a production service.",
      },
    ],
    sections: [
      {
        id: "define-the-offer",
        title: "Start with a member journey your team can deliver.",
        paragraphs: [
          "A following gives an influencer a way to reach people. It does not, by itself, define a brokerage operation. Start by describing the service in plain language: who can join, what they can use, which entity provides the trading account, and where a member goes when something needs attention.",
          "Choose an initial journey small enough to test end to end. A community introduction, account application, account access and a funding explanation provide a clearer launch scope than promising every platform and payment method at once. Record the exclusions alongside the offer so support can answer the same questions consistently.",
        ],
        links: [
          {
            label: "Explore solutions for influencers",
            href: "/solutions/influencers",
          },
        ],
      },
      {
        id: "operating-responsibilities",
        title: "Name the people who own each operational decision.",
        paragraphs: [
          "Write a responsibility map before choosing dashboard features. The community lead may own education and communication while another operator controls accounts, payments or execution settings. Make the handoff visible. A support agent should know who can investigate an order, who can approve a payment exception and who can communicate a service incident.",
          "Agree the production entity, applicable operating requirements and commercial relationships with appropriate advisers and providers. The free solution proposition needs a written scope: platform licensing, liquidity arrangements, payment processing and other third-party services may carry separate costs. A launch budget should identify those owners and dependencies.",
        ],
        bullets: [
          "Assign an owner and a backup for account, payment, execution and community issues.",
          "Set response expectations and an escalation path for unresolved cases.",
          "Confirm the approved member-facing terms and disclosure process.",
        ],
      },
      {
        id: "account-design",
        title: "Specify accounts before building the signup flow.",
        paragraphs: [
          "Separate a community profile from a trading account. One person may join several discussion groups and hold more than one account. Your records need to distinguish the member identifier, account login, trading server, account currency, group and current status. A familiar display name is insufficient to authorize an account action.",
          "MetaTrader 5 account setup exposes account-type choices and available leverage according to the selected broker configuration. Use that as a reminder to agree the actual account offer, then test the resulting settings on the intended environment. Include inactive, rejected and suspended states in the design.",
        ],
        links: [
          {
            label: "Account operations and CRM planning",
            href: "/insights/brokerage-crm-account-operations",
          },
        ],
      },
      {
        id: "execution-readiness",
        title: "Turn an A-book promise into an execution checklist.",
        paragraphs: [
          "An A-book operating model needs a configured order path, agreed provider relationships and evidence that the path behaves as intended. Ask which symbols are available, how symbol names map across systems, what happens when a provider is unavailable and where an operator can inspect a rejected order.",
          "Platform and provider logos are useful for discussing options. They are insufficient evidence that a connector is live or a commercial agreement is signed. For each proposed connection, record the actions supported, credentials required, test results and person responsible for accepting it. Keep marketing claims aligned with that connection record.",
        ],
        links: [
          { label: "Review liquidity configuration", href: "/liquidity" },
          { label: "Plan trading risk controls", href: "/risk-management" },
        ],
      },
      {
        id: "funding-and-support",
        title: "Test the less convenient funding and support cases.",
        paragraphs: [
          "A successful payment is only one case. Also rehearse a pending deposit, a failed attempt, a duplicated notification, a refund and a withdrawal awaiting review. Agree which system confirms the payment outcome and which account receives the credit. The support view should help the team trace a reference without exposing card details or integration secrets.",
          "Give members a clear place to ask for help. Public discussion channels can explain common processes; individual account cases belong in an access-controlled support workflow. Include currency, processing expectations and possible fees in the funding explanation before a member begins the payment journey.",
        ],
        links: [
          { label: "Explore funding workflows", href: "/funding" },
          { label: "See the MT5 deposit walkthrough", href: "/mt5-deposits" },
        ],
      },
      {
        id: "launch-acceptance",
        title: "Use acceptance evidence to decide when to open the doors.",
        paragraphs: [
          "Create a launch record with a named owner, a test result and an unresolved-issues list for every critical journey. Try each workflow from the member, support and administrator perspectives. A screenshot of a successful dashboard is useful context; the acceptance record should explain what the underlying system actually did.",
          "Azuriya currently provides a local product preview and simulated terminal execution. Use it to shape the operating brief and compare workflows. A production launch still needs confirmed infrastructure, agreements and completed validation. Revisit this checklist whenever you add a platform, payment provider, account group or audience segment.",
        ],
        bullets: [
          "Confirm access controls with both permitted and denied requests.",
          "Rehearse a service interruption and the member communication process.",
          "Make unresolved launch blockers visible to the decision owner.",
        ],
      },
    ],
    related: [
      "/solutions/influencers",
      "/resources/getting-started",
      "/insights/trading-community-team-permissions",
    ],
    cta: { label: "Prepare your launch brief", href: "/contact" },
    sources: [
      {
        label: "MetaTrader 5 Help: opening and configuring an account",
        href: "https://www.metatrader5.com/en/terminal/help/startworking/acc_open",
      },
    ],
  },
  {
    path: "/insights/brokerage-crm-account-operations",
    title: "What a brokerage CRM needs to know about accounts and operations.",
    navLabel: "Brokerage CRM and account operations",
    seoTitle: "Brokerage CRM and Trading Account Operations | Azuriya",
    eyebrow: "Account operations",
    description:
      "Design a brokerage CRM around verified account ownership, support cases, funding references and controlled administrative actions across the trading team.",
    kind: "article",
    article: {
      category: "Brokerage",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Member and account",
        text: "Keep community identity, verified ownership and platform account references distinct.",
      },
      {
        title: "A traceable case",
        text: "Connect support conversations to the specific order, account or funding event being investigated.",
      },
      {
        title: "Controlled actions",
        text: "Make permission checks, approvals and the history of administrative changes part of the workflow.",
      },
    ],
    sections: [
      {
        id: "member-and-account",
        title:
          "Model the customer relationship separately from the trading account.",
        paragraphs: [
          "A brokerage CRM becomes difficult to trust when a community username is treated as an account identifier. A member can change their display name, join another group or open an additional trading account. The operations record needs a stable member reference and an explicit relationship to each account, including the tenant, platform and trading server.",
          "Keep contact preferences and community membership on the member record. Put account currency, account group, trading permissions and lifecycle status on the relevant account record. That separation lets support understand the relationship while account actions remain tied to verified ownership. It also prevents a new community role from silently changing trading authority.",
        ],
        bullets: [
          "Member record: identity reference, contact preferences and community roles.",
          "Account record: platform, server, login reference, currency, group and state.",
          "Relationship record: verified owner, authorized access and any relevant expiry.",
        ],
      },
      {
        id: "account-lifecycle",
        title: "Show a lifecycle that explains what the team can do next.",
        paragraphs: [
          "Avoid one ambiguous active flag for every situation. An application being reviewed, an account waiting for a connection and an account with suspended trading need different explanations and different allowed actions. Each state should have a reason, a timestamp and an owner responsible for the next step.",
          "Account creation should produce a traceable request and a clear result. If a platform request times out, the operator needs to investigate whether the account was created before trying again. The CRM should make that uncertainty explicit so a support conversation does not accidentally produce a second account or contradict the trading platform.",
        ],
        links: [{ label: "Explore brokerage controls", href: "/brokerage" }],
      },
      {
        id: "support-context",
        title: "Attach support cases to evidence, with appropriate access.",
        paragraphs: [
          "When a member says that a trade is missing, capture the account reference, symbol, approximate time and the order or deal identifier if available. Ask which result they expected. Link those details to one case so the next operator can continue the investigation without asking the member to repeat the conversation.",
          "A support case should separate the member-facing explanation from internal investigation notes. Give agents the minimum account context needed for the task, and route sensitive documents through the approved process. Do not request account passwords, provider keys or full payment credentials in a chat message.",
        ],
        bullets: [
          "Assign one case owner and a clear status such as investigating or awaiting member input.",
          "Preserve the original event references and record the resolution reason.",
          "Use an escalation path when support cannot confirm the authoritative result.",
        ],
      },
      {
        id: "financial-context",
        title: "Display financial context without creating a second ledger.",
        paragraphs: [
          "The CRM can show balances, funding statuses and transaction references, but it should obtain those values from the system responsible for them. A balance edited by a support agent to match a screenshot is difficult to reconcile. A controlled correction should identify the original record, the approved action and the resulting record.",
          "Also distinguish balance, equity and available margin in the interface. MetaTrader 5 documents them as separate account-state values. Label the source and retrieval time when presenting them to operators, especially if an external connection is delayed. Financial amounts need their currency and exact precision; chart rounding should not alter an account record.",
        ],
        links: [{ label: "Review funding operations", href: "/funding" }],
      },
      {
        id: "administrative-actions",
        title: "Design administrative actions around accountability.",
        paragraphs: [
          "Changing leverage, moving an account between groups or updating commission settings can affect more than one screen. Define the scope of each action, require the relevant account and tenant permission, and record the approved values before the change is published. The result should tell the operator which accounts changed and which did not.",
          "For changes with wider impact, agree whether a second approval is required and how the effective time is communicated. Keep an append-only change history with the actor, reason and result. A read-only reviewer should be able to inspect that history without receiving the ability to make the same changes.",
        ],
        links: [
          {
            label: "Inspect the administration workspace",
            href: "/admin-portal",
          },
        ],
      },
      {
        id: "daily-operating-view",
        title: "Build daily queues that make unresolved work visible.",
        paragraphs: [
          "A useful operating view prioritizes accounts awaiting action, unresolved funding cases, connector issues and support cases approaching the agreed response target. Each row needs a clear next action and owner. Large totals can give context, but they should not hide a blocked member journey inside a successful-looking dashboard.",
          "Use the Azuriya preview to discuss these queues with your team and turn the discussion into acceptance cases. Its dashboard values and interactions are illustrative, and the terminal uses simulated execution. Before production, confirm how each proposed CRM action maps to the connected platform, payment system and permission model.",
        ],
      },
    ],
    related: [
      "/brokerage",
      "/admin-portal",
      "/insights/trading-community-team-permissions",
    ],
    cta: { label: "Explore the operating workspace", href: "/platform" },
    sources: [
      {
        label: "MetaTrader 5 Help: account state and trading operations",
        href: "https://www.metatrader5.com/en/terminal/help/trading/performing_deals",
      },
    ],
  },
  {
    path: "/insights/commission-markups-per-lot",
    title: "Commission markups per lot: how to explain a $2 + $5 model.",
    navLabel: "Commission markups per lot",
    seoTitle: "Commission Markups per Lot: The $2 + $5 Example | Azuriya",
    eyebrow: "Commercial configuration",
    description:
      "Understand an illustrative $2.00 base plus $5.00 markup per lot, including charging basis, eligible volume, account groups and reconciliation controls.",
    kind: "article",
    article: {
      category: "Brokerage",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "A clear example",
        text: "$2.00 base + $5.00 additional markup = $7.00 per lot on the same agreed charging basis.",
      },
      {
        title: "Define the basis",
        text: "Confirm entry, exit or round-turn treatment before comparing rates or estimating a charge.",
      },
      {
        title: "Reconcile the result",
        text: "Trace eligible executed volume to the applied rate, account group and recorded commission.",
      },
    ],
    sections: [
      {
        id: "example-and-scope",
        title: "Separate the base amount from the additional markup.",
        paragraphs: [
          "Azuriya’s commercial illustration uses a $2.00 base amount and an additional operator markup of up to $5.00 per lot. At the illustrated maximum, $2.00 + $5.00 = $7.00 per lot. The two components must use the same currency, volume unit and charging basis for that statement to be meaningful.",
          "This example describes a possible configuration for discussion. It is not a promise of revenue, an approved live rate or proof that every instrument can use the same schedule. The production arrangement needs to define eligibility, the recipient of each component, provider terms and how the charge is disclosed to the account holder.",
        ],
        links: [{ label: "Review the commercial example", href: "/pricing" }],
      },
      {
        id: "charging-basis",
        title: "Agree the charging basis before comparing rates.",
        paragraphs: [
          "Per lot describes a volume unit; it does not explain when commission is charged. Confirm whether a quoted amount applies on entry, on exit or across a completed round turn. Do not add a per-side base rate to a round-turn markup and describe the result as one comparable rate. Normalize the definitions first.",
          "MetaTrader 5 documentation describes commission settings that can differ by entry or exit direction, volume unit and collection timing. Those distinctions matter when translating a commercial quote into a platform configuration. Ask the operator to show the relevant symbol and group settings alongside the written commercial schedule.",
        ],
        bullets: [
          "Currency and volume unit: USD per eligible lot in this illustration.",
          "Direction: entry, exit or an agreed round-turn basis.",
          "Collection: the configured timing and the record used for reconciliation.",
        ],
      },
      {
        id: "worked-example",
        title: "Use a small example with explicit assumptions.",
        paragraphs: [
          "Assume the agreed schedule charges the combined rate once for 1.00 eligible lot. The base component is $2.00, the additional markup is $5.00 and the combined illustrated charge is $7.00. For 0.10 eligible lot on that same basis, the components are $0.20 and $0.50, giving a combined illustrated charge of $0.70.",
          "These are explanatory examples, not a trading calculator. They exclude other possible fees, currency conversion, rebates and schedule exceptions. If the agreed schedule charges both entry and exit, document how each leg is billed instead of treating the one-charge example as a completed-trade total. Have the production system apply exact decimal arithmetic and the agreed rounding policy.",
        ],
      },
      {
        id: "eligible-volume",
        title: "Define which executed volume earns or attracts the charge.",
        paragraphs: [
          "Commission reporting needs an eligibility rule. Establish which account groups, instruments, trade directions and dates use the schedule. A request to trade is different from executed volume, and a rejected order should not be treated as a filled lot. Partial executions need identifiable records so the same volume is not counted twice.",
          "Agree how corrections, cancellations where applicable, reversals and rebates appear in the report. Preserve the relationship between the original execution and any adjustment. An operator should be able to explain why a record was included, excluded or adjusted without inferring the answer from a monthly total.",
        ],
        bullets: [
          "Identify the eligible execution records and applicable schedule version.",
          "Keep excluded volume and adjustment reasons visible.",
          "Separate commission charges, markup allocation and settled proceeds.",
        ],
      },
      {
        id: "change-control",
        title: "Treat a markup change as an administrative change.",
        paragraphs: [
          "Before changing an additional markup from one value to another, show the affected groups and the proposed effective time. Identify the authorized operator and any required reviewer. A rate changed mid-period should be traceable to the version that applied to each eligible execution.",
          "Set limits in the authoritative service and validate changes there. A slider in a dashboard can communicate the intended range, but it cannot enforce account ownership or protect a live commission schedule by itself. Record the request, approval and outcome in the audit history, and tell support how the new schedule should be explained.",
        ],
        links: [
          { label: "Explore group and markup controls", href: "/admin-portal" },
        ],
      },
      {
        id: "reconciliation-and-disclosure",
        title: "Make the resulting charge explainable to the member and team.",
        paragraphs: [
          "A commission report should connect each charge to an execution reference, account group, volume, currency, rate and schedule basis. Compare those records with the authoritative platform records and investigate differences before treating a summary as settled revenue. Collection timing can make a platform statement look different from an operational estimate.",
          "Use plain language in member-facing pricing. State the actual agreed rate and basis, then identify other applicable costs in their own terms. The Azuriya preview demonstrates the $2.00 + up to $5.00 structure using illustrative values. Final pricing and allocations must be confirmed in the production arrangement.",
        ],
      },
    ],
    related: [
      "/pricing",
      "/admin-portal",
      "/insights/brokerage-crm-account-operations",
    ],
    cta: { label: "Explore the markup demonstration", href: "/pricing" },
    sources: [
      {
        label:
          "MetaTrader 5 Help: symbol specifications and commission settings",
        href: "https://www.metatrader5.com/en/terminal/help/trading/market_watch",
      },
      {
        label: "MetaTrader 5 Help: recorded commission and account state",
        href: "https://www.metatrader5.com/en/terminal/help/trading/performing_deals",
      },
    ],
  },
  {
    path: "/insights/trading-community-team-permissions",
    title: "Trading community permissions: channels, teams and account access.",
    navLabel: "Trading community team permissions",
    seoTitle: "Trading Community Roles and Team Permissions | Azuriya",
    eyebrow: "Community operations",
    description:
      "Plan Discord-like channels and team roles for a trading community while keeping account actions, funding approvals and administration separately controlled.",
    kind: "article",
    article: {
      category: "Community",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Channel access",
        text: "Decide who can view, post, moderate and join each communication space.",
      },
      {
        title: "Account authority",
        text: "Grant trading and funding permissions through a separate, verified account relationship.",
      },
      {
        title: "Test the boundaries",
        text: "Check allowed and denied actions after every role or account access change.",
      },
    ],
    sections: [
      {
        id: "two-permission-models",
        title: "Separate participation from authority over an account.",
        paragraphs: [
          "A trading community combines social participation with operational context. A member may discuss a strategy, receive announcements and ask for support. None of those activities establishes authority to place an order, change another member’s leverage or approve a withdrawal. Define communication permissions and account permissions as separate relationships.",
          "Give roles names that describe the task: community moderator, support agent, account operator or payment reviewer. Avoid a single powerful role for everyone who helps run the group. A moderator needs tools to organize a discussion; an account operator needs authenticated permission for the specific tenant and accounts they manage.",
        ],
        links: [
          { label: "Explore the community workspace", href: "/community" },
        ],
      },
      {
        id: "channel-architecture",
        title: "Organize channels around what members need to accomplish.",
        paragraphs: [
          "Start with a small set of clear spaces: announcements, getting started, general discussion, education and a route to support. Use restricted team channels for operating decisions and incident coordination. Decide who can post announcements, who can moderate replies and which information should never be shared in a public channel.",
          "Discord’s official guidance distinguishes server roles and channel-specific permissions. That is a useful reference when planning a familiar community experience. For a trading portal, also document what happens when a member’s role changes: channel visibility should update without unexpectedly changing their trading account permissions.",
        ],
        bullets: [
          "Announcements: a controlled publishing space with an identified owner.",
          "Education and discussion: clear moderation rules and expectations.",
          "Support: private account context with a case reference and assigned agent.",
          "Operations: access limited to the team responsible for those decisions.",
        ],
      },
      {
        id: "role-capabilities",
        title: "Write capabilities before assigning people to roles.",
        paragraphs: [
          "For each role, list the exact actions it allows. A support agent might view an account connection status and create a case while being unable to change leverage or request a payment. A payment reviewer might inspect a withdrawal queue without being able to alter commission schedules. These boundaries should be visible in the interface and enforced by the service.",
          "Record who can assign or remove each role. Use time-limited access where the task is temporary, and review access when team members change responsibilities. Community badges can communicate a person’s role, but the service should resolve current permissions from the authenticated relationship rather than trusting a badge or message label.",
        ],
        links: [
          {
            label: "Review account and CRM responsibilities",
            href: "/insights/brokerage-crm-account-operations",
          },
        ],
      },
      {
        id: "support-and-escalation",
        title: "Move from conversation to a traceable support case.",
        paragraphs: [
          "A member’s question can begin in chat, but an account investigation needs a clear owner and a record of what is being checked. Capture the account reference and relevant order or payment reference through the approved support workflow. Keep private account details out of a shared discussion thread.",
          "Define when moderators should redirect a question to support and when support should escalate it to an operator. Keep member-facing updates clear about the current state: being investigated, awaiting a provider result or resolved. Avoid promising a payment or trade outcome before the authoritative system has confirmed it.",
        ],
        bullets: [
          "Link the conversation to one case instead of creating duplicate investigations.",
          "Record the escalation owner and the next expected update.",
          "Preserve the resolution reason and references needed for later review.",
        ],
      },
      {
        id: "voice-events-and-resources",
        title: "Make live sessions and shared resources operationally clear.",
        paragraphs: [
          "If the production community includes voice rooms, screen sharing or events, define host permissions, joining rules and moderation responsibilities before opening the session. Give participants a clear way to find the agenda and approved resources afterwards. If recordings are planned, agree notice, access and retention as part of the operating brief.",
          "A shared screen or group message must never substitute for an authorized account action. Keep educational discussion and individual account instructions distinguishable in the member experience. The Azuriya preview demonstrates channel, message and voice-control interface states; it does not establish a live calling or screen-sharing service.",
        ],
      },
      {
        id: "permission-testing",
        title: "Test access from the member’s perspective.",
        paragraphs: [
          "Create a test matrix for a new member, moderator, support agent and account operator. Check that each can see the intended channels and perform only the intended actions. Include direct requests to restricted account actions, rather than checking only whether a button is hidden. Repeat the checks after removing a role or changing account ownership.",
          "Before a production launch, verify that access removal takes effect across active sessions and connected systems according to the agreed design. Keep the actor, reason and outcome of administrative changes in the audit record. A team should be able to explain who could access a case or change a setting at the time of an incident.",
        ],
        links: [
          { label: "Explore administrator controls", href: "/admin-portal" },
        ],
      },
    ],
    related: [
      "/community",
      "/admin-portal",
      "/insights/influencer-brokerage-launch-checklist",
    ],
    cta: {
      label: "See the team communication demonstration",
      href: "/community",
    },
    sources: [
      {
        label: "Discord Help Center: roles and channel permissions",
        href: "https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions",
      },
      {
        label: "Discord Help Center: permission configuration",
        href: "https://support.discord.com/hc/en-us/articles/206029707-Setting-Up-Permissions-FAQ",
      },
    ],
  },
];
