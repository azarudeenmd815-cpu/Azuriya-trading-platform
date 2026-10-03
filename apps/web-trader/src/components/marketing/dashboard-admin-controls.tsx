"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowsClockwise,
  Bank,
  Check,
  CheckCircle,
  CreditCard,
  FileText,
  Fingerprint,
  GlobeHemisphereWest,
  HardDrives,
  LockKey,
  ShieldCheck,
  SlidersHorizontal,
  TreeStructure,
  UsersThree,
} from "@phosphor-icons/react";

import "./dashboard-admin-controls.css";

const categories = [
  {
    name: "Access & roles",
    icon: Fingerprint,
    description: "Delegate work within the selected account group.",
  },
  {
    name: "Instruments",
    icon: SlidersHorizontal,
    description: "Inspect symbol, session and order policies.",
  },
  {
    name: "Payments",
    icon: CreditCard,
    description: "Set regional payment preferences and approval thresholds.",
  },
  {
    name: "Operations",
    icon: HardDrives,
    description: "Inspect adapters, event delivery and reporting preferences.",
  },
] as const;

type Category = (typeof categories)[number]["name"];

const initialDraft = {
  role: "Community owner",
  visibility: "Assigned account groups",
  session: "30 minutes",
  accounts: "Enabled",
  reports: "Enabled",
  announcements: "Enabled",
  payments: "Enabled",
  configuration: "Enabled",
  symbol: "XAUUSD",
  sessionZone: "UTC",
  tradingSession: "Weekdays · 00:05–23:55",
  minimumVolume: "0.01 lot",
  volumeStep: "0.01 lot",
  maximumVolume: "5.00 lots",
  filling: "Fill or kill (FOK)",
  expiry: "Good till cancelled",
  stopDistance: "20 points",
  priceDigits: "2 digits",
  region: "United Kingdom / EEA",
  currencies: "USD · EUR · GBP",
  depositMethod: "Card + bank transfer",
  withdrawalMethod: "Verified bank account",
  depositMinimum: "$100.00",
  approvalThreshold: "$5,000.00",
  feePolicy: "Provider fee shown separately",
  settlement: "Original payment currency",
  paymentEmail: "Enabled",
  adapter: "MT5 Manager API",
  sync: "Every 30 seconds",
  callback: "Versioned webhook · v1",
  retries: "3 attempts · exponential backoff",
  reportTime: "Daily · 23:59 UTC",
  reportFormat: "CSV + PDF",
  operationsEmail: "Enabled",
  communityNotices: "Enabled",
} satisfies Record<string, string>;

type DraftKey = keyof typeof initialDraft;
type Draft = Record<DraftKey, string>;

const labels: Record<DraftKey, string> = {
  role: "Operator role",
  visibility: "Workspace visibility",
  session: "Session timeout",
  accounts: "Account administration",
  reports: "Report exports",
  announcements: "Community announcements",
  payments: "Payment queue access",
  configuration: "Configuration drafts",
  symbol: "Instrument",
  sessionZone: "Session timezone",
  tradingSession: "Trading session",
  minimumVolume: "Minimum order volume",
  volumeStep: "Volume step",
  maximumVolume: "Maximum order volume",
  filling: "Order filling policy",
  expiry: "Pending order expiry",
  stopDistance: "Minimum stop distance",
  priceDigits: "Quote precision",
  region: "Payment region",
  currencies: "Accepted currencies",
  depositMethod: "Deposit methods",
  withdrawalMethod: "Withdrawal destination",
  depositMinimum: "Minimum deposit",
  approvalThreshold: "Manual review threshold",
  feePolicy: "Payment fee disclosure",
  settlement: "Settlement currency",
  paymentEmail: "Payment receipt emails",
  adapter: "Backend adapter",
  sync: "Account sync interval",
  callback: "Event delivery",
  retries: "Callback retry policy",
  reportTime: "Statement schedule",
  reportFormat: "Statement format",
  operationsEmail: "Operations email alerts",
  communityNotices: "Community service notices",
};

const permissionKeys = [
  "accounts",
  "reports",
  "announcements",
  "payments",
  "configuration",
] as const;
const roles = ["Community owner", "Operations manager", "Analyst"];
const rolePermissions: Record<string, readonly DraftKey[]> = {
  "Community owner": permissionKeys,
  "Operations manager": ["accounts", "reports", "payments", "configuration"],
  Analyst: ["reports"],
};

