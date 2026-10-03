import Image from "next/image";
import {
  ArrowUpRight,
  CheckCircle,
  LockKey,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import "./product-detail-graphics.css";

export function AccountSnapshot() {
  return (
    <div
      className="pd-account"
      role="group"
      aria-label="Illustrative account overview"
    >
      <div className="pd-account-owner">
        <span className="az-avatar az-avatar-blue">AM</span>
        <div>
          <strong>Alex Morgan</strong>
          <small>Gold Elite / #23192</small>
        </div>
        <span className="pd-account-status">
          <CheckCircle size={14} weight="fill" /> Connected
        </span>
      </div>
      <div className="pd-account-platform">
        <Image
          src="/marketing/platforms/metatrader-5.png"
          alt=""
          width={24}
          height={24}
        />
        <strong>MetaTrader 5</strong>
        <span>USD account</span>
      </div>
      <div className="pd-account-balances">
        <div>
          <small>Balance</small>
          <strong>$24,680.00</strong>
        </div>
        <div>
          <small>Equity</small>
          <strong>$24,921.00</strong>
        </div>
      </div>
      <div className="pd-account-health">
        <span>
          <small>Leverage</small>
          <b>1:100</b>
        </span>
        <span>
          <small>Open positions</small>
          <b>2</b>
        </span>
        <span>
          <small>Risk profile</small>
          <b>
            <ShieldCheck size={13} /> Active
          </b>
        </span>
      </div>
      <div className="pd-position-heading">
        <span>OPEN POSITIONS</span>
        <span>Floating P/L</span>
      </div>
      <div className="pd-position">
        <span className="pd-instrument">Au</span>
        <div>
          <strong>XAUUSD</strong>
          <small>Buy · 0.10 lot</small>
        </div>
        <b>+$184.00</b>
        <ArrowUpRight size={14} />
      </div>
      <div className="pd-position">
        <span className="pd-instrument pd-instrument-fx">€</span>
        <div>
          <strong>EURUSD</strong>
          <small>Buy · 0.30 lot</small>
        </div>
        <b>+$57.00</b>
        <ArrowUpRight size={14} />
      </div>
      <div className="pd-account-total">
        <span>Combined floating P/L</span>
        <strong>+$241.00</strong>
      </div>
      <div className="pd-account-footer">
        <LockKey size={12} /> Permission-based account access
      </div>
    </div>
  );
}

export function RiskUsageGraphic() {
  return (
    <div
      className="pd-risk-usage"
      role="group"
      aria-label="Illustrative risk usage: daily loss 0.80% of 3.00%, drawdown 2.40% of 10.00%"
    >
      <div className="pd-risk-status">
        <span className="pd-shield">
          <ShieldCheck size={33} weight="duotone" />
        </span>
        <div>
          <small>ACCOUNT HEALTH</small>
          <strong>Within limits</strong>
          <span>Gold Elite · example account</span>
        </div>
        <span className="pd-risk-dot" aria-hidden="true" />
      </div>
      <div className="pd-risk-meter">
        <div>
          <span>Daily loss</span>
          <strong>
            0.80% <small>/ 3.00%</small>
          </strong>
        </div>
        <span className="pd-meter-rail">
          <span className="pd-meter-daily" />
        </span>
      </div>
      <div className="pd-risk-meter">
        <div>
          <span>Drawdown</span>
          <strong>
            2.40% <small>/ 10.00%</small>
          </strong>
        </div>
        <span className="pd-meter-rail">
          <span className="pd-meter-drawdown" />
        </span>
      </div>
      <div className="pd-meter-caption">
        <span>
          <i /> Current usage
        </span>
        <span>Policy threshold</span>
      </div>
    </div>
  );
}

export function CommissionGraphic() {
  return (
    <div
      className="pd-commission"
      role="group"
      aria-label="Illustrative per-lot commission: 2 dollars base commission plus 5 dollars community markup equals 7 dollars combined"
    >
      <div className="pd-commission-heading">
        <span>AT THE $5 EXTRA MARKUP LIMIT</span>
        <span>EXAMPLE</span>
      </div>
      <div className="pd-commission-equation">
        <div>
          <strong>$2</strong>
          <span>Base commission</span>
        </div>
        <span>+</span>
        <div className="pd-markup-value">
          <strong>$5</strong>
          <span>Community markup</span>
        </div>
        <span>=</span>
        <div>
          <strong>$7</strong>
          <span>Combined / lot</span>
        </div>
      </div>
      <div className="pd-commission-bar" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="pd-commission-legend">
        <span>
          <i /> Base
        </span>
        <span>
          <i /> Your community
        </span>
      </div>
    </div>
  );
}
