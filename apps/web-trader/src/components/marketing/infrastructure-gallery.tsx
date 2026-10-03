"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowsOutSimple,
  CaretDown,
  Check,
  CheckCircle,
  Cloud,
  CurrencyDollar,
  Database,
  GlobeHemisphereWest,
  Images,
  MapPin,
  PlugsConnected,
  ShieldCheck,
  SlidersHorizontal,
  Stack,
  TreeStructure,
  Triangle,
} from "@phosphor-icons/react";
import {
  calculateRevenueExample,
  formatExampleUsd,
} from "../../lib/marketing-revenue";
import { FlowTracks } from "./flow-tracks";
import "./infrastructure-gallery.css";

type View = "zones" | "routing" | "markups";
type Reference = {
  file: string;
  title: string;
  width: number;
  height: number;
};

const references: Reference[] = [
  {
    file: "mt5-liquidity-zones.png",
    title: "MT5 liquidity zones",
    width: 1652,
    height: 994,
  },
  {
    file: "mt5-symbol-routing.png",
    title: "Symbol routing & market depth",
    width: 1786,
    height: 1274,
  },
  {
    file: "mt5-quote-markups.png",
    title: "Quotes & markup settings",
    width: 1608,
    height: 1246,
  },
  {
    file: "liquidity-provider-directory.png",
    title: "Liquidity provider directory",
    width: 2346,
    height: 524,
  },
  {
    file: "liquidity-provider-logos-one.png",
    title: "Liquidity provider collection 01",
    width: 802,
    height: 404,
  },
  {
    file: "liquidity-provider-logos-two.png",
    title: "Liquidity provider collection 02",
    width: 786,
    height: 346,
  },
  {
    file: "liquidity-provider-logos-three.png",
    title: "Liquidity provider collection 03",
    width: 776,
    height: 336,
  },
];
const views = [
  {
    id: "zones",
    label: "Liquidity zones",
    detail: "Locations, coverage & provider choices",
  },
  {
    id: "routing",
    label: "Symbol routing",
    detail: "Aggregation, depth & execution paths",
  },
  {
    id: "markups",
    label: "Quotes & markups",
    detail: "Account groups & your commercial model",
  },
] as const;
const zones = [
  {
    id: "ld4",
    city: "London",
    country: "United Kingdom",
    location: "Equinix LD4",
    providers: "9",
    coverage: "FX · Metals · CFDs · Indices",
  },
  {
    id: "ams",
    city: "Amsterdam",
    country: "Netherlands",
    location: "Servers AMS",
    providers: "6",
    coverage: "FX · Metals · Crypto · Stocks",
  },
  {
    id: "ld6",
    city: "London",
    country: "United Kingdom",
    location: "Servers LD6",
    providers: "2",
    coverage: "FX · Metals · Stocks · Crypto",
  },
];
const platformNodes = [
  { name: "MetaTrader 5", file: "metatrader-5.png" },
  { name: "cTrader", file: "ctrader.ico" },
  { name: "TradeLocker", file: "tradelocker.webp" },
];
const featureCopy = {
  zones: {
    title: "A regional view of your liquidity.",
    description:
      "Bring location, instrument coverage and provider choices into the same operational view.",
    points: [
      {
        title: "Choose your location",
        text: "Select a zone to explore the supplied infrastructure examples.",
      },
      {
        title: "See instrument coverage",
        text: "Compare the markets listed for each regional configuration.",
      },
      {
        title: "Keep routing visible",
        text: "Account connections and external liquidity follow a shared architecture.",
      },
    ],
  },
  routing: {
    title: "Give every symbol a clear route.",
    description:
      "Define how quotes reach your accounts, with provider selection and depth visible beside the symbol.",
    points: [
      {
        title: "Choose an execution model",
        text: "Explore best-provider or aggregated-provider routing.",
      },
      {
        title: "Inspect market depth",
        text: "Review an illustrative price ladder without leaving the configuration.",
      },
      {
        title: "Preserve account controls",
        text: "Your configured risk and permission rules remain part of the workflow.",
      },
    ],
  },
  markups: {
    title: "Your commercial model, clearly defined.",
    description:
      "Manage commission markups and account-group settings through a consistent administration workspace.",
    points: [
      {
        title: "Separate base and markup",
        text: "Show the $2.00 base and up to $5.00 extra per lot clearly.",
      },
      {
        title: "Configure each group",
        text: "Organize leverage and commercial settings around your teams.",
      },
      {
        title: "Keep ownership clear",
        text: "The community head manages settings through permitted administration access.",
      },
    ],
  },
};