type FieldDefinition = {
  key: DraftKey;
  options: readonly string[];
  detail?: string;
};

const instrumentFields: FieldDefinition[] = [
  {
    key: "symbol",
    options: ["XAUUSD", "EURUSD", "GBPUSD", "US500"],
    detail: "Policy applies to this example symbol.",
  },
  { key: "sessionZone", options: ["UTC", "Europe/London", "America/New_York"] },
  {
    key: "tradingSession",
    options: [
      "Weekdays · 00:05–23:55",
      "London session · 08:00–16:30",
      "New York session · 13:30–20:00",
    ],
  },
  { key: "minimumVolume", options: ["0.01 lot", "0.10 lot", "0.50 lot"] },
  { key: "volumeStep", options: ["0.01 lot", "0.10 lot", "0.50 lot"] },
  { key: "maximumVolume", options: ["5.00 lots", "10.00 lots", "20.00 lots"] },
  {
    key: "filling",
    options: [
      "Fill or kill (FOK)",
      "Immediate or cancel (IOC)",
      "Return remaining volume",
    ],
  },
  {
    key: "expiry",
    options: ["Good till cancelled", "End of trading day", "Specified expiry"],
  },
  { key: "stopDistance", options: ["20 points", "30 points", "50 points"] },
  { key: "priceDigits", options: ["2 digits", "3 digits", "5 digits"] },
];

const paymentFields: FieldDefinition[] = [
  {
    key: "region",
    options: [
      "United Kingdom / EEA",
      "United Arab Emirates",
      "Provider-approved regions",
    ],
  },
  { key: "currencies", options: ["USD · EUR · GBP", "USD · AED", "USD only"] },
  {
    key: "depositMethod",
    options: [
      "Card + bank transfer",
      "Bank transfer only",
      "Configured local methods",
    ],
  },
  {
    key: "withdrawalMethod",
    options: ["Verified bank account", "Original payment method"],
  },
  { key: "depositMinimum", options: ["$100.00", "$250.00", "$500.00"] },
  {
    key: "approvalThreshold",
    options: ["$5,000.00", "$2,500.00", "$1,000.00"],
    detail: "Example trigger for an additional manual review.",
  },
  {
    key: "feePolicy",
    options: ["Provider fee shown separately", "Broker covers provider fee"],
  },
  {
    key: "settlement",
    options: ["Original payment currency", "Trading account currency"],
  },
];

const operationFields: FieldDefinition[] = [
  {
    key: "adapter",
    options: ["MT5 Manager API", "cTrader Open API", "TradeLocker API"],
  },
  {
    key: "sync",
    options: ["Every 30 seconds", "Every 60 seconds", "Every 5 minutes"],
  },
  {
    key: "callback",
    options: ["Versioned webhook · v1", "Versioned event stream · v1"],
  },
  {
    key: "retries",
    options: [
      "3 attempts · exponential backoff",
      "5 attempts · exponential backoff",
    ],
  },
  {
    key: "reportTime",
    options: [
      "Daily · 23:59 UTC",
      "Weekly · Friday 23:59 UTC",
      "Monthly · last day 23:59 UTC",
    ],
  },
  { key: "reportFormat", options: ["CSV + PDF", "CSV only", "PDF only"] },
];

