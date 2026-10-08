import Link from "next/link";
import {
  ArrowUpRight,
  ArrowsLeftRight,
  ChartLineUp,
  Check,
  Code,
  FlagCheckered,
  GearSix,
  GlobeHemisphereWest,
  ShieldCheck,
  SquaresFour,
  Stack,
  Trophy,
  Users,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import "./launch-sections.css";
import { BuildComparisonGraphic, CoreEcosystemGraphic } from "./launch-visuals";

function Heading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="launch-heading">
      <div className="az-eyebrow">
        <SquaresFour size={16} />
        {eyebrow}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function LaunchOffer() {
  return (
    <section
      className="az-container launch-section"
      id="launch-offer"
      aria-label="Launch options and development costs"
    >
      <Heading
        eyebrow="ALREADY BUILT. READY FOR YOUR BRAND."
        title="Everything you need to launch."
        description="You bring the brand and audience. We provide the technology, without the cost of developing your own platform."
      />
      <div className="launch-grid launch-offers">
        {[
          [
            "01",
            "Azuriya Brokerage",
            "$0",
            "per month · 35% revenue share",
            "Your own branded brokerage with trading, CRM, back office, funding workflows and account management.",
            "/brokerage",
            "Start Your Brokerage",
          ],
          [
            "02",
            "Azuriya Prop",
            "$0",
            "per month · 35% revenue share",
            "Build evaluation products, configure rules and manage funded accounts, trader activity and payout workflows.",
            "/prop-firm",
            "Launch a Prop Firm",
          ],
          [
            "03",
            "MT5 Brokerage",
            "Optional",
            "platform upgrade",
            "Connect MT5 when your business requires it, with platform licensing, access and connector scope agreed separately.",
            "/contact",
            "Discuss MT5",
          ],
        ].map(([number, title, price, label, body, href, cta]) => (
          <article className="launch-card" key={title}>
            <span className="launch-number">{number}</span>
            <h3>{title}</h3>
            <div className="launch-price">
              {price}
              <small>{label}</small>
            </div>
            <p>{body}</p>
            <Link href={href}>
              {cta}
              <ArrowUpRight size={18} />
            </Link>
          </article>
        ))}
      </div>
      <p className="launch-note">
        The standard Azuriya package has no fixed monthly subscription. A 35%
        revenue share applies. Payment-provider charges, third-party licenses,
        custom work and commercial terms are agreed before launch.{" "}
        <Link href="/pricing">Review pricing and scope →</Link>
      </p>
    </section>
  );
}

export function BrandOwnership() {
  return (
    <section
      className="az-container launch-section launch-ownership"
      aria-label="Your brand and business ownership"
    >
      <Heading
        eyebrow="WHITE LABEL. YOUR IDENTITY."
        title="Your business. Your brand."
        description="Azuriya powers the infrastructure while your customers interact with your trading business."
      />
      <div className="launch-brand-strip">
        {[
          "Your logo",
          "Your domain",
          "Your branding",
          "Your clients",
          "Your pricing",
        ].map((label, index) => (
          <div key={label}>
            <span>0{index + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LaunchSteps() {
  return (
    <section
      className="az-container launch-section"
      aria-label="Steps to launch your business"
    >
      <Heading
        eyebrow="A CLEAR PATH TO LAUNCH"
        title="From brand to live business."
        description="Choose the business you want to build. Configure the technology around it."
      />
      <ol className="launch-steps">
        {[
          [
            "Choose your business",
            "Brokerage, prop firm, or both. Define your operating model and launch scope.",
          ],
          [
            "Make it yours",
            "Add your name, logo, domain, pricing and trading conditions.",
          ],
          [
            "Connect what you need",
            "Use Azuriya’s platform or arrange connections to MT5 and your existing providers.",
          ],
          [
            "Go live",
            "Complete onboarding, integration and readiness checks, then start welcoming clients.",
          ],
        ].map(([title, body], index) => (
          <li key={title}>
            <span className="launch-number">0{index + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CoreEcosystem() {
  return (
    <section
      className="az-container launch-section"
      id="azuriya-core"
      aria-label="Azuriya Core ecosystem"
    >
      <Heading
        eyebrow="CONNECTED FROM THE CORE"
        title="One Core. Your entire trading business."
        description="Bring platforms, CRM, funding, copy trading and operations into one connected ecosystem. Connection scope depends on your configured infrastructure."
      />
      <CoreEcosystemGraphic />
    </section>
  );
}

export function BusinessJourneys() {
  return (
    <section
      className="az-container launch-section"
      id="products"
      aria-label="Brokerage and prop firm products"
    >
      <Heading
        eyebrow="TWO PATHS. ONE CONNECTED STACK."
        title="What do you want to launch?"
        description="Build the operation around your business model, with its own tools, branding and workflow."
      />
      <div className="launch-grid launch-two">
        {[
          {
            number: "01",
            title: "Brokerage",
            body: "Build and operate a brokerage under your own brand.",
            Icon: ChartLineUp,
            groups: [
              {
                title: "Trading workspace",
                Icon: ChartLineUp,
                features: ["Trading platform", "Copy trading"],
              },
              {
                title: "Business operations",
                Icon: Users,
                features: ["CRM & back office", "Funding workflows"],
              },
              {
                title: "Connectivity & distribution",
                Icon: GlobeHemisphereWest,
                features: [
                  "Liquidity connectivity",
                  "Partner programs",
                  "APIs",
                ],
              },
            ],
            kind: "brokerage" as const,
            href: "/brokerage",
            cta: "Launch a Brokerage",
          },
          {
            number: "02",
            title: "Prop firm",
            body: "Launch and manage your own prop operation.",
            Icon: Trophy,
            groups: [
              {
                title: "Evaluations & challenges",
                Icon: FlagCheckered,
                features: ["Challenges & evaluation products", "Rule engine"],
              },
              {
                title: "Trader management",
                Icon: ShieldCheck,
                features: ["Trader dashboard", "Risk monitoring"],
              },
              {
                title: "Business operations",
                Icon: GearSix,
                features: [
                  "Payout workflows",
                  "Trading platform & CRM",
                  "Platform integrations",
                ],
              },
            ],
            kind: "prop" as const,
            href: "/prop-firm",
            cta: "Launch a Prop Firm",
          },
        ].map((product) => (
          <article className="launch-card launch-product" key={product.title}>
            <div className="launch-product-heading">
              <span className="launch-product-icon">
                <product.Icon size={27} weight="duotone" aria-hidden />
              </span>
              <span className="launch-product-index">
                {product.number} / PRODUCT
              </span>
            </div>
            <h3>{product.title}</h3>
            <p>{product.body}</p>
            <ProductJourneyGraphic kind={product.kind} />
            <div className="launch-product-groups">
              {product.groups.map(({ title, Icon, features }) => (
                <div className="launch-product-group" key={title}>
                  <Icon size={20} weight="duotone" aria-hidden />
                  <div>
                    <h4>{title}</h4>
                    <p>
                      {features.map((feature, index) => (
                        <span key={feature}>
                          {index > 0 && <span aria-hidden="true"> · </span>}
                          {feature}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link href={product.href}>
              {product.cta}
              <ArrowUpRight size={18} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductJourneyGraphic({ kind }: { kind: "brokerage" | "prop" }) {
  return (
    <div
      className={`launch-journey-graphic launch-journey-${kind}`}
      aria-hidden="true"
    >
      <div className="launch-journey-topline">
        <span>
          <SquaresFour size={16} /> AZURIYA{" "}
          {kind === "brokerage" ? "BROKERAGE" : "PROP"}
        </span>
        <span className="launch-journey-topline-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      {kind === "brokerage" ? (
        <div className="launch-brokerage-workspace">
          <div className="launch-workspace-market">
            <span className="launch-diagram-caption">TRADING PLATFORM</span>
            <svg
              viewBox="0 0 240 84"
              preserveAspectRatio="none"
              focusable="false"
            >
              <path
                className="launch-chart-grid"
                d="M0 20H240 M0 42H240 M0 64H240 M40 0V84 M100 0V84 M160 0V84 M220 0V84"
              />
              <path
                className="launch-chart-trace"
                d="M0 66L16 61L28 66L43 46L55 51L71 34L85 45L102 42L116 23L128 29L140 18L153 31L168 20L183 27L197 9L213 18L225 11L240 6"
              />
              <circle cx="240" cy="6" r="3" />
            </svg>
            <div className="launch-workspace-market-bottom">
              <span>Copy trading</span>
              <ChartLineUp size={17} />
            </div>
          </div>
          <div className="launch-workspace-office">
            <Users size={25} weight="duotone" />
            <strong>CRM & back office</strong>
            <div className="launch-workspace-rows">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="launch-workspace-connections">
            <span>
              <Wallet size={16} />
              Funding
            </span>
            <span>
              <ArrowsLeftRight size={16} />
              Liquidity
            </span>
            <span>
              <Users size={16} />
              Partners
            </span>
          </div>
        </div>
      ) : (
        <div className="launch-prop-workspace">
          <div className="launch-evaluation-track">
            <div>
              <FlagCheckered size={22} weight="duotone" />
              <span>Challenge</span>
            </div>
            <span className="launch-evaluation-line" />
            <div>
              <ShieldCheck size={22} weight="duotone" />
              <span>Evaluation</span>
            </div>
            <span className="launch-evaluation-line" />
            <div>
              <Trophy size={22} weight="duotone" />
              <span>Funded</span>
            </div>
          </div>
          <div className="launch-rule-engine">
            <div>
              <GearSix size={24} weight="duotone" />
              <strong>Rule engine</strong>
            </div>
            <div className="launch-rule-signals">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="launch-prop-connections">
            <span>
              <ShieldCheck size={17} />
              Risk monitoring
            </span>
            <span>
              <Wallet size={17} />
              Payout workflows
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function BusinessEconomics() {
  return (
    <section
      className="az-container launch-section"
      aria-label="Business model controls"
    >
      <Heading
        eyebrow="YOUR COMMERCIAL MODEL"
        title="Build the business model your way."
        description="Configure the products, pricing and distribution around your operation. Revenue depends on activity and agreed commercial terms."
      />
      <div className="launch-grid launch-economics">
        {[
          [
            "Spread markup",
            "Set pricing structures for configured instruments and account groups.",
          ],
          [
            "Lot commissions",
            "Configure commission schedules and eligible volume-based markups.",
          ],
          [
            "Deposits & withdrawals",
            "Connect funding workflows to your approved payment providers.",
          ],
          [
            "Prop challenges",
            "Create evaluation products, rules and pricing for your traders.",
          ],
          [
            "Partner programs",
            "Build IB and affiliate distribution with agreed payout terms.",
          ],
        ].map(([title, body]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BuildComparison() {
  return (
    <section
      className="az-container launch-section"
      aria-label="Build yourself versus Azuriya"
    >
      <Heading
        eyebrow="SPEND YOUR TIME BUILDING THE BUSINESS"
        title="Why build it all yourself?"
        description="Start from a connected operating stack instead of commissioning each system separately."
      />
      <BuildComparisonGraphic />
      <div className="launch-comparison-details">
        <div className="launch-comparison-labels">
          <span>What you need</span>
          <span>Build yourself</span>
          <span>With Azuriya</span>
        </div>
        {[
          {
            title: "Trading & products",
            Icon: ChartLineUp,
            rows: [
              ["Trading platform", "Build or license", "Azuriya platform"],
              ["Copy trading", "Separate system", "Integrated workflows"],
              [
                "Prop technology",
                "Separate development",
                "Rules & trader management",
              ],
            ],
          },
          {
            title: "Operations & connectivity",
            Icon: Stack,
            rows: [
              ["CRM & back office", "Build or buy", "Unified portal"],
              ["Payments", "Integrate providers", "Configured connections"],
              ["APIs", "Design and build", "Integration scope agreed"],
            ],
          },
          {
            title: "Delivery & maintenance",
            Icon: Code,
            rows: [
              [
                "Development cost",
                "Fund development",
                "Included in standard scope*",
              ],
              [
                "Engineering team",
                "Build and maintain",
                "No in-house build required",
              ],
            ],
          },
        ].map(({ title, Icon, rows }) => (
          <div className="launch-comparison-group" key={title}>
            <h3>
              <Icon size={20} weight="duotone" aria-hidden />
              {title}
            </h3>
            <div className="launch-comparison-rows">
              {rows.map(([feature, build, azuriya]) => (
                <div className="launch-comparison-row" key={feature}>
                  <h4>{feature}</h4>
                  <p className="launch-comparison-build">
                    <span className="launch-comparison-mobile-label">
                      Build yourself
                    </span>
                    {build}
                  </p>
                  <p className="launch-comparison-azuriya">
                    <span className="launch-comparison-mobile-label">
                      With Azuriya
                    </span>
                    <Check size={16} aria-hidden />
                    {azuriya}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="launch-comparison-commercial">
          <div>
            <span>MONTHLY SUBSCRIPTION</span>
            <p>Separate platform and CRM licenses</p>
          </div>
          <div>
            <strong>
              $0 <small>per month</small>
            </strong>
            <span>35% revenue share applies</span>
          </div>
          <Link href="/pricing">
            View pricing & terms
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
      <p className="launch-note">
        *Standard Azuriya package. The $0 monthly subscription carries a 35%
        revenue share. Platform licensing, external providers and custom work
        are scoped separately.{" "}
        <Link href="/pricing">See commercial details →</Link>
      </p>
    </section>
  );
}

export function MigrationAndTrust() {
  return (
    <>
      <section
        className="az-container launch-section launch-migration"
        id="migration"
        aria-label="Migrate or connect an existing operation"
      >
        <Heading
          eyebrow="BRING YOUR EXISTING STACK"
          title="Already running a brokerage or prop firm?"
          description="Connect your existing operation to Azuriya. Agree the integration and migration scope before changing your live systems."
        />
        <div className="launch-tags">
          {[
            "Keep your CRM",
            "Connect your platform",
            "Connect through APIs",
            "Add Azuriya operations",
            "Migrate when ready",
          ].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <Link className="az-button" href="/contact">
          Talk About Migration
          <ArrowUpRight size={18} />
        </Link>
      </section>
      <section
        className="az-container launch-section"
        aria-label="Who Azuriya is built for"
      >
        <Heading
          eyebrow="READY FOR THE NEXT STEP"
          title="Built for people ready to own the business."
          description="For new founders and established operators who want a connected trading infrastructure."
        />
        <div className="launch-tags launch-audiences">
          {[
            "Trading brands",
            "Educators & mentors",
            "Introducing brokers",
            "Existing prop firms",
            "Existing brokerages",
            "Entrepreneurs",
          ].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </section>
      <section
        className="az-container launch-section"
        id="infrastructure-proof"
        aria-label="Infrastructure and launch due diligence"
      >
        <Heading
          eyebrow="KNOW WHAT YOU ARE LAUNCHING"
          title="Clear scope. Visible responsibilities."
          description="Explore the working simulated terminal and the product documentation. Confirm production arrangements with the team before launch."
        />
        <div className="launch-grid launch-two">
          <article className="launch-card">
            <h3>Product proof you can explore.</h3>
            <p>
              The dashboard contains example data. The terminal uses simulated
              funds and execution. Platform catalogs describe connection
              options, not proof of active integrations.
            </p>
            <Link href="/terminal">
              Try the Simulated Platform
              <ArrowUpRight size={18} />
            </Link>
          </article>
          <article className="launch-card">
            <h3>Agree the operating details.</h3>
            <p>
              Request the contracting entity, hosting and data location, tenant
              isolation, security controls, support arrangements, service
              commitments, and data export process for your deployment.
            </p>
            <Link href="/contact">
              Discuss Launch Readiness
              <ArrowUpRight size={18} />
            </Link>
          </article>
        </div>
        <p className="launch-note">
          Service status, availability commitments and launch dates are
          confirmed for your deployment.{" "}
          <Link href="/status">View service status →</Link> ·{" "}
          <Link href="/about">About Azuriya →</Link> ·{" "}
          <Link href="/legal/privacy">Data & privacy →</Link>
        </p>
      </section>
    </>
  );
}
