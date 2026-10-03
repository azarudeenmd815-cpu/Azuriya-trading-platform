"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Order, Position, OrderPreview } from "@azuriya/api-types";
import { api, message, post } from "./api";
import type { TradeDrag, TradeLine } from "./chart-trade-layer";
import { notify } from "./notifications";
import { useTerminal } from "./store";
export function useChartTrading(accountId: string, symbol: string) {
  const client = useQueryClient();
  const connection = useTerminal((state) => state.connection);
  const positions = useQuery({
    queryKey: ["account", accountId, "positions"],
    queryFn: () => api<Position[]>(`/accounts/${accountId}/positions`),
    enabled: !!accountId,
  });
  const orders = useQuery({
    queryKey: ["account", accountId, "orders"],
    queryFn: () => api<Order[]>(`/accounts/${accountId}/orders`),
    enabled: !!accountId,
  });
  const [drag, setDrag] = useState<TradeDrag>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<OrderPreview>();
  const [previewError, setPreviewError] = useState("");
  const lines = useMemo(() => {
    const result: TradeLine[] = [],
      editable = connection === "LIVE" && !busy;
    for (const position of positions.data || []) {
      if (position.symbol !== symbol || position.status === "CLOSED") continue;
      result.push({
        id: `${position.id}:ENTRY`,
        resourceId: position.id,
        kind: "ENTRY",
        price: position.open_price,
        label: `${position.side} ${position.quantity}`,
        color: position.side === "BUY" ? "#43c9a0" : "#ed7c85",
        editable: false,
      });
      if (position.stop_loss)
        result.push({
          id: `${position.id}:SL`,
          resourceId: position.id,
          kind: "SL",
          price: position.stop_loss,
          label: `SL · ${position.quantity}`,
          color: "#ed7c85",
          editable,
        });
      if (position.take_profit)
        result.push({
          id: `${position.id}:TP`,
          resourceId: position.id,
          kind: "TP",
          price: position.take_profit,
          label: `TP · ${position.quantity}`,
          color: "#43c9a0",
          editable,
        });
    }
    for (const order of orders.data || [])
      if (
        order.symbol === symbol &&
        ["ACCEPTED", "VALIDATED", "TRIGGERED", "PARTIALLY_FILLED"].includes(
          order.status,
        ) &&
        (order.limit_price || order.stop_price)
      )
        result.push({
          id: `${order.id}:ORDER`,
          resourceId: order.id,
          kind: "ORDER",
          price: order.limit_price || order.stop_price!,
          label: `${order.side} ${order.type} ${order.quantity}`,
          color: "#c5ac78",
          editable,
        });
    return result;
  }, [symbol, positions.data, orders.data, connection, busy]);
  useEffect(() => {
    setPreview(undefined);
    setPreviewError("");
    if (!drag) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const position = positions.data?.find(
          (item) => item.id === drag.line.resourceId,
        );
        const order = orders.data?.find(
          (item) => item.id === drag.line.resourceId,
        );
        const result = position
          ? await post<OrderPreview>(
              `/accounts/${accountId}/positions/${position.id}/protection-preview`,
              {
                stop_loss:
                  drag.line.kind === "SL"
                    ? drag.price
                    : position.stop_loss || null,
                take_profit:
                  drag.line.kind === "TP"
                    ? drag.price
                    : position.take_profit || null,
              },
            )
          : order
            ? await post<OrderPreview>(
                `/accounts/${accountId}/orders/preview`,
                {
                  symbol,
                  side: order.side,
                  type: order.type,
                  quantity_mode: "LOTS",
                  quantity: order.quantity,
                  ...(order.type === "LIMIT"
                    ? { limit_price: drag.price }
                    : { stop_price: drag.price }),
                  stop_loss: order.stop_loss,
                  take_profit: order.take_profit,
                },
              )
            : undefined;
        if (!cancelled) setPreview(result);
      } catch (error) {
        if (!cancelled) setPreviewError(message(error));
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [drag, accountId, symbol, positions.data, orders.data]);
  const drop = async (value: TradeDrag) => {
    if (connection !== "LIVE") {
      notify("Reconnect before modifying a trade.", "error");
      return;
    }
    setBusy(true);
    setDrag(undefined);
    try {
      const position = positions.data?.find(
        (item) => item.id === value.line.resourceId,
      );
      const order = orders.data?.find(
        (item) => item.id === value.line.resourceId,
      );
      if (position)
        await api(`/accounts/${accountId}/positions/${position.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stop_loss:
              value.line.kind === "SL"
                ? value.price
                : position.stop_loss || null,
            take_profit:
              value.line.kind === "TP"
                ? value.price
                : position.take_profit || null,
          }),
        });
      else if (order) {
        const key = crypto.randomUUID();
        await api(`/accounts/${accountId}/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({
            client_order_id: key,
            entry_price: value.price,
            quantity: order.quantity,
            stop_loss: order.stop_loss || null,
            take_profit: order.take_profit || null,
          }),
        });
      } else
        throw new Error(
          "This trade is no longer available. Refreshing account state.",
        );
      notify(
        position
          ? `${value.line.kind} updated to ${value.price}.`
          : "Pending entry modified.",
      );
    } catch (error) {
      notify(message(error), "error");
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: ["account", accountId] });
    }
  };
  return { lines, drag, setDrag, drop, busy, preview, previewError };
}
