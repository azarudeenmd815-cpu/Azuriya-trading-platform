import { getSeoMetadata } from "@/lib/seo";
import { Mt5DepositsPage } from "@/components/marketing/mt5-deposits-page";

export const metadata = getSeoMetadata({
  title: "MT5 Deposits | Fund directly from MetaTrader 5 | Azuriya",
  description:
    "Let traders deposit directly from MetaTrader 5 on desktop and mobile. Explore native payments, provider checkout and broker controls for currencies, limits, groups, fees and approvals.",
  path: "/mt5-deposits",
});

export default function Page() {
  return <Mt5DepositsPage />;
}
