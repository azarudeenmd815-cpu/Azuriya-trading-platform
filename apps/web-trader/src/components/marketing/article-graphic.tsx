import type { SiteArticle } from "./site-types";

type ArticleDiagram = { labels: string[]; details: string[]; caption: string };
const articleDiagrams: Record<string, ArticleDiagram> = {
  "/insights/mt5-manager-account-groups": {
    labels: ["Account group", "Change approval", "Verified rollout"],
    details: ["Policy version", "Scoped permissions", "Audit reference"],
    caption: "LEVERAGE · COMMISSION · ACCOUNT RULES",
  },
  "/insights/brokerage-deposit-withdrawal-controls": {
    labels: ["Funding request", "Operator review", "Recorded outcome"],
    details: ["Verified owner", "Amount & method", "Ledger reference"],
    caption: "SEPARATE DEPOSIT AND WITHDRAWAL RULES",
  },
  "/insights/trading-platform-integration-checklist": {
    labels: ["Access scope", "Capability tests", "Connector review"],
    details: [
      "Provider permissions",
      "Versioned interfaces",
      "Accepted functions",
    ],
    caption: "VERIFY EACH CONNECTION BEFORE LAUNCH",
  },
  "/insights/trading-operations-incident-response": {
    labels: ["Detect issue", "Reconcile state", "Controlled recovery"],
    details: ["Affected accounts", "Confirmed execution", "Reviewed actions"],
    caption: "RECOVER FROM CONFIRMED STATE",
  },
  "/insights/prop-firm-payout-review": {
    labels: ["Eligibility", "Evidence review", "Payment decision"],
    details: ["Policy version", "Account records", "Approval reference"],
    caption: "REVIEW BEFORE PAYMENT AUTHORIZATION",
  },
  "/insights/prop-firm-evaluation-lifecycle": {
    labels: ["Evaluation", "Stage review", "Next account state"],
    details: ["Published criteria", "Confirmed results", "Program decision"],
    caption: "RULES FOLLOW EVERY STAGE TRANSITION",
  },
  "/insights/trading-community-onboarding": {
    labels: ["Welcome", "Member resources", "Account setup"],
    details: [
      "Community profile",
      "Guided first steps",
      "Separate permissions",
    ],
    caption: "FROM MEMBER JOINING TO ACCOUNT ACCESS",
  },
  "/insights/trading-community-support-workflows": {
    labels: ["Private case", "Assigned owner", "Resolution record"],
    details: ["Minimum evidence", "Visible escalation", "Member response"],
    caption: "KEEP ACCOUNT CASES OUT OF PUBLIC CHAT",
  },
};

export function ArticleGraphic({
  category,
  path,
  className = "",
}: {
  category: SiteArticle["category"];
  path: string;
  className?: string;
}) {
  const funding = path.includes("deposit");
  const commission = path.includes("commission");
  const copy = category === "Copy trading";
  const community = category === "Community";
  const prop = category === "Prop firms";
  const diagram = articleDiagrams[path];
  const labels =
    diagram?.labels ??
    (community
      ? ["Announcements", "Team channels", "Account support"]
      : prop
        ? ["Evaluation", "Rule validation", "Program review"]
        : copy
          ? ["Source account", "Copy engine", "Follower accounts"]
          : funding
            ? ["MT5 Payments", "Provider checkout", "Reconciled ledger"]
            : commission
              ? ["Base · $2.00", "Extra · $5.00", "Total · $7.00 / lot"]
              : category === "Infrastructure"
                ? [
                    "Trading accounts",
                    "Execution routing",
                    "Liquidity provider",
                  ]
                : ["Community", "Account operations", "Brokerage controls"]);
  const caption =
    diagram?.caption ??
    (community
      ? "ROLES · CHANNELS · HANDOFFS"
      : prop
        ? "CLEAR RULES AT EVERY STAGE"
        : copy
          ? "INDIVIDUAL RISK RULES"
          : funding
            ? "PAYMENT STATUS ≠ ACCOUNT CREDIT"
            : commission
              ? "ILLUSTRATIVE · SAME PER-LOT BASIS"
              : "A CONNECTED OPERATING FRAMEWORK");
  return (
    <svg
      className={`ai-graphic ${className}`}
      viewBox="0 0 640 340"
      role="img"
      aria-label={`${labels.join(" to ")}. ${caption.toLowerCase()}.`}
    >
      <rect width="640" height="340" fill="#f3f7fd" />
      <path
        d="M0 68H640M0 136H640M0 204H640M0 272H640M80 0V340M160 0V340M240 0V340M320 0V340M400 0V340M480 0V340M560 0V340"
        stroke="#e5edf8"
      />
      <rect
        x="39"
        y="31"
        width="562"
        height="278"
        rx="12"
        fill="white"
        stroke="#d6e1f2"
      />
      <text
        x="62"
        y="65"
        fill="#60728d"
        fontSize="11"
        fontWeight="600"
        letterSpacing="1.5"
      >
        AZURIYA / {category.toUpperCase()}
      </text>
      <circle cx="566" cy="61" r="4" fill="#2859c5" />
      <path d="M62 85H578" stroke="#e3eaf4" />
      {labels.map((label, index) => (
        <g key={label}>
          {index > 0 && (
            <path
              d={`M${80 + index * 170 - 18} 163H${80 + index * 170}`}
              stroke="#8aaae2"
              strokeWidth="2"
            />
          )}
          <rect
            x={68 + index * 170}
            y="116"
            width="158"
            height="94"
            rx="9"
            fill={index === 1 ? "#eaf1ff" : "#fafcfe"}
            stroke={index === 1 ? "#a8bfec" : "#dce5f1"}
          />
          <rect
            x={83 + index * 170}
            y="129"
            width="27"
            height="27"
            rx="7"
            fill={index === 1 ? "#2859c5" : "#e7eef9"}
          />
          <text
            x={96 + index * 170}
            y="147"
            fill={index === 1 ? "#fff" : "#2859c5"}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
          >
            0{index + 1}
          </text>
          <text
            x={83 + index * 170}
            y="182"
            fill="#1c2b44"
            fontSize="12"
            fontWeight="600"
          >
            {label}
          </text>
          <text x={83 + index * 170} y="198" fill="#6f819b" fontSize="10">
            {diagram
              ? diagram.details[index]
              : community
                ? ["Public updates", "Role-based access", "Private handoff"][
                    index
                  ]
                : prop
                  ? ["Defined targets", "Loss boundaries", "Audited decisions"][
                      index
                    ]
                  : copy
                    ? [
                        "Validated order",
                        "Mapped & sized",
                        "Account authority",
                      ][index]
                    : funding
                      ? ["Start deposit", "Confirm outcome", "Credit once"][
                          index
                        ]
                      : commission
                        ? "Same charge convention"
                        : "Defined ownership"}
          </text>
        </g>
      ))}
      <path d="M96 210V235H538V210" fill="none" stroke="#cfddf2" />
      <circle cx="318" cy="235" r="4" fill="#2859c5" />
      <text
        x="320"
        y="274"
        fill="#60728d"
        fontSize="10"
        fontWeight="600"
        letterSpacing="1"
        textAnchor="middle"
      >
        {caption}
      </text>
    </svg>
  );
}
