import type { SitePage } from "./site-types";

export const teamArticles: SitePage[] = [
  {
    path: "/insights/prop-firm-payout-review",
    title: "Build a prop firm payout review that the whole team can follow.",
    navLabel: "Prop firm payout review",
    seoTitle: "Prop Firm Payout Review and Approval Workflow | Azuriya",
    eyebrow: "Prop firm operations",
    description:
      "Plan a prop firm payout review with clear eligibility evidence, account records, approval responsibilities, payment states and a traceable case history.",
    kind: "article",
    article: {
      category: "Prop firms",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Evidence before approval",
        text: "Review the request against the agreed program terms and the correct account history.",
      },
      {
        title: "A clear decision owner",
        text: "Keep the reviewer, approver and payment operator visible throughout the case.",
      },
      {
        title: "An honest payment state",
        text: "Distinguish a request, an approval and a confirmed payment in the member view.",
      },
    ],
    sections: [
      {
        id: "define-eligibility",
        title: "Start with the terms that apply to this participant.",
        paragraphs: [
          "A payout review starts with an eligibility question: which program terms govern this request? Record the participant, account, program, stage and applicable terms version together. A reviewer should be able to inspect that record without reconstructing the agreement from chat messages or the latest marketing page.",
          "Set out the review window, permitted request methods, required evidence and applicable conditions before opening the program. Programs differ, so avoid importing another firm's payout timetable or profit split. Have the operator and relevant advisers confirm the actual offer. A request button should explain what happens next and which information the participant may need to provide.",
        ],
        links: [{ label: "Explore prop firm operations", href: "/prop-firm" }],
      },
      {
        id: "capture-evidence",
        title: "Build one case with a reproducible account record.",
        paragraphs: [
          "Attach a dated account snapshot, the reviewed trading period and the references used to assess the request. Preserve the source account and server identifiers. A screenshot can help someone understand a discrepancy, but the decision needs underlying records that another reviewer can inspect.",
          "MetaTrader 5 history distinguishes orders from executed deals and records execution times in the trading server's time zone. Use the appropriate view when reconstructing activity. Record the review cutoff and time zone alongside the export so an apparent gap can be checked against the same period. Keep the firm's eligibility decision separate from the platform report itself.",
        ],
        bullets: [
          "Include the program and terms version used for the decision.",
          "Keep source references and reviewer notes with the request.",
          "Restrict participant documents to the staff who need them.",
        ],
      },
      {
        id: "review-exceptions",
        title: "Give exceptions a reason and a responsible person.",
        paragraphs: [
          "A review queue needs more than approved and rejected. Missing evidence, disputed records and provider checks each need a visible reason, a next action and an owner. Tell the participant what information is outstanding in language that support can explain consistently.",
          "If trading records conflict with the portal summary, investigate the source discrepancy before making a decision. Preserve the original submission and add subsequent evidence as dated entries. A correction should explain what changed; overwriting the first account snapshot makes the review harder to reproduce. Include a documented route for a participant to question the result.",
        ],
      },
      {
        id: "approval-controls",
        title: "Separate reviewing a request from releasing a payment.",
        paragraphs: [
          "Choose approval responsibilities according to the operating model and risk of the action. The person collecting evidence may prepare a recommendation while an authorized approver makes the decision. The payment operator should receive an approved instruction with the recipient, currency, amount and case reference confirmed through the controlled process.",
          "Check permissions when the action is performed, including the authenticated tenant and account relationship. A community role or a message from a familiar username should never authorize a financial change. Record who approved the instruction and how an amendment is handled. Retrying an action after a timeout must not create a second payment instruction.",
        ],
        links: [
          { label: "Review administrative controls", href: "/admin-portal" },
        ],
      },
      {
        id: "payment-states",
        title: "Show progress without confusing approval with settlement.",
        paragraphs: [
          "Use distinct states for requested, under review, approved, submitted to the provider and payment outcome confirmed. Define the evidence required for each transition. A provider accepting an instruction does not automatically establish that the recipient received the funds. The operations team needs a reconciliation process for pending, failed and returned payments.",
          "Keep internal exception details separate from the participant's update. Support can communicate the current state, missing information and next review step without exposing provider credentials or another participant's records. If the team cannot confirm a completion time, state the dependency and arrange a dated follow-up rather than presenting an unsupported delivery promise.",
        ],
      },
      {
        id: "close-and-test",
        title: "Close the case with evidence and test the difficult paths.",
        paragraphs: [
          "A closed payout case should link the decision, any authorized amendments, payment instruction and confirmed outcome. Keep the audit trail append-only so later reviewers can distinguish the original decision from a subsequent correction. Use unresolved cases to improve the request form and evidence checklist.",
          "Before production, rehearse a duplicate request, a mismatched account, missing evidence and a provider timeout. Azuriya's local preview illustrates administrative workflows and simulated execution; it does not approve or send real prop firm payouts. Production eligibility, agreements and payment integrations must be confirmed for the actual program. A clear review process supports consistent decisions without promising that every request will be approved.",
        ],
      },
    ],
    related: [
      "/insights/prop-firm-evaluation-lifecycle",
      "/insights/prop-firm-challenge-risk-rules",
      "/insights/brokerage-deposit-withdrawal-controls",
    ],
    cta: { label: "Discuss your payout workflow", href: "/contact" },
    sources: [
      {
        label: "MetaTrader 5 Help: trading account history and executed deals",
        href: "https://www.metatrader5.com/en/terminal/help/trading/performing_deals",
      },
    ],
  },
  {
    path: "/insights/prop-firm-evaluation-lifecycle",
    title: "Design a prop firm evaluation lifecycle with clear transitions.",
    navLabel: "Prop firm evaluation lifecycle",
    seoTitle: "Prop Firm Evaluation Lifecycle and Account Stages | Azuriya",
    eyebrow: "Evaluation operations",
    description:
      "Map a prop firm evaluation from enrollment through review, retry and progression, preserving rules, account history and clear simulated or live labels.",
    kind: "article",
    article: {
      category: "Prop firms",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "Named account stages",
        text: "Give each stage entry conditions, permitted actions and a clear exit decision.",
      },
      {
        title: "Rules remain traceable",
        text: "Keep the terms and rule version associated with every evaluation attempt.",
      },
      {
        title: "Progression is explicit",
        text: "Show what the next account represents and which environment it uses.",
      },
    ],
    sections: [
      {
        id: "define-stages",
        title: "Describe the program as a series of operational decisions.",
        paragraphs: [
          "Write down the states a participant can move through before choosing badges for the dashboard. Enrollment, account provisioning, active evaluation, review, completed evaluation and retry are different operational situations. For each one, define the entry condition, owner, permitted actions and information shown to the participant.",
          "Avoid using passed as a catch-all for everything after the last trade. Meeting a displayed target may trigger a review rather than immediate access to another account. The program terms should explain that distinction. Include provisioning failures and withdrawn applications in the design so support has a useful answer when the ideal journey does not complete.",
        ],
        links: [
          {
            label: "Explore prop firm solutions",
            href: "/solutions/prop-firms",
          },
        ],
      },
      {
        id: "terms-and-attempts",
        title: "Associate every attempt with its agreed rules.",
        paragraphs: [
          "Give each evaluation attempt a stable reference and record the program terms, account configuration and risk rule version accepted at enrollment. If a program changes later, operators still need to identify the conditions governing an earlier participant. Decide in advance how changes are communicated and which attempts they affect.",
          "An account group can help organize a platform configuration, but its current name is insufficient evidence of historical terms. Preserve the original assignment and subsequent authorized changes. Link acknowledgments to the participant record. Support should be able to explain the applicable rule without guessing from the newest public description of the challenge.",
        ],
        bullets: [
          "Record enrollment time, attempt reference and assigned account.",
          "Retain the accepted terms and associated risk configuration.",
          "Document who can authorize a rule or account-group change.",
        ],
      },
      {
        id: "active-evaluation",
        title: "Keep the active view aligned with authoritative events.",
        paragraphs: [
          "Show participants the current stage, account environment, applicable limits and time of the latest update. If activity data is delayed, expose that state rather than treating an old dashboard value as current. Define whether a displayed metric is informational, a confirmed rule result or awaiting reconciliation.",
          "The authoritative service should apply the agreed financial and risk rules. A chart in the browser is a presentation of those results, not a separate calculation used to decide progression. Preserve trading transitions and their audit records before publishing updates. Test how the workflow behaves when a rule event arrives late or the platform connection temporarily drops.",
        ],
        links: [
          {
            label: "Specify challenge risk rules",
            href: "/insights/prop-firm-challenge-risk-rules",
          },
        ],
      },
      {
        id: "review-and-progression",
        title: "Review the result before provisioning the next stage.",
        paragraphs: [
          "Choose the evidence needed for a stage decision and record it in a review case. Confirm the account, complete evaluation period and applicable rule outcomes. An exception should retain a reason, reviewer and next step. The participant's page can show review progress without disclosing internal security checks.",
          "Treat provisioning the next account as a separate operation with its own success or failure result. If the decision is approved but provisioning fails, show those two facts accurately. Keep the completed account's records linked to the next stage. A repeated provisioning request should resolve to the same intended operation instead of creating additional active accounts.",
        ],
      },
      {
        id: "retries-and-closure",
        title:
          "Give retries a new reference and preserve the previous attempt.",
        paragraphs: [
          "Define whether a retry requires a new application, agreement or account, and describe any applicable charges in the approved program terms. The retry should have a clear relationship to the preceding attempt while keeping its own start date, rule version and outcome. Preserve the old record so the participant and support team can discuss what happened.",
          "Decide how to handle open positions, pending orders and access when an attempt closes. The authorized account workflow should enforce that decision. Include disputed outcomes and administrative corrections in the model. A correction belongs in the audit history with its reason and approver; it should not silently erase the earlier result.",
        ],
      },
      {
        id: "environment-and-launch",
        title: "Explain exactly what each account environment represents.",
        paragraphs: [
          "MetaTrader 5 distinguishes demo accounts using virtual money from real accounts. A program label such as funded does not, by itself, identify the execution environment or establish a payout entitlement. Describe the actual arrangement in the program terms and the account interface, including whether evaluation and later stages remain simulated.",
          "Azuriya currently offers a local preview with simulated execution. Use it to review the stage design and rehearse denied transitions, delayed results and provisioning failures. Production challenge rules, commercial terms and platform integrations require separate confirmation. The objective is a lifecycle in which every participant can understand their current stage and every operator can explain how the account reached it.",
        ],
      },
    ],
    related: [
      "/prop-firm",
      "/insights/prop-firm-payout-review",
      "/insights/trading-platform-integration-checklist",
    ],
    cta: { label: "Plan your evaluation workflow", href: "/contact" },
    sources: [
      {
        label: "MetaTrader 5 Help: demonstration and real account environments",
        href: "https://www.metatrader5.com/en/terminal/help/startworking/acc_open",
      },
    ],
  },
  {
    path: "/insights/trading-community-support-workflows",
    title: "Organize trading community support beyond a busy chat channel.",
    navLabel: "Trading community support workflows",
    seoTitle: "Trading Community Support Workflows and Escalation | Azuriya",
    eyebrow: "Community operations",
    description:
      "Organize trading community support with public guides, private account cases, conversation threads, escalation owners and clear updates for each member.",
    kind: "article",
    article: {
      category: "Community",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "The right place to ask",
        text: "Separate general questions from account issues that need a controlled support case.",
      },
      {
        title: "A visible case owner",
        text: "Keep the current question, responsible team and next action together.",
      },
      {
        title: "Knowledge from outcomes",
        text: "Turn resolved recurring issues into concise guides with an assigned maintenance owner.",
      },
    ],
    sections: [
      {
        id: "support-entry-points",
        title:
          "Offer two clear entry points for common questions and private cases.",
        paragraphs: [
          "A community support channel works well for questions whose answers help everyone: where to find a guide, how to navigate the portal or which team handles account applications. Make that purpose visible in the channel description and pinned resources. Give members an obvious way to open a private case when their question involves an account, payment or personal document.",
          "The private route should explain what the team needs and what the member should omit. Ask for the relevant reference and a short description of the issue; avoid requesting passwords, full card details or integration secrets. A moderator can direct an account question into that route without attempting to solve it in public.",
        ],
        links: [
          { label: "Explore the community workspace", href: "/community" },
        ],
      },
      {
        id: "organize-conversations",
        title:
          "Use threads for discussion and case records for operational work.",
        paragraphs: [
          "Discord's thread and forum documentation illustrates ways to keep a discussion associated with its topic. Forum posts can carry tags; threads have specific visibility and management permissions. These are useful communication patterns to consider when designing a trading community. They do not replace a verified account relationship or a controlled case record.",
          "Give a support case its own reference, category and current state even if members discuss it through a thread. A chat title can change, a thread can close and people can leave a channel. The operations team still needs to locate the case and its evidence. Preserve the relevant conversation link without making unrestricted chat history the source of authority.",
        ],
      },
      {
        id: "case-context",
        title:
          "Collect enough context for someone else to continue the investigation.",
        paragraphs: [
          "Record the member, verified account relationship, platform and server when the case concerns a trading account. For an order issue, collect the relevant order or deal reference and the reported time. For a payment issue, use the payment reference and current confirmed state. Mark information supplied by the member separately from facts checked against an authoritative service.",
          "The summary should answer what the member expected, what they observed and what the team has already checked. Include the time zone when timing matters. A screenshot can provide context but may contain personal information, so use controlled uploads and appropriate access. The next agent should be able to continue without asking the same introductory questions again.",
        ],
        bullets: [
          "Identify the affected journey and its relevant reference.",
          "Document the latest confirmed state and unresolved question.",
          "Record the case owner and next expected update.",
        ],
      },
      {
        id: "escalation-and-handoffs",
        title: "Escalate with a question that the receiving team can answer.",
        paragraphs: [
          "Define escalation routes for account access, execution, funding and community conduct. Send the receiving team the evidence and a specific request, such as confirming whether a payment outcome was received or explaining an order rejection. Include the case priority and reason rather than treating every unhappy message as the same kind of incident.",
          "Keep one person responsible for the member update while specialists investigate. A handoff is complete when the receiving team accepts ownership of its action. If several cases point to a shared incident, link them to a common investigation and approved update. Keep individual member records private while communicating the broader service issue in an appropriate announcement channel.",
        ],
        links: [
          {
            label: "Prepare an operations incident workflow",
            href: "/insights/trading-operations-incident-response",
          },
        ],
      },
      {
        id: "member-updates",
        title: "Make updates useful even when a case remains open.",
        paragraphs: [
          "A useful update explains the confirmed state, the remaining dependency and the next action. If another provider is investigating, describe the issue at a level the member can understand and retain the provider reference internally. Avoid promising a completion time that the responsible team has not confirmed.",
          "When the investigation ends, summarize the outcome and any action the member needs to take. Record whether the issue was resolved, explained or referred for a further decision. Closing a chat conversation should not automatically mark an unresolved financial or account action complete. Give the member a clear way to question the explanation or reopen the case under the agreed support process.",
        ],
      },
      {
        id: "improve-support",
        title: "Use repeat questions to improve the product and its guides.",
        paragraphs: [
          "Review recurring categories, unresolved handoffs and requests for missing information. These records show where a guide, form or interface label needs improvement. Publish general explanations after removing member details, and give every guide an owner who can update it when the workflow changes.",
          "Azuriya's community preview shows communication and team workspace concepts. It does not send real invitations or provide a production voice service. Use the preview to test the support journey with staff: find the public guide, open a private case, hand it to the right team and explain the outcome. Production communication, case storage and access controls need validation against the chosen service.",
        ],
      },
    ],
    related: [
      "/insights/trading-community-onboarding",
      "/insights/trading-community-team-permissions",
      "/insights/brokerage-crm-account-operations",
    ],
    cta: { label: "Discuss your team support workflow", href: "/contact" },
    sources: [
      {
        label: "Discord Help: threads and their permissions",
        href: "https://support.discord.com/hc/en-us/articles/4403205878423-Threads-FAQ",
      },
      {
        label: "Discord Help: forum channels and discussion tags",
        href: "https://support.discord.com/hc/en-us/articles/6208479917079-Forum-Channels-FAQ",
      },
    ],
  },
  {
    path: "/insights/trading-community-onboarding",
    title: "Give new trading community members a clear first journey.",
    navLabel: "Trading community onboarding",
    seoTitle: "Trading Community Onboarding and Member Journey | Azuriya",
    eyebrow: "Member experience",
    description:
      "Design trading community onboarding with useful welcome rooms, learning resources, account guidance, notification choices and a clear route to support.",
    kind: "article",
    article: {
      category: "Community",
      publishedAt: "2026-10-01",
      author: "Azuriya editorial",
    },
    highlights: [
      {
        title: "A useful first screen",
        text: "Help a new member find the welcome guide, relevant resources and support route.",
      },
      {
        title: "Identity stays distinct",
        text: "Explain the difference between a community profile and a verified trading account.",
      },
      {
        title: "Preferences over noise",
        text: "Let members choose relevant discussion topics and understand their notifications.",
      },
    ],
    sections: [
      {
        id: "first-journey",
        title: "Answer the new member's first questions immediately.",
        paragraphs: [
          "The welcome screen should explain what the community offers, where to start and how to get help. A new member may arrive from an influencer's video without knowing the account provider, program terms or purpose of each room. Give them a short orientation that connects those expectations to the actual service.",
          "Choose a small initial journey: read the welcome guide, select relevant learning topics and locate support. Keep essential rules and the approved service explanation accessible. A room list filled with unfamiliar trading shorthand makes it harder to choose the next step. Use descriptive names and explain which rooms are for education, announcements and individual assistance.",
        ],
        links: [
          {
            label: "Explore solutions for educators",
            href: "/solutions/educators",
          },
        ],
      },
      {
        id: "welcome-rooms",
        title: "Keep the starting rooms relevant and easy to revisit.",
        paragraphs: [
          "A welcome room can hold the orientation, community conduct guidance and links to the most useful resources. An announcements room provides a place for approved service updates. A questions room gives members a route to general explanations. Assign an owner to each resource so outdated platform instructions do not remain pinned indefinitely.",
          "Discord's onboarding documentation describes using questions to tailor the channels and roles a member sees. That is a useful reference for reducing unnecessary choices. In a trading community, topic preferences should control discussion access and notifications according to the configured policy; they should never establish account ownership or permission to approve a financial action.",
        ],
      },
      {
        id: "member-and-account",
        title:
          "Explain when the journey moves from community to account services.",
        paragraphs: [
          "A community profile identifies someone within discussions. A trading account requires a separate verified relationship with the responsible operator and platform. Make the transition explicit: which service processes the application, what information it requires and how the member learns the result. Joining a welcome room should not appear to open a trading account automatically.",
          "If the community supports several programs or platforms, show the account context before displaying an account action. Members need to distinguish the account login, server and environment from their community nickname. Describe whether an account is simulated or live. When access is pending or unavailable, provide a helpful explanation and support route instead of an inactive control with no context.",
        ],
        links: [
          {
            label: "Plan community and account permissions",
            href: "/insights/trading-community-team-permissions",
          },
        ],
      },
      {
        id: "funding-explanation",
        title:
          "Make funding information understandable before presenting a payment action.",
        paragraphs: [
          "Link the approved funding explanation from the account journey. Identify the recipient account, available methods, currency, any applicable charges and how a member can check progress. Payment options depend on the configured provider and account eligibility. The interface should explain an unavailable method and what the member can do next.",
          "For MT5 native funding, explain that the broker and provider must configure the payment service. The walkthrough can help members recognize the intended flow without suggesting that every account automatically has the same methods. Keep private payment issues within the support process. A welcome message should never ask a member to send sensitive payment details to a public channel.",
        ],
        links: [
          {
            label: "Read the MT5 funding guide",
            href: "/resources/mt5-funding",
          },
          { label: "Explore the deposit walkthrough", href: "/mt5-deposits" },
        ],
      },
      {
        id: "preferences-and-help",
        title: "Let members set preferences and practice finding help.",
        paragraphs: [
          "Ask a small number of questions whose answers change the experience: preferred learning topics, relevant program and desired announcement notifications. Keep optional preferences easy to update later. Explain what a mention or notification means so members can follow the discussions they value without assuming every room needs constant attention.",
          "Include a visible example of how to ask a general question and where an account-specific case belongs. A short checklist can confirm that the member found the resource library, understood the support route and knows how to revisit their choices. Avoid presenting a completed welcome checklist as proof of financial suitability, verified identity or permission to trade.",
        ],
        bullets: [
          "Make learning preferences editable after the first visit.",
          "Show the support route alongside account guidance.",
          "Explain how to report suspicious messages or inappropriate conduct.",
        ],
      },
      {
        id: "test-and-improve",
        title:
          "Test the first journey with people who have not seen the workspace.",
        paragraphs: [
          "Ask a new tester to locate the welcome guide, identify the correct account service and find help for a pending application. Watch where they pause or choose the wrong room. Those observations are more actionable than adding another welcome banner. Test on a phone as well as a desktop, including keyboard navigation and readable descriptions.",
          "Azuriya's local community workspace is a preview of the intended experience; it does not send real invitations or establish a live voice connection. Use it to review the layout, resource wording and handoffs. Before inviting members to production, validate delivery, privacy, permissions and the actual account workflows. Revisit the welcome journey whenever a new program or platform changes the choices members need to make.",
        ],
      },
    ],
    related: [
      "/community",
      "/insights/trading-community-support-workflows",
      "/resources/getting-started",
    ],
    cta: { label: "Plan your member experience", href: "/contact" },
    sources: [
      {
        label: "Discord Help: community onboarding and channel preferences",
        href: "https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ",
      },
      {
        label:
          "MetaTrader 5 Help: broker-dependent deposit and withdrawal methods",
        href: "https://www.metatrader5.com/en/terminal/help/startworking/payments",
      },
    ],
  },
];
