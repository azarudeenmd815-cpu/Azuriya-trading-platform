import { renderShareImage } from "../../lib/share-image";

export function GET() {
  return renderShareImage({
    title: "One place for your entire trading business.",
    category: "Azuriya / Brokerage & prop firm technology",
    subtitle:
      "Accounts, copy trading, funding, community and operator controls in one portal.",
  });
}
