import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { AdminShell } from "@/components/admin-shell";
import { themeBootstrap } from "@/components/theme";
import "./globals.css";
const instrumentSans=localFont({src:"../../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",variable:"--font-instrument",weight:"400 700",display:"swap"});
export const metadata:Metadata={title:"Azuriya Broker OS",description:"Native simulated broker operations, client accounts, trading configuration and risk.",robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en" className={instrumentSans.variable} data-product-theme="dark" suppressHydrationWarning><head><script id="azuriya-broker-theme" dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body><a className="skip-link" href="#content">Skip to workspace</a><Providers><AdminShell>{children}</AdminShell></Providers></body></html>; }