function MiniGraphic({ view }: { view: View }) {
  return (
    <span className={`ig-mini ig-mini-${view}`} aria-hidden="true">
      {view === "zones" ? (
        <>
          <span>
            <Cloud size={19} />
          </span>
          <i />
          <span>
            <MapPin size={19} />
          </span>
          <i />
          <span>
            <Database size={19} />
          </span>
        </>
      ) : view === "routing" ? (
        <>
          <span>
            <PlugsConnected size={19} />
          </span>
          <i />
          <span className="ig-mini-core">
            <TreeStructure size={20} />
          </span>
          <i />
          <span>
            <Stack size={19} />
          </span>
        </>
      ) : (
        <>
          <span>$2</span>
          <b>+</b>
          <span>$5</span>
          <b>=</b>
          <span className="ig-mini-total">$7</span>
        </>
      )}
    </span>
  );
}
function ZoneConnections({
  selectedZone,
}: {
  selectedZone: (typeof zones)[number];
}) {
  return (
    <div
      className="ig-zone-network"
      role="img"
      aria-label={`Illustrative platform accounts connect through the Azuriya A-book router to ${selectedZone.city}, ${selectedZone.location}`}
    >
      <div className="ig-platform-stack">
        {platformNodes.map((platform) => (
          <div key={platform.name}>
            <span>
              <Image
                src={`/marketing/platforms/${platform.file}`}
                alt=""
                width={23}
                height={23}
                unoptimized
              />
            </span>
            <strong>{platform.name}</strong>
          </div>
        ))}
      </div>
      <div className="ig-zone-tracks">
        <FlowTracks
          id="infrastructure-zones"
          viewBox="0 0 70 164"
          paths={[
            "M 0 24 H 19 Q 27 24 27 32 V 74 Q 27 82 35 82 H 70",
            "M 0 82 H 70",
            "M 0 140 H 19 Q 27 140 27 132 V 90 Q 27 82 35 82 H 70",
          ]}
        />
      </div>
      <div className="ig-router">
        <span>
          <Triangle size={27} weight="fill" />
        </span>
        <strong>azuriya.</strong>
        <small>A-book router</small>
      </div>
      <div className="ig-zone-output">
        <FlowTracks
          id="infrastructure-zone-output"
          viewBox="0 0 60 164"
          paths={["M 0 82 H 60"]}
          delay={-1.8}
        />
      </div>
      <div className="ig-zone-destination">
        <GlobeHemisphereWest size={28} />
        <strong>{selectedZone.city}</strong>
        <span>{selectedZone.location}</span>
        <small>External liquidity</small>
      </div>
    </div>
  );
}
function ZonesGraphic() {
  const [zone, setZone] = useState(zones[0].id);
  const selected = zones.find((item) => item.id === zone)!;
  return (
    <div className="ig-native-zones">
      <div className="ig-native-heading">
        <span>
          <GlobeHemisphereWest size={18} /> Liquidity zones
        </span>
        <small>Regional configuration</small>
      </div>
      <div
        className="ig-zones"
        role="group"
        aria-label="Illustrative liquidity zone"
      >
        {zones.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={zone === item.id}
            aria-label={`${item.city}, ${item.location}`}
            onClick={() => setZone(item.id)}
          >
            <span className="ig-zone-city">
              <MapPin size={17} />
              <strong>{item.city}</strong>
              {zone === item.id && <CheckCircle size={16} weight="fill" />}
            </span>
            <span className="ig-zone-location">{item.location}</span>
            <span className="ig-zone-country">{item.country}</span>
            <span className="ig-zone-provider-count">
              <strong>{item.providers}</strong> supplied provider options
            </span>
          </button>
        ))}
      </div>
      <ZoneConnections selectedZone={selected} />
      <div className="ig-zone-coverage">
        <span>Example instrument coverage</span>
        <strong>{selected.coverage}</strong>
      </div>
    </div>
  );
}
function RoutingGraphic() {
  const [symbol, setSymbol] = useState("EURUSD");
  const [model, setModel] = useState("aggregated");
  const prices =
    symbol === "EURUSD"
      ? [
          ["1.00", "1.08421", "1.08424"],
          ["2.00", "1.08420", "1.08425"],
          ["5.00", "1.08418", "1.08427"],
        ]
      : [
          ["1.00", "2648.20", "2648.35"],
          ["2.00", "2648.15", "2648.40"],
          ["5.00", "2648.10", "2648.45"],
        ];
  return (
    <div className="ig-native-routing">
      <div className="ig-native-heading">
        <span>
          <TreeStructure size={18} /> Symbol configuration
        </span>
        <div role="group" aria-label="Example routing symbol">
          {["EURUSD", "XAUUSD"].map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={symbol === item}
              onClick={() => setSymbol(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="ig-routing-model">
        <span>
          <strong>Execution route</strong>
          <small>External liquidity · A-book</small>
        </span>
        <label>
          Routing model
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            <option value="aggregated">Aggregated providers</option>
            <option value="best">Best provider</option>
          </select>
        </label>
      </div>
      <div
        className={`ig-aggregation ${model === "best" ? "ig-best-provider" : ""}`}
        aria-label={`Illustrative ${model === "best" ? "best-provider" : "aggregated-provider"} route for ${symbol}`}
      >
        <div className="ig-route-providers">
          {["Provider 01", "Provider 02", "Provider 03"].map((name, index) => (
            <span
              key={name}
              className={
                model === "aggregated" || index === 0
                  ? "ig-provider-enabled"
                  : ""
              }
            >
              <Database size={19} />
              <strong>{name}</strong>
              <small>
                {model === "aggregated" || index === 0
                  ? "Example route"
                  : "Standby route"}
              </small>
            </span>
          ))}
        </div>
        <div className="ig-aggregation-tracks">
          <FlowTracks
            id={`infrastructure-aggregation-${model}`}
            viewBox="0 0 600 50"
            paths={
              model === "aggregated"
                ? [
                    "M 100 0 V 12 Q 100 20 108 20 H 292 Q 300 20 300 28 V 50",
                    "M 300 0 V 50",
                    "M 500 0 V 12 Q 500 20 492 20 H 308 Q 300 20 300 28 V 50",
                  ]
                : ["M 100 0 V 12 Q 100 20 108 20 H 292 Q 300 20 300 28 V 50"]
            }
          />
        </div>
        <div className="ig-aggregation-result">
          <TreeStructure size={18} />
          <strong>{symbol}</strong>
          <span>
            {model === "aggregated"
              ? "Aggregated market depth"
              : "Best-provider quotes"}
          </span>
          <ShieldCheck size={17} />
        </div>
      </div>
      <div className="ig-depth">
        <span>Example market depth</span>
        <table aria-label={`Illustrative ${symbol} market depth`}>
          <thead>
            <tr>
              <th>Volume / lots</th>
              <th>Bid</th>
              <th>Ask</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((row) => (
              <tr key={row[0]}>
                <td>{row[0]}</td>
                <td>{row[1]}</td>
                <td>{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function MarkupsGraphic() {
  const [markup, setMarkup] = useState("5.00");
  const [leverage, setLeverage] = useState("1:100");
  const commission = calculateRevenueExample(markup, "10000");
  return (
    <div className="ig-native-markups">
      <div className="ig-native-heading">
        <span>
          <SlidersHorizontal size={18} /> Group administration
        </span>
        <small>Illustrative settings</small>
      </div>
      <div className="ig-group-context">
        <span className="ig-group-mark">
          <ShieldCheck size={23} />
        </span>
        <span>
          <strong>Gold Elite</strong>
          <small>Community / account group</small>
        </span>
        <span className="ig-owner-access">
          <Check size={14} /> Owner access
        </span>
      </div>
      <div className="ig-setting-row">
        <span>
          <strong>Group leverage</strong>
          <small>Choose an example risk profile</small>
        </span>
        <label>
          <span className="ig-visually-hidden">Example group leverage</span>
          <select
            value={leverage}
            onChange={(event) => setLeverage(event.target.value)}
          >
            {["1:30", "1:100", "1:200"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="ig-markup-control">
        <span>
          <strong>Extra commission markup</strong>
          <small>USD per traded lot, above the base</small>
        </span>
        <div role="group" aria-label="Infrastructure example markup">
          {["1.00", "3.00", "5.00"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={markup === value}
              onClick={() => setMarkup(value)}
            >
              {formatExampleUsd(value)}
            </button>
          ))}
        </div>
      </div>
      <div
        className="ig-commission-equation"
        aria-label="Illustrative commission per lot"
      >
        <span>
          <small>Base commission</small>
          <strong>{formatExampleUsd(commission.baseCommission)}</strong>
        </span>
        <b>+</b>
        <span>
          <small>Your extra markup</small>
          <strong>{formatExampleUsd(commission.markup)}</strong>
        </span>
        <b>=</b>
        <span className="ig-commission-total">
          <small>Trader commission</small>
          <strong>{formatExampleUsd(commission.traderCommission)}</strong>
        </span>
      </div>
      <div className="ig-commercial-summary">
        <span>
          <CurrencyDollar size={20} />
          <span>
            Example markup revenue
            <strong>{formatExampleUsd(commission.monthlyRevenue)}</strong>
          </span>
        </span>
        <span>
          10,000 lots / month<small>Illustrative, before costs</small>
        </span>
      </div>
      <div className="ig-setting-footer">
        <ShieldCheck size={16} />
        <span>Local preview settings only</span>
        <strong>Admin Portal + MT5 Manager</strong>
      </div>
    </div>
  );
}
function OriginalImage({ reference }: { reference: Reference }) {
  return (
    <span className="ig-original-image">
      <Image
        src={`/marketing/infrastructure/${reference.file}`}
        alt={`Supplied original reference: ${reference.title}`}
        width={reference.width}
        height={reference.height}
        unoptimized
      />
    </span>
  );
}
export function InfrastructureGallery() {
  const [view, setView] = useState<View>("zones");
  const [sourceFile, setSourceFile] = useState(references[0].file);
  const sourceRef = useRef<HTMLDivElement>(null);
  const selectedSource = references.find(
    (reference) => reference.file === sourceFile,
  )!;
  const copy = featureCopy[view];
  const selectSource = (reference: Reference) => {
    setSourceFile(reference.file);
    sourceRef.current?.focus({ preventScroll: true });
    sourceRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return (
    <section
      id="infrastructure"
      className="az-container ig-section"
      aria-labelledby="infrastructure-title"
    >
      <div className="ig-intro">
        <span className="ig-section-label">
          <Stack size={18} /> Behind your brokerage
        </span>
        <h2 id="infrastructure-title">A closer look at the infrastructure</h2>
        <p>
          Location, execution and commercial controls. Explore the workspace
          that brings the details together.
        </p>
      </div>
      <div
        className="ig-view-selector"
        role="group"
        aria-label="Infrastructure preview views"
      >
        {views.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={view === item.id}
            aria-controls="infrastructure-featured"
            onClick={() => setView(item.id)}
          >
            <MiniGraphic view={item.id} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      <div
        className="ig-featured"
        id="infrastructure-featured"
        role="region"
        aria-label="Interactive infrastructure preview"
      >
        <div className="ig-workspace">
          <div className="ig-workspace-bar">
            <span>
              <Triangle size={14} weight="fill" /> azuriya.
              <small>Infrastructure</small>
            </span>
            <span>Illustrative workspace</span>
          </div>
          {view === "zones" ? (
            <ZonesGraphic />
          ) : view === "routing" ? (
            <RoutingGraphic />
          ) : (
            <MarkupsGraphic />
          )}
          <div className="ig-workspace-footer">
            <ShieldCheck size={15} />
            <span>
              {view === "markups"
                ? "Commercial configuration example"
                : "External liquidity architecture example"}
            </span>
            <span>Simulation</span>
          </div>
        </div>
        <aside className="ig-editorial" aria-live="polite">
          <span>Infrastructure in focus</span>
          <h3>{copy.title}</h3>
          <p>{copy.description}</p>
          <ul>
            {copy.points.map((point, index) => {
              const Icon = [GlobeHemisphereWest, PlugsConnected, ShieldCheck][
                index
              ];
              return (
                <li key={point.title}>
                  <Icon size={18} />
                  <span>
                    <strong>{point.title}</strong>
                    <small>{point.text}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="ig-editorial-note">
            A product illustration of the supplied infrastructure. No live
            connection or market status is shown.
          </span>
        </aside>
      </div>
      <details className="ig-source-details">
        <summary>
          <Images size={21} />
          <span>
            <strong>Inspect the original infrastructure references</strong>
            <small>Seven supplied screenshots and provider collections</small>
          </span>
          <CaretDown size={18} />
        </summary>
        <div className="ig-source-content">
          <div
            id="infrastructure-source-viewer"
            className="ig-source-viewer"
            ref={sourceRef}
            tabIndex={-1}
            role="region"
            aria-label="Selected original infrastructure reference"
          >
            <div className="ig-source-toolbar">
              <strong>{selectedSource.title}</strong>
              <a
                href={`/marketing/infrastructure/${selectedSource.file}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Enlarge ${selectedSource.title} (opens in a new tab)`}
              >
                <ArrowsOutSimple size={17} /> Enlarge original
              </a>
            </div>
            <OriginalImage reference={selectedSource} />
          </div>
          <div
            className="ig-source-list"
            aria-label="Supplied infrastructure reference files"
          >
            {references.map((reference) => (
              <article
                data-liquidity-reference={reference.file}
                key={reference.file}
              >
                <button
                  type="button"
                  aria-label={`Preview ${reference.title}`}
                  aria-pressed={sourceFile === reference.file}
                  aria-controls="infrastructure-source-viewer"
                  onClick={() => selectSource(reference)}
                >
                  <Images size={16} />
                  <span>{reference.title}</span>
                  {sourceFile === reference.file && <Check size={15} />}
                </button>
                <a
                  href={`/marketing/infrastructure/${reference.file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open original: ${reference.title} (opens in a new tab)`}
                >
                  Open original
                  <ArrowUpRight size={15} />
                </a>
              </article>
            ))}
          </div>
          <p>
            These unchanged source files document the supplied infrastructure
            examples. Connection states, latency figures and settings belong to
            those references and do not represent live Azuriya telemetry.
          </p>
        </div>
      </details>
    </section>
  );
}
