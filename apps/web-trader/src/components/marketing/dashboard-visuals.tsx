import type { CSSProperties } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  ArrowsSplit,
  Bank,
  GearSix,
  GlobeHemisphereWest,
  ShieldCheck,
  Trophy,
} from "@phosphor-icons/react";
import { FlowTracks } from "./flow-tracks";
import "./dashboard-visuals.css";

const platforms = [
  {
    name: "MT5",
    file: "metatrader-5.png",
    accounts: "642",
    share: "54.2%",
    color: "blue",
  },
  {
    name: "cTrader",
    file: "ctrader.ico",
    accounts: "318",
    share: "26.9%",
    color: "steel",
  },
  {
    name: "TradeLocker",
    file: "tradelocker.webp",
    accounts: "224",
    share: "18.9%",
    color: "gold",
  },
];

const sparkPaths = [
  "M0 28 C10 27 11 18 21 17 S35 28 47 23 S62 10 75 12 S94 16 101 9 S106 6 110 4",
  "M0 29 C9 29 12 22 22 23 S36 26 45 21 S57 14 69 15 S83 19 92 12 S103 10 110 5",
  "M0 30 C10 30 12 16 24 16 S36 25 48 23 S63 9 74 12 S88 17 100 8 S106 8 110 3",
  "M0 29 C8 29 12 23 21 22 S34 29 44 23 S58 8 70 10 S85 16 95 9 S103 7 110 3",
];
const fallingSparkPath =
  "M0 7 C10 7 12 11 24 13 S37 23 49 22 S62 18 73 24 S88 28 99 27 S105 30 110 32";

export function DashboardSparkline({
  index,
  negative = false,
}: {
  index: number;
  negative?: boolean;
}) {
  const path = negative ? fallingSparkPath : sparkPaths[index];
  return (
    <svg
      className="dv-sparkline"
      viewBox="0 0 110 36"
      aria-hidden="true"
      style={
        negative
          ? ({
              "--dv-spark-color": "var(--dash-red, #fd606c)",
            } as CSSProperties)
          : undefined
      }
    >
      <line
        x1="0"
        x2="110"
        y1="29"
        y2="29"
        stroke="var(--dash-border, #303238)"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <path d={`${path} L110 36 L0 36 Z`} className="dv-spark-area" />
      <path d={path} className="dv-spark-line" />
    </svg>
  );
}

export function DashboardVolumeBreakdown({
  groups,
}: {
  groups: readonly { name: string; lots: string }[];
}) {
  const volumes = groups.map(({ lots }) => BigInt(lots.replaceAll(",", "")));
  const peak = volumes.reduce(
    (largest, value) => (value > largest ? value : largest),
    1n,
  );
  return (
    <div
      className="dv-volume-breakdown"
      aria-label="Example trading volume by team"
    >
      {groups.map(({ name, lots }, index) => (
        <div key={name}>
          <span>{name}</span>
          <span className="dv-volume-rail">
            <i
              style={
                {
                  "--dv-bar": `${Number((volumes[index] * 1000n) / peak) / 10}%`,
                } as CSSProperties
              }
            />
          </span>
          <strong>
            {lots} <small>lots</small>
          </strong>
        </div>
      ))}
    </div>
  );
}

export function DashboardWorkspaceShortcuts({
  onView,
}: {
  onView: (view: string) => void;
}) {
  return (
    <nav
      className="dv-workspace-shortcuts"
      aria-label="Control center shortcuts"
    >
      {[
        {
          view: "Administration",
          title: "Admin Portal",
          detail: "Groups · access · payments",
          icon: GearSix,
        },
        {
          view: "Prop firm",
          title: "Prop firm",
          detail: "Challenges · risk · payouts",
          icon: Trophy,
        },
        {
          view: "Brokerage",
          title: "Brokerage",
          detail: "Execution · pricing · servers",
          icon: Bank,
        },
      ].map(({ view, title, detail, icon: Icon }) => (
        <button
          key={view}
          onClick={() => onView(view)}
          aria-label={`Open ${title} controls`}
        >
          <span className="dv-shortcut-icon">
            <Icon size={20} weight="duotone" />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
          <ArrowUpRight size={14} />
        </button>
      ))}
    </nav>
  );
}

