import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { getSiteOrigin, isPublicIndexingEnabled } from "@/lib/seo";
import { marketingThemeBootstrap } from "@/components/marketing/marketing-theme-config";
import { MarketingThemeSync } from "@/components/marketing/marketing-theme";
import "./globals.css";
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta", display: "swap" });
export const metadata: Metadata = {
  title: "Azuriya | Free brokerage & prop firm solutions for influencers",
  description:
    "Free brokerage and prop firm solutions for influencers. A-book liquidity, trading platforms, copy trading, direct MT5 deposits, withdrawals, community chat and admin controls in one portal.",
  ...(getSiteOrigin() ? { metadataBase: new URL(getSiteOrigin()!) } : {}),
  applicationName: "Azuriya",
  robots: { index: isPublicIndexingEnabled(), follow: true },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.BING_SITE_VERIFICATION
      ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
      : {}),
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={plusJakarta.variable}
      data-marketing-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script
          id="azuriya-marketing-theme"
          dangerouslySetInnerHTML={{ __html: marketingThemeBootstrap }}
        />
      </head>
      <body>
        <MarketingThemeSync />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
