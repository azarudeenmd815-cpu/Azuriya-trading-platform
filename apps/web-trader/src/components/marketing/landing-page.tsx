import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChartLineUp,
  Check,
  CheckCircle,
  Copy,
  DiamondsFour,
  GlobeHemisphereWest,
  LockKey,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import { MarketingNavigation } from "./navigation";
import { SiteFooter } from "./site-footer";
import { DashboardLaptopMock } from "./dashboard";
import { CopyTradingDemo } from "./copy-demo";
import { RevenueCalculator } from "./revenue-calculator";
import { LiquidityNetwork } from "./liquidity-network";
import { InfrastructureGallery } from "./infrastructure-gallery";
import {
  AccountSnapshot,
  CommissionGraphic,
  RiskUsageGraphic,
} from "./product-detail-graphics";
import { TradingPlatforms } from "./trading-platforms";
import { PortalOperations, AdministrationPreview } from "./portal-operations";
import { HeroGraphic } from "./hero-graphic";
import { MT5DepositHighlight } from "./mt5-deposit-highlight";
import { MarketingMotion } from "./marketing-motion";
import { FlowTracks } from "./flow-tracks";
import { FeaturedArticles } from "./article-insights";
import { TradingConditions } from "./trading-conditions";
import { LandingHeroCopy } from "./landing-hero-copy";
import { LaunchPricing } from "./launch-pricing";
import { LaunchGlobe } from "./launch-globe";
import { FooterBrand } from "./footer-brand-mark";
import { AutomationEcosystem, EcosystemPreview } from "./ecosystem-preview";
import {
  BrandOwnership,
  LaunchSteps,
  CoreEcosystem,
  BusinessJourneys,
  BusinessEconomics,
  BuildComparison,
  MigrationAndTrust,
} from "./launch-sections";
import "./marketing.css";
import "./brokerage.css";
import "./hero-graphic.css";
import "./marketing-light-theme.css";
import "./marketing-reference-theme.css";
import "./landing-product-theme.css";
import "./landing-polish.css";

