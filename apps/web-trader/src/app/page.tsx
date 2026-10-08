import { LandingPage } from "@/components/marketing/landing-page";
import { StructuredData } from "@/components/marketing/structured-data";
import { getSeoMetadata } from "@/lib/seo";
import { getWebsiteStructuredData } from "@/lib/site-structured-data";

export const metadata = getSeoMetadata({
  title: "Azuriya | Launch your own brokerage or prop firm",
  description:
    "Built to power your trading business. Launch your own brokerage or prop firm with a $0 monthly Azuriya package and 35% revenue share. Explore trading, CRM, back office and platform connections.",
  path: "/",
});
export default function Page() {
  return (
    <>
      <StructuredData data={getWebsiteStructuredData()} />
      <LandingPage />
    </>
  );
}
