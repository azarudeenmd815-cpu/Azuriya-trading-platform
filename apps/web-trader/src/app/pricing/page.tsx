import { MarketingMotion } from "../../components/marketing/marketing-motion";
import { MarketingNavigation } from "../../components/marketing/navigation";
import { SiteFooter } from "../../components/marketing/site-footer";
import { LaunchPricing } from "../../components/marketing/launch-pricing";
import { getSitePage } from "../../components/marketing/site-pages";
import { getSitePageMetadata } from "../../lib/site-page-metadata";
import { getPageStructuredData } from "../../lib/site-structured-data";
import { StructuredData } from "../../components/marketing/structured-data";
import "../../components/marketing/marketing.css";
import "../../components/marketing/marketing-light-theme.css";
import "../../components/marketing/marketing-reference-theme.css";
import "../../components/marketing/landing-product-theme.css";

export const metadata = getSitePageMetadata(getSitePage("/pricing")!);

export default function PricingPage() {
  return (
    <MarketingMotion className="az-pricing-page">
      <StructuredData data={getPageStructuredData(getSitePage("/pricing")!)} />
      <a className="az-skip-link" href="#main-content">
        Skip to content
      </a>
      <MarketingNavigation pageLinks currentPath="/pricing" />
      <main id="main-content">
        <LaunchPricing fullPage />
      </main>
      <SiteFooter />
    </MarketingMotion>
  );
}
