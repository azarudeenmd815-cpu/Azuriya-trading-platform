"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Bank,
  ChartLineUp,
  ChartPieSlice,
  ChatCircleDots,
  CheckCircle,
  Copy,
  CurrencyDollar,
  DiamondsFour,
  GearSix,
  MagnifyingGlass,
  Pause,
  Play,
  PlugsConnected,
  ShieldCheck,
  SquaresFour,
  TrendUp,
  Trophy,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";
import { MarketingBrand } from "./brand";
import { FooterBrandMark } from "./footer-brand-mark";
import {
  AdministrationView,
  FundingView,
  OverviewOperations,
  PlatformsView,
} from "./dashboard-details";
import { demoAggregateCommission, demoAggregateVolume } from "./dashboard-fees";
import { BrokerageView } from "./dashboard-brokerage";
import { PropFirmView } from "./dashboard-prop-firm";
import {
  CommunityView,
  type CommunityDestination,
} from "./dashboard-community";
import { DashboardTeams } from "./dashboard-teams";
import { DashboardTeamPulse } from "./dashboard-team-pulse";
import { DashboardTradingJournal } from "./dashboard-trading-journal";
import { DashboardCommunityVolume } from "./dashboard-reference-graphs";
import { useMarketingTheme } from "./marketing-theme";
import {
  DashboardCopyNetwork,
  DashboardOperationsVisual,
  DashboardSparkline,
  DashboardVolumeBreakdown,
  DashboardWorkspaceShortcuts,
} from "./dashboard-visuals";
import "./dashboard-details.css";
import "./dashboard-console.css";
import "./dashboard-theme.css";
import "./dashboard-laptop.css";

const teams = [
  {
    name: "Gold Elite",
    short: "GE",
    people: "380",
    accounts: "542",
    symbol: "XAUUSD",
    pnl: "+$12,480.00",
    volume: { "1W": "2,398", "1M": "8,920", "3M": "24,330" },
    color: "gold",
    master: "ALEX-GOLD-01",
    trader: "Alex Morgan",
    initials: "AM",
    followers: "324",
  },
  {
    name: "FX Intraday",
    short: "FX",
    people: "216",
    accounts: "318",
    symbol: "EURUSD",
    pnl: "+$6,842.00",
    volume: { "1W": "880", "1M": "3,284", "3M": "8,950" },
    color: "blue",
    master: "JAMES-FX-01",
    trader: "James Carter",
    initials: "JC",
    followers: "184",
  },
  {
    name: "Scalping Pro",
    short: "SP",
    people: "142",
    accounts: "224",
    symbol: "GBPUSD",
    pnl: "+$3,218.00",
    volume: { "1W": "390", "1M": "1,460", "3M": "3,990" },
    color: "purple",
    master: "RYAN-SCALP-01",
    trader: "Ryan Mitchell",
    initials: "RM",
    followers: "92",
  },
  {
    name: "Algo Team",
    short: "AT",
    people: "85",
    accounts: "100",
    symbol: "EURUSD",
    pnl: "+$1,140.00",
    volume: { "1W": "174", "1M": "628", "3M": "1,676" },
    color: "blue",
    master: "DANIEL-ALGO-01",
    trader: "Daniel Reed",
    initials: "DR",
    followers: "61",
  },
];
const positions = [
  {
    name: "Alex Morgan",
    initials: "AM",
    account: "#23192",
    symbol: "XAUUSD",
    side: "Buy",
    lot: "0.50",
    pnl: "+$241.00",
    team: "Gold Elite",
    platform: "MetaTrader 5",
    logo: "metatrader-5.png",
    balance: "$24,250.00",
    equity: "$24,491.00",
    leverage: "1:100",
  },
  {
    name: "Ryan Mitchell",
    initials: "RM",
    account: "#18273",
    symbol: "EURUSD",
    side: "Sell",
    lot: "1.00",
    pnl: "+$84.00",
    team: "FX Intraday",
    platform: "cTrader",
    logo: "ctrader.ico",
    balance: "$18,400.00",
    equity: "$18,484.00",
    leverage: "1:100",
  },
  {
    name: "James Carter",
    initials: "JC",
    account: "#92731",
    symbol: "XAUUSD",
    side: "Buy",
    lot: "2.00",
    pnl: "-$113.00",
    team: "Gold Elite",
    platform: "MetaTrader 5",
    logo: "metatrader-5.png",
    balance: "$32,800.00",
    equity: "$32,687.00",
    leverage: "1:100",
  },
  {
    name: "Daniel Reed",
    initials: "DR",
    account: "#46281",
    symbol: "GBPUSD",
    side: "Buy",
    lot: "0.25",
    pnl: "+$128.00",
    team: "Scalping Pro",
    platform: "TradeLocker",
    logo: "tradelocker.webp",
    balance: "$12,100.00",
    equity: "$12,228.00",
    leverage: "1:50",
  },
];
const tabs = [
  { name: "Overview", icon: SquaresFour },
  { name: "Teams", icon: UsersThree },
  { name: "Accounts", icon: Wallet },
  { name: "Copy trading", icon: Copy },
  { name: "Funding", icon: Bank },
  { name: "Community", icon: ChatCircleDots },
  { name: "Analytics", icon: ChartPieSlice },
  { name: "Administration", icon: GearSix },
  { name: "Prop firm", icon: Trophy },
  { name: "Brokerage", icon: Bank },
  { name: "Risk controls", icon: ShieldCheck },
  { name: "Platforms", icon: PlugsConnected },
];
type Period = "1W" | "1M" | "3M";

