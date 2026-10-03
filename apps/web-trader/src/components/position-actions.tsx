"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClosePreview,
  Fill,
  OrderPreview,
  Position,
} from "@azuriya/api-types";
import { api, message, post } from "@/lib/api";
import { isPositiveDecimal, money, signClass } from "@/lib/decimal-display";
import { notify } from "@/lib/notifications";
import { TradeDialog } from "./trade-dialog";
import { TradePreview } from "./trade-preview";
export type PositionAction = {
  kind: "close" | "protect";
  position: Position;
  percentage?: string;
};
export function PositionDialog({
  action,
  accountId,
  onClose,
}: {
  action: PositionAction;
  accountId: string;
  onClose: () => void;
}) {
  const position = action.position,
    client = useQueryClient();
  const [quantity, setQuantity] = useState(position.quantity),
    [percentage, setPercentage] = useState(action.percentage ?? "");
  const [sl, setSL] = useState(position.stop_loss ?? ""),
    [tp, setTP] = useState(position.take_profit ?? "");
  const request = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  const closeBody = percentage ? { percentage } : { quantity };
  const protection = { stop_loss: sl || null, take_profit: tp || null };
  const closePreview = useQuery({
    queryKey: ["close-preview", accountId, position.id, closeBody],
    queryFn: () =>
      post<ClosePreview>(
        `/accounts/${accountId}/positions/${position.id}/close-preview`,
        closeBody,
      ),
    enabled:
      action.kind === "close" && isPositiveDecimal(percentage || quantity),
    retry: false,
  });
  const protectionPreview = useQuery({
    queryKey: ["protection-preview", accountId, position.id, protection],
    queryFn: () =>
      post<OrderPreview>(
        `/accounts/${accountId}/positions/${position.id}/protection-preview`,
        protection,
      ),
    enabled:
      action.kind === "protect" &&
      (!sl || isPositiveDecimal(sl)) &&
      (!tp || isPositiveDecimal(tp)),
    retry: false,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["account"] });
    void client.invalidateQueries({ queryKey: ["accounts"] });
  };
  const mutation = useMutation({
    mutationFn: () => {
      if (action.kind === "close") {
        const signature = JSON.stringify(closeBody);
        if (request.current?.signature !== signature)
          request.current = { signature, key: crypto.randomUUID() };
        return post<Position>(
          `/accounts/${accountId}/positions/${position.id}/close`,
          { ...closeBody, client_order_id: request.current.key },
          request.current.key,
        );
      }
      return api<Position>(`/accounts/${accountId}/positions/${position.id}`, {
        method: "PATCH",
        body: JSON.stringify(protection),
      });
    },
    onSuccess: () => {
      refresh();
      notify(
        action.kind === "close"
          ? "Position close executed"
          : "Position protection updated",
        "success",
        `position:${position.id}`,
      );
      onClose();
    },
    onError: (error) => notify(message(error), "error"),
  });
  const breakEven = useMutation({
    mutationFn: () => {
      const key = crypto.randomUUID();
      return post<Position>(
        `/accounts/${accountId}/positions/${position.id}/breakeven`,
        { client_order_id: key },
        key,
      );
    },
    onSuccess: (p) => {
      setSL(p.stop_loss ?? "");
      refresh();
      notify("Stop loss moved to breakeven");
    },
    onError: (error) => notify(message(error), "error"),
  });
  const preview = closePreview.data;
  return (
    <TradeDialog
      title={action.kind === "close" ? "Close position" : "Position protection"}
      subtitle={`${position.symbol} · ${position.side}`}
      busy={mutation.isPending || breakEven.isPending}
      onClose={onClose}
    >
      <p>
        {action.kind === "close"
          ? "The server rounds percentage closes to a valid quantity and protects against an invalid remaining position."
          : "Protection is validated against the current executable market. Empty fields remove their level."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {action.kind === "close" ? (
          <>
            <label>
              Quantity to close
              <input
                aria-label="Quantity to close"
                inputMode="decimal"
                value={percentage ? (preview?.quantity ?? "") : quantity}
                onChange={(e) => {
                  setPercentage("");
                  setQuantity(e.target.value);
                }}
              />
            </label>
            <div
              className="quick-close-presets"
              role="group"
              aria-label="Quick partial close"
            >
              {["10", "25", "50", "75", "100"].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={percentage === value ? "active" : ""}
                  onClick={() => setPercentage(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
            <div className="close-preview">
              <div>
                <span>Open quantity</span>
                <strong>{position.quantity} lots</strong>
              </div>
              <div>
                <span>Will close</span>
                <strong>{preview?.quantity ?? "—"} lots</strong>
              </div>
              <div>
                <span>Will remain</span>
                <strong>{preview?.remaining_quantity ?? "—"} lots</strong>
              </div>
              <div>
                <span>Estimated realized P&L</span>
                <strong className={signClass(preview?.estimated_realized_pnl)}>
                  {money(preview?.estimated_realized_pnl)}
                </strong>
              </div>
              <div>
                <span>Estimated closing commission</span>
                <strong>{money(preview?.estimated_commission)}</strong>
              </div>
              <div>
                <span>Estimated net realized P&L</span>
                <strong className={signClass(preview?.estimated_net_pnl)}>
                  {money(preview?.estimated_net_pnl)}
                </strong>
              </div>
            </div>
            {preview?.adjusted && (
              <p className="inline-warning">
                Adjusted to {preview.quantity} lots ({preview.actual_percentage}
                %) to satisfy the instrument quantity rules.
              </p>
            )}
            {preview?.validation_warnings?.map((warning) => (
              <p className="inline-warning" key={warning}>
                {warning}
              </p>
            ))}
            {closePreview.isError && (
              <p role="alert" className="inline-error">
                {message(closePreview.error)}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="dialog-protections">
              <label>
                Stop loss
                <input
                  aria-label="Position stop loss"
                  value={sl}
                  onChange={(e) => setSL(e.target.value)}
                  inputMode="decimal"
                  placeholder="Optional price"
                />
              </label>
              <label>
                Take profit
                <input
                  aria-label="Position take profit"
                  value={tp}
                  onChange={(e) => setTP(e.target.value)}
                  inputMode="decimal"
                  placeholder="Optional price"
                />
              </label>
            </div>
            <div className="protection-toolbar">
              <button
                type="button"
                className="secondary-button"
                disabled={breakEven.isPending}
                onClick={() => breakEven.mutate()}
              >
                Move SL to breakeven
              </button>
              <small>Entry {position.open_price}</small>
            </div>
            <TradePreview
              preview={protectionPreview.data}
              pending={protectionPreview.isFetching}
              error={
                protectionPreview.isError
                  ? message(protectionPreview.error)
                  : undefined
              }
            />
            {breakEven.isError && (
              <p role="alert" className="inline-error">
                {message(breakEven.error)}
              </p>
            )}
          </>
        )}
        {mutation.isError && (
          <div role="alert" className="error-box">
            {message(mutation.error)}
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={
              mutation.isPending ||
              (action.kind === "close"
                ? closePreview.isError ||
                  !closePreview.data ||
                  closePreview.isFetching
                : protectionPreview.isError ||
                  !protectionPreview.data ||
                  protectionPreview.isFetching)
            }
          >
            {mutation.isPending
              ? "Processing…"
              : action.kind === "close"
                ? "Confirm close"
                : "Save protection"}
          </button>
        </div>
      </form>
    </TradeDialog>
  );
}
export function PositionDetail({
  position,
  fills,
  onClose,
}: {
  position: Position;
  fills: Fill[];
  onClose: () => void;
}) {
  const rows = [
    ["Symbol", position.symbol],
    ["Side", position.side],
    ["Quantity", position.quantity],
    ["Open price", position.open_price],
    ["Current price", position.current_price],
    ["Unrealized P&L", money(position.unrealized_pnl)],
    ["Stop loss", position.stop_loss ?? "—"],
    ["Take profit", position.take_profit ?? "—"],
    ["Margin used", money(position.margin_used)],
    ["Commissions paid", money(position.commission_paid)],
    ["Accumulated swap", money(position.swap_accrued)],
    ["Opened", new Date(position.opened_at).toLocaleString()],
    ["Position ID", position.id],
  ];
  return (
    <TradeDialog
      title="Position details"
      subtitle={`${position.symbol} · ${position.side}`}
      onClose={onClose}
    >
      <dl className="position-detail-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Executions</h3>
      <div className="detail-fills">
        <table>
          <thead>
            <tr>
              <th>Side</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {fills
              .filter((fill) => fill.position_id === position.id)
              .map((fill) => (
                <tr key={fill.id}>
                  <td>{fill.side}</td>
                  <td>{fill.quantity}</td>
                  <td>{fill.price}</td>
                  <td>{fill.execution_reason.replaceAll("_", " ")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </TradeDialog>
  );
}
