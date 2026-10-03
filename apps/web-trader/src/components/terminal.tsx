"use client";
import { useEffect, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EffectiveConfiguration,
  Instrument,
  TradingAccount,
  User,
} from "@azuriya/api-types";
import { api, APIError, message, post } from "@/lib/api";
import { formatDecimal, money, signClass } from "@/lib/decimal-display";
import { useRealtime } from "@/lib/realtime";
import { useTerminal } from "@/lib/store";
import { Auth } from "./auth";
import { Brand, Icon } from "./icons";
import { useWorkspaces } from "@/lib/use-workspaces";
import { WorkspaceControls } from "./workspace-controls";
import {
  ChartWorkspace,
  ResizeHandle,
  WorkspaceToolbar,
} from "./workspace-layout";
import { CommandPalette } from "./command-palette";
import { Notifications } from "./notifications";
import "./workspace-v2.css";
import { OrderTicket } from "./order-ticket";
import { TradingActivity } from "./trading-activity";
import { Watchlist } from "./watchlist";
function ConnectionStatus() {
  const connection = useTerminal((state) => state.connection);
  return (
    <span className={`connection ${connection.toLowerCase()}`}>
      <span className="small-dot" />
      {connection}
    </span>
  );
}
function AccountMetrics({ account }: { account?: TradingAccount }) {
  return (
    <div className="account-metrics">
      <div>
        <span>Balance</span>
        <strong>{money(account?.balance)}</strong>
      </div>
      <div>
        <span>Equity</span>
        <strong>{money(account?.equity)}</strong>
      </div>
      <div>
        <span>Unrealized P&L</span>
        <strong className={signClass(account?.unrealized_pnl)}>
          {money(account?.unrealized_pnl)}
        </strong>
      </div>
      <div>
        <span>Used margin</span>
        <strong title={account?.margin_used}>
          {money(account?.margin_used)}
        </strong>
      </div>
      <div>
        <span>Free margin</span>
        <strong>{money(account?.margin_free)}</strong>
      </div>
      <div>
        <span>Margin level</span>
        <strong>
          {account?.margin_level && account.margin_level !== "0"
            ? formatDecimal(account.margin_level) + "%"
            : "—"}
        </strong>
      </div>
    </div>
  );
}
export function Terminal({
  initialRegister = false,
}: {
  initialRegister?: boolean;
}) {
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/me"),
    retry: false,
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () =>
      api<TradingAccount[]>("/accounts").then((data) => data || []),
    enabled: !!me.data,
  });
  const instruments = useQuery({
    queryKey: ["instruments"],
    queryFn: () => api<Instrument[]>("/instruments").then((data) => data || []),
    enabled: !!me.data,
    staleTime: 60_000,
  });
  const accountId = useTerminal((state) => state.accountId);
  const panels = useTerminal((state) => state.config.panels);
  const workspaces = useWorkspaces(me.data?.id);
  const selectedSymbol = useTerminal((state) => state.symbol);
  const selectAccount = useTerminal((state) => state.selectAccount);
  const account =
    accounts.data?.find((item) => item.id === accountId) || accounts.data?.[0];
  const instrument = instruments.data?.find(
    (item) => item.symbol === selectedSymbol,
  );
  const terms = useQuery({
    queryKey: ["effective-settings", account?.id, selectedSymbol],
    queryFn: () =>
      api<EffectiveConfiguration>(
        `/accounts/${account!.id}/effective-settings?symbol=${encodeURIComponent(selectedSymbol)}`,
      ),
    enabled: !!me.data && !!account && !!instrument,
    refetchInterval: 30_000,
  });
  const logout = useMutation({
    mutationFn: () => post<void>("/auth/logout", {}),
    onSuccess: () => {
      useTerminal.getState().reset();
      client.clear();
      client.setQueryData(["me"], null);
    },
  });
  useEffect(() => {
    if (account && accountId !== account.id) selectAccount(account.id);
  }, [account, accountId, selectAccount]);
  useEffect(() => {
    const expire = () => {
      useTerminal.getState().reset();
      client.setQueryData(["me"], null);
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "me",
      });
    };
    window.addEventListener("azuriya:session-expired", expire);
    return () => window.removeEventListener("azuriya:session-expired", expire);
  }, [client]);
  useRealtime(!!me.data);
  if (me.isPending)
    return (
      <main className="loading-page">
        <Brand />
        <div className="loading-indicator" />
        <p>Connecting to your workspace…</p>
      </main>
    );
  if (!me.data || me.isError)
    return (
      <Auth
        initialRegister={initialRegister}
        serverError={
          me.error &&
          (!(me.error instanceof APIError) || me.error.status !== 401)
            ? message(me.error)
            : undefined
        }
      />
    );
  return (
    <main className="terminal-shell">
      <header className="topbar">
        <Brand small />
        <div className="topbar-divider" />
        <WorkspaceControls controls={workspaces} />
        <span className="simulation-badge">SIMULATED</span>
        <div className="topbar-right">
          <CommandPalette
            instruments={instruments.data || []}
            accounts={accounts.data || []}
            workspaces={workspaces}
          />
          <ConnectionStatus />
          <span className="topbar-divider" />
          <div className="profile-chip" title={me.data.email}>
            {me.data.email.slice(0, 1).toUpperCase()}
          </div>
          <button
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>
      <section className="account-bar">
        <div className="account-selector">
          <div className="account-icon">
            <Icon name="wallet" size={19} />
          </div>
          <div>
            <select
              aria-label="Trading account"
              value={account?.id || ""}
              onChange={(event) => selectAccount(event.target.value)}
            >
              {accounts.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.account_number}
                </option>
              ))}
            </select>
            <span>
              {account?.mode === "PROP_SIMULATED"
                ? "Prop simulated"
                : "Broker demo"}
              <i />
              {account?.currency || "USD"} · Effective leverage 1:
              {terms.data?.effective_leverage || account?.leverage || "—"}
            </span>
          </div>
        </div>
        <AccountMetrics account={account} />
        <div className="account-mode">
          <Icon name="shield" size={14} />
          {account?.status || "LOADING"}
        </div>
      </section>
      {account &&
        ["MARGIN_CALL", "STOP_OUT", "STOP_OUT_REQUIRED"].includes(
          account.margin_status || "",
        ) && (
          <div
            className="broker-margin-warning"
            role="status"
            aria-live="polite"
          >
            <Icon name="shield" size={18} />
            <div>
              <strong>Margin warning · simulated account</strong>
              <span>
                Margin level has fallen below{" "}
                {terms.data?.margin.margin_call_level || "the configured"}%
                threshold. Reduce exposure or request a simulated balance
                adjustment. Automatic stop-out applies at{" "}
                {terms.data?.margin.stop_out_level || "the configured"}% when
                executable.
              </span>
            </div>
          </div>
        )}
      {terms.isError && (
        <div className="global-error" role="alert">
          Broker terms could not be refreshed: {message(terms.error)}
          <button onClick={() => void terms.refetch()}>Retry</button>
        </div>
      )}
      {(accounts.isError || instruments.isError || logout.isError) && (
        <div className="global-error" role="alert">
          {message(accounts.error || instruments.error || logout.error)}
          <button
            onClick={() => {
              void accounts.refetch();
              void instruments.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}
      <WorkspaceToolbar />
      {workspaces.error && (
        <div className="global-error" role="alert">
          {workspaces.error}
        </div>
      )}
      <div
        className="workspace-grid workspace-v2"
        style={
          {
            "--markets-width": `${panels.markets_width}px`,
            "--ticket-width": `${panels.ticket_width}px`,
            "--bottom-height": `${panels.bottom_height}px`,
            gridTemplateColumns: `${panels.markets ? "var(--markets-width) 4px " : ""}minmax(0, 1fr)${panels.ticket ? " 4px var(--ticket-width)" : ""}`,
          } as CSSProperties
        }
      >
        {panels.markets && (
          <>
            <Watchlist instruments={instruments.data || []} />
            <ResizeHandle panel="markets" />
          </>
        )}
        <div className="center-workspace">
          <ChartWorkspace
            instruments={instruments.data || []}
            accountId={account?.id || ""}
          />
          {panels.bottom && (
            <>
              <ResizeHandle panel="bottom" />
              <TradingActivity
                key={account?.id}
                accountId={account?.id || ""}
                instruments={instruments.data || []}
              />
            </>
          )}
        </div>
        {panels.ticket && (
          <>
            <ResizeHandle panel="ticket" />
            <OrderTicket
              key={`${account?.id}-${selectedSymbol}`}
              account={account}
              instrument={instrument}
              terms={terms.data}
            />
          </>
        )}
      </div>
      <footer className="terminal-footer">
        <span>
          AZURIYA NATIVE TERMINAL <i /> BROKER OS
        </span>
        <span>
          All execution is simulated · Server-authoritative account values
        </span>
        <span>
          <Icon name="shield" size={12} /> SESSION SECURED
        </span>
      </footer>
      <Notifications />
    </main>
  );
}
