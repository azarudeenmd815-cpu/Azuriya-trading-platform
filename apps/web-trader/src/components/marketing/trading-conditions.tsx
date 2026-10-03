import Link from "next/link";
import {
  ArrowUpRight,
  ArrowsHorizontal,
  Coins,
  GlobeHemisphereWest,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import "./trading-conditions.css";

export function TradingConditions() {
  return (
    <section
      className="atc-conditions"
      aria-labelledby="trading-conditions-title"
    >
      <div className="az-container">
        <div className="atc-heading">
          <h2 id="trading-conditions-title">Trading conditions at a glance.</h2>
          <Link href="/pricing">
            Explore pricing <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <dl className="atc-grid">
          <div>
            <dt>
              <Lightning size={18} aria-hidden="true" /> Execution latency
            </dt>
            <dd>
              0.05 <span>s</span>
            </dd>
            <dd className="atc-detail">50 milliseconds</dd>
          </div>
          <div>
            <dt>
              <ArrowsHorizontal size={18} aria-hidden="true" /> Spreads from
            </dt>
            <dd>
              0.00 <span>pips</span>
            </dd>
            <dd className="atc-detail">Variable liquidity provider pricing</dd>
          </div>
          <div>
            <dt>
              <Coins size={18} aria-hidden="true" /> Base commission
            </dt>
            <dd>
              $2.00 <span>/ lot</span>
            </dd>
            <dd className="atc-detail">Optional markup up to $5.00 / lot</dd>
          </div>
          <div>
            <dt>
              <GlobeHemisphereWest size={18} aria-hidden="true" /> Execution
              model
            </dt>
            <dd className="atc-routing">A-book</dd>
            <dd className="atc-detail">Direct liquidity provider routing</dd>
          </div>
        </dl>
        <p className="atc-note">
          Conditions vary by instrument, account and liquidity route. Commission
          is shown before optional markup; charging basis follows your account
          terms. Local preview execution is simulated.
        </p>
      </div>
    </section>
  );
}
