import { MarketingMotion } from "../../components/marketing/marketing-motion";
import { MarketingNavigation } from "../../components/marketing/navigation";
import { SiteFooter } from "../../components/marketing/site-footer";
import { EcosystemDirectory } from "../../components/marketing/ecosystem-directory";
import { ecosystemPage } from "../../components/marketing/ecosystem-page-data";
import { getSitePageMetadata } from "../../lib/site-page-metadata";
import { getPageStructuredData } from "../../lib/site-structured-data";
import { StructuredData } from "../../components/marketing/structured-data";
import "../../components/marketing/marketing.css";
import "../../components/marketing/marketing-light-theme.css";
import "../../components/marketing/marketing-reference-theme.css";
import "../../components/marketing/landing-product-theme.css";

export const metadata = getSitePageMetadata(ecosystemPage);

export default function IntegrationsPage() {
  return (
    <>
      <StructuredData data={getPageStructuredData(ecosystemPage)} />
      <MarketingMotion className="az-ecosystem-page">
        <a className="az-skip-link" href="#main-content">
          Skip to content
        </a>
        <MarketingNavigation pageLinks currentPath="/integrations" />
        <main id="main-content">
          <EcosystemDirectory />
        </main>
        <SiteFooter />
      </MarketingMotion>
    </>
  );
}