export function DashboardCopyNetwork({ paused }: { paused: boolean }) {
  return (
    <figure
      className={`dv-copy-network${paused ? " af-motion-paused" : ""}`}
      aria-label="Example copy orders pass from the master through the copy engine to MT5, cTrader and TradeLocker"
    >
      <FlowTracks
        id="dashboard-copy"
        viewBox="0 0 300 170"
        paths={[
          "M150 0 V30",
          "M150 67 V92 Q150 98 144 98 H57 Q50 98 50 105 V128",
          "M150 67 V128",
          "M150 67 V92 Q150 98 156 98 H243 Q250 98 250 105 V128",
        ]}
      />
      <span className="dv-copy-hub">
        <ArrowsSplit size={19} />
        <strong>Copy engine</strong>
      </span>
      <div className="dv-copy-destinations">
        {platforms.map(({ name, file }) => (
          <span key={name}>
            <Image
              src={`/marketing/platforms/${file}`}
              width={24}
              height={24}
              alt=""
            />
            <small>{name}</small>
          </span>
        ))}
      </div>
    </figure>
  );
}

export function DashboardOperationsVisual({ team }: { team: string }) {
  return (
    <div className="dv-operations-visuals">
      <section className="dd-panel dv-routing-panel">
        <div className="dd-panel-title">
          <h3>Execution architecture</h3>
          <span className="dv-context-label">A-book only</span>
        </div>
        <p className="dd-panel-note">
          {team === "All teams" ? "All community groups" : team} · illustrative
          account routing
        </p>
        <figure
          className="dv-routing-map"
          aria-label="Trading platform accounts pass ownership and risk checks before the A-book router connects to external liquidity"
        >
          <FlowTracks
            id="dashboard-routing"
            viewBox="0 0 600 180"
            paths={[
              "M100 38 H158 Q169 38 169 50 V79 Q169 90 180 90 H238",
              "M100 90 H238",
              "M100 142 H158 Q169 142 169 131 V101 Q169 90 180 90 H238",
              "M362 90 H403 Q414 90 414 79 V50 Q414 38 426 38 H493",
              "M362 90 H493",
              "M362 90 H403 Q414 90 414 101 V130 Q414 142 426 142 H493",
            ]}
          />
          <div className="dv-map-platforms">
            {platforms.map(({ name, file }) => (
              <span key={name}>
                <Image
                  src={`/marketing/platforms/${file}`}
                  width={19}
                  height={19}
                  alt=""
                />
                <strong>{name}</strong>
              </span>
            ))}
          </div>
          <div className="dv-map-router">
            <span className="dv-router-symbol">
              <ArrowsSplit size={24} />
            </span>
            <strong>Azuriya router</strong>
            <small>Ownership · risk · routing</small>
            <span>A-book execution</span>
          </div>
          <div className="dv-map-providers">
            <span>
              <GlobeHemisphereWest size={16} />
              <strong>London · LD4</strong>
            </span>
            <span>
              <GlobeHemisphereWest size={16} />
              <strong>Amsterdam · AMS</strong>
            </span>
            <span>
              <GlobeHemisphereWest size={16} />
              <strong>External LPs</strong>
            </span>
          </div>
        </figure>
        <div className="dv-route-footer">
          <ShieldCheck size={13} />
          <span>
            Account ownership and pre-trade risk checks stay enforced.
          </span>
        </div>
      </section>
      <section className="dd-panel dv-allocation-panel">
        <div className="dd-panel-title">
          <h3>Platform account mix</h3>
        </div>
        <p className="dd-panel-note">Whole workspace · example inventory</p>
        <figure
          className="dv-allocation"
          aria-label="Example platform distribution: MT5 642 accounts, cTrader 318 accounts, TradeLocker 224 accounts"
        >
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="45" className="dv-ring-base" />
            <circle
              cx="60"
              cy="60"
              r="45"
              pathLength="100"
              strokeDasharray="53.2 46.8"
              className="dv-ring-blue"
            />
            <circle
              cx="60"
              cy="60"
              r="45"
              pathLength="100"
              strokeDasharray="25.9 74.1"
              strokeDashoffset="-54.2"
              className="dv-ring-steel"
            />
            <circle
              cx="60"
              cy="60"
              r="45"
              pathLength="100"
              strokeDasharray="17.9 82.1"
              strokeDashoffset="-81.1"
              className="dv-ring-gold"
            />
          </svg>
          <figcaption>
            <strong>1,184</strong>
            <span>accounts</span>
          </figcaption>
        </figure>
        <ul className="dv-allocation-legend">
          {platforms.map(({ name, accounts, share, color }) => (
            <li key={name}>
              <i className={`dv-dot-${color}`} />
              <span>{name}</span>
              <strong>{accounts}</strong>
              <small>{share}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
