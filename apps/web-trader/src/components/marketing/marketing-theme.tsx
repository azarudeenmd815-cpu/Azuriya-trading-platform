"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import {
  DEFAULT_MARKETING_THEME,
  MARKETING_THEME_STORAGE_KEY,
  type MarketingTheme,
} from "./marketing-theme-config";
import "./marketing-theme-switch.css";

const themeEvent = "azuriya:marketing-theme-change";
const getServerSnapshot = () => DEFAULT_MARKETING_THEME;

function getSnapshot(): MarketingTheme {
  return document.documentElement.dataset.marketingTheme === "light"
    ? "light"
    : "dark";
}

function subscribe(onChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key !== MARKETING_THEME_STORAGE_KEY && event.key !== null) return;
    document.documentElement.dataset.marketingTheme =
      event.newValue === "light" ? "light" : "dark";
    onChange();
  }
  window.addEventListener(themeEvent, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(themeEvent, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useMarketingTheme(): MarketingTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function MarketingThemeSync() {
  // Keep cross-tab appearance changes synchronized while visiting the terminal.
  useMarketingTheme();
  return null;
}

export function setMarketingTheme(theme: MarketingTheme) {
  document.documentElement.dataset.marketingTheme = theme;
  try {
    localStorage.setItem(MARKETING_THEME_STORAGE_KEY, theme);
  } catch {
    // The selected appearance still works for this visit when storage is unavailable.
  }
  window.dispatchEvent(new Event(themeEvent));
}

export function MarketingThemeSwitch() {
  const theme = useMarketingTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="az-theme-switch"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setMarketingTheme(nextTheme)}
    >
      {theme === "dark" ? (
        <Sun size={19} aria-hidden="true" />
      ) : (
        <Moon size={19} aria-hidden="true" />
      )}
    </button>
  );
}

export function MarketingDashboardSurface({
  children,
}: {
  children: ReactNode;
}) {
  const theme = useMarketingTheme();
  return (
    <div className="az-demo-shell" data-dashboard-theme={theme}>
      {children}
    </div>
  );
}

export function MarketingSurface({
  children,
  className = "az-marketing",
}: {
  children: ReactNode;
  className?: string;
}) {
  const theme = useMarketingTheme();
  return (
    <div className={className} data-site-theme={theme}>
      {children}
    </div>
  );
}
