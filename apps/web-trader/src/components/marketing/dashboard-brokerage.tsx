"use client";

import { useId, useState } from "react";
import {
  ArrowsSplit,
  ArrowRight,
  CheckCircle,
  Database,
  LockKey,
  Pulse,
  ShieldCheck,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { FlowTracks } from "./flow-tracks";
import "./dashboard-brokerage.css";

const zones = {
  "London LD4": {
    location: "UK · Equinix LD4",
    primary: "Luramic",
    secondary: "FxPro",
    backup: "GBE Prime",
  },
  "Amsterdam AMS": {
    location: "NL · Amsterdam AMS",
    primary: "GBE Prime",
    secondary: "FxGrow",
    backup: "CMS Prime",
  },
  "London LD6": {
    location: "UK · Equinix LD6",
    primary: "FxPro",
    secondary: "CMS Prime",
    backup: "Luramic",
  },
};
type Zone = keyof typeof zones;
type Category =
  | "Execution"
  | "Symbols & pricing"
  | "Server & accounts"
  | "Monitoring";
type Setting = { key: string; label: string; options: string[]; note: string };

const categories: {
  name: Category;
  icon: typeof ArrowsSplit;
  description: string;
}[] = [
  {
    name: "Execution",
    icon: ArrowsSplit,
    description: "External routing, aggregation and failover policy.",
  },
  {
    name: "Symbols & pricing",
    icon: SlidersHorizontal,
    description: "Precision, contract specifications and pricing profiles.",
  },
  {
    name: "Server & accounts",
    icon: Database,
    description: "Account groups, margin rules and platform connections.",
  },
  {
    name: "Monitoring",
    icon: Pulse,
    description: "Alert thresholds, event delivery and audit retention.",
  },
];

const settings: Record<Category, Setting[]> = {
  Execution: [
    {
      key: "aggregation",
      label: "Aggregation strategy",
      options: [
        "Best available price",
        "Weighted market depth",
        "Priority provider",
      ],
      note: "Quotes are sourced from external LPs.",
    },
    {
      key: "policy",
      label: "Order execution policy",
      options: ["IOC — immediate or cancel", "FOK — fill or kill"],
      note: "Applied after account and risk validation.",
    },
    {
      key: "timeout",
      label: "Provider timeout",
      options: ["500 ms", "1,000 ms", "2,000 ms"],
      note: "Timeout policy advances to the next eligible LP.",
    },
    {
      key: "failover",
      label: "Failover sequence",
      options: ["Primary → secondary → backup", "Primary → backup → secondary"],
      note: "All destinations use external A-book execution.",
    },
    {
      key: "slippage",
      label: "Slippage tolerance",
      options: ["2 points", "5 points", "10 points"],
      note: "Orders outside the configured tolerance require rejection.",
    },
    {
      key: "partial",
      label: "Partial-fill handling",
      options: ["Allow within risk limits", "Cancel unfilled remainder"],
      note: "Each accepted fill retains its execution reference.",
    },
    {
      key: "session",
      label: "Trading session",
      options: ["Instrument trading hours", "London + New York sessions"],
      note: "Session policy requires rejection outside configured hours.",
    },
  ],
  "Symbols & pricing": [
    {
      key: "precision",
      label: "Quote precision",
      options: ["5 digits — FX", "3 digits — metals", "2 digits — indices"],
      note: "Symbol-specific precision is explicit.",
    },
    {
      key: "spread",
      label: "Spread profile",
      options: ["Raw LP spread", "Raw + 1 point", "Raw + 2 points"],
      note: "The spread profile is separate from lot commission.",
    },
    {
      key: "commission",
      label: "Lot commission profile",
      options: [
        "$2.00 base + $5.00 extra",
        "$2.00 base + $3.00 extra",
        "$2.00 base + $0.00 extra",
      ],
      note: "Illustrative decimal amounts per lot; no settlement occurs.",
    },
    {
      key: "contract",
      label: "Contract size",
      options: [
        "FX — 100,000 units",
        "Gold — 100 ounces",
        "Index — 1 contract",
      ],
      note: "Contract specifications follow the selected symbol group.",
    },
    {
      key: "minlot",
      label: "Minimum order volume",
      options: ["0.01 lot", "0.10 lot", "1.00 lot"],
      note: "Server-side volume validation remains required.",
    },
    {
      key: "step",
      label: "Volume increment",
      options: ["0.01 lot", "0.10 lot"],
      note: "Orders must follow the configured volume increment.",
    },
    {
      key: "swap",
      label: "Financing profile",
      options: ["Provider financing schedule", "Swap-free eligible accounts"],
      note: "Eligibility and financing terms are account specific.",
    },
  ],
  "Server & accounts": [
    {
      key: "accountmode",
      label: "Position accounting",
      options: ["Hedging accounts", "Netting accounts"],
      note: "Matches the trading-platform account model.",
    },
    {
      key: "currency",
      label: "Account currency",
      options: ["USD", "EUR", "GBP"],
      note: "Balances and ledger entries retain their currency.",
    },
    {
      key: "leverage",
      label: "Group leverage",
      options: ["1:100", "1:50", "1:30"],
      note: "Effective margin follows symbol and account risk rules.",
    },
    {
      key: "margin",
      label: "Margin-call threshold",
      options: ["100%", "120%", "150%"],
      note: "Margin-call alerts use the selected account threshold.",
    },
    {
      key: "stopout",
      label: "Stop-out threshold",
      options: ["50%", "60%", "80%"],
      note: "Account risk enforcement is a required server policy.",
    },
    {
      key: "group",
      label: "Account group mapping",
      options: [
        "real / influencer / gold",
        "real / influencer / fx",
        "real / institutional",
      ],
      note: "Mapping remains scoped to the authenticated tenant.",
    },
    {
      key: "permission",
      label: "Platform connection scope",
      options: ["Orders + accounts + reports", "Accounts + reports only"],
      note: "Access is bounded by authenticated account ownership.",
    },
  ],
  Monitoring: [
    {
      key: "heartbeat",
      label: "Connection heartbeat",
      options: ["5 seconds", "10 seconds", "30 seconds"],
      note: "Missing heartbeats raise a connection alert.",
    },
    {
      key: "alert",
      label: "Reject-rate alert",
      options: ["Above 1%", "Above 2%", "Above 5%"],
      note: "The sample alert is scoped to the selected route.",
    },
    {
      key: "stale",
      label: "Stale-quote threshold",
      options: ["500 ms", "1,000 ms", "2,000 ms"],
      note: "Stale-quote policy excludes quotes beyond this threshold.",
    },
    {
      key: "delivery",
      label: "Event delivery",
      options: ["Versioned API + event stream", "Versioned API only"],
      note: "Transitions are persisted before events are published.",
    },
    {
      key: "retention",
      label: "Audit retention policy",
      options: ["7 years", "10 years"],
      note: "Audit and ledger records remain append-only.",
    },
    {
      key: "reports",
      label: "Reconciliation schedule",
      options: ["End of trading day", "Every 4 hours"],
      note: "Reconcile platform fills against external LP references.",
    },
    {
      key: "notify",
      label: "Alert recipients",
      options: ["Operations + risk owners", "Operations + risk + finance"],
      note: "The preview changes the draft only; no alerts are sent.",
    },
  ],
};
const initialSettings = Object.fromEntries(
  Object.values(settings)
    .flat()
    .map(({ key, options }) => [key, options[0]]),
);

const book = {
  EURUSD: [
    {
      bid: "1.07825",
      ask: "1.07831",
      buy: "12.40",
      sell: "10.20",
      bidWidth: 85,
      askWidth: 70,
    },
    {
      bid: "1.07824",
      ask: "1.07832",
      buy: "9.80",
      sell: "13.60",
      bidWidth: 67,
      askWidth: 93,
    },
    {
      bid: "1.07823",
      ask: "1.07833",
      buy: "7.50",
      sell: "8.90",
      bidWidth: 51,
      askWidth: 61,
    },
    {
      bid: "1.07822",
      ask: "1.07834",
      buy: "14.60",
      sell: "11.30",
      bidWidth: 100,
      askWidth: 77,
    },
  ],
  XAUUSD: [
    {
      bid: "2,643.120",
      ask: "2,643.280",
      buy: "5.20",
      sell: "6.40",
      bidWidth: 60,
      askWidth: 74,
    },
    {
      bid: "2,643.110",
      ask: "2,643.290",
      buy: "8.60",
      sell: "7.10",
      bidWidth: 100,
      askWidth: 83,
    },
    {
      bid: "2,643.100",
      ask: "2,643.300",
      buy: "4.80",
      sell: "5.90",
      bidWidth: 56,
      askWidth: 69,
    },
    {
      bid: "2,643.090",
      ask: "2,643.310",
      buy: "6.30",
      sell: "8.20",
      bidWidth: 73,
      askWidth: 95,
    },
  ],
};
const orders = [
  {
    id: "EX-10482",
    symbol: "XAUUSD",
    side: "Buy",
    volume: "0.50",
    source: "MT5 · #23192",
    status: "Routed",
    fill: "2,643.280",
  },
  {
    id: "EX-10481",
    symbol: "EURUSD",
    side: "Sell",
    volume: "1.00",
    source: "cTrader · #18273",
    status: "Routed",
    fill: "1.07825",
  },
  {
    id: "EX-10480",
    symbol: "GBPUSD",
    side: "Buy",
    volume: "0.25",
    source: "TradeLocker · #46281",
    status: "Risk review",
    fill: "—",
  },
];

/** All values and state are illustrative drafts; this component has no execution API. */
export function BrokerageView() {
  const formId = useId();
  const [zone, setZone] = useState<Zone>("London LD4");
  const [category, setCategory] = useState<Category>("Execution");
  const [draft, setDraft] = useState(initialSettings);
  const [symbol, setSymbol] = useState<keyof typeof book>("EURUSD");
  const [orderFilter, setOrderFilter] = useState("All orders");
  const [review, setReview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const route = zones[zone];
  const providers = [route.primary, route.secondary, route.backup];
  const visibleOrders = orders.filter(
    (order) => orderFilter === "All orders" || order.status === orderFilter,
  );

  function update(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setReview(false);
  }

  return (
    <section className="db-view" aria-label="Brokerage controls preview">
      <article
        className="db-panel db-routing"
        aria-label="External A-book route"
      >
        <div className="db-panel-heading">
          <div>
            <h3>A-book execution route</h3>
          </div>
          <label className="db-zone-label">
            Routing zone
            <select
              aria-label="Brokerage routing zone"
              value={zone}
              onChange={(event) => {
                setZone(event.target.value as Zone);
                setDirty(true);
                setReview(false);
              }}
            >
              <option>London LD4</option>
              <option>Amsterdam AMS</option>
              <option>London LD6</option>
            </select>
          </label>
        </div>
        <div className="db-route-legend">
          <span>
            <span className="db-dot" />
            Illustrative route
          </span>
          <span>{route.location}</span>
          <span>Risk checks enforced</span>
        </div>
        <div className="db-route-graph">
          <FlowTracks
            id="brokerage-routing-desktop"
            className="db-route-tracks db-tracks-desktop"
            viewBox="0 0 700 260"
            paths={[
              "M160 40 H228 Q247 40 247 65 V130 H285",
              "M160 130 H285",
              "M160 220 H228 Q247 220 247 195 V130 H285",
              "M415 130 H453 V65 Q453 40 478 40 H540",
              "M415 130 H540",
              "M415 130 H453 V195 Q453 220 478 220 H540",
            ]}
          />
          <FlowTracks
            id="brokerage-routing-mobile"
            className="db-route-tracks db-tracks-mobile"
            viewBox="0 0 300 330"
            paths={[
              "M50 88 V110 H150 V125",
              "M150 88 V125",
              "M250 88 V110 H150 V125",
              "M150 205 V225 H50 V242",
              "M150 205 V242",
              "M150 205 V225 H250 V242",
            ]}
          />
          <div className="db-route-column db-sources">
            {["MetaTrader 5", "cTrader", "TradeLocker"].map(
              (platform, index) => (
                <div className="db-node" key={platform}>
                  <div>
                    <strong>{platform}</strong>
                    <small>Adapter 0{index + 1}</small>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="db-engine-node">
            <span className="db-engine-icon">
              <ArrowsSplit size={25} weight="duotone" />
            </span>
            <strong>Azuriya router</strong>
            <small>{draft.aggregation}</small>
            <span className="db-engine-badge">
              <LockKey size={11} />
              A-book
            </span>
          </div>
          <div className="db-route-column db-providers">
            {providers.map((provider, index) => (
              <div
                className={`db-node db-provider-${index}`}
                key={`${provider}-${index}`}
              >
                <span className="db-provider-rank">0{index + 1}</span>
                <div>
                  <strong>{provider}</strong>
                  <small>
                    {index === 0
                      ? "Primary"
                      : index === 1
                        ? "Secondary"
                        : "Backup"}
                  </small>
                </div>
                <CheckCircle size={15} />
              </div>
            ))}
          </div>
        </div>
        <div className="db-route-bottom">
          <span>
            <ShieldCheck size={14} />
            Tenant ownership → order validation → margin & risk → external route
          </span>
          <span>No internal dealing desk</span>
        </div>
      </article>

      <div className="db-market-grid">
        <article
          className="db-panel db-depth"
          aria-label="Illustrative market depth"
        >
          <div className="db-panel-heading">
            <div>
              <h3>Market depth</h3>
            </div>
            <select
              aria-label="Market depth symbol"
              value={symbol}
              onChange={(event) =>
                setSymbol(event.target.value as keyof typeof book)
              }
            >
              <option>EURUSD</option>
              <option>XAUUSD</option>
            </select>
          </div>
          <div className="db-depth-labels">
            <span>Bid volume · lot</span>
            <span>Bid / Ask</span>
            <span>Ask volume · lot</span>
          </div>
          <div
            className="db-book"
            role="img"
            aria-label={`${symbol} illustrative four-level bid and ask market depth`}
          >
            {book[symbol].map((level) => (
              <div className="db-book-row" key={level.bid}>
                <span className="db-book-volume db-bid">
                  <i style={{ width: `${level.bidWidth}%` }} />
                  <b>{level.buy}</b>
                </span>
                <span className="db-book-prices">
                  <b>{level.bid}</b>
                  <b>{level.ask}</b>
                </span>
                <span className="db-book-volume db-ask">
                  <i style={{ width: `${level.askWidth}%` }} />
                  <b>{level.sell}</b>
                </span>
              </div>
            ))}
          </div>
          <div className="db-depth-footer">
            <span>4 displayed levels</span>
            <span>Static illustrative quotes</span>
          </div>
        </article>
        <article
          className="db-panel db-route-health"
          aria-label="Execution safeguards"
        >
          <div className="db-panel-heading">
            <div>
              <h3>Execution safeguards</h3>
            </div>
            <ShieldCheck size={20} weight="duotone" />
          </div>
          <div className="db-control-chain">
            {[
              "Tenant & account ownership",
              "Symbol & volume validation",
              "Margin & risk evaluation",
              "External LP confirmation",
            ].map((text, index) => (
              <div key={text}>
                <span>0{index + 1}</span>
                <strong>{text}</strong>
                <CheckCircle size={15} />
              </div>
            ))}
          </div>
          <p className="db-panel-footnote">
            Required checks stay enabled. Trading transitions must be persisted
            before versioned execution events are published.
          </p>
        </article>
      </div>

      <article
        className="db-panel db-configuration"
        aria-label="Brokerage configuration draft"
      >
        <div className="db-panel-heading">
          <div>
            <h3>Operational controls</h3>
          </div>
          <span className={`db-draft-state${dirty ? " is-dirty" : ""}`}>
            <span />
            {dirty ? "Draft changes" : "Example configuration"}
          </span>
        </div>
        <div
          className="db-control-tabs"
          role="tablist"
          aria-label="Brokerage control categories"
        >
          {categories.map(({ name, icon: Icon }, index) => (
            <button
              key={name}
              id={`${formId}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={category === name}
              aria-controls={`${formId}-controls`}
              tabIndex={category === name ? 0 : -1}
              onClick={() => setCategory(name)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next =
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      categories.length) %
                    categories.length;
                  setCategory(categories[next].name);
                  document.getElementById(`${formId}-tab-${next}`)?.focus();
                }
              }}
            >
              <Icon size={15} />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <div
          id={`${formId}-controls`}
          role="tabpanel"
          aria-labelledby={`${formId}-tab-${categories.findIndex(({ name }) => name === category)}`}
          className="db-control-content"
        >
          <p className="db-category-note">
            {categories.find(({ name }) => name === category)?.description}
          </p>
          <div className="db-setting-grid">
            {settings[category].map((setting) => (
              <label className="db-setting" key={setting.key}>
                <span>{setting.label}</span>
                <select
                  value={draft[setting.key]}
                  onChange={(event) => update(setting.key, event.target.value)}
                >
                  {setting.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
                <small>{setting.note}</small>
              </label>
            ))}
          </div>
        </div>
        <div className="db-config-footer">
          <span>
            <LockKey size={14} />
            A-book routing, risk validation and append-only audit are required.
          </span>
          <button
            type="button"
            className="db-review-button"
            onClick={() => setReview((current) => !current)}
            aria-expanded={review}
            aria-controls={`${formId}-review`}
          >
            Review configuration
            <ArrowRight size={15} />
          </button>
        </div>
        {review && (
          <section
            className="db-review"
            id={`${formId}-review`}
            aria-label="Brokerage configuration review"
          >
            <div>
              <h4>Draft configuration review</h4>
              <span>Preview only · no server changes</span>
            </div>
            <dl>
              <div>
                <dt>Routing zone</dt>
                <dd>{zone}</dd>
              </div>
              <div>
                <dt>Primary / secondary / backup</dt>
                <dd>{providers.join(" / ")}</dd>
              </div>
              {Object.values(settings)
                .flat()
                .map(({ key, label }) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{draft[key]}</dd>
                  </div>
                ))}
            </dl>
            <p>
              <CheckCircle size={14} />
              Required ownership, order validation, margin and risk checks
              remain enforced.
            </p>
          </section>
        )}
      </article>

      <article
        className="db-panel db-blotter"
        aria-label="Illustrative routed-order blotter"
      >
        <div className="db-panel-heading">
          <div>
            <h3>Routed-order blotter</h3>
          </div>
          <select
            aria-label="Execution trace filter"
            value={orderFilter}
            onChange={(event) => setOrderFilter(event.target.value)}
          >
            <option>All orders</option>
            <option>Routed</option>
            <option>Risk review</option>
          </select>
        </div>
        <div className="db-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Execution ID</th>
                <th>Instrument / side</th>
                <th>Volume</th>
                <th>Account source</th>
                <th>External route</th>
                <th>Fill price</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span className="db-execution-id">{order.id}</span>
                  </td>
                  <td>
                    <strong>{order.symbol}</strong>
                    <small
                      className={
                        order.side === "Buy" ? "db-positive" : "db-negative"
                      }
                    >
                      {order.side}
                    </small>
                  </td>
                  <td>{order.volume} lot</td>
                  <td>{order.source}</td>
                  <td>
                    {order.status === "Routed"
                      ? route.primary
                      : "Awaiting validation"}
                  </td>
                  <td>{order.fill}</td>
                  <td>
                    <span
                      className={`db-order-status${order.status === "Risk review" ? " is-review" : ""}`}
                    >
                      <span />
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="db-blotter-footer">
          <span>
            {visibleOrders.length} example{" "}
            {visibleOrders.length === 1 ? "order" : "orders"}
          </span>
          <span>Simulated execution · no orders sent</span>
        </div>
      </article>
    </section>
  );
}
