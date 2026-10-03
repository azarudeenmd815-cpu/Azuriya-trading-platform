export type MarketingTheme = "light" | "dark";
export const DEFAULT_MARKETING_THEME: MarketingTheme = "dark";
export const MARKETING_THEME_STORAGE_KEY = "azuriya.marketing-theme";

// A fixed first-paint script; no visitor content is interpolated into executable code.
export const marketingThemeBootstrap = `(() => {
  let theme = "dark";
  try {
    const saved = localStorage.getItem("azuriya.marketing-theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {}
  document.documentElement.dataset.marketingTheme = theme;
})();`;
