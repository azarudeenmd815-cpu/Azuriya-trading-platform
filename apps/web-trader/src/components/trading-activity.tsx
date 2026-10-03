"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AuditEvent,
  Fill,
  Instrument,
  Order,
  Position,
} from "@azuriya/api-types";
import { api, message, post } from "@/lib/api";
import { notify } from "@/lib/notifications";
import {
  PositionDialog,
  PositionDetail,
  type PositionAction,
} from "./position-actions";
import { PendingOrderDialog } from "./pending-order-dialog";
import "./trading-v2.css";
import { formatDecimal, money, signClass } from "@/lib/decimal-display";
import { Icon } from "./icons";
type Tab = "Positions" | "Orders" | "History" | "Activity";
function time(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function Empty({ tab }: { tab: Tab }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={tab === "Positions" ? "chart" : "clock"} size={24} />
      </div>
      <strong>
        {tab === "Positions"
          ? "Your next position starts here"
          : tab === "Orders"
            ? "No working orders"
            : tab === "History"
              ? "Your execution history"
              : "Your account activity"}
      </strong>
      <span>
        {tab === "Positions"
          ? "Choose a market and place an order to begin your session."
          : tab === "Orders"
            ? "Limit and stop orders will appear here until they execute."
            : tab === "History"
              ? "Every simulated fill will be recorded here."
              : "Auditable account transitions will appear here."}
      </span>
    </div>
  );
}
export function TradingActivity({
  accountId,
  instruments,
}: {
  accountId: string;
  instruments: Instrument[];
}) {
  const [tab, setTab] = useState<Tab>("Positions");
  const [auditScope, setAuditScope] = useState("ALL");
  const [detail, setDetail] = useState<Position>();
  const [editingOrder, setEditingOrder] = useState<Order>();
  useEffect(() => {
    const handler = (event: Event) => {
      const value = (event as CustomEvent<Tab>).detail;
      if (["Positions", "Orders", "History", "Activity"].includes(value))
        setTab(value);
    };
    window.addEventListener("azuriya:activity-tab", handler);
    return () => window.removeEventListener("azuriya:activity-tab", handler);
  }, []);
  const [action, setAction] = useState<PositionAction>();
  const client = useQueryClient();
  const positions = useQuery({
    queryKey: ["account", accountId, "positions"],
    queryFn: () =>
      api<Position[]>(`/accounts/${accountId}/positions`).then(
        (data) => data || [],
      ),
    enabled: !!accountId,
  });
  const orders = useQuery({
    queryKey: ["account", accountId, "orders"],
    queryFn: () =>
      api<Order[]>(`/accounts/${accountId}/orders`).then((data) => data || []),
    enabled: !!accountId,
  });
  const fills = useQuery({
    queryKey: ["account", accountId, "fills"],
    queryFn: () =>
      api<Fill[]>(`/accounts/${accountId}/fills`).then((data) => data || []),
    enabled: !!accountId,
  });
  const events = useQuery({
    queryKey: ["account", accountId, "events"],
    queryFn: () =>
      api<AuditEvent[]>(`/accounts/${accountId}/events`).then(
        (data) => data || [],
      ),
    enabled: !!accountId && tab === "Activity",
  });
  const cancel = useMutation({
    mutationFn: (orderId: string) =>
      post<Order>(`/accounts/${accountId}/orders/${orderId}/cancel`, {}),
    onSuccess: (order) => {
      void client.invalidateQueries({ queryKey: ["account", accountId] });
      notify("Pending order cancelled", "success", `order:${order.id}`);
    },
  });
  const workspaceEvents = useQuery({
    queryKey: ["workspace-events"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          workspace_id: string;
          event_type: string;
          occurred_at: string;
        }>
      >("/workspaces/events?limit=100"),
    enabled: tab === "Activity",
    refetchInterval: tab === "Activity" ? 5000 : false,
  });
  const auditRows = [
    ...(auditScope === "WORKSPACE" ? [] : events.data || []),
    ...(auditScope === "ACCOUNT" ? [] : workspaceEvents.data || []).map(
      (event) => ({
        ...event,
        sequence: "—",
        aggregate_type: "WORKSPACE",
        aggregate_id: event.workspace_id,
      }),
    ),
  ]
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    .slice(0, 100);
  const openPositions = (positions.data || []).filter(
    (position) => position.status !== "CLOSED",
  );
  const workingOrders = (orders.data || []).filter((order) =>
    [
      "CREATED",
      "VALIDATED",
      "ACCEPTED",
      "TRIGGERED",
      "PARTIALLY_FILLED",
    ].includes(order.status),
  );
  const price = (symbol: string, value?: string) =>
    value && value !== "0"
      ? formatDecimal(
          value,
          instruments.find((instrument) => instrument.symbol === symbol)
            ?.digits ?? 5,
          false,
        )
      : "—";
  const query =
    tab === "Positions"
      ? positions
      : tab === "Orders"
        ? orders
        : tab === "History"
          ? fills
          : events;
  const count =
    tab === "Positions"
      ? openPositions.length
      : tab === "Orders"
        ? workingOrders.length
        : tab === "History"
          ? fills.data?.length
          : auditRows.length;
  return (
    <section className="activity-panel">
      <div className="activity-toolbar">
        <div
          className="activity-tabs"
          role="tablist"
          aria-label="Account activity"
        >
          {(["Positions", "Orders", "History", "Activity"] as Tab[]).map(
            (value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {value}
                {value === "Positions" || value === "Orders" ? (
                  <span>
                    {value === "Positions"
                      ? openPositions.length
                      : workingOrders.length}
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
        <div className="activity-context">
          {tab === "Activity" && (
            <select
              aria-label="Activity scope"
              value={auditScope}
              onChange={(e) => setAuditScope(e.target.value)}
            >
              <option value="ALL">All activity</option>
              <option value="ACCOUNT">Trading account</option>
              <option value="WORKSPACE">Workspaces</option>
            </select>
          )}
          <Icon name="shield" size={14} />
          <span>HEDGING ACCOUNT</span>
        </div>
      </div>
      {cancel.isError && (
        <div role="alert" className="table-error">
          {message(cancel.error)}
        </div>
      )}
      {tab === "Activity" && workspaceEvents.isError && (
        <div role="alert" className="table-error">
          {message(workspaceEvents.error)}
          <button onClick={() => void workspaceEvents.refetch()}>
            Retry workspace activity
          </button>
        </div>
      )}
      {query.isError ? (
        <div className="table-error" role="alert">
          {message(query.error)}{" "}
          <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : query.isPending && accountId ? (
        <div className="small-empty">Loading account activity…</div>
      ) : !count ? (
        <Empty tab={tab} />
      ) : (
        <div className="table-scroll" role="tabpanel">
          {tab === "Positions" && (
            <table>
              <thead>
                <tr>
                  {[
                    "Symbol",
                    "Side",
                    "Quantity",
                    "Open price",
                    "Current",
                    "Stop loss",
                    "Take profit",
                    "P&L (USD)",
                    "",
                  ].map((header, index) => (
                    <th key={index}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openPositions.map((position) => (
                  <tr key={position.id}>
                    <td className="symbol-cell">
                      <button
                        className="position-name-button"
                        aria-label={`Details ${position.symbol} ${position.id.slice(0, 8)}`}
                        onClick={() => setDetail(position)}
                      >
                        {position.symbol}
                        <small>#{position.id.slice(0, 8)}</small>
                      </button>
                    </td>
                    <td>
                      <span
                        className={`side-tag ${position.side.toLowerCase()}`}
                      >
                        {position.side}
                      </span>
                    </td>
                    <td>{position.quantity}</td>
                    <td>{price(position.symbol, position.open_price)}</td>
                    <td>{price(position.symbol, position.current_price)}</td>
                    <td>
                      <button
                        className="protection-cell"
                        title="Edit protection"
                        onClick={() => setAction({ kind: "protect", position })}
                      >
                        {price(position.symbol, position.stop_loss)}
                      </button>
                    </td>
                    <td>
                      <button
                        className="protection-cell"
                        title="Edit protection"
                        onClick={() => setAction({ kind: "protect", position })}
                      >
                        {price(position.symbol, position.take_profit)}
                      </button>
                    </td>
                    <td className={signClass(position.unrealized_pnl)}>
                      {money(position.unrealized_pnl)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-button"
                          aria-label={`Close 25% ${position.symbol}`}
                          onClick={() =>
                            setAction({
                              kind: "close",
                              position,
                              percentage: "25",
                            })
                          }
                        >
                          25%
                        </button>
                        <button
                          className="table-button"
                          aria-label={`Close 50% ${position.symbol}`}
                          onClick={() =>
                            setAction({
                              kind: "close",
                              position,
                              percentage: "50",
                            })
                          }
                        >
                          50%
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${position.symbol} protection`}
                          onClick={() =>
                            setAction({ kind: "protect", position })
                          }
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          className="table-button"
                          onClick={() => setAction({ kind: "close", position })}
                        >
                          Close
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "Orders" && (
            <table>
              <thead>
                <tr>
                  {[
                    "Symbol",
                    "Side",
                    "Type",
                    "Quantity",
                    "Entry price",
                    "Status",
                    "Placed",
                    "",
                  ].map((header, index) => (
                    <th key={index}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workingOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="symbol-cell">
                      {order.symbol}
                      <small>#{order.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <span className={`side-tag ${order.side.toLowerCase()}`}>
                        {order.side}
                      </span>
                    </td>
                    <td>{order.type}</td>
                    <td>{order.quantity}</td>
                    <td>
                      {price(
                        order.symbol,
                        order.limit_price || order.stop_price,
                      )}
                    </td>
                    <td>
                      <span className="status-tag">{order.status}</span>
                    </td>
                    <td className="muted">{time(order.created_at)}</td>
                    <td>
                      <button
                        className="table-button"
                        onClick={() => setEditingOrder(order)}
                      >
                        Modify
                      </button>{" "}
                      <button
                        className="table-button"
                        onClick={() => cancel.mutate(order.id)}
                        disabled={cancel.isPending}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "History" && (
            <table>
              <thead>
                <tr>
                  {[
                    "Symbol",
                    "Side",
                    "Quantity",
                    "Fill price",
                    "Execution reason",
                    "Latency",
                    "Time",
                  ].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(fills.data || []).map((fill) => (
                  <tr key={fill.id}>
                    <td className="symbol-cell">
                      {fill.symbol}
                      <small>#{fill.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <span className={`side-tag ${fill.side.toLowerCase()}`}>
                        {fill.side}
                      </span>
                    </td>
                    <td>{fill.quantity}</td>
                    <td>{price(fill.symbol, fill.price)}</td>
                    <td>
                      <span className="fill-reason">
                        {fill.execution_reason.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="muted">{fill.execution_latency_ms} ms</td>
                    <td className="muted">{time(fill.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "Activity" && (
            <table>
              <thead>
                <tr>
                  {["Sequence", "Event", "Entity", "Reference", "Time"].map(
                    (header) => (
                      <th key={header}>{header}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {auditRows.map((event) => (
                  <tr key={event.id}>
                    <td className="muted">{event.sequence}</td>
                    <td>{event.event_type.replaceAll("_", " ")}</td>
                    <td className="muted">{event.aggregate_type}</td>
                    <td className="muted">{event.aggregate_id.slice(0, 12)}</td>
                    <td className="muted">{time(event.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {action && (
        <PositionDialog
          key={action.position.id + action.kind}
          action={action}
          accountId={accountId}
          onClose={() => setAction(undefined)}
        />
      )}
      {detail && (
        <PositionDetail
          position={positions.data?.find((p) => p.id === detail.id) ?? detail}
          fills={fills.data ?? []}
          onClose={() => setDetail(undefined)}
        />
      )}
      {editingOrder && (
        <PendingOrderDialog
          order={editingOrder}
          accountId={accountId}
          onClose={() => setEditingOrder(undefined)}
        />
      )}
    </section>
  );
}
