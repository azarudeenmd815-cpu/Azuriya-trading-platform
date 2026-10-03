import {
  ArrowsSplit,
  Bank,
  CheckCircle,
  ChatCircleDots,
  Database,
  GlobeHemisphereWest,
  LockKey,
  PlugsConnected,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import { MarketingBrand } from "./brand";
import { CommissionGraphic, RiskUsageGraphic } from "./product-detail-graphics";
import type { SiteVisual } from "./site-types";

const profiles = {
  portal: {
    title: "Operations workspace",
    icon: Database,
    rows: [
      ["Accounts", "Groups & ownership"],
      ["Trading", "Positions & order history"],
      ["Funding", "Requests & reconciliation"],
    ],
    nodes: ["Accounts", "Community", "Trading stack"],
  },
  brokerage: {
    title: "Brokerage control plane",
    icon: Bank,
    rows: [
      ["Execution", "A-book routing"],
      ["Account groups", "Leverage & symbols"],
      ["Pricing", "Base + group markup"],
    ],
    nodes: ["Trading platforms", "Azuriya portal", "Liquidity providers"],
  },
  prop: {
    title: "Prop firm workspace",
    icon: Trophy,
    rows: [
      ["Programs", "Evaluation → funded"],
      ["Rules", "Daily loss & drawdown"],
      ["Payouts", "Eligibility & review"],
    ],
    nodes: ["Evaluation", "Risk review", "Funded account"],
  },
  copy: {
    title: "Copy engine workspace",
    icon: ArrowsSplit,
    rows: [
      ["Source", "Master account"],
      ["Allocation", "Follower-specific sizing"],
      ["Protection", "Independent risk rules"],
    ],
    nodes: ["Master account", "Copy engine", "Follower accounts"],
  },
  community: {
    title: "Team communication",
    icon: ChatCircleDots,
    rows: [
      ["Channels", "Discussion & announcements"],
      ["Members", "Roles & permissions"],
      ["Collaboration", "Threads, files & events"],
    ],
    nodes: ["Your audience", "Your community", "Your team"],
  },
  admin: {
    title: "Administration workspace",
    icon: SlidersHorizontal,
    rows: [
      ["Access", "Team & operator roles"],
      ["Configuration", "Groups, leverage & fees"],
      ["Oversight", "Approvals & audit history"],
    ],
    nodes: ["Admin Portal", "Manager services", "Trading platforms"],
  },
  liquidity: {
    title: "Liquidity routing layer",
    icon: PlugsConnected,
    rows: [
      ["Provider selection", "Configured LP options"],
      ["Symbol routing", "Coverage & quote rules"],
      ["Execution", "External A-book flow"],
    ],
    nodes: ["Platform orders", "Routing layer", "Selected LPs"],
  },
  platforms: {
    title: "Platform ecosystem",
    icon: GlobeHemisphereWest,
    rows: [
      ["Catalog", "32 platform references"],
      ["Connector scope", "API & account actions"],
      ["Validation", "Provider permissions"],
    ],
    nodes: ["MT5 & MT4", "Portal connectors", "Platform ecosystem"],
  },
  funding: {
    title: "Funding workspace",
    icon: Wallet,
    rows: [
      ["Native MT5", "Provider-enabled funding"],
      ["Transactions", "Deposits & withdrawals"],
      ["Operations", "Approval & reconciliation"],
    ],
    nodes: ["Trader", "Payment provider", "Trading account"],
  },
  risk: {
    title: "Risk control workspace",
    icon: ShieldCheck,
    rows: [
      ["Account rules", "Margin & order checks"],
      ["Programs", "Loss & drawdown limits"],
      ["Copy settings", "Independent follower limits"],
    ],
    nodes: ["Order request", "Risk checks", "Execution decision"],
  },
  commercial: {
    title: "Transparent commission model",
    icon: Bank,
    rows: [
      ["Base commission", "$2.00 / lot"],
      ["Extra markup", "Up to $5.00 / lot"],
      ["Combined example", "$7.00 / lot at the limit"],
    ],
    nodes: ["Eligible volume", "Agreed markup", "Reconciliation"],
  },
  network: {
    title: "One place for the entire team",
    icon: UsersThree,
    rows: [
      ["People", "Members & operators"],
      ["Platforms", "Your configured trading stack"],
      ["Operations", "Accounts, funding & community"],
    ],
    nodes: ["Your audience", "Azuriya", "Your operation"],
  },
} as const;

export function SiteProductGraphic({ visual }: { visual: SiteVisual }) {
  const profile = profiles[visual];
  const Icon = profile.icon;
  return (
    <div
      className="sp-product-graphic"
      aria-label={`${profile.title} illustration`}
      role="group"
    >
      <div className="sp-graphic-top">
        <MarketingBrand compact />
        <span>WORKSPACE PREVIEW</span>
      </div>
      <div className="sp-graphic-heading">
        <span>
          <Icon size={24} weight="duotone" />
        </span>
        <div>
          <small>YOUR OPERATION, CONNECTED</small>
          <h2>{profile.title}</h2>
        </div>
      </div>
      <div className="sp-graphic-nodes" aria-hidden="true">
        {profile.nodes.map((node, index) => (
          <div key={node}>
            <span>{index + 1}</span>
            <strong>{node}</strong>
          </div>
        ))}
      </div>
      <div className="sp-graphic-rows">
        {profile.rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <CheckCircle size={17} />
          </div>
        ))}
      </div>
      {visual === "commercial" ? (
        <CommissionGraphic />
      ) : visual === "prop" || visual === "risk" ? (
        <RiskUsageGraphic />
      ) : (
        <div className="sp-graphic-bottom">
          <LockKey size={15} />
          <span>Role-based access</span>
          <span>Illustrative configuration</span>
        </div>
      )}
    </div>
  );
}
