import { SitePageTemplate } from "../../components/marketing/site-page";
import { insightsPage } from "../../components/marketing/site-articles";
import { StructuredData } from "../../components/marketing/structured-data";
import { getSitePageMetadata } from "../../lib/site-page-metadata";
import { getPageStructuredData } from "../../lib/site-structured-data";

export const metadata = getSitePageMetadata(insightsPage);
export default function InsightsPage() {
  return (
    <>
      <StructuredData data={getPageStructuredData(insightsPage)} />
      <SitePageTemplate page={insightsPage} />
    </>
  );
}
