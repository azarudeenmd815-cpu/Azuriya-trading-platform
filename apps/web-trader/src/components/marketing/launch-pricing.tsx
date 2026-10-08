import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChartLineUp,
  PlugsConnected,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import {
  formatOfferMoney,
  launchOffer,
  leverateReference,
  leverateSource,
  revenueShareExample,
} from "@/lib/launch-offer";
import "./launch-pricing.css";

export function LaunchAllocation({ compact = false }: { compact?: boolean }) {
  const remaining = launchOffer.totalSlots - launchOffer.allocatedSlots;
  return (
    <div className={`lp-allocation${compact ? " lp-allocation-compact" : ""}`}>
      <div className="lp-allocation-copy">
        <span className="lp-live-dot" aria-hidden="true" />
        <div>
          <strong>Limited launch allocation</strong>
          <span>{remaining} slots remaining in this release</span>
        </div>
      </div>
      <div className="lp-allocation-meter">
        <div>
          <strong>
            {launchOffer.allocatedSlots}
            <span> / {launchOffer.totalSlots}</span>
          </strong>
          <small>slots allocated</small>
        </div>
        <progress
          value={launchOffer.allocatedSlots}
          max={launchOffer.totalSlots}
          aria-label={`${launchOffer.allocatedSlots} of ${launchOffer.totalSlots} launch slots allocated`}
        />
      </div>
      {!compact && (
        <Link href="/contact">
          Discuss your launch <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}

const platformFeatures = [
  ["Real trading accounts", "Configured"],
  ["Additional accounts", "Agreed capacity"],
  ["Branded trading platform", "Included"],
  ["Account groups & managers", "Configured"],
  ["Data feed & liquidity", "Provider scope"],
  ["Hosting & deployment", "Agreed scope"],
  ["Mobile, web & desktop", "Platform dependent"],
  ["Funding & payment workflows", "Included"],
  ["Charts & market data", "Platform dependent"],
  ["Languages & branding", "Configured"],
  ["Calendar & market news", "Provider scope"],
  ["Copy & social trading", "Configured"],
  ["Algorithmic trading", "Platform dependent"],
  ["Instruments & risk controls", "Configured"],
  ["Platform APIs & connectors", "Agreed scope"],
] as const;

const crmFeatures = [
  ["CRM & client portal", "Included"],
  ["VoIP, SMS & email connections", "Connector scope"],
  ["Operational workflows", "Included"],
  ["Automation connections", "Connector scope"],
  ["CRM seats & team access", "Agreed capacity"],
  ["Roles & agent permissions", "Included"],
  ["Portal customization", "Configured"],
  ["Account analytics & reporting", "Configured"],
  ["Multiple brands", "Agreed scope"],
  ["IB & referral workflows", "Agreed scope"],
  ["API & data access", "Agreed scope"],
] as const;

const supportFeatures = [
  ["Community workspace", "Included"],
  ["Commission & markup controls", "Configured"],
  ["Implementation planning", "Included"],
  ["Launch readiness review", "Included"],
  ["Ongoing service & support", "Agreed scope"],
] as const;

const plans = [
  {
    name: "Start-up Brokerage",
    icon: ChartLineUp,
    label: "BUILD YOUR FIRST OPERATION",
    description:
      "Your brand, trading platform and client operations, configured for launch.",
    cta: "Launch a Brokerage",
    reference: leverateReference[0],
    operation: "Brokerage configuration",
  },
  {
    name: "Professional Operation",
    icon: ShieldCheck,
    label: "GROW YOUR TRADING BUSINESS",
    description:
      "Bring brokerage or prop workflows, risk and team management together.",
    cta: "Plan Your Operation",
    reference: leverateReference[1],
    operation: "Brokerage or prop configuration",
  },
  {
    name: "Premium Operation",
    icon: PlugsConnected,
    label: "CONNECT A COMPLEX OPERATION",
    description:
      "Connect your established stack with a defined migration and integration plan.",
    cta: "Plan Your Connections",
    reference: null,
    operation: "Existing stack & migration",
  },
];

function PackageFeatures({
  operation,
  fullPage,
}: {
  operation: string;
  fullPage: boolean;
}) {
  const GroupHeading = fullPage ? "h3" : "h4";
  const groups = [
    { name: "Trading platform", rows: platformFeatures },
    { name: "CRM & client portal", rows: crmFeatures },
    {
      name: "Scope & support",
      rows: [[operation, "Agreed scope"], ...supportFeatures],
    },
  ];
  return (
    <div className="lp-feature-groups">
      {groups.map(({ name, rows }) => (
        <div className="lp-feature-group" key={name}>
          <GroupHeading>{name}</GroupHeading>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value === "Included" ? "lp-included" : ""}>
                  {value === "Included" && (
                    <Check size={14} aria-hidden="true" />
                  )}
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function PriceReference({
  reference,
}: {
  reference: (typeof leverateReference)[number] | null;
}) {
  return (
    <div className="lp-price-reference">
      <span className="lp-reference-label">Published Leverate reference</span>
      <dl>
        <div>
          <dt>Trading platform</dt>
          <dd>
            {reference
              ? formatOfferMoney(reference.platform, "€", false)
              : "Custom"}
          </dd>
        </div>
        <div>
          <dt>CRM & client portal</dt>
          <dd>
            {reference ? formatOfferMoney(reference.crm, "€", false) : "Custom"}
          </dd>
        </div>
        <div className="lp-reference-total">
          <dt>Combined / month</dt>
          <dd>
            {reference ? (
              <s>{formatOfferMoney(reference.total, "€", false)}</s>
            ) : (
              "Custom quote"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function LaunchPricing({ fullPage = false }: { fullPage?: boolean }) {
  const example = revenueShareExample("10000.00");
  const ItemHeading = fullPage ? "h2" : "h3";
  return (
    <section
      className={`az-container lp-section${fullPage ? " lp-page-section" : ""}`}
      id="launch-pricing"
      aria-labelledby="launch-pricing-title"
    >
      <div className="lp-heading">
        <div className="az-eyebrow">
          <Sparkle size={17} /> A DIFFERENT WAY TO LAUNCH
        </div>
        {fullPage ? (
          <h1 id="launch-pricing-title">
            $0 per month.
            <br />
            <span>Built around your growth.</span>
          </h1>
        ) : (
          <h2 id="launch-pricing-title">
            $0 per month.
            <br />
            <span>Built around your growth.</span>
          </h2>
        )}
        <p>
          No fixed Azuriya monthly subscription. We receive 35% of eligible
          revenue, with the operating scope agreed before you launch.
        </p>
      </div>
      <LaunchAllocation />
      <div className="lp-plans">
        {plans.map(
          (
            { name, icon: Icon, label, description, cta, reference, operation },
            index,
          ) => (
            <article
              className={`lp-plan${index === 1 ? " lp-plan-featured" : ""}`}
              key={name}
            >
              <div className="lp-plan-head">
                <div className="lp-plan-intro">
                  <div className="lp-plan-top">
                    <span className="lp-plan-icon">
                      <Icon size={22} />
                    </span>
                    <span>{label}</span>
                  </div>
                  <ItemHeading>{name}</ItemHeading>
                  <p>{description}</p>
                </div>
                <div className="lp-plan-commercial">
                  <PriceReference reference={reference} />
                  <div className="lp-price">
                    <span className="lp-price-label">
                      AZURIYA MONTHLY SUBSCRIPTION
                    </span>
                    <div>
                      <strong>$0</strong>
                      <span>/ month</span>
                    </div>
                  </div>
                  <div className="lp-share">
                    <span>Revenue share</span>
                    <strong>35%</strong>
                  </div>
                </div>
              </div>
              <PackageFeatures operation={operation} fullPage={fullPage} />
              <p className="lp-package-scope">
                Account capacity, providers and service scope are agreed for
                your operation.
              </p>
              <Link className="az-button" href="/contact">
                {cta}
                <ArrowUpRight size={17} />
              </Link>
              <small>
                Subject to scope, eligibility and{" "}
                <Link href={launchOffer.termsHref}>offer terms</Link>.
              </small>
            </article>
          ),
        )}
      </div>
      <p className="lp-reference-note">
        Leverate reference: published platform + CRM monthly list prices checked
        8 October 2026, excluding promotions, taxes and extras. These are
        comparison prices, not previous Azuriya charges. Package scopes differ;
        third-party fees are separate.{" "}
        <a href={leverateSource} target="_blank" rel="noopener noreferrer">
          View the pricing source <ArrowUpRight size={12} />
        </a>
      </p>
      <div className="lp-model">
        <div>
          <span className="lp-kicker">ALIGNED WITH YOUR BUSINESS</span>
          <ItemHeading>One clear revenue split.</ItemHeading>
          <p>
            The 35% share applies to eligible business revenue defined in your
            agreement. It is separate from trader deposits, account balances and
            the per-lot commission example.
          </p>
        </div>
        <div
          className="lp-split-example"
          aria-label="Example of a 35 percent revenue share on ten thousand dollars of eligible revenue"
        >
          <div className="lp-example-total">
            <span>Example eligible revenue</span>
            <strong>{formatOfferMoney(example.revenue)}</strong>
          </div>
          <div className="lp-split-bar" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="lp-split-values">
            <div>
              <span>65% · Your business</span>
              <strong>{formatOfferMoney(example.businessShare)}</strong>
            </div>
            <div>
              <span>35% · Azuriya</span>
              <strong>{formatOfferMoney(example.azuriyaShare)}</strong>
            </div>
          </div>
          <small>Illustrative split before taxes and other agreed costs.</small>
        </div>
      </div>
      <details className="lp-terms">
        <summary>
          Offer terms & conditions<span aria-hidden="true">+</span>
        </summary>
        <div>
          <ul>
            <li>
              The standard Azuriya package has a $0 fixed monthly subscription
              and a 35% revenue share.
            </li>
            <li>
              Your agreement defines eligible revenue, reporting, refunds, taxes
              and the settlement schedule.
            </li>
            <li>
              Third-party platform licences, liquidity and payment-provider
              charges are separate. Custom development and services outside the
              standard package require an agreed scope.
            </li>
            <li>
              The 100-slot release is subject to eligibility, commercial
              agreement and deployment readiness. The current allocation is 97
              of 100; discussing a launch does not reserve a slot.
            </li>
            <li>
              Live services require the relevant provider arrangements and
              operating permissions. The website preview uses simulated or
              illustrative data.
            </li>
          </ul>
          <Link href={launchOffer.termsHref}>
            Read the launch-offer terms <ArrowUpRight size={15} />
          </Link>
        </div>
      </details>
    </section>
  );
}