function Chart({ period, team }: { period: Period; team: string }) {
  return <DashboardCommunityVolume period={period} team={team} />;
}
export function TradingRoomDemo({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const theme = useMarketingTheme();
  const [tab, setTab] = useState("Overview");
  const [period, setPeriod] = useState<Period>("1M");
  const [team, setTeam] = useState("All teams");
  const [communityDestination, setCommunityDestination] =
    useState<CommunityDestination>();
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [groupSettings, setGroupSettings] = useState<
    Record<string, { markup: string; leverage: string }>
  >(() =>
    Object.fromEntries(
      teams.map((entry) => [
        entry.name,
        {
          markup: "5.00",
          leverage: entry.name === "Scalping Pro" ? "1:50" : "1:100",
        },
      ]),
    ),
  );
  const selectedTeam = teams.find((t) => t.name === team);
  const rows = positions.filter(
    (p) =>
      (team === "All teams" || p.team === team) &&
      (tab !== "Accounts" ||
        `${p.name} ${p.account} ${p.symbol}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const visibleTeams = selectedTeam ? [selectedTeam] : teams;
  const commissionGroups = visibleTeams.map((entry) => ({
    name: entry.name,
    lots: entry.volume[period],
    markup: groupSettings[entry.name].markup,
  }));
  const volume = demoAggregateVolume(
    commissionGroups.map((entry) => entry.lots),
  );
  const revenue = demoAggregateCommission(commissionGroups);
  const uniformMarkup = commissionGroups.every(
    (entry) => entry.markup === commissionGroups[0].markup,
  )
    ? commissionGroups[0].markup
    : null;
  const configurationGroup = selectedTeam?.name ?? "Gold Elite";
  const configuration = groupSettings[configurationGroup];
  const hasTeamScope = ![
    "Prop firm",
    "Brokerage",
    "Platforms",
    "Community",
    "Administration",
  ].includes(tab);
  const updateConfiguration = (
    update: Partial<{ markup: string; leverage: string }>,
  ) => {
    setGroupSettings((current) => ({
      ...current,
      [configurationGroup]: { ...current[configurationGroup], ...update },
    }));
  };
  const description: Record<string, string> = {
    Overview: "Accounts, copy trading, funding and revenue in one workspace.",
    Teams: "People, community roles, account access and shared team sessions.",
    Accounts: "Balances, platform connections and open trading positions.",
    "Copy trading":
      "Master accounts, follower groups and individual risk rules.",
    Funding: "Direct MT5 deposits, withdrawals and payment approvals.",
    Community:
      "Channels, direct messages, threads, voice rooms and shared resources.",
    "Risk controls": "Position sizing and loss limits for every account.",
    Analytics: "Trading volume and commission revenue by period.",
    Administration: "Leverage, commission markups and group permissions.",
    "Prop firm":
      "Challenge programs, evaluation rules, funded accounts and payout policies.",
    Brokerage:
      "A-book routing, symbol pricing, server settings and operational monitoring.",
    Platforms: "Connection status and backends across trading platforms.",
  };
  return (
    <div className="az-demo-shell" data-dashboard-theme={theme} id="platform">
      <div className="az-demo-caption">
        <span>
          <span className="az-caption-symbol">
            <SquaresFour size={14} />
          </span>{" "}
          YOUR BROKERAGE. CONNECTED.
        </span>
        <span>
          Interactive preview <span className="az-preview-tag">DEMO DATA</span>
        </span>
      </div>
      <div
        className={embedded ? "az-dashboard-embed-surface" : "az-laptop-device"}
      >
        <div
          className="az-dashboard az-laptop-screen"
          data-dashboard-view={tab}
          data-scroll-reveal-item="visual"
          role="region"
          aria-label="Dashboard preview. Scroll inside this screen to explore."
          tabIndex={0}
        >
          <aside className="az-dash-sidebar">
            {embedded ? (
              <span className="az-dash-preview-brand">
                <FooterBrandMark width={30} height={30} />
                <span>BACK OFFICE</span>
              </span>
            ) : (
              <MarketingBrand compact />
            )}
            <div className="az-workspace">
              <span className="az-workspace-avatar">A</span>
              <span>
                Alpha Trading<small>Community workspace</small>
              </span>
            </div>
            <nav aria-label="Demo dashboard views">
              {tabs.map(({ name, icon: Icon }, index) => (
                <div className="dc-nav-item" key={name}>
                  {index === 0 && (
                    <span className="az-nav-heading">Workspace</span>
                  )}
                  {name === "Administration" && (
                    <span className="az-nav-heading">Business controls</span>
                  )}
                  <button
                    className={tab === name ? "is-active" : ""}
                    onClick={() => setTab(name)}
                    aria-pressed={tab === name}
                  >
                    <Icon
                      size={17}
                      weight={tab === name ? "fill" : "regular"}
                    />
                    {name}
                    {name === "Teams" && (
                      <span className="az-nav-count">{teams.length}</span>
                    )}
                  </button>
                </div>
              ))}
            </nav>
            <Link className="az-demo-settings" href="/terminal">
              <GearSix size={17} />
              Open terminal <ArrowUpRight size={13} />
            </Link>
          </aside>
          <div className="az-dash-main">
            <div className="az-dash-topbar">
              <span>
                Workspace <span>/</span> <b>{tab}</b>
              </span>
              <div>
                <div
                  className="dr-toolbar"
                  role="group"
                  aria-label="Workspace tools"
                >
                  <button
                    type="button"
                    aria-label="Open analytics view"
                    onClick={() => setTab("Analytics")}
                  >
                    <ChartLineUp size={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Open funding view"
                    onClick={() => setTab("Funding")}
                  >
                    <Wallet size={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Open administration view"
                    onClick={() => setTab("Administration")}
                  >
                    <GearSix size={17} aria-hidden="true" />
                  </button>
                </div>
                <span className="az-demo-data-label">
                  Simulated environment
                </span>
                <span className="az-owner-avatar">AK</span>
              </div>
            </div>
            <div className="az-dash-content">
              <div className="az-dash-heading">
                <div>
                  <h2>{tab === "Overview" ? "Brokerage overview" : tab}</h2>
                  <p>{description[tab]}</p>
                </div>
                {hasTeamScope && (
                  <label className="az-team-filter">
                    <span className="az-sr-only">Filter demo by team</span>
                    <UsersThree size={14} />
                    <select
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                    >
                      <option>All teams</option>
                      {teams.map((t) => (
                        <option key={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {tab === "Overview" && (
                <div className="dd-environment-strip">
                  <ShieldCheck size={13} />
                  <b>A-book execution</b>
                  <span>·</span>
                  <span>MT5 Manager + Admin Portal</span>
                  <span>Last demo update 08:51 UTC</span>
                </div>
              )}
              {tab === "Overview" && (
                <div
                  className="az-stats"
                  role="group"
                  aria-label="Workspace overview metrics"
                >
                  {[
                    {
                      label: "Active traders",
                      value: selectedTeam?.people ?? "823",
                      change: "+12.8%",
                      icon: UsersThree,
                    },
                    {
                      label: "Connected accounts",
                      value: selectedTeam?.accounts ?? "1,184",
                      change: "+8.2%",
                      icon: Wallet,
                    },
                    {
                      label: "Trading volume",
                      value: volume,
                      suffix: "lots",
                      change: "+18.6%",
                      icon: ChartLineUp,
                    },
                    {
                      label: "Community revenue",
                      value: revenue,
                      change: "+24.3%",
                      icon: CurrencyDollar,
                    },
                  ].map(
                    ({ label, value, change, icon: Icon, suffix }, index) => (
                      <div
                        className={`az-stat ${label === "Community revenue" ? "is-money" : ""}`}
                        key={label}
                      >
                        <div>
                          <span>{label}</span>
                          <Icon size={16} />
                        </div>
                        <strong>
                          {value} {suffix && <small>{suffix}</small>}
                        </strong>
                        <span className="az-stat-change">
                          <TrendUp size={12} />
                          {change}
                          <em> vs. prior period</em>
                        </span>
                        <DashboardSparkline index={index} />
                      </div>
                    ),
                  )}
                </div>
              )}
              {tab === "Overview" && (
                <DashboardWorkspaceShortcuts onView={setTab} />
              )}
              {(tab === "Overview" || tab === "Analytics") && (
                <DashboardTradingJournal
                  team={team}
                  period={period}
                  onPeriodChange={setPeriod}
                />
              )}
              {(tab === "Overview" || tab === "Analytics") && (
                <div className="az-dash-middle">
                  <section className="az-chart-panel">
                    <div className="az-panel-heading">
                      <h3>Community trading volume</h3>
                      <div className="az-periods" aria-label="Chart period">
                        {(["1W", "1M", "3M"] as const).map((p) => (
                          <button
                            key={p}
                            className={period === p ? "is-active" : ""}
                            onClick={() => setPeriod(p)}
                            aria-pressed={period === p}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="az-chart-summary">
                      <span>
                        <i />
                        Volume
                      </span>
                      <span>
                        {period === "1W"
                          ? "Sep 24-30, 2026"
                          : period === "3M"
                            ? "Jul-Sep 2026"
                            : "September 2026"}{" "}
                        <span className="az-subtle">/ example</span>
                      </span>
                    </div>
                    <Chart period={period} team={team} />
                    <DashboardVolumeBreakdown groups={commissionGroups} />
                  </section>
                  {tab === "Overview" && (
                    <section className="az-engine">
                      <div className="az-panel-heading">
                        <h3>
                          <Copy size={15} />
                          Copy engine
                        </h3>
                        <span
                          className={`az-status ${paused ? "is-paused" : ""}`}
                        >
                          {paused ? "Paused" : "Running"}
                        </span>
                      </div>
                      <span className="az-engine-label">MASTER ACCOUNT</span>
                      <div className="az-master">
                        <span className="az-avatar az-avatar-gold">
                          {selectedTeam?.initials ?? "AM"}
                        </span>
                        <div>
                          {selectedTeam?.master ?? "ALEX-GOLD-01"}
                          <small>
                            {selectedTeam?.trader ?? "Alex Morgan"}{" "}
                            <CheckCircle weight="fill" size={11} />
                          </small>
                        </div>
                      </div>
                      <DashboardCopyNetwork paused={paused} />
                      <div className="az-followers">
                        <UsersThree size={20} />
                        <strong>{selectedTeam?.followers ?? "324"}</strong>
                        <span>follower accounts</span>
                      </div>
                      <div className="az-engine-rule">
                        <span>Risk mode</span>
                        <b>Equity proportional</b>
                      </div>
                      <button
                        className="az-engine-control"
                        onClick={() => setPaused(!paused)}
                      >
                        {paused ? (
                          <Play size={12} weight="fill" />
                        ) : (
                          <Pause size={12} weight="fill" />
                        )}
                        {paused ? "Resume demo engine" : "Pause demo engine"}
                      </button>
                    </section>
                  )}
                </div>
              )}
              {tab === "Overview" && <DashboardTeamPulse onView={setTab} />}
              {tab === "Analytics" && <DashboardOperationsVisual team={team} />}
              {tab === "Overview" && (
                <details className="dc-supporting-details dc-routing-detail">
                  <summary>
                    Execution architecture & account allocation{" "}
                    <span>Inspect infrastructure</span>
                  </summary>
                  <DashboardOperationsVisual team={team} />
                </details>
              )}
              {tab === "Teams" && team === "All teams" && (
                <section className="az-teams-section">
                  <div className="az-panel-heading">
                    <h3>
                      Your trading teams <span>{visibleTeams.length}</span>
                    </h3>
                    <button
                      onClick={() =>
                        setTab(tab === "Teams" ? "Accounts" : "Teams")
                      }
                    >
                      {tab === "Teams" ? "View accounts" : "Manage teams"}
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                  <div className="az-team-cards">
                    {visibleTeams.map((t) => (
                      <button
                        key={t.name}
                        className={`az-team-card ${team === t.name ? "is-selected" : ""}`}
                        onClick={() =>
                          setTeam(team === t.name ? "All teams" : t.name)
                        }
                        aria-pressed={team === t.name}
                      >
                        <span className={`az-team-symbol az-${t.color}`}>
                          <DiamondsFour size={19} weight="duotone" />
                        </span>
                        <span>
                          <strong>{t.name}</strong>
                          <small>
                            {t.people} traders <span>·</span> {t.symbol}
                          </small>
                        </span>
                        <ArrowUpRight size={13} />
                        <span className="az-team-pnl">
                          <span className="az-sr-only">Trading P/L </span>
                          {t.pnl}
                          <TrendUp size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {(tab === "Overview" || tab === "Accounts") && (
                <section className="az-positions">
                  <div className="az-panel-heading">
                    <h3>
                      {tab === "Accounts"
                        ? "Connected trading accounts"
                        : "Open positions"}
                      <span>{rows.length}</span>
                    </h3>
                    {tab === "Accounts" ? (
                      <label className="az-search">
                        <MagnifyingGlass size={14} />
                        <span className="az-sr-only">Search accounts</span>
                        <input
                          placeholder="Trader, account, symbol"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    ) : (
                      <button onClick={() => setTab("Accounts")}>
                        View all accounts
                        <ArrowUpRight size={12} />
                      </button>
                    )}
                  </div>
                  <div className="az-table-scroll">
                    <table
                      className={tab === "Accounts" ? "dd-account-table" : ""}
                      aria-label={
                        tab === "Accounts"
                          ? "Connected trading accounts"
                          : "Open positions"
                      }
                    >
                      <thead>
                        <tr>
                          <th>Trader / account</th>
                          <th>Instrument</th>
                          {tab === "Accounts" && <th>Platform</th>}
                          {tab === "Accounts" && <th>Balance / equity</th>}
                          {tab === "Accounts" && <th>Leverage</th>}
                          <th>Side</th>
                          <th>Lots</th>
                          <th className="az-align-right">Floating P/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p) => (
                          <tr key={p.account}>
                            <td>
                              <span className="az-trader-cell">
                                <span className="az-mini-avatar">
                                  {p.initials}
                                </span>
                                <span>
                                  {p.name}
                                  <small>{p.account}</small>
                                </span>
                              </span>
                            </td>
                            <td>{p.symbol}</td>
                            {tab === "Accounts" && (
                              <td>
                                <span className="dd-account-platform">
                                  <Image
                                    src={`/marketing/platforms/${p.logo}`}
                                    alt=""
                                    width={17}
                                    height={17}
                                    unoptimized
                                  />
                                  {p.platform}
                                </span>
                              </td>
                            )}
                            {tab === "Accounts" && (
                              <td>
                                <span className="az-trader-cell">
                                  <span>
                                    {p.balance}
                                    <small>Equity {p.equity}</small>
                                  </span>
                                </span>
                              </td>
                            )}
                            {tab === "Accounts" && (
                              <td>{groupSettings[p.team].leverage}</td>
                            )}
                            <td>
                              <span
                                className={`az-side az-side-${p.side.toLowerCase()}`}
                              >
                                {p.side}
                              </span>
                            </td>
                            <td>{p.lot}</td>
                            <td
                              className={`az-align-right ${p.pnl.startsWith("-") ? "az-loss" : "az-gain"}`}
                            >
                              {p.pnl}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && (
                      <div className="az-empty">
                        No matching accounts. Try another trader or symbol.
                      </div>
                    )}
                  </div>
                </section>
              )}
              {tab === "Overview" && (
                <OverviewOperations
                  team={team}
                  lots={volume}
                  markup={uniformMarkup}
                  revenue={revenue}
                  commissionGroups={commissionGroups}
                  onView={setTab}
                />
              )}
              {tab === "Funding" && <FundingView team={team} />}
              <div className="dc-workspace-mount" hidden={tab !== "Teams"}>
                <DashboardTeams
                  team={team}
                  onCommunity={(selected, channel, panel) => {
                    setTeam(selected);
                    if (channel)
                      setCommunityDestination((current) => ({
                        channel,
                        panel,
                        request: (current?.request ?? 0) + 1,
                      }));
                    setTab("Community");
                  }}
                  onAccounts={() => setTab("Accounts")}
                />
              </div>
              <div className="dc-workspace-mount" hidden={tab !== "Community"}>
                <CommunityView team={team} destination={communityDestination} />
              </div>
              {tab === "Administration" && (
                <AdministrationView
                  team={team}
                  onTeam={setTeam}
                  markup={configuration.markup}
                  onMarkup={(value) => updateConfiguration({ markup: value })}
                  leverage={configuration.leverage}
                  onLeverage={(value) =>
                    updateConfiguration({ leverage: value })
                  }
                />
              )}
              {tab === "Platforms" && <PlatformsView />}
              {tab === "Brokerage" && <BrokerageView />}
              {tab === "Prop firm" && <PropFirmView />}
              {tab === "Copy trading" && (
                <div className="az-demo-detail">
                  <Copy size={30} />
                  <h3>Master accounts & follower groups</h3>
                  <p>
                    Choose a team above to explore its master account and
                    follower configuration.
                  </p>
                  <div className="az-copy-team-list">
                    {visibleTeams.map((t) => (
                      <div key={t.name}>
                        <span className={`az-team-symbol az-${t.color}`}>
                          <DiamondsFour size={22} />
                        </span>
                        <span>
                          <b>{t.name}</b>
                          <small>{t.master}</small>
                        </span>
                        <span>
                          <b>{t.followers}</b>
                          <small>followers</small>
                        </span>
                        <span className="az-status">
                          {paused ? "Paused" : "Running"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="az-button az-button-secondary"
                    onClick={() => setPaused(!paused)}
                  >
                    {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
                    {paused ? "Resume demonstration" : "Pause demonstration"}
                  </button>
                  <small>
                    This control only changes the preview. No trades are placed.
                  </small>
                </div>
              )}
              {tab === "Risk controls" && (
                <div className="az-demo-detail az-risk-detail">
                  <ShieldCheck size={30} />
                  <h3>Account group risk policy</h3>
                  <p>
                    Illustrative settings for the selected team. Production
                    limits must be approved and enforced by your trading
                    infrastructure.
                  </p>
                  {[
                    ["Daily loss limit", "3.00%"],
                    ["Maximum drawdown", "10.00%"],
                    ["Maximum lot size", "5.00 lots"],
                    ["Open position limit", "20 positions"],
                    [
                      "Allowed instruments",
                      selectedTeam?.symbol ?? "XAUUSD, EURUSD, GBPUSD",
                    ],
                  ].map(([label, value]) => (
                    <div className="az-risk-row" key={label}>
                      <CheckCircle size={17} />
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              )}
              <div className="az-dash-footer">
                <span>
                  <ShieldCheck size={12} />
                  Illustrative community data. No live execution.
                </span>
                <span>All amounts in USD</span>
              </div>
            </div>
          </div>
        </div>
        {!embedded && (
          <Image
            className="az-laptop-frame"
            src="/marketing/azuriya-laptop-frame.svg"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1200px"
            loading="eager"
            unoptimized
            aria-hidden="true"
          />
        )}
      </div>
      {!embedded && (
        <p className="az-laptop-scroll-hint">
          Scroll inside the screen to explore
        </p>
      )}
    </div>
  );
}

export function DashboardLaptopMock() {
  const laptopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const laptop = laptopRef.current;
    if (!laptop) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const closedLidAngle = 90;
    const openLidAngle = 7;
    let animationFrame = 0;

    const update = () => {
      // Screen opening measured from the supplied, unmodified 3944 × 2564 PNG.
      const scale = Math.min(1, (laptop.clientWidth * (3024 / 3944)) / 1200);
      laptop.style.setProperty("--az-dashboard-scale", String(scale));
      const viewportHeight = window.innerHeight;
      const laptopTop = laptop.getBoundingClientRect().top;
      const closedAt = viewportHeight * 0.92;
      const openAt = viewportHeight * 0.24;
      const progress = reducedMotion.matches
        ? 1
        : Math.min(
            1,
            Math.max(0, (closedAt - laptopTop) / (closedAt - openAt)),
          );

      laptop.style.setProperty(
        "--az-laptop-lid-angle",
        `${openLidAngle + (1 - progress) * (closedLidAngle - openLidAngle)}deg`,
      );
      laptop.style.setProperty(
        "--az-laptop-closed-progress",
        String(1 - progress),
      );
      laptop.dataset.laptopOpenProgress = progress.toFixed(3);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    reducedMotion.addEventListener("change", scheduleUpdate);
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(laptop);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      reducedMotion.removeEventListener("change", scheduleUpdate);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="az-laptop-preview" id="platform">
      <div className="az-demo-caption">
        <span>
          <span className="az-caption-symbol">
            <SquaresFour size={14} />
          </span>{" "}
          YOUR BROKERAGE. CONNECTED.
        </span>
        <span>
          Interactive preview <span className="az-preview-tag">DEMO DATA</span>
        </span>
      </div>
      <div
        className="az-laptop-device az-laptop-device-macbook"
        ref={laptopRef}
      >
        <div className="az-laptop-lid" data-laptop-lid>
          <iframe
            className="az-laptop-dashboard-iframe"
            src="/dashboard-preview"
            title="Interactive Azuriya trading community dashboard preview"
            loading="eager"
            scrolling="no"
          />
          <Image
            className="az-laptop-frame az-laptop-frame-lid"
            src="/marketing/apple-macbookpro14-front.png"
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            aria-hidden="true"
          />
        </div>
        <div className="az-laptop-base-frame">
          <Image
            className="az-laptop-frame az-laptop-frame-base"
            src="/marketing/apple-macbookpro14-front.png"
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            aria-hidden="true"
          />
        </div>
      </div>
      <p className="az-laptop-scroll-hint">
        Scroll the page to open · scroll inside to explore
      </p>
    </div>
  );
}
