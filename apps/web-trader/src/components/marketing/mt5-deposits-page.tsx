import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle,
  CreditCard,
  DeviceMobile,
  GlobeHemisphereWest,
  LockKey,
  Monitor,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import { SiteFooter } from "./site-footer";
import { MarketingNavigation } from "./navigation";
import { FundingWalkthrough } from "./funding-walkthrough";
import { MarketingSurface } from "./marketing-theme";
import "./marketing.css";
import "./mt5-deposits-page.css";
import "./marketing-light-theme.css";
import "./marketing-reference-theme.css";
import "./landing-product-theme.css";

const questions = [
  [
    "Can clients deposit without leaving MT5?",
    "They can start a deposit from the Payments section inside MetaTrader 5 on desktop or mobile. When they continue, the selected provider opens its secure payment page. After the payment flow, they return to MT5.",
  ],
  [
    "Which payment methods are available?",
    "Your broker configures the providers and payment methods. Card payments, bank transfers and other options depend on the chosen gateway, client region and account group. The methods in this walkthrough are examples.",
  ],
  [
    "Does funding appear instantly?",
    "The trading account is credited after the payment is completed and the broker approves it. Processing and approval times vary by payment method, provider and broker rules.",
  ],
  [
    "Can I control payment fees and approvals?",
    "MT5 payment wallet settings let the broker configure supported currencies, limits, eligible countries and account groups. Commission settings and deposit rules can define fees and automatic or manual approval, according to the configured provider.",
  ],
  [
    "Is this a live payment integration?",
    "This page explains native MetaTrader 5 payment capabilities and shows an illustrative walkthrough. The local Azuriya preview does not process deposits or connect to payment providers. A production setup requires an approved provider agreement and broker configuration.",
  ],
];

const references = [
  {
    href: "/marketing/mt5-deposits/desktop-deposit.png",
    title: "Desktop terminal payments",
    alt: "Example native MetaTrader 5 desktop deposit screen",
    width: 1802,
    height: 896,
  },
  {
    href: "/marketing/mt5-deposits/desktop-mobile-deposit.png",
    title: "Desktop and mobile funding",
    alt: "Example native MetaTrader 5 deposit screens on desktop and mobile",
    width: 1854,
    height: 952,
  },
];

