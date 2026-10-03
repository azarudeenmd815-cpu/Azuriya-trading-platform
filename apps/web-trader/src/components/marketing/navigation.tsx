"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, List, X } from "@phosphor-icons/react";
import { MarketingBrand } from "./brand";
import { MarketingThemeSwitch } from "./marketing-theme";
import "./navigation.css";

const links = [
  ["Solutions", "#solutions"],
  ["A-book liquidity", "#liquidity"],
  ["Trading platforms", "#trading-platforms"],
  ["Copy trading", "#copy-trading"],
  ["MT5 deposits", "/mt5-deposits"],
  ["Resources", "/resources"],
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
  const navigationLinks = pageLinks
    ? [
        ["Solutions", "/solutions"],
        ["A-book liquidity", "/liquidity"],
        ["Trading platforms", "/trading-platforms"],
        ["Copy trading", "/copy-trading"],
        ["Resources", "/resources"],
      ]
    : links.map(([label, href]) => [
        label,
        homeLinks && href.startsWith("#") ? `/${href}` : href,
      ]);
  return (
    <header className="az-header">
      <div className="az-container az-header-inner">
        <Link href="/" aria-label="Azuriya home">
          <MarketingBrand />
        </Link>
        <nav className="az-desktop-nav" aria-label="Main navigation">
          {navigationLinks.map(([label, href]) => (
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
          <MarketingThemeSwitch />
          <Link className="az-login" href="/terminal">
            Log in <ArrowUpRight size={14} />
          </Link>
          <Link
            className="az-button az-button-small"
            href="/terminal?mode=register"
          >
            Get started <ArrowUpRight size={15} />
          </Link>
          <button
            className="az-menu-toggle"
            aria-label={open ? "Close navigation" : "Open navigation"}
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
          <Link href="/terminal">
            Log in to your workspace <ArrowUpRight size={16} />
          </Link>
        </nav>
      )}
    </header>
  );
}
