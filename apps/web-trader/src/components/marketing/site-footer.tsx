import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  GlobeHemisphereWest,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { FooterBrand } from "./footer-brand-mark";
import { FooterAccess } from "./footer-access";
import { SitePreferences } from "./site-preferences";
import "./site-footer.css";

export const footerGroups = [
  {
    title: "Platform",
    links: [
      ["Platform overview", "/platform"],
      ["Copy trading", "/copy-trading"],
      ["Team & community", "/community"],
      ["Trading platforms", "/trading-platforms"],
      ["Platform & tool directory", "/integrations"],
      ["Funding & withdrawals", "/funding"],
      ["MT5 deposits", "/mt5-deposits"],
      ["Risk management", "/risk-management"],
    ],
  },
  {
    title: "Solutions",
    links: [
      ["For influencers", "/solutions/influencers"],
      ["For educators", "/solutions/educators"],
      ["Brokerage solutions", "/brokerage"],
      ["Prop firm solutions", "/prop-firm"],
      ["For existing brokers", "/solutions/brokers"],
      ["For prop operators", "/solutions/prop-firms"],
      ["Admin Portal", "/admin-portal"],
      ["Liquidity access", "/liquidity"],
      ["Commercial model", "/pricing"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Resource library", "/resources"],
      ["Insights & articles", "/insights"],
      ["Getting started", "/resources/getting-started"],
      ["A-book explained", "/resources/a-book-execution"],
      ["MT5 funding guide", "/resources/mt5-funding"],
      ["Help centre", "/help"],
      ["Environment status", "/status"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About Azuriya", "/about"],
      ["Partner ecosystem", "/partners"],
      ["Contact", "/contact"],
      ["All solutions", "/solutions"],
      ["Site directory", "/sitemap"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Legal centre", "/legal"],
      ["Terms of use", "/legal/terms"],
      ["Privacy notice", "/legal/privacy"],
      ["Cookies & storage", "/legal/cookies"],
      ["Risk disclosure", "/legal/risk-disclosure"],
      ["Execution framework", "/legal/execution"],
      ["AML & KYC framework", "/legal/aml-kyc"],
      ["Complaints", "/legal/complaints"],
      ["Platform disclaimer", "/legal/platform-disclaimer"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="sf-footer" aria-label="Azuriya site footer">
      <div className="az-container">
        <div className="sf-intro">
          <div>
            <span className="sf-kicker">YOUR COMMUNITY. YOUR OPERATION.</span>
            <h2>Bring your whole trading business together.</h2>
          </div>
          <Link className="az-button" href="/contact">
            Plan your workspace <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="sf-brand-row">
          <Link href="/" aria-label="Azuriya home">
            <FooterBrand />
          </Link>
          <p>
            Brokerage and prop firm solutions.
            <br />
            Built around your community.
          </p>
          <Link href="/platform">
            <GlobeHemisphereWest size={17} /> Explore the platform{" "}
            <ArrowRight size={15} />
          </Link>
        </div>
        <FooterAccess />
        <div className="sf-link-grid">
          {footerGroups.map((group) => (
            <nav
              key={group.title}
              aria-label={`Footer ${group.title.toLowerCase()} navigation`}
            >
              <h3>{group.title}</h3>
              {group.links.map(([label, href]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <section
          className="sf-disclosures"
          aria-label="Service and risk disclosures"
        >
          <div>
            <ShieldCheck size={18} />
            <h3>Clear information. Informed decisions.</h3>
          </div>
          <div className="sf-disclosure-copy">
            <p>
              <strong>About this environment.</strong> This website presents
              trading technology and a product demonstration. Funds, execution
              and community activity in the preview are simulated or
              illustrative. Live brokerage, liquidity, payments and platform
              connections require configured providers and separate service
              agreements.
            </p>
            <p>
              <strong>Trading risk.</strong> Leveraged trading can magnify
              losses. Copy trading, risk controls and A-book routing do not
              eliminate market or execution risk. Charts, pricing examples and
              performance figures do not guarantee results. Read the{" "}
              <Link href="/legal/risk-disclosure">risk disclosure</Link> before
              evaluating a live service.
            </p>
            <p>
              <strong>Service information.</strong> The{" "}
              <Link href="/legal">legal centre</Link> identifies the current
              document status and operator details awaiting confirmation.
              Third-party names and logos identify referenced products and
              provider options; they do not establish regulatory approval or
              endorsement.
            </p>
          </div>
        </section>
        <div className="sf-bottom">
          <span>© 2026 Azuriya. All rights reserved.</span>
          <div>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <SitePreferences />
          </div>
        </div>
      </div>
    </footer>
  );
}
