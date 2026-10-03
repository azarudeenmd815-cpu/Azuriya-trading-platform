import { TradingRoomDemo } from "./dashboard";
import { CommunityView } from "./dashboard-community";
import { CopyTradingDemo } from "./copy-demo";
import { LiquidityNetwork } from "./liquidity-network";
import { TradingPlatforms } from "./trading-platforms";
import { RevenueCalculator } from "./revenue-calculator";
import { AdministrationPreview } from "./portal-operations";
import { MarketingMotion, DiagramMotionToggle } from "./marketing-motion";
import { MarketingDashboardSurface } from "./marketing-theme";

export function PageExperience({ path }: { path: string }) {
  const experiences: Record<
    string,
    { label: string; title: string; text: string; content: React.ReactNode }
  > = {
    "/platform": {
      label: "EXPLORE THE PORTAL",
      title: "See the whole workspace in action.",
      text: "Switch between Overview, Teams, Community, Brokerage, Prop firm and Administration. All values and interactions are examples.",
      content: <TradingRoomDemo />,
    },
    "/community": {
      label: "TEAM COMMUNICATION",
      title: "A community with the tools to work together.",
      text: "Explore channels, member roles, direct messages, threads, pinned resources and scheduled events. Messages and settings stay in this local preview; voice and screen sharing are interface demonstrations.",
      content: (
        <MarketingDashboardSurface>
          <div className="az-dashboard sp-community-preview">
            <CommunityView />
          </div>
        </MarketingDashboardSurface>
      ),
    },
    "/copy-trading": {
      label: "FOLLOW THE TRADE",
      title: "One source. Individual account rules.",
      text: "The illustration shows a master order moving through the copy engine to three followers, each with its own allocation.",
      content: (
        <div className="sp-copy-preview">
          <CopyTradingDemo />
        </div>
      ),
    },
    "/liquidity": {
      label: "THE EXECUTION MODEL",
      title: "A clear path to external liquidity.",
      text: "Explore the provider options and routing illustration. Third-party marks identify referenced options; production access requires provider approval and configuration.",
      content: <LiquidityNetwork />,
    },
    "/trading-platforms": {
      label: "PLATFORM ECOSYSTEM",
      title: "Your preferred trading environment.",
      text: "Browse the 32-entry platform catalog. Each live connection needs a defined API scope, provider permissions and connector validation.",
      content: <TradingPlatforms />,
    },
    "/pricing": {
      label: "COMMISSION EXAMPLE",
      title: "Understand the per-lot model.",
      text: "Adjust the illustrative volume and extra markup. The example uses a $2.00 base plus up to $5.00 extra on the same per-lot basis.",
      content: <RevenueCalculator />,
    },
    "/admin-portal": {
      label: "OPERATOR CONTROLS",
      title: "Configuration with context.",
      text: "Inspect the illustrative Admin and MT5 Manager views. Production changes need authenticated access, ownership checks and audit records.",
      content: <AdministrationPreview />,
    },
  };
  const experience = experiences[path];
  if (!experience) return null;
  return (
    <MarketingMotion>
      <section className="sp-experience" aria-labelledby="experience-title">
        <div className="sp-experience-heading">
          <span className="sp-eyebrow">{experience.label}</span>
          <h2 id="experience-title">{experience.title}</h2>
          <p>{experience.text}</p>
        </div>
        {(path === "/trading-platforms" || path === "/admin-portal") && (
          <div className="sp-motion-toolbar">
            <DiagramMotionToggle />
          </div>
        )}
        {experience.content}
      </section>
    </MarketingMotion>
  );
}
