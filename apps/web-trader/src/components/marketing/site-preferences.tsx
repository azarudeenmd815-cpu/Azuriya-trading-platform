"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CaretDown,
  Check,
  GlobeHemisphereWest,
  LockKey,
  X,
} from "@phosphor-icons/react";
import {
  isSiteLanguage,
  localizedUi,
  siteLanguageStorageKey,
  siteLanguageEvent,
  siteLanguages,
  sitePreferencesOpenEvent,
  type SiteLanguage,
} from "@/lib/site-language";
import { setSiteLanguage, useSiteLanguage } from "@/lib/site-language-client";
import "./site-preferences.css";

const consentStorageKey = "azuriya:site-consent";
const consentCookieName = "azuriya_site_consent";
type CookieConsent = { essential: true; optionalAnalytics: boolean };

function readConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(consentStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    return parsed.essential === true
      ? {
          essential: true,
          optionalAnalytics: parsed.optionalAnalytics === true,
        }
      : null;
  } catch {
    return null;
  }
}

function browserLanguage(): SiteLanguage {
  const candidate = navigator.languages
    .map((value) => value.split("-")[0]?.toLowerCase())
    .find(isSiteLanguage);
  return candidate ?? "en";
}

function saveConsent(consent: CookieConsent) {
  const value = JSON.stringify({
    ...consent,
    savedAt: new Date().toISOString(),
  });
  try {
    localStorage.setItem(consentStorageKey, value);
  } catch {
    // Keep the first-party cookie as a fallback when browser storage is blocked.
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${consentCookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function SitePreferences() {
  const activeLanguage = useSiteLanguage();
  const [open, setOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SiteLanguage>("en");
  const [suggestedLanguage, setSuggestedLanguage] =
    useState<SiteLanguage>("en");
  const [hasRegionSuggestion, setHasRegionSuggestion] = useState(false);
  const [allowOptional, setAllowOptional] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const languageInteracted = useRef(false);

  useEffect(() => {
    let preferred = "";
    try {
      preferred = localStorage.getItem(siteLanguageStorageKey) ?? "";
    } catch {
      // Browser storage may be blocked; use language hints for this visit.
    }
    const initialLanguage = isSiteLanguage(preferred)
      ? preferred
      : browserLanguage();
    setSelectedLanguage(initialLanguage);
    setSuggestedLanguage(initialLanguage);
    setSiteLanguage(initialLanguage, false);

    const localeRequest = new AbortController();
    const honorLanguageChoice = () => {
      languageInteracted.current = true;
    };
    window.addEventListener(siteLanguageEvent, honorLanguageChoice);

    if (!readConsent()) {
      let dismissed = false;
      try {
        dismissed =
          sessionStorage.getItem("azuriya:consent-dismissed") === "true";
      } catch {
        // A blocked session store should not prevent the first-visit prompt.
      }
      if (!dismissed) setOpen(true);
    } else {
      setAllowOptional(readConsent()?.optionalAnalytics === true);
    }

    fetch("/api/site-locale", {
      cache: "no-store",
      signal: localeRequest.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { locale?: string; source?: string } | null) => {
        if (!result || !isSiteLanguage(result.locale)) return;
        setSuggestedLanguage(result.locale);
        setHasRegionSuggestion(result.source === "country");
        if (!isSiteLanguage(preferred) && !languageInteracted.current) {
          setSelectedLanguage(result.locale);
          setSiteLanguage(result.locale, false);
        }
      })
      .catch(() => {
        // Browser language remains the fallback when location is unavailable.
      });
    return () => {
      localeRequest.abort();
      window.removeEventListener(siteLanguageEvent, honorLanguageChoice);
    };
  }, []);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  useEffect(() => {
    const openPreferences = () => {
      setSelectedLanguage(activeLanguage);
      setAllowOptional(readConsent()?.optionalAnalytics === true);
      setOpen(true);
    };
    window.addEventListener(sitePreferencesOpenEvent, openPreferences);
    return () =>
      window.removeEventListener(sitePreferencesOpenEvent, openPreferences);
  }, [activeLanguage]);

  const copy = localizedUi[selectedLanguage];
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    try {
      sessionStorage.setItem("azuriya:consent-dismissed", "true");
    } catch {
      // The prompt will be shown again on the next visit when session storage is unavailable.
    }
  };
  const save = (optionalAnalytics: boolean) => {
    languageInteracted.current = true;
    try {
      localStorage.setItem(siteLanguageStorageKey, selectedLanguage);
    } catch {
      // The language still applies to this visit.
    }
    setSiteLanguage(selectedLanguage);
    saveConsent({ essential: true, optionalAnalytics });
    dialog.current?.close();
    setOpen(false);
  };
  const selectLanguage = (value: string) => {
    if (isSiteLanguage(value)) {
      languageInteracted.current = true;
      setSelectedLanguage(value);
    }
  };

  return (
    <>
      <button
        type="button"
        className="sf-preferences-trigger"
        onClick={() =>
          window.dispatchEvent(new Event(sitePreferencesOpenEvent))
        }
      >
        <GlobeHemisphereWest size={15} aria-hidden="true" />
        {localizedUi[activeLanguage].privacyPreferences}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="sf-visitor-dialog"
          aria-labelledby="sf-visitor-title"
          aria-label={copy.welcomeTitle}
          dir={
            selectedLanguage === "ar" || selectedLanguage === "ur"
              ? "rtl"
              : "ltr"
          }
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <header className="sf-visitor-header">
            <span className="sf-visitor-icon">
              <GlobeHemisphereWest size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="sf-visitor-kicker">AZURIYA</p>
              <h2 id="sf-visitor-title">{copy.welcomeTitle}</h2>
            </div>
            <button
              type="button"
              className="sf-visitor-close"
              aria-label={copy.closeDialog}
              onClick={close}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </header>
          <div className="sf-visitor-body">
            <p className="sf-visitor-intro">{copy.welcomeDescription}</p>
            <label className="sf-language-field">
              <span>{copy.languageLabel}</span>
              <select
                value={selectedLanguage}
                onChange={(event) => selectLanguage(event.currentTarget.value)}
                autoFocus
              >
                {siteLanguages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
            {hasRegionSuggestion && selectedLanguage === suggestedLanguage && (
              <p className="sf-region-hint" role="status">
                {copy.suggestedLanguage}
              </p>
            )}
            <div className="sf-cookie-heading">
              <h3>{copy.cookiesTitle}</h3>
              <p>{copy.cookiesDescription}</p>
            </div>
            <div className="sf-cookie-choice">
              <LockKey size={20} aria-hidden="true" />
              <span>
                <strong>{copy.essentialCookies}</strong>
                <small>{copy.essentialDescription}</small>
              </span>
              <span className="sf-cookie-state">{copy.alwaysOn}</span>
            </div>
            <label className="sf-cookie-choice sf-cookie-optional">
              <Check size={20} aria-hidden="true" />
              <span>
                <strong>{copy.optionalCookies}</strong>
                <small>{copy.optionalDescription}</small>
              </span>
              <input
                type="checkbox"
                checked={allowOptional}
                onChange={(event) =>
                  setAllowOptional(event.currentTarget.checked)
                }
                aria-label={copy.optionalCookies}
              />
            </label>
            <p className="sf-cookie-policy">
              <Link href="/legal/cookies" onClick={close}>
                {copy.cookiesPolicy}
              </Link>
            </p>
            <div className="sf-visitor-actions">
              <button
                type="button"
                className="sf-essential-button"
                onClick={() => save(false)}
              >
                {copy.essentialOnly}
              </button>
              <button
                type="button"
                className="sf-accept-button"
                onClick={() => save(allowOptional)}
              >
                {allowOptional ? copy.acceptOptional : copy.savePreferences}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}

export function SiteLanguageButton() {
  const language = useSiteLanguage();
  return (
    <label className="az-language-switch">
      <GlobeHemisphereWest size={16} aria-hidden="true" />
      <select
        aria-label={localizedUi[language].changeLanguage}
        title={localizedUi[language].changeLanguage}
        value={language}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (isSiteLanguage(value)) setSiteLanguage(value);
        }}
      >
        {siteLanguages.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
      <CaretDown size={12} aria-hidden="true" />
    </label>
  );
}
