"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, List, X } from "@phosphor-icons/react";
import { MarketingBrand } from "./brand";
import { MarketingThemeSwitch } from "./marketing-theme";
import { SiteLanguageButton } from "./site-preferences";
import { localizedUi } from "@/lib/site-language";
import { useSiteLanguage } from "@/lib/site-language-client";
import "./navigation.css";

const links = [
  ["Products", "#products"],
  ["Platform", "/platform"],
  ["Integrations", "/integrations"],
  ["Pricing", "/pricing"],
  ["Developers", "/resources"],
  ["Company", "/about"],
];

export function MarketingNavigation({
  homeLinks = false,
  pageLinks = false,
  currentPath,
}: {
  homeLinks?: boolean;
  pageLinks?: boolean;
  currentPath?: string;
}) {
  const [open, setOpen] = useState(false);
  const copy = localizedUi[useSiteLanguage()];
  const navigationLinks = links.map(([label, href]) => [
    label,
    (homeLinks || pageLinks) && href.startsWith("#") ? `/${href}` : href,
  ]);
  return (
    <header className="az-header">
      <div className="az-container az-header-inner">
        <Link href="/" aria-label="Azuriya home">
          <MarketingBrand />
        </Link>
        <nav className="az-desktop-nav" aria-label={copy.mainNavigation}>
          <details className="az-products-menu">
            <summary>Products</summary>
            <div>
              <Link href="/brokerage">
                Azuriya Brokerage
                <small>Launch and operate your brokerage.</small>
              </Link>
              <Link href="/prop-firm">
                Azuriya Prop<small>Build and manage a prop firm.</small>
              </Link>
              <Link href="/#azuriya-core">
                Azuriya API
                <small>Discuss connecting your infrastructure.</small>
              </Link>
            </div>
          </details>
          {navigationLinks.slice(1).map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={currentPath === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="az-header-actions">
          <Link className="az-button-small az-launch-nav" href="/contact">
            Launch Your Business
          </Link>
          <SiteLanguageButton />
          <MarketingThemeSwitch />
          <button
            className="az-menu-toggle"
            aria-label={open ? copy.closeNavigation : copy.openNavigation}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={24} /> : <List size={24} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="az-mobile-nav"
          aria-label="Mobile navigation"
        >
          {navigationLinks.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={currentPath === href ? "page" : undefined}
            >
              {label}
              <ArrowUpRight size={16} />
            </Link>
          ))}
          <Link href="/contact" onClick={() => setOpen(false)}>
            Launch Your Business <ArrowUpRight size={16} />
          </Link>
        </nav>
      )}
    </header>
  );
}
