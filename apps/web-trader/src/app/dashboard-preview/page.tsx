import type { Metadata, Viewport } from "next";
import { TradingRoomDemo } from "@/components/marketing/dashboard";
import "@/components/marketing/marketing.css";
import "@/components/marketing/marketing-light-theme.css";
import "@/components/marketing/marketing-reference-theme.css";
import "@/components/marketing/landing-product-theme.css";

export const metadata: Metadata = {
  title: "Azuriya | BACK OFFICE preview",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 1200,
  initialScale: 1,
};

export default function DashboardPreviewPage() {
  return (
    <main className="az-marketing az-dashboard-embed-page">
      <TradingRoomDemo embedded />
    </main>
  );
}
