"use client";
import type { OrderPreview } from "@azuriya/api-types";
import { formatDecimal, money } from "@/lib/decimal-display";
export function TradePreview({
  preview,
  pending,
  error,
}: {
  preview?: OrderPreview;
  pending?: boolean;
  error?: string;
}) {
  return (
    <div className="risk-preview" aria-label="Server order preview">
      <div className="preview-heading">
        <span>Server preview</span>
        <small>{pending ? "Updating…" : "Non-binding"}</small>
      </div>
      <dl>
        <div>
          <dt>Calculated quantity</dt>
          <dd>
            {preview?.quantity ?? "—"} <small>lots</small>
          </dd>
        </div>
        <div>
          <dt>Estimated entry</dt>
          <dd>{preview?.estimated_entry ?? "—"}</dd>
        </div>
        <div>
          <dt>Risk budget</dt>
          <dd>
            {money(preview?.risk_amount)}{" "}
            <small>({formatDecimal(preview?.risk_percent)}%)</small>
          </dd>
        </div>
        <div>
          <dt>Potential loss</dt>
          <dd className="negative">{money(preview?.potential_loss)}</dd>
        </div>
        <div>
          <dt>Potential profit</dt>
          <dd className="positive">{money(preview?.potential_profit)}</dd>
        </div>
        <div>
          <dt>Risk / reward</dt>
          <dd>1 : {formatDecimal(preview?.risk_reward)}</dd>
        </div>
        <div>
          <dt>Estimated margin</dt>
          <dd>{money(preview?.estimated_margin)}</dd>
        </div>
        <div>
          <dt>Opening commission</dt>
          <dd>{money(preview?.estimated_commission)}</dd>
        </div>
        <div>
          <dt>Closing commission estimate</dt>
          <dd>{money(preview?.estimated_close_commission)}</dd>
        </div>
        {preview?.effective_leverage && (
          <div>
            <dt>Effective leverage</dt>
            <dd>1:{preview.effective_leverage}</dd>
          </div>
        )}
        <div>
          <dt>Free margin after</dt>
          <dd>{money(preview?.free_margin_after)}</dd>
        </div>
      </dl>
      {preview && (preview.stop_loss || preview.take_profit) && (
        <div className="protection-summary">
          <span>
            SL {preview.stop_loss ?? "—"} · Δ {preview.distance_to_sl}
          </span>
          <span>
            TP {preview.take_profit ?? "—"} · Δ {preview.distance_to_tp}
          </span>
        </div>
      )}
      {preview?.validation_warnings?.map((warning) => (
        <p className="inline-warning" key={warning}>
          {warning}
        </p>
      ))}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
