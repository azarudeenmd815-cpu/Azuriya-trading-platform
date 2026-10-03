import type { CSSProperties } from "react";
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<string, React.ReactNode> = {
    minus: <path d="M5 12h14" />,
    reset: (
      <>
        <path d="M5 8a8 8 0 1 1-1 8M5 3v5h5" />
      </>
    ),
    save: (
      <>
        <path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8" />
      </>
    ),
    single: <rect x="3" y="4" width="18" height="16" rx="1" />,
    columns: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M12 4v16" />
      </>
    ),
    rows: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 12h18" />
      </>
    ),
    ticket: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    density: <path d="M4 5h16M4 10h16M4 15h16M4 20h16" />,
    search: (
      <>
        <circle cx="10.7" cy="10.7" r="6.2" />
        <path d="m15 15 5 5" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    chart: (
      <>
        <path d="M4 4v16h16M7 14l4-5 4 3 5-7" />
      </>
    ),
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    logout: (
      <>
        <path d="M10 4H4v16h6m4-13 5 5-5 5M8 12h11" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8H5a2 2 0 0 1 0-4h13v4M3 6v12a2 2 0 0 0 2 2h15V8" />
        <path d="M16 12h4v4h-4z" />
      </>
    ),
    expand: <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />,
    star: (
      <path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.1L12 17.3l-5.6 2.9 1.1-6.1L3 9.7l6.2-.9L12 3Z" />
    ),
    edit: (
      <>
        <path d="m15 4 5 5-11 11H4v-5L15 4Z" />
        <path d="m12 7 5 5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name] || paths.chart}
    </svg>
  );
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <svg
        width="28"
        height="30"
        viewBox="0 0 28 30"
        fill="none"
        aria-hidden="true"
      >
        <path d="M14 2 27 27h-7L14 14 8 27H1L14 2Z" fill="currentColor" />
        <path d="M11 23h6l-3 6-3-6Z" fill="#497beb" />
      </svg>
      <span>
        AZURIYA<small>TRADING PLATFORM</small>
      </span>
    </div>
  );
}
