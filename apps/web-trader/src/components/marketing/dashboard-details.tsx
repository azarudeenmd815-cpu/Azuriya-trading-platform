"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bank,
  CheckCircle,
  Clock,
  CreditCard,
  GlobeHemisphereWest,
  LockKey,
  PlugsConnected,
  ShieldCheck,
  SlidersHorizontal,
  UsersThree,
} from "@phosphor-icons/react";

import { demoTotalCommission } from "./dashboard-fees";
import { AdminPortalControls } from "./dashboard-admin-controls";

const connections = [
  {
    name: "MetaTrader 5",
    file: "metatrader-5.png",
    accounts: "642",
    balance: "$1,284,920.00",
    region: "London · LD4",
    backend: "MT5 Manager API",
    state: "Connected",
    sync: "08:51:32",
    team: "Gold Elite",
  },
  {
    name: "cTrader",
    file: "ctrader.ico",
    accounts: "318",
    balance: "$628,450.00",
    region: "London · LD4",
    backend: "cTrader Open API",
    state: "Connected",
    sync: "08:51:30",
    team: "FX Intraday",
  },
  {
    name: "TradeLocker",
    file: "tradelocker.webp",
    accounts: "224",
    balance: "$412,800.00",
    region: "Amsterdam · AMS",
    backend: "TradeLocker API",
    state: "Connected",
    sync: "08:51:28",
    team: "Scalping Pro",
  },
  {
    name: "DXtrade",
    file: "dxtrade.png",
    accounts: "0",
    balance: "$0.00",
    region: "New connection",
    backend: "DXtrade API",
    state: "Configuration needed",
    sync: "Awaiting credentials",
    team: "Algo Team",
  },
];

type DemoTeam = string;

function Status({
  children,
  pending = false,
}: {
  children: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <span className={`dd-status ${pending ? "dd-status-pending" : ""}`}>
      {pending ? <Clock size={12} /> : <CheckCircle size={12} />} {children}
    </span>
  );
}

function PlatformLogo({ file, name }: { file: string; name: string }) {
  return (
    <span className="dd-platform-logo">
      <Image
        src={`/marketing/platforms/${file}`}
        alt={name}
        width={28}
        height={28}
        unoptimized
      />
    </span>
  );
}

