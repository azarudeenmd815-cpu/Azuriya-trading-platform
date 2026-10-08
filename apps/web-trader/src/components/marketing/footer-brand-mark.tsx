import type { SVGProps } from "react";

// Smooth vector version of the existing framed A mark, used only in the footer.
export function FooterBrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 128 128"
      width="44"
      height="44"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M43 16H24a8 8 0 0 0-8 8v19" />
        <path d="M85 16h19a8 8 0 0 1 8 8v19" />
        <path d="M16 85v19a8 8 0 0 0 8 8h19" />
        <path d="M112 85v19a8 8 0 0 1-8 8H85" />
      </g>
      <path
        d="M35.9 90.7 59.8 46.3c1.8-3.3 6.6-3.3 8.4 0l23.9 44.4c1.2 2.2-.4 4.9-2.9 4.9H79.1a5 5 0 0 1-4.4-2.6L64 73.2 53.3 93a5 5 0 0 1-4.4 2.6H38.8c-2.5 0-4.1-2.7-2.9-4.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FooterBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`az-brand az-footer-brand${compact ? " az-brand-compact" : ""}`}
    >
      <FooterBrandMark
        width={compact ? 36 : 44}
        height={compact ? 36 : 44}
        style={{ color: "#2c60ed", flexShrink: 0 }}
      />
      <span>
        azuriya<span className="az-brand-period">.</span>
      </span>
    </span>
  );
}
