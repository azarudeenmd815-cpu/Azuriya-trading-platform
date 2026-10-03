"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowsSplit,
  Check,
  Copy,
  Pause,
  Play,
  ShieldCheck,
} from "@phosphor-icons/react";
import "./workflow-graphics.css";

const followers = [
  { initials: "MT", lot: "0.10", platform: "cTrader", logo: "ctrader.ico" },
  {
    initials: "JL",
    lot: "0.30",
    platform: "TradeLocker",
    logo: "tradelocker.webp",
  },
  {
    initials: "RK",
    lot: "0.15",
    platform: "MetaTrader 5",
    logo: "metatrader-5.png",
  },
];

export function CopyTradingDemo() {
  const [active, setActive] = useState(true);
  const [selected, setSelected] = useState("Gold Elite");
  return (
    <div
      className={`az-copy-visual wg-copy ${active ? "wg-active" : "wg-paused"}`}
    >
      <div className="az-copy-visual-header">
        <span>
          <Copy size={17} /> Copy distribution
        </span>
        <span className="az-preview-tag">DEMO</span>
      </div>
      <div className="az-copy-tabs" aria-label="Copy trading team">
        {["Gold Elite", "FX Intraday"].map((t) => (
          <button
            aria-pressed={selected === t}
            key={t}
            className={selected === t ? "is-active" : ""}
            onClick={() => setSelected(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="az-master-ticket">
        <span className="wg-platform-logo wg-master-logo">
          <Image
            src="/marketing/platforms/metatrader-5.png"
            alt=""
            width={40}
            height={40}
            unoptimized
          />
        </span>
        <span className="wg-master-identity">
          <small>MASTER ACCOUNT</small>
          <strong>
            {selected === "Gold Elite" ? "ALEX-GOLD-01" : "JAMES-FX-01"}
          </strong>
          <span className="wg-platform-name">MetaTrader 5</span>
        </span>
        <span className="az-ticket-symbol">
          {selected === "Gold Elite" ? "XAUUSD" : "EURUSD"}
          <small>
            <span className="az-gain">BUY</span> 1.00 lot
          </small>
        </span>
      </div>
      <div
        className={`wg-copy-route ${active ? "is-running" : ""}`}
        aria-hidden="true"
      >
        <span className="wg-route-trunk" />
        <span
          className="wg-route-packet wg-packet-master"
          data-copy-packet="master"
        />
        <div className="wg-route-hub">
          <ArrowsSplit size={18} weight="duotone" />
          <span>Azuriya copy engine</span>
        </div>
        <span className="wg-route-downlink" />
        <span className="wg-route-branches" />
        <span
          className="wg-route-packet wg-packet-engine"
          data-copy-packet="engine"
        />
        <span
          className="wg-route-packet wg-packet-left"
          data-copy-packet="ctrader"
        />
        <span
          className="wg-route-packet wg-packet-center"
          data-copy-packet="tradelocker"
        />
        <span
          className="wg-route-packet wg-packet-right"
          data-copy-packet="mt5"
        />
      </div>
      <div className="az-follower-tickets">
        {followers.map(({ initials, lot, platform, logo }, i) => (
          <div className="wg-follower" key={initials}>
            <div className="wg-platform-logo">
              <Image
                src={`/marketing/platforms/${logo}`}
                alt=""
                width={32}
                height={32}
                unoptimized
              />
            </div>
            <strong>Trader 0{i + 1}</strong>
            <div className="wg-platform-name">{platform}</div>
            <span>{lot} lot</span>
            <small>
              {active ? (
                <>
                  <Check size={12} />
                  Synced
                </>
              ) : (
                <>
                  <Pause size={12} />
                  Paused
                </>
              )}
            </small>
          </div>
        ))}
      </div>
      <div className="az-copy-visual-footer">
        <span>
          <ShieldCheck size={15} />
          Individual risk rules applied
        </span>
        <button
          onClick={() => setActive(!active)}
          aria-label={active ? "Pause copy preview" : "Resume copy preview"}
        >
          {active ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
      <p className="az-copy-note" aria-live="polite">
        {active
          ? `${selected === "Gold Elite" ? "324" : "184"} example accounts synchronized`
          : "Preview paused. No real accounts are connected."}
      </p>
    </div>
  );
}