export function OverviewOperations({
  team,
  lots,
  markup,
  revenue,
  commissionGroups,
  onView,
}: {
  team: DemoTeam;
  lots: string;
  markup: string | null;
  revenue: string;
  commissionGroups: { name: string; lots: string; markup: string }[];
  onView: (view: string) => void;
}) {
  const visibleConnections =
    team === "All teams"
      ? connections.slice(0, 3)
      : team === "Gold Elite"
        ? [{ ...connections[0], accounts: "542", balance: "$1,098,420.00" }]
        : team === "Algo Team"
          ? [{ ...connections[0], accounts: "100", balance: "$186,500.00" }]
          : connections.filter((connection) => connection.team === team);
  const visibleFunding = funding.filter(
    (item) => team === "All teams" || item.team === team,
  );
  const visibleActivity = activity
    .filter((item) => team === "All teams" || item.team === team)
    .slice(0, 3);
  return (
    <div className="dd-overview" data-dashboard-operations>
      <section className="dd-panel dd-commission-panel">
        <div className="dd-panel-title">
          <h3>Commission breakdown</h3>
          <button onClick={() => onView("Administration")}>
            Configure <SlidersHorizontal size={12} />
          </button>
        </div>
        <p className="dd-panel-note">Illustrative commission per traded lot</p>
        {markup !== null ? (
          <div className="dd-fee-equation">
            <span>
              <small>Base fee</small>
              <strong>$2.00</strong>
            </span>
            <i>+</i>
            <span>
              <small>Your markup</small>
              <strong>${markup}</strong>
            </span>
            <i>=</i>
            <span>
              <small>Trader pays</small>
              <strong>{demoTotalCommission(markup)}</strong>
            </span>
          </div>
        ) : (
          <div className="dd-group-rates">
            <p>Commission rates differ by group.</p>
            {commissionGroups.map((entry) => (
              <div key={entry.name}>
                <span>{entry.name}</span>
                <b>
                  ${entry.markup} markup{" "}
                  <small>{demoTotalCommission(entry.markup)} total / lot</small>
                </b>
              </div>
            ))}
          </div>
        )}
        <dl className="dd-key-values">
          <div>
            <dt>Selected volume</dt>
            <dd>{lots} lots</dd>
          </div>
          <div>
            <dt>Markup revenue</dt>
            <dd className="dd-positive">{revenue}</dd>
          </div>
          <div>
            <dt>Markup available</dt>
            <dd>Up to $5.00 / lot</dd>
          </div>
        </dl>
      </section>
      <section className="dd-panel dd-overview-funding">
        <div className="dd-panel-title">
          <h3>Funding & approvals</h3>
          <button onClick={() => onView("Funding")}>
            Open queue <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="dd-queue-metrics">
          <span>
            <b>
              {visibleFunding
                .filter(
                  (item) =>
                    item.type === "Withdrawal" &&
                    item.status === "Pending review",
                )
                .length.toString()
                .padStart(2, "0")}
            </b>
            Pending withdrawals
          </span>
          <span>
            <b>
              {visibleFunding
                .filter((item) => item.status === "Verification needed")
                .length.toString()
                .padStart(2, "0")}
            </b>
            Verification reviews
          </span>
        </div>
        <ul className="dd-compact-list">
          {visibleFunding.slice(0, 2).map((item) => (
            <li key={item.id}>
              {item.type === "Deposit" ? (
                <CreditCard size={16} />
              ) : (
                <Bank size={16} />
              )}
              <span>
                {item.type === "Deposit"
                  ? "Account deposit"
                  : "Withdrawal review"}
                <small>
                  Account {item.account} · {item.rail}
                </small>
              </span>
              <b className={item.type === "Deposit" ? "dd-positive" : ""}>
                {item.amount}
              </b>
            </li>
          ))}
        </ul>
      </section>
      <details className="dc-supporting-details dc-platform-detail">
        <summary>
          Platform balances <span>Inspect connected backends</span>
        </summary>
        <section className="dd-panel">
          <div className="dd-panel-title">
            <h3>Platform balances</h3>
            <button onClick={() => onView("Platforms")}>
              View backends <ArrowUpRight size={12} />
            </button>
          </div>
          <p className="dd-panel-note">
            Trading balances across connected account groups
          </p>
          <ul className="dd-platform-balances">
            {visibleConnections.map((connection) => (
              <li key={connection.name}>
                <PlatformLogo {...connection} />
                <span>
                  <strong>{connection.name}</strong>
                  <small>
                    {connection.accounts} accounts · {connection.region}
                  </small>
                </span>
                <b>{connection.balance}</b>
              </li>
            ))}
          </ul>
          <div className="dd-inline-note">
            <ShieldCheck size={13} />
            <span>A-book routing · individual account risk rules</span>
          </div>
        </section>
      </details>
      <details className="dc-supporting-details dc-activity-detail">
        <summary>
          Activity & risk <span>Inspect recent events</span>
        </summary>
        <section className="dd-panel dd-overview-activity">
          <div className="dd-panel-title">
            <h3>Activity & risk</h3>
            <Status>Controls active</Status>
          </div>
          <ol className="dd-activity">
            {visibleActivity.map((item) => (
              <li key={`${item.team}-${item.time}`}>
                <span
                  className={`dd-activity-dot ${item.review ? "dd-dot-amber" : ""}`}
                />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <time>{item.time}</time>
              </li>
            ))}
          </ol>
        </section>
      </details>
    </div>
  );
}

const activity = [
  {
    team: "Gold Elite",
    title: "Copy order synchronized",
    detail: "Gold Elite · 3 platform destinations",
    time: "08:51",
    review: false,
  },
  {
    team: "FX Intraday",
    title: "Daily loss check passed",
    detail: "Account #18273 · within 3.00% limit",
    time: "08:49",
    review: false,
  },
  {
    team: "Gold Elite",
    title: "Withdrawal requires review",
    detail: "Account #92731 · approval pending",
    time: "08:46",
    review: true,
  },
  {
    team: "FX Intraday",
    title: "Deposit balance recorded",
    detail: "Account #18273 · bank transfer verified",
    time: "08:32",
    review: false,
  },
  {
    team: "Scalping Pro",
    title: "Withdrawal requires review",
    detail: "Account #46281 · approval pending",
    time: "08:15",
    review: true,
  },
  {
    team: "Scalping Pro",
    title: "Position size checked",
    detail: "Scalping Pro · within 5.00 lot limit",
    time: "08:12",
    review: false,
  },
  {
    team: "Algo Team",
    title: "Deposit verification pending",
    detail: "Account #62714 · cardholder check needed",
    time: "08:02",
    review: true,
  },
  {
    team: "Algo Team",
    title: "Daily risk check passed",
    detail: "Algo Team · within 3.00% loss limit",
    time: "08:00",
    review: false,
  },
];

