import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  Desktop,
  DeviceMobile,
} from "@phosphor-icons/react/dist/ssr";
import { FundingWalkthrough } from "./funding-walkthrough";
import "./mt5-deposit-highlight.css";

export function MT5DepositHighlight() {
  return (
    <section
      id="mt5-deposits"
      className="mdh-section az-container"
      aria-labelledby="mt5-highlight-title"
    >
      <div className="mdh-editorial">
        <div className="mdh-label">
          <Image
            src="/marketing/platforms/metatrader-5.png"
            alt=""
            width={24}
            height={24}
          />
          BUILT-IN MT5 PAYMENTS
        </div>
        <h2 id="mt5-highlight-title">
          Deposit directly
          <br />
          from <span>MetaTrader 5.</span>
        </h2>
        <p>
          Give your community a shorter path to funding. Traders can start a
          deposit inside MT5, choose a payment method and return to their
          account after checkout.
        </p>
        <div className="mdh-devices">
          <span>
            <Desktop size={17} /> Desktop terminal
          </span>
          <span>
            <DeviceMobile size={17} /> iOS &amp; Android
          </span>
        </div>
        <ul className="mdh-benefits">
          <li>
            <Check size={15} /> Payment methods configured for your brokerage
          </li>
          <li>
            <Check size={15} /> Currencies, fees and approval rules in your
            control
          </li>
        </ul>
        <Link href="/mt5-deposits" className="mdh-link">
          Explore MT5 deposits <ArrowUpRight size={19} />
        </Link>
        <small>Availability depends on your broker and payment provider.</small>
      </div>
      <div className="mdh-product">
        <div className="mdh-product-top">
          <span>
            <span className="mdh-product-dot" /> NATIVE FUNDING EXPERIENCE
          </span>
          <span>Interactive example</span>
        </div>
        <FundingWalkthrough compact />
      </div>
    </section>
  );
}