const questions = [
  [
    "Is Azuriya really free to launch?",
    "The standard Azuriya package has a $0 fixed monthly subscription and a 35% share of eligible revenue. Third-party licensing, provider charges and custom work are scoped separately. Review pricing and confirm the revenue basis and settlement terms before launch.",
  ],
  [
    "What is included in the standard package?",
    "The $0 monthly package brings your branded trading platform, CRM and client portal together under a 35% revenue-share arrangement. Your proposal should identify included modules, branding, connections, onboarding and support. Bespoke development and external platform licenses are scoped separately.",
  ],
  [
    "Are there monthly minimums or usage fees?",
    "The standard Azuriya package has no fixed monthly subscription. A 35% share of eligible revenue applies. Your written schedule and agreement define eligible revenue, settlement, external provider costs and any services outside the standard package.",
  ],
  [
    "Do I need MT5?",
    "No. You can explore Azuriya’s own simulated trading terminal. MT5 is an optional connection for businesses that require it; access, licensing and production integration must be arranged for your deployment.",
  ],
  [
    "Can I connect my existing MT5 or keep my CRM?",
    "Discuss your existing server, CRM, API access and provider permissions with the team. Connection availability and migration scope are confirmed after reviewing your systems.",
  ],
  [
    "Can an existing prop firm use Azuriya?",
    "Yes, the offer includes an integration path for existing operations. Challenge rules, accounts, trader records and payout workflows should be mapped and validated before migration.",
  ],
  [
    "Can I use my own domain and branding?",
    "The white-label offer is designed around your identity: logo, branding and domain. Agree the exact branding surfaces, domain setup and onboarding requirements in your launch scope.",
  ],
  [
    "Who handles licensing and regulatory requirements?",
    "The operator is responsible for confirming the permissions, licensing and legal requirements that apply to its business. Technology access does not provide authorization to offer financial services.",
  ],
  [
    "Which countries can I operate in?",
    "Availability depends on your operating entity, business model, providers and applicable restrictions. Confirm target jurisdictions and provider eligibility before launch; this preview does not publish a universal country list.",
  ],
  [
    "Can I set my own spreads and commissions?",
    "Configured account groups can use agreed pricing and commission rules. Available controls depend on the platform, liquidity route, permissions and commercial arrangement.",
  ],
  [
    "How quickly can I launch?",
    "Timing depends on branding, integrations, provider onboarding, readiness checks and your operating requirements. The team confirms a launch plan after reviewing your scope.",
  ],
  [
    "Can I export my data or migrate away?",
    "Confirm export formats, access rights, retention, offboarding support and any migration charges in your contract. This preview does not promise an unverified production export workflow.",
  ],
  [
    "Who is Azuriya built for?",
    "Azuriya is built for trading brands, educators, introducing brokers, founders and existing brokerages or prop firms that want to run their operation through connected infrastructure.",
  ],
  [
    "What does A-book mean for our community?",
    "A-book routes trading flow to external liquidity providers. Azuriya’s offer is built around direct LP connectivity, with provider selection and routing managed through the configured infrastructure.",
  ],
  [
    "Can we manage deposits, withdrawals and community chat here?",
    "The unified portal brings funding requests, member conversations, account management and trading operations together. The landing page shows the intended workflows; funding and chat panels here contain example data.",
  ],
  [
    "Can traders deposit directly from MetaTrader 5?",
    "Yes. With a configured broker payment gateway, traders can start a deposit in MT5 on desktop, iOS or Android and complete checkout with the selected provider. Available payment methods, currencies, fees and approval rules depend on the broker and provider. This website contains an illustrative walkthrough; it does not process deposits.",
  ],
  [
    "Who controls leverage and commission markups?",
    "The community head manages leverage, commission markups and account group settings through the Admin Portal and MT5 Manager Portal. Permissions determine which team members can view or change these settings.",
  ],
  [
    "How do platform connections work?",
    "The platform catalog brings together more than 25 trading platforms. Connections depend on the platform’s API, provider permissions and configured connector. The local preview uses simulated execution.",
  ],
  [
    "Can I explore the platform before creating an account?",
    "Yes. Use the interactive preview above to explore sample teams, account information, copy trading and risk controls. Create a simulated account to try the working trading terminal.",
  ],
  [
    "Are the trades and performance figures live?",
    "The website uses illustrative community data. The current terminal uses simulated funds and execution. No real money is traded, and no external liquidity providers are connected in this environment.",
  ],
  [
    "How does community commission markup work?",
    "The commercial model adds an agreed markup to the base commission on eligible trading volume. Our calculator illustrates the arithmetic on a consistent per-lot basis. Actual commission terms, per-side or round-turn treatment, eligibility and settlement must be agreed with your provider.",
  ],
  [
    "Can different teams have different trading rules?",
    "The community experience is designed around separate team permissions, instruments, copy settings and risk profiles. The preview shows example settings; production community management and broker connections require integration with your configured trading infrastructure.",
  ],
];