function FixedControl({ children }: { children: ReactNode }) {
  return (
    <span className="da-fixed">
      <LockKey size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

export function AdminPortalControls({
  group,
  markup,
  leverage,
}: {
  group: string;
  markup: string;
  leverage: string;
}) {
  const [category, setCategory] = useState<Category>("Access & roles");
  const [draft, setDraft] = useState<Draft>({ ...initialDraft });
  const [review, setReview] = useState<Draft | null>(null);
  const categoryInfo = categories.find((entry) => entry.name === category)!;
  const CategoryIcon = categoryInfo.icon;
  const changes = (Object.keys(initialDraft) as DraftKey[]).filter(
    (key) => draft[key] !== initialDraft[key],
  );

  const change = (key: DraftKey, value: string) => {
    setDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "role") {
        for (const permission of permissionKeys) {
          next[permission] = rolePermissions[value].includes(permission)
            ? "Enabled"
            : "Disabled";
        }
      }
      return next;
    });
    setReview(null);
  };

  const field = ({ key, options, detail }: FieldDefinition) => (
    <label className="da-field" key={key}>
      <span>{labels[key]}</span>
      <select
        aria-label={labels[key]}
        value={draft[key]}
        onChange={(event) => change(key, event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      {detail && <small>{detail}</small>}
    </label>
  );

  const toggle = (key: DraftKey, detail: string) => (
    <label className="da-toggle" key={key}>
      <span>
        <strong>{labels[key]}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        aria-label={labels[key]}
        checked={draft[key] === "Enabled"}
        onChange={(event) =>
          change(key, event.target.checked ? "Enabled" : "Disabled")
        }
      />
    </label>
  );

  return (
    <section
      className="da-controls"
      aria-label="Admin portal configuration preview"
    >
      <details className="dc-supporting-details da-scope-details">
        <summary>
          Group and adapter scope{" "}
          <span>
            {group} · {draft.adapter}
          </span>
        </summary>
        <div className="da-control-plane">
          <div className="da-plane-heading">
            <span className="da-plane-icon">
              <TreeStructure size={22} aria-hidden="true" />
            </span>
            <div>
              <h3>Group and adapter scope</h3>
              <p>Admin Portal → versioned APIs → platform adapters</p>
            </div>
            <span className="da-example">Preview only</span>
          </div>
          <div
            className="da-topology"
            aria-label="Tenant-scoped admin and backend relationships"
          >
            <svg
              viewBox="0 0 720 112"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M110 56H360M360 56H610M360 36V76" />
              <circle cx="226" cy="56" r="4" />
              <circle cx="492" cy="56" r="4" />
            </svg>
            <div className="da-node">
              <span>
                <UsersThree size={18} aria-hidden="true" />
              </span>
              <strong>{group}</strong>
              <small>Tenant + account group</small>
            </div>
            <div className="da-node da-node-primary">
              <span>
                <Fingerprint size={18} aria-hidden="true" />
              </span>
              <strong>Admin Portal</strong>
              <small>{draft.role}</small>
            </div>
            <div className="da-node">
              <span>
                <HardDrives size={18} aria-hidden="true" />
              </span>
              <strong>{draft.adapter}</strong>
              <small>Validated adapter requests</small>
            </div>
          </div>
          <div className="da-context">
            <span>
              Group <b>{group}</b>
            </span>
            <span>
              Leverage <b>{leverage}</b>
            </span>
            <span>
              Extra markup <b>${markup} / lot</b>
            </span>
            <span>
              API contract <b>v1</b>
            </span>
          </div>
        </div>
      </details>

      <div
        className="da-segments"
        role="group"
        aria-label="Admin configuration categories"
      >
        {categories.map(({ name, icon: Icon }) => (
          <button
            type="button"
            key={name}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            <Icon size={16} aria-hidden="true" />
            {name}
          </button>
        ))}
      </div>

      <div className="da-category-heading">
        <span className="da-category-icon">
          <CategoryIcon size={18} aria-hidden="true" />
        </span>
        <div>
          <h3>{category}</h3>
          <p>{categoryInfo.description}</p>
        </div>
        <span>{changes.length} draft changes</span>
      </div>

      {category === "Access & roles" && (
        <div className="da-access-grid">
          <section className="da-panel">
            <h4>Operator assignment</h4>
            <div className="da-fields">
              {field({ key: "role", options: roles })}
              {field({
                key: "visibility",
                options: [
                  "Assigned account groups",
                  "Assigned community workspace",
                ],
              })}
              {field({
                key: "session",
                options: ["15 minutes", "30 minutes", "60 minutes"],
              })}
            </div>
            <div className="da-toggle-list">
              {toggle(
                "accounts",
                "View account details and prepare administration requests.",
              )}
              {toggle("reports", "Export reports for the assigned group.")}
              {toggle(
                "announcements",
                "Prepare messages for assigned community channels.",
              )}
              {toggle(
                "payments",
                "Inspect payment requests; approval safeguards stay required.",
              )}
              {toggle(
                "configuration",
                "Prepare settings for an authorized operator review.",
              )}
            </div>
          </section>
          <section className="da-panel da-permissions">
            <h4>Role capability matrix</h4>
            <p className="da-muted">
              Example grants for the selected operator.
            </p>
            <div className="da-matrix-scroll">
              <table>
                <caption className="az-sr-only">
                  Example role permissions
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    {roles.map((role) => (
                      <th
                        scope="col"
                        key={role}
                        className={
                          draft.role === role ? "da-selected-column" : ""
                        }
                      >
                        {role === "Community owner"
                          ? "Owner"
                          : role === "Operations manager"
                            ? "Ops"
                            : "Analyst"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionKeys.map((key) => (
                    <tr key={key}>
                      <th scope="row">{labels[key]}</th>
                      {roles.map((role) => {
                        const enabled =
                          role === draft.role
                            ? draft[key] === "Enabled"
                            : rolePermissions[role].includes(key);
                        return (
                          <td
                            key={role}
                            className={
                              draft.role === role ? "da-selected-column" : ""
                            }
                          >
                            {enabled ? (
                              <span className="da-granted">
                                <Check size={13} aria-hidden="true" />
                                <span className="az-sr-only">Granted</span>
                              </span>
                            ) : (
                              <span aria-label="Not granted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="da-scope-card">
              <ShieldCheck size={28} aria-hidden="true" />
              <strong>Assigned scope only</strong>
              <p>
                Requests require authenticated tenant and account ownership.
                Permissions remain within the assigned scope.
              </p>
            </div>
          </section>
        </div>
      )}

      {category === "Instruments" && (
        <div className="da-policy-layout">
          <section className="da-panel">
            <h4>Symbol & execution policy</h4>
            <div className="da-fields">{instrumentFields.map(field)}</div>
          </section>
          <aside className="da-panel da-policy-preview">
            <span className="da-preview-overline">Symbol policy preview</span>
            <h4>{draft.symbol}</h4>
            <span className="da-instrument-subtitle">
              {group} · A-book routing
            </span>
            <svg
              className="da-order-graphic"
              viewBox="0 0 260 126"
              role="img"
              aria-label="Illustrative price candles inside a validated order range"
            >
              <path
                className="da-chart-grid"
                d="M10 26H250M10 63H250M10 100H250"
              />
              <path className="da-price-range" d="M12 28H248V99H12Z" />
              <g className="da-candle-wicks">
                <path d="M32 82V106M61 63V95M90 47V82M119 43V81M148 37V71M177 25V62M206 16V53M235 25V62" />
              </g>
              <g className="da-candle-bodies">
                <rect x="26" y="89" width="12" height="13" />
                <rect x="55" y="70" width="12" height="18" />
                <rect x="84" y="54" width="12" height="22" />
                <rect x="113" y="51" width="12" height="24" />
                <rect x="142" y="44" width="12" height="21" />
                <rect x="171" y="32" width="12" height="23" />
                <rect x="200" y="23" width="12" height="24" />
                <rect x="229" y="34" width="12" height="21" />
              </g>
            </svg>
            <dl className="da-preview-values">
              <div>
                <dt>Volume range</dt>
                <dd>
                  {draft.minimumVolume} – {draft.maximumVolume}
                </dd>
              </div>
              <div>
                <dt>Filling</dt>
                <dd>{draft.filling}</dd>
              </div>
              <div>
                <dt>Stop distance</dt>
                <dd>{draft.stopDistance}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{draft.tradingSession}</dd>
              </div>
            </dl>
            <FixedControl>
              Order validation + pre-trade risk required
            </FixedControl>
          </aside>
        </div>
      )}

      {category === "Payments" && (
        <div className="da-policy-layout">
          <section className="da-panel">
            <h4>Wallet & regional preferences</h4>
            <div className="da-fields">{paymentFields.map(field)}</div>
            <div className="da-toggle-list">
              {toggle(
                "paymentEmail",
                "Send an illustrative receipt after a recorded payment transition.",
              )}
            </div>
          </section>
          <aside className="da-panel da-payment-preview">
            <span className="da-preview-overline">Payment workflow</span>
            <h4>Deposit processing</h4>
            <ol className="da-process">
              <li>
                <span>
                  <CreditCard size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>MT5 / portal request</strong>
                  <small>
                    {draft.depositMethod}
                    <br />
                    {draft.currencies}
                  </small>
                </div>
              </li>
              <li>
                <span>
                  <GlobeHemisphereWest size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>Configured payment provider</strong>
                  <small>
                    {draft.region}
                    <br />
                    {draft.feePolicy}
                  </small>
                </div>
              </li>
              <li>
                <span>
                  <Bank size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>Verification + approval</strong>
                  <small>
                    Additional manual review above {draft.approvalThreshold}
                  </small>
                </div>
              </li>
              <li>
                <span>
                  <CheckCircle size={18} aria-hidden="true" />
                </span>
                <div>
                  <strong>Atomic ledger transition</strong>
                  <small>Append-only records, then versioned event</small>
                </div>
              </li>
            </ol>
            <FixedControl>
              Cardholder + account verification required
            </FixedControl>
            <p className="da-muted">
              Methods and regions depend on the configured provider. This
              preview submits no payment requests.
            </p>
          </aside>
        </div>
      )}

      {category === "Operations" && (
        <div className="da-policy-layout">
          <section className="da-panel">
            <h4>Backend & delivery preferences</h4>
            <div className="da-fields">{operationFields.map(field)}</div>
            <div className="da-toggle-list">
              {toggle(
                "operationsEmail",
                "Notify operators about adapter errors and review queues.",
              )}
              {toggle(
                "communityNotices",
                "Publish scheduled service notices to the assigned community.",
              )}
            </div>
          </section>
          <aside className="da-panel da-operation-preview">
            <span className="da-preview-overline">Event delivery</span>
            <h4>Backend processing</h4>
            <div className="da-operation-service">
              <HardDrives size={26} aria-hidden="true" />
              <strong>{draft.adapter}</strong>
              <small>{draft.sync}</small>
            </div>
            <ol className="da-operation-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>Validate scope + risk</strong>
                  <small>Required before transition</small>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Persist transaction</strong>
                  <small>Atomic state + append-only audit</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Publish event v1</strong>
                  <small>{draft.callback}</small>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>Retry + reconcile</strong>
                  <small>{draft.retries}</small>
                </div>
              </li>
            </ol>
            <div className="da-delivery-report">
              <FileText size={17} aria-hidden="true" />
              <span>
                {draft.reportFormat}
                <small>{draft.reportTime}</small>
              </span>
            </div>
          </aside>
        </div>
      )}

      <div className="da-safeguards" aria-label="Required platform safeguards">
        <FixedControl>Authenticated ownership</FixedControl>
        <FixedControl>Pre-trade risk checks</FixedControl>
        <FixedControl>Append-only audit</FixedControl>
        <FixedControl>Atomic ledger writes</FixedControl>
      </div>
      <div className="da-review-actions">
        <p>
          {review
            ? "Draft reviewed locally. No settings were applied."
            : "Example settings only. Review the draft before any real authorized change."}
        </p>
        <div>
          <button
            type="button"
            className="da-reset"
            onClick={() => {
              setDraft({ ...initialDraft });
              setReview(null);
            }}
          >
            <ArrowsClockwise size={14} aria-hidden="true" />
            Reset draft
          </button>
          <button
            type="button"
            className="da-review-button"
            onClick={() => setReview({ ...draft })}
          >
            Review configuration
            <FileText size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {review && (
        <section
          className="da-review-summary"
          aria-label="Configuration review summary"
          aria-live="polite"
        >
          <div className="da-review-heading">
            <CheckCircle size={19} aria-hidden="true" />
            <div>
              <h4>Configuration review</h4>
              <p>
                {group} · {changes.length} changes from the example defaults
              </p>
            </div>
            <span>Local draft</span>
          </div>
          {changes.length ? (
            <dl>
              {changes.map((key) => (
                <div key={key}>
                  <dt>{labels[key]}</dt>
                  <dd>
                    <s>{initialDraft[key]}</s>
                    <span>→</span>
                    <strong>{review[key]}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="da-muted">
              No changes to review. Adjust an option above to inspect a
              configuration diff.
            </p>
          )}
          <p className="da-review-footnote">
            <LockKey size={13} aria-hidden="true" />
            Ownership, order validation, risk checks and ledger safeguards
            remain required.
          </p>
        </section>
      )}
    </section>
  );
}
