import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { getSiteOrigin, isPublicIndexingEnabled } from "@/lib/seo";
import { marketingThemeBootstrap } from "@/components/marketing/marketing-theme-config";
import { MarketingThemeSync } from "@/components/marketing/marketing-theme";
import "./globals.css";
const euclid = localFont({
  src: [
    {
      path: "./fonts/EuclidSquare-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/EuclidSquare-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    { path: "./fonts/EuclidSquare-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-euclid",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Azuriya | Brokerage & prop firm solutions for trading communities",
  description:
    "Free brokerage and prop firm solutions for trading communities. A-book liquidity, trading platforms, copy trading, direct MT5 deposits, withdrawals, community chat and admin controls in one portal.",
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
      className={euclid.variable}
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