export function LandingPage() {
  return (
    <MarketingMotion className="az-landing-page">
      <a className="az-skip-link" href="#main-content">
        Skip to content
      </a>
      <MarketingNavigation />
      <main id="main-content">
        <section
          className="az-hero az-container ab-hero"
          aria-labelledby="hero-title"
        >
          <div className="az-hero-grid">
            <LandingHeroCopy />
            <HeroGraphic />
          </div>
          <div className="az-hero-capabilities">
            <span>
              <GlobeHemisphereWest size={16} />
              Web trading & CRM
            </span>
            <span>
              <Copy size={16} />
              Back office & copy trading
            </span>
            <span>
              <Wallet size={16} />
              Payments & platform connections
            </span>
            <span>
              <SlidersHorizontal size={16} />
              Prop technology & APIs
            </span>
          </div>
        </section>

        <LaunchPricing />

        <section
          className="az-section az-container az-split-section"
          id="revenue"
          aria-labelledby="revenue-title"
        >
          <div className="az-section-copy">
            <div className="az-eyebrow">
              <ChartLineUp size={17} /> YOUR COMMUNITY. YOUR BUSINESS.
            </div>
            <h2 id="revenue-title">
              Your commission markup.
              <br />
              <span>Your commercial model.</span>
            </h2>
            <p>
              Set your community’s commission markup from the Admin Portal. See
              how eligible trading volume translates into revenue with a simple
              per-lot example.
            </p>
            <div className="az-revenue-features">
              <span>
                <SlidersHorizontal size={20} />
                <div>
                  <strong>Flexible by design</strong>
                  <p>Pricing by team, instrument or member.</p>
                </div>
              </span>
              <span>
                <ChartLineUp size={20} />
                <div>
                  <strong>Visible from the start</strong>
                  <p>Trading activity and revenue in one view.</p>
                </div>
              </span>
            </div>
            <CommissionGraphic />
            <span className="az-small-note">
              The calculator is an example, not a forecast or guarantee.
            </span>
          </div>
          <RevenueCalculator />
        </section>

        <BusinessJourneys />
        <BuildComparison />
        <BrandOwnership />

        <section
          className="az-section az-container ab-portal-section"
          id="solutions"
          aria-labelledby="solutions-title"
        >
          <div className="ab-section-heading">
            <div>
              <div className="az-eyebrow">
                <SquaresFour size={17} /> YOUR BUSINESS, ON SCREEN
              </div>
              <h2 id="solutions-title">
                See your brokerage
                <br />
                <span>before you launch it.</span>
              </h2>
            </div>
            <p>
              Explore a working portal with accounts, funding, copy trading and
              risk controls in one place. This interactive preview uses sample
              data; the trading terminal uses simulated funds and execution.
            </p>
          </div>
          <DashboardLaptopMock />
          <div className="az-preview-footnote">
            <span>Explore the interactive brokerage portal demo.</span>
            <a href="/terminal">
              Open the simulated terminal <ArrowUpRight size={14} />
            </a>
          </div>
        </section>

        <LaunchSteps />
        <CoreEcosystem />
        <TradingPlatforms />
        <EcosystemPreview />
        <AutomationEcosystem />
        <MigrationAndTrust />
        <TradingConditions />
        <LiquidityNetwork />
        <BusinessEconomics />
        <MT5DepositHighlight />

        <section
          className="az-section az-container"
          id="communities"
          aria-labelledby="community-title"
        >
          <div className="az-section-intro pd-community-heading">
            <div>
              <div className="az-eyebrow">
                <SquaresFour size={17} /> THE COMMUNITY OPERATING SYSTEM
              </div>
              <h2 id="community-title">
                Your people. Your accounts.
                <br />
                <span>Connected from day one.</span>
              </h2>
            </div>
            <p>
              Organize members, platform accounts and permissions around your
              community. Manage MT5 and your connected trading platforms through
              the portal, with account information and trades in one view.
            </p>
          </div>
          <div className="az-feature-grid">
            <article className="az-feature az-feature-wide">
              <div className="az-feature-copy">
                <UsersThree size={25} />
                <h3>A place for every team.</h3>
                <p>
                  Organize traders into teams. Give each person the right role,
                  accounts and permissions.
                </p>
                <a href="#platform">
                  Explore account management <ArrowUpRight size={16} />
                </a>
              </div>
              <div
                className="az-hierarchy"
                aria-label="Example community hierarchy"
              >
                <div className="az-hierarchy-owner">
                  <span className="az-mini-brand">
                    <DiamondsFour size={19} weight="fill" />
                  </span>
                  <div>
                    <strong>Alpha Trading</strong>
                    <small>Community owner</small>
                  </div>
                  <ShieldCheck size={17} />
                </div>
                <div className="az-hierarchy-branches" aria-hidden="true">
                  <FlowTracks
                    id="community-teams"
                    viewBox="0 0 300 57"
                    paths={[
                      "M150 0 V14 Q150 22 142 22 H8 Q0 22 0 30 V57",
                      "M150 0 V57",
                      "M150 0 V14 Q150 22 158 22 H292 Q300 22 300 30 V57",
                    ]}
                  />
                </div>
                <div className="az-hierarchy-teams">
                  {[
                    ["Gold Elite", "380 traders", "gold", "MT5 · cTrader"],
                    ["FX Intraday", "216 traders", "blue", "MT5 · TradeLocker"],
                    ["Algo Team", "85 traders", "purple", "MT5 · cTrader"],
                  ].map(([name, count, color, platforms]) => (
                    <div key={name}>
                      <span className={`az-team-symbol az-${color}`}>
                        <DiamondsFour size={19} />
                      </span>
                      <strong>{name}</strong>
                      <small>{count}</small>
                      <small className="pd-team-platforms">{platforms}</small>
                      <span className="az-role-chip">
                        Team leader <Check size={11} />
                      </span>
                    </div>
                  ))}
                </div>
                <span className="az-visual-caption">
                  Illustrative organization structure
                </span>
              </div>
            </article>
            <article className="az-feature az-accounts-feature">
              <Wallet size={25} />
              <h3>Every account, accounted for.</h3>
              <p>
                Balances, equity and open positions. The information you need,
                without another login.
              </p>
              <AccountSnapshot />
              <span className="az-visual-caption">Example account data</span>
            </article>
          </div>
        </section>

        <section
          className="az-section az-container az-split-section"
          id="copy-trading"
          aria-labelledby="copy-title"
        >
          <div className="az-section-copy">
            <div className="az-eyebrow">
              <Copy size={17} /> BUILT-IN COPY TRADING
            </div>
            <h2 id="copy-title">
              Copy trades.
              <br />
              <span>Across your accounts.</span>
            </h2>
            <p>
              Copy trades between accounts across your connected trading stack.
              Bring master traders and followers together, with sizing and risk
              settings for every account.
            </p>
            <ul className="az-check-list">
              <li>
                <CheckCircle />
                Cross-account and cross-platform workflows
              </li>
              <li>
                <CheckCircle />
                Proportional sizing and lot limits
              </li>
              <li>
                <CheckCircle />
                Stop-loss and take-profit copying
              </li>
              <li>
                <CheckCircle />
                Individual control for every follower
              </li>
            </ul>
            <a className="az-text-link" href="#platform">
              Explore the copy engine <ArrowRight size={18} />
            </a>
          </div>
          <CopyTradingDemo />
        </section>

        <PortalOperations />
        <AdministrationPreview />

        <section
          className="az-container az-risk-section"
          id="risk"
          aria-labelledby="risk-title"
        >
          <div className="az-risk-visual">
            <div className="az-risk-visual-top">
              <ShieldCheck size={23} />
              <span>Community risk policy</span>
              <span className="az-preview-tag">EXAMPLE</span>
            </div>
            <RiskUsageGraphic />
            {[
              ["Daily loss limit", "3.00%"],
              ["Maximum drawdown", "10.00%"],
              ["Maximum open positions", "20"],
              ["Permission-based access", "Enabled"],
            ].map(([label, value]) => (
              <div className="az-policy-row" key={label}>
                <span>
                  <CheckCircle size={16} />
                  {label}
                </span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="az-policy-footer">
              <LockKey size={15} />
              Rules follow every account group.
            </div>
          </div>
          <div className="az-section-copy">
            <div className="az-eyebrow">
              <ShieldCheck size={17} /> CONTROL THAT SCALES
            </div>
            <h2 id="risk-title">
              Your prop firm.
              <br />
              <span>Your risk framework.</span>
            </h2>
            <p>
              Define trading limits, drawdown rules and risk profiles for your
              prop firm and community accounts. Keep oversight as your team and
              platform network grow.
            </p>
            <a className="az-text-link" href="#platform">
              Explore risk controls <ArrowRight size={18} />
            </a>
          </div>
        </section>

        <InfrastructureGallery />

        <section
          className="az-section az-container az-faq"
          id="questions"
          aria-labelledby="faq-title"
        >
          <div>
            <div className="az-eyebrow">A LITTLE MORE CLARITY</div>
            <h2 id="faq-title">
              Before you get started.
              <br />
              <span>A few useful answers.</span>
            </h2>
            <p>Get to know your brokerage and prop firm solution.</p>
          </div>
          <div className="az-faq-items">
            {questions.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <FeaturedArticles />

        <section className="az-final-cta az-container az-globe-cta">
          <div className="az-globe-cta-copy">
            <span className="az-cta-mark">
              <FooterBrand compact />
            </span>
            <h2>
              Your brand could be live next.
              <br />
              <span>Build your own trading business.</span>
            </h2>
            <p>
              $0 per month. 35% revenue share. Your business, backed by a
              connected operating stack.
            </p>
            <div>
              <Link className="az-button" href="/contact">
                Launch Your Business <ArrowUpRight size={18} />
              </Link>
              <Link className="az-button az-button-secondary" href="/terminal">
                Explore the terminal <ArrowRight size={17} />
              </Link>
            </div>
            <small>Explore the interactive preview at your own pace.</small>
          </div>
          <LaunchGlobe />
        </section>
      </main>
      <SiteFooter />
    </MarketingMotion>
  );
}
