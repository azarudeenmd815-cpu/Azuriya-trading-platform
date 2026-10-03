import { Triangle } from "@phosphor-icons/react/dist/ssr";

export function MarketingBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`az-brand${compact ? " az-brand-compact" : ""}`}>
      <span className="az-brand-mark">
        <Triangle weight="fill" aria-hidden="true" />
      </span>
      <span>
        azuriya<span className="az-brand-period">.</span>
      </span>
    </span>
  );
}
