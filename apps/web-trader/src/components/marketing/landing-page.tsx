import Link from "next/link";
import Image from "next/image";
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
  PlayCircle,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  SquaresFour,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import { MarketingBrand } from "./brand";
import { MarketingNavigation } from "./navigation";
import { SiteFooter } from "./site-footer";
import { TradingRoomDemo } from "./dashboard";
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
import "./marketing.css";
import "./brokerage.css";
import "./hero-graphic.css";
import "./marketing-light-theme.css";
import "./marketing-reference-theme.css";
import "./landing-product-theme.css";
import "./landing-polish.css";

const questions = [
  [
    "Who is Azuriya built for?",
    "Azuriya is built for influencers, educators and community leaders who want a free brokerage or prop firm solution with one portal for their team, trading accounts and business operations.",
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
        <div className="ab-routing-banner">
          <div className="az-container">
            <span>
              <GlobeHemisphereWest size={18} /> No more B-Book.{" "}
              <strong>Only A-book.</strong>
            </span>
            <a href="#liquidity">
              Direct liquidity provider connections <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <section
          className="az-hero az-container ab-hero"
          aria-labelledby="hero-title"
        >
          <div className="az-hero-grid">
            <div className="ab-hero-editorial">
              <div className="az-hero-eyebrow">
                <span className="az-eyebrow-line" />
                YOUR AUDIENCE. YOUR BROKERAGE.
              </div>
              <h1 id="hero-title">
                Free brokerage &amp;
                <br />
                prop firm solutions.
                <br />
                <span>Built for influencers.</span>
              </h1>
              <div className="az-hero-copy">
                <p>
                  Turn your community into a complete trading business. Bring
                  platforms, accounts, copy trading, payments and your entire
                  team together in one portal.
                </p>
                <div className="az-hero-actions">
                  <Link href="/terminal?mode=register" className="az-button">
                    Explore your portal <ArrowUpRight size={18} />
                  </Link>
                  <a href="#solutions" className="az-explore">
                    <PlayCircle size={19} />
                    See the complete solution
                  </a>
                </div>
                <Link href="/mt5-deposits" className="mdh-hero-link">
                  <Image
                    src="/marketing/platforms/metatrader-5.png"
                    alt=""
                    width={19}
                    height={19}
                  />
                  Deposit directly from MT5 · Desktop &amp; mobile
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
            <HeroGraphic />
          </div>
          <div className="az-hero-capabilities">
            <span>
              <GlobeHemisphereWest size={16} />
              A-book liquidity
            </span>
            <span>
              <Copy size={16} />
              Cross-account copy trading
            </span>
            <span>
              <Wallet size={16} />
              Direct MT5 deposits
            </span>
            <span>
              <SlidersHorizontal size={16} />
              Admin &amp; MT5 Manager
            </span>
          </div>
        </section>

        <TradingConditions />

        <section
          className="az-audience az-container"
          aria-label="Solutions for influencers"
        >
          <p>
            Built around your audience.
            <br />
            <strong>Run the business your way.</strong>
          </p>
          <div>
            <span>
              <DiamondsFour />
              Free brokerage solutions
            </span>
            <span>
              <GlobeHemisphereWest />
              Prop firm solutions
            </span>
            <span>
              <ChartLineUp />
              Influencers &amp; educators
            </span>
            <span>
              <UsersThree />
              Your entire team
            </span>
          </div>
        </section>

        <MT5DepositHighlight />
        <LiquidityNetwork />
        <TradingPlatforms />

        <section
          className="az-section az-container ab-portal-section"
          id="solutions"
          aria-labelledby="solutions-title"
        >
          <div className="ab-section-heading">
            <div>
              <div className="az-eyebrow">
                <SquaresFour size={17} /> ONE PLACE FOR THE ENTIRE TEAM
              </div>
              <h2 id="solutions-title">
                Every part of your business.
                <br />
                <span>One portal to run it.</span>
              </h2>
            </div>
            <p>
              Manage your trading platform backends, accounts, trades and people
              from the same place. Give your team a shared view and your
              community head complete oversight.
            </p>
          </div>
          <TradingRoomDemo />
          <div className="az-preview-footnote">
            <span>Explore the interactive brokerage portal demo.</span>
            <a href="/terminal">
              Open the simulated terminal <ArrowUpRight size={14} />
            </a>
          </div>
        </section>

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

        <section className="az-final-cta az-container">
          <span className="az-cta-mark">
            <MarketingBrand compact />
          </span>
          <h2>
            Your audience is ready.
            <br />
            <span>Give them a complete trading business.</span>
          </h2>
          <p>
            Free brokerage and prop firm solutions. One portal for the entire
            team.
          </p>
          <div>
            <Link className="az-button" href="/terminal?mode=register">
              Explore your portal <ArrowUpRight size={18} />
            </Link>
            <Link className="az-button az-button-secondary" href="/terminal">
              Explore the terminal <ArrowRight size={17} />
            </Link>
          </div>
          <small>
            Start with a simulated account. Explore at your own pace.
          </small>
        </section>
      </main>
      <SiteFooter />
    </MarketingMotion>
  );
}
