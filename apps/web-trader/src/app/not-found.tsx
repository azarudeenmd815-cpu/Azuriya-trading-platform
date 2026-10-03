import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { MarketingNavigation } from "../components/marketing/navigation";
import { SiteFooter } from "../components/marketing/site-footer";
import { MarketingSurface } from "../components/marketing/marketing-theme";
import "../components/marketing/marketing.css";
import "../components/marketing/site-page.css";
import "../components/marketing/marketing-light-theme.css";
import "../components/marketing/marketing-reference-theme.css";

export default function NotFound() {
  return (
    <MarketingSurface className="az-marketing sp-page">
      <MarketingNavigation pageLinks />
      <main className="az-container">
        <section className="sp-not-found">
          <span className="sp-eyebrow">PAGE NOT FOUND · 404</span>
          <h1>Let’s get you to the right place.</h1>
          <p>
            This address does not match an Azuriya page. Explore the site
            directory for product information, solutions, guides and legal
            documents.
          </p>
          <div>
            <Link href="/sitemap" className="az-button">
              Open the directory <ArrowUpRight size={17} />
            </Link>
            <Link href="/" className="az-button az-button-secondary">
              Return home <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </MarketingSurface>
  );
}
