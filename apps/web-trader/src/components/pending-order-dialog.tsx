"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Order, OrderPreview } from "@azuriya/api-types";
import { api, message, post } from "@/lib/api";
import { isPositiveDecimal } from "@/lib/decimal-display";
import { notify } from "@/lib/notifications";
import { TradeDialog } from "./trade-dialog";
import { TradePreview } from "./trade-preview";
export function PendingOrderDialog({
  order,
  accountId,
  onClose,
}: {
  order: Order;
  accountId: string;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState(
      order.limit_price ?? order.stop_price ?? "",
    ),
    [quantity, setQuantity] = useState(order.quantity),
    [sl, setSL] = useState(order.stop_loss ?? ""),
    [tp, setTP] = useState(order.take_profit ?? "");
  const client = useQueryClient(),
    request = useRef<{ signature: string; key: string } | undefined>(undefined);
  const body = {
    quantity,
    entry_price: entry,
    stop_loss: sl || null,
    take_profit: tp || null,
  };
  const valid =
    isPositiveDecimal(entry) &&
    isPositiveDecimal(quantity) &&
    (!sl || isPositiveDecimal(sl)) &&
    (!tp || isPositiveDecimal(tp));
  const preview = useQuery({
    queryKey: ["pending-preview", accountId, order.id, body],
    queryFn: () =>
      post<OrderPreview>(`/accounts/${accountId}/orders/preview`, {
        client_order_id: "preview",
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity,
        time_in_force: "GTC",
        ...(order.type === "LIMIT"
          ? { limit_price: entry }
          : { stop_price: entry }),
        ...(sl ? { stop_loss: sl } : {}),
        ...(tp ? { take_profit: tp } : {}),
      }),
    enabled: valid,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: () => {
      const signature = JSON.stringify(body);
      if (request.current?.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      return api<Order>(`/accounts/${accountId}/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": request.current.key },
        body: JSON.stringify({ ...body, client_order_id: request.current.key }),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["account"] });
      notify("Pending order modified");
      onClose();
    },
    onError: (error) => notify(message(error), "error"),
  });
  return (
    <TradeDialog
      title="Modify pending order"
      subtitle={`${order.symbol} · ${order.side} ${order.type}`}
      busy={mutation.isPending}
      onClose={onClose}
    >
      <p>
        The order keeps its identity. Changes reset its time priority and are
        risk-checked again. A marketable limit can execute immediately.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="dialog-protections">
          <label>
            Entry price
            <input
              aria-label="Pending entry price"
              value={entry}
              inputMode="decimal"
              onChange={(e) => setEntry(e.target.value)}
            />
          </label>
          <label>
            Quantity
            <input
              aria-label="Pending quantity"
              value={quantity}
              inputMode="decimal"
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Stop loss
            <input
              aria-label="Pending stop loss"
              value={sl}
              inputMode="decimal"
              onChange={(e) => setSL(e.target.value)}
            />
          </label>
          <label>
            Take profit
            <input
              aria-label="Pending take profit"
              value={tp}
              inputMode="decimal"
              onChange={(e) => setTP(e.target.value)}
            />
          </label>
        </div>
        <TradePreview
          preview={preview.data}
          pending={preview.isFetching}
          error={preview.isError ? message(preview.error) : undefined}
        />
        {mutation.isError && (
          <p role="alert" className="inline-error">
            {message(mutation.error)}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={
              !valid ||
              mutation.isPending ||
              preview.isError ||
              !preview.data?.can_submit
            }
          >
            Save order changes
          </button>
        </div>
      </form>
    </TradeDialog>
  );
}