export function Mt5DepositsPage() {
  return (
    <MarketingSurface className="az-marketing md-page">
      <a className="az-skip-link" href="#main-content">
        Skip to content
      </a>
      <MarketingNavigation homeLinks currentPath="/mt5-deposits" />
      <main id="main-content">
        <section className="md-hero az-container" aria-labelledby="mt5-title">
          <div className="md-breadcrumb">
            <Link href="/">Azuriya</Link>
            <ArrowRight size={12} />
            <span>MT5 deposits</span>
          </div>
          <div className="md-hero-heading">
            <div>
              <div className="md-eyebrow">NATIVE METATRADER 5 PAYMENTS</div>
              <h1 id="mt5-title">
                Deposit directly from <span>MetaTrader 5.</span>
              </h1>
            </div>
            <div className="md-hero-copy">
              <p>
                Keep funding close to trading. Your members can start a deposit
                inside their desktop or mobile terminal, with payment options
                configured by your brokerage.
              </p>
              <a className="md-text-link" href="#funding-walkthrough">
                Explore the funding flow <ArrowDown size={16} />
              </a>
            </div>
          </div>
          <div id="funding-walkthrough" className="md-hero-visual">
            <FundingWalkthrough />
          </div>
          <div className="md-hero-benefits">
            <span>
              <Monitor size={18} /> Desktop terminal
            </span>
            <span>
              <DeviceMobile size={18} /> iOS &amp; Android
            </span>
            <span>
              <LockKey size={18} /> Secure provider checkout
            </span>
            <span>
              <SlidersHorizontal size={18} /> Broker controlled
            </span>
          </div>
        </section>

        <section
          className="md-flow az-container"
          aria-labelledby="funding-flow-title"
        >
          <div className="md-section-intro">
            <span className="md-eyebrow">THE CLIENT EXPERIENCE</span>
            <h2 id="funding-flow-title">From terminal to funding.</h2>
            <p>
              A familiar starting point for your members, with the payment
              handled by your selected provider.
            </p>
            <a
              className="md-text-link"
              href="https://www.metatrader5.com/en/terminal/help/startworking/payments"
              target="_blank"
              rel="noreferrer"
            >
              Read the official MT5 guide <ArrowUpRight size={16} />
            </a>
          </div>
          <ol className="md-flow-list">
            <li>
              <span className="md-flow-number">1</span>
              <div>
                <h3>Open Payments in MT5</h3>
                <p>
                  Select the trading account, deposit amount and an available
                  currency from the terminal&apos;s Payments area.
                </p>
              </div>
              <Wallet size={28} />
            </li>
            <li>
              <span className="md-flow-number">2</span>
              <div>
                <h3>Choose a payment method</h3>
                <p>
                  Select from your brokerage&apos;s configured options. Review
                  any commission before continuing to the payment provider.
                </p>
              </div>
              <CreditCard size={28} />
            </li>
            <li>
              <span className="md-flow-number">3</span>
              <div>
                <h3>Complete checkout and return</h3>
                <p>
                  Finish on the provider&apos;s secure page and return to MT5.
                  The account is credited after completion and broker approval.
                </p>
              </div>
              <CheckCircle size={28} />
            </li>
          </ol>
        </section>

        <section
          className="md-control-band"
          aria-labelledby="payment-controls-title"
        >
          <div className="md-controls az-container">
            <div className="md-section-intro">
              <span className="md-eyebrow">YOUR BROKERAGE. YOUR RULES.</span>
              <h2 id="payment-controls-title">
                A better client flow. Full broker control.
              </h2>
              <p>
                Define who can fund, in which currencies and under which terms.
                Bring payment operations into the same management experience.
              </p>
              <ul className="md-control-points">
                <li>
                  <Check size={16} /> Currency and transaction limits
                </li>
                <li>
                  <Check size={16} /> Country and account group availability
                </li>
                <li>
                  <Check size={16} /> Commission and approval settings
                </li>
              </ul>
              <Link href="/terminal?mode=register" className="az-button">
                Explore your portal <ArrowUpRight size={17} />
              </Link>
            </div>

            <div className="md-wallet-controls">
              <div className="md-wallet-header">
                <span>
                  <SlidersHorizontal size={20} /> Payment wallet controls
                </span>
                <span>Configuration overview</span>
              </div>
              <div className="md-wallet-group">
                <div className="md-wallet-group-label">
                  <GlobeHemisphereWest size={20} />
                  <div>
                    <h3>Currencies &amp; limits</h3>
                    <p>Define the currencies your wallet accepts.</p>
                  </div>
                </div>
                <div
                  className="md-currency-options"
                  aria-label="Example currencies"
                >
                  <span>USD</span>
                  <span>EUR</span>
                  <span>GBP</span>
                  <span>
                    <Plus size={13} /> Set limits
                  </span>
                </div>
              </div>
              <div className="md-wallet-group">
                <div className="md-wallet-group-label">
                  <UsersThree size={20} />
                  <div>
                    <h3>Client availability</h3>
                    <p>Choose eligible countries and account groups.</p>
                  </div>
                </div>
                <div className="md-wallet-rule">
                  <span>Countries</span>
                  <strong>Configured by broker</strong>
                  <span>Account groups</span>
                  <strong>Assigned per wallet</strong>
                </div>
              </div>
              <div className="md-wallet-pair">
                <div>
                  <CreditCard size={22} />
                  <h3>Commission</h3>
                  <p>Fixed, percentage or tiered settings.</p>
                  <span>Shown before checkout</span>
                </div>
                <div>
                  <ShieldCheck size={22} />
                  <h3>Approval rules</h3>
                  <p>Automatic or manual review conditions.</p>
                  <span>Controlled by your team</span>
                </div>
              </div>
              <div className="md-wallet-note">
                <LockKey size={14} />
                Gateway credentials stay in the broker configuration.
              </div>
            </div>
          </div>
        </section>

        <section
          className="md-providers az-container"
          aria-labelledby="providers-title"
        >
          <div>
            <span className="md-eyebrow">PAYMENT PROVIDER OPTIONS</span>
            <h2 id="providers-title">
              Connect the right provider for your members.
            </h2>
            <p>
              Native MT5 integrations include these provider examples.
              Availability, onboarding and processing fees depend on your
              provider agreement.
            </p>
          </div>
          <div className="md-provider-links">
            <a
              href="https://www.metatrader5.com/en/news/2321"
              target="_blank"
              rel="noreferrer"
            >
              <strong>ECOMMPAY</strong>
              <span>
                Native MT5 integration <ArrowUpRight size={16} />
              </span>
            </a>
            <a
              href="https://www.metatrader5.com/en/news/2340"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Unlimit</strong>
              <span>
                Native MT5 integration <ArrowUpRight size={16} />
              </span>
            </a>
            <a
              href="https://aps.money/online-payments/metatrader-5-embedded-payments/"
              target="_blank"
              rel="noreferrer"
            >
              <strong>APS</strong>
              <span>
                Embedded MT5 payments <ArrowUpRight size={16} />
              </span>
            </a>
          </div>
        </section>

        <section
          className="md-reference az-container"
          aria-labelledby="mt5-reference-title"
        >
          <div className="md-reference-heading">
            <span className="md-reference-icon">
              <Monitor size={25} />
              <DeviceMobile size={19} />
            </span>
            <div>
              <h2 id="mt5-reference-title">See the native MT5 experience.</h2>
              <p>
                Desktop and mobile reference screens supplied for this feature.
              </p>
            </div>
          </div>
          <details className="md-reference-disclosure">
            <summary>
              View MT5 reference screens <Plus size={19} />
            </summary>
            <div className="md-reference-images">
              {references.map((reference) => (
                <a
                  key={reference.href}
                  href={reference.href}
                  target="_blank"
                  rel="noreferrer"
                  data-mt5-reference
                >
                  <Image
                    src={reference.href}
                    alt={reference.alt}
                    width={reference.width}
                    height={reference.height}
                    sizes="(max-width: 767px) calc(100vw - 80px), 570px"
                  />
                  <span>
                    {reference.title} <ArrowUpRight size={16} />
                  </span>
                </a>
              ))}
            </div>
            <p className="md-reference-caption">
              Provider reference examples. These screens show native MT5 payment
              capabilities and are not live Azuriya payment accounts.
            </p>
          </details>
        </section>

        <section
          className="md-faq az-container"
          aria-labelledby="mt5-questions-title"
        >
          <div className="md-section-intro">
            <span className="md-eyebrow">FUNDING, EXPLAINED</span>
            <h2 id="mt5-questions-title">A few practical details.</h2>
            <p>How native payments work for your clients and your brokerage.</p>
          </div>
          <div className="md-faq-list">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={18} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="md-final-cta az-container"
          aria-labelledby="mt5-cta-title"
        >
          <div className="md-final-cta-icon">
            <Wallet size={27} />
          </div>
          <div>
            <h2 id="mt5-cta-title">Trading. Funding. Your entire team.</h2>
            <p>
              Bring the complete brokerage experience into one Azuriya portal.
            </p>
          </div>
          <Link href="/terminal?mode=register" className="az-button">
            Get started <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </MarketingSurface>
  );
}
