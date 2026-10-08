"use client";

import { useSyncExternalStore } from "react";
import {
  isSiteLanguage,
  siteLanguageEvent,
  type SiteLanguage,
} from "./site-language";

const serverLanguage = () => "en" as const;

function currentLanguage(): SiteLanguage {
  if (typeof document === "undefined") return "en";
  const value = document.documentElement.lang;
  return isSiteLanguage(value) ? value : "en";
}

function subscribe(onChange: () => void) {
  window.addEventListener(siteLanguageEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(siteLanguageEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSiteLanguage(): SiteLanguage {
  return useSyncExternalStore(subscribe, currentLanguage, serverLanguage);
}

export function setSiteLanguage(language: SiteLanguage, persist = true) {
  document.documentElement.lang = language;
  if (persist) {
    try {
      localStorage.setItem("azuriya:language", language);
    } catch {
      // The language applies to this visit when storage is blocked.
    }
  }
  window.dispatchEvent(new Event(siteLanguageEvent));
}