const funding = [
  {
    id: "PAY-1048",
    account: "#23192",
    team: "Gold Elite",
    type: "Deposit",
    rail: "MT5 · card gateway",
    amount: "+$1,000.00",
    status: "Completed",
    time: "08:51",
  },
  {
    id: "PAY-1047",
    account: "#92731",
    team: "Gold Elite",
    type: "Withdrawal",
    rail: "Bank transfer",
    amount: "$750.00",
    status: "Pending review",
    time: "08:46",
  },
  {
    id: "PAY-1046",
    account: "#18273",
    team: "FX Intraday",
    type: "Deposit",
    rail: "Portal · bank transfer",
    amount: "+$2,500.00",
    status: "Completed",
    time: "08:32",
  },
  {
    id: "PAY-1045",
    account: "#46281",
    team: "Scalping Pro",
    type: "Withdrawal",
    rail: "Bank transfer",
    amount: "$320.00",
    status: "Pending review",
    time: "08:15",
  },
  {
    id: "PAY-1044",
    account: "#62714",
    team: "Algo Team",
    type: "Deposit",
    rail: "MT5 · card gateway",
    amount: "+$500.00",
    status: "Verification needed",
    time: "08:02",
  },
];

export function FundingView({ team }: { team: DemoTeam }) {
  const [type, setType] = useState("All transactions");
  const [status, setStatus] = useState("All statuses");
  const filtered = funding.filter(
    (item) =>
      (team === "All teams" || item.team === team) &&
      (type === "All transactions" || type === item.type) &&
      (status === "All statuses" || item.status === status),
  );
  return (
    <div className="dd-view">
      <div className="dd-funding-banner">
        <span className="dd-feature-icon">
          <CreditCard size={24} />
        </span>
        <div>
          <h3>Deposit directly from MetaTrader 5</h3>
          <p>
            Desktop and mobile funding through your configured payment gateway.
          </p>
        </div>
        <Link href="/mt5-deposits">
          Explore MT5 deposits <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="dd-panel">
        <div className="dd-panel-title">
          <h3>Payment activity</h3>
          <span className="dd-muted">
            {filtered.length} example transactions
          </span>
        </div>
        <div className="dd-toolbar">
          <label>
            Transaction type
            <select
              aria-label="Transaction type"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option>All transactions</option>
              <option>Deposit</option>
              <option>Withdrawal</option>
            </select>
          </label>
          <label>
            Payment status
            <select
              aria-label="Payment status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option>All statuses</option>
              <option>Completed</option>
              <option>Pending review</option>
              <option>Verification needed</option>
            </select>
          </label>
        </div>
        <div className="dd-payment-list" aria-live="polite">
          {filtered.map((item) => (
            <article key={item.id}>
              <span
                className={`dd-payment-direction ${item.type === "Deposit" ? "dd-incoming" : ""}`}
              >
                {item.type === "Deposit" ? (
                  <ArrowDownLeft size={17} />
                ) : (
                  <ArrowUpRight size={17} />
                )}
              </span>
              <div>
                <strong>
                  {item.type} · {item.account}
                </strong>
                <small>
                  {item.id} · {item.rail} · {item.team}
                </small>
              </div>
              <span className="dd-payment-amount">
                <b>{item.amount}</b>
                <time>{item.time}</time>
              </span>
              <Status pending={item.status !== "Completed"}>
                {item.status}
              </Status>
            </article>
          ))}
          {filtered.length === 0 && (
            <p className="dd-no-results">
              No example payments match these filters.
            </p>
          )}
        </div>
      </div>
      <div className="dd-two-columns">
        <section className="dd-panel">
          <div className="dd-panel-title">
            <h3>Payment rules</h3>
            <ShieldCheck size={17} />
          </div>
          <dl className="dd-key-values">
            <div>
              <dt>Account ownership</dt>
              <dd>Required</dd>
            </div>
            <div>
              <dt>Large withdrawal review</dt>
              <dd>Above $5,000.00</dd>
            </div>
            <div>
              <dt>Cardholder verification</dt>
              <dd>Enabled</dd>
            </div>
            <div>
              <dt>Accepted currencies</dt>
              <dd>USD · EUR · GBP</dd>
            </div>
          </dl>
        </section>
        <section className="dd-panel">
          <div className="dd-panel-title">
            <h3>Settlement & records</h3>
            <LockKey size={17} />
          </div>
          <dl className="dd-key-values">
            <div>
              <dt>Deposit callback</dt>
              <dd>Verification required</dd>
            </div>
            <div>
              <dt>Balance transition</dt>
              <dd>Recorded atomically</dd>
            </div>
            <div>
              <dt>Ledger & audit</dt>
              <dd>Append-only</dd>
            </div>
            <div>
              <dt>Preview status</dt>
              <dd>No money movement</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

export function AdministrationView({
  team,
  onTeam,
  markup,
  onMarkup,
  leverage,
  onLeverage,
}: {
  team: string;
  onTeam: (team: string) => void;
  markup: string;
  onMarkup: (markup: string) => void;
  leverage: string;
  onLeverage: (leverage: string) => void;
}) {
  const group = team === "All teams" ? "Gold Elite" : team;
  return (
    <div className="dd-view">
      <div className="dd-panel dd-admin-group">
        <div className="dd-panel-title">
          <h3>Account group configuration</h3>
          <span className="dd-muted">Local preview controls</span>
        </div>
        <div className="dd-toolbar">
          <label>
            Configuration group
            <select
              aria-label="Configuration group"
              value={group}
              onChange={(event) => onTeam(event.target.value)}
            >
              {["Gold Elite", "FX Intraday", "Scalping Pro", "Algo Team"].map(
                (name) => (
                  <option key={name}>{name}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Group leverage
            <select
              aria-label="Group leverage"
              value={leverage}
              onChange={(event) => onLeverage(event.target.value)}
            >
              {["1:30", "1:50", "1:100", "1:200"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Extra markup per lot
            <select
              aria-label="Extra markup per lot"
              value={markup}
              onChange={(event) => onMarkup(event.target.value)}
            >
              {[
                "0.50",
                "1.00",
                "1.50",
                "2.00",
                "2.50",
                "3.00",
                "4.00",
                "5.00",
              ].map((value) => (
                <option value={value} key={value}>
                  ${value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dd-admin-fees">
          <span>
            Base commission{" "}
            <b>
              $2.00 <small>/ lot</small>
            </b>
          </span>
          <i>+</i>
          <span>
            Extra markup{" "}
            <b>
              ${markup} <small>/ lot</small>
            </b>
          </span>
          <i>=</i>
          <span className="dd-admin-total">
            Trader commission{" "}
            <b>
              {demoTotalCommission(markup)} <small>/ lot</small>
            </b>
          </span>
        </div>
      </div>
      <AdminPortalControls
        key={group}
        group={group}
        markup={markup}
        leverage={leverage}
      />
      <div className="dd-inline-note dd-admin-disclosure">
        <LockKey size={14} />
        <span>
          These controls change this example only. Live changes require
          authenticated administrator access and server validation.
        </span>
      </div>
    </div>
  );
}

export function PlatformsView() {
  const [status, setStatus] = useState("All connections");
  const filtered = connections.filter(
    (connection) => status === "All connections" || connection.state === status,
  );
  return (
    <div className="dd-view">
      <section className="dd-panel">
        <div className="dd-panel-title">
          <h3>Trading platform backends</h3>
          <label className="dd-inline-filter">
            <span className="az-sr-only">Platform connection status</span>
            <select
              aria-label="Platform connection status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option>All connections</option>
              <option>Connected</option>
              <option>Configuration needed</option>
            </select>
          </label>
        </div>
        <p className="dd-panel-note">
          Illustrative connection inventory. Credentials and permissions
          determine available platform operations.
        </p>
        <div className="dd-connections" aria-live="polite">
          {filtered.map((connection) => (
            <article key={connection.name}>
              <div className="dd-connection-heading">
                <PlatformLogo {...connection} />
                <span>
                  <h4>{connection.name}</h4>
                  <small>{connection.backend}</small>
                </span>
                <Status pending={connection.state !== "Connected"}>
                  {connection.state}
                </Status>
              </div>
              <dl>
                <div>
                  <dt>Account group</dt>
                  <dd>{connection.team}</dd>
                </div>
                <div>
                  <dt>Connected accounts</dt>
                  <dd>{connection.accounts}</dd>
                </div>
                <div>
                  <dt>Region</dt>
                  <dd>{connection.region}</dd>
                </div>
                <div>
                  <dt>Last sync</dt>
                  <dd>{connection.sync}</dd>
                </div>
              </dl>
              <div className="dd-connection-capabilities">
                <span>Accounts</span>
                <span>Trades</span>
                <span>Risk rules</span>
                {connection.name === "MetaTrader 5" && <span>MT5 funding</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="dd-panel">
        <div className="dd-panel-title">
          <h3>One portal for the entire operation</h3>
          <GlobeHemisphereWest size={18} />
        </div>
        <ul className="dd-service-list">
          <li>
            <PlugsConnected size={17} />
            <span>
              <strong>Platform connectors</strong>
              <small>Account and trade management through versioned APIs</small>
            </span>
            <Status>3 example connections</Status>
          </li>
          <li>
            <ShieldCheck size={17} />
            <span>
              <strong>Risk & permissions</strong>
              <small>
                Tenant ownership, account limits and administrator roles
              </small>
            </span>
            <Status>Checked per request</Status>
          </li>
          <li>
            <UsersThree size={17} />
            <span>
              <strong>Community workspace</strong>
              <small>
                Teams, channels and member access alongside trading tools
              </small>
            </span>
            <Status>Shared portal</Status>
          </li>
        </ul>
      </section>
    </div>
  );
}
