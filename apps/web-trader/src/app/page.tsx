import { LandingPage } from "@/components/marketing/landing-page";
import { StructuredData } from "@/components/marketing/structured-data";
import { getSeoMetadata } from "@/lib/seo";
import { getWebsiteStructuredData } from "@/lib/site-structured-data";

export const metadata = getSeoMetadata({
  title: "Azuriya | Free brokerage & prop firm solutions for influencers",
  description:
    "Brokerage and prop firm solutions for influencers. Manage trading accounts, A-book routing, copy trading, MT5 deposits and your community in one portal.",
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
