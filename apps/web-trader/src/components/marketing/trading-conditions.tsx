"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ArrowsHorizontal,
  Coins,
  GlobeHemisphereWest,
  Lightning,
} from "@phosphor-icons/react";
import { localizedUi } from "@/lib/site-language";
import { useSiteLanguage } from "@/lib/site-language-client";
import "./trading-conditions.css";

export function TradingConditions() {
  const copy = localizedUi[useSiteLanguage()];
  return (
    <section
      className="atc-conditions"
      aria-labelledby="trading-conditions-title"
    >
      <div className="az-container">
        <div className="atc-heading">
          <h2 id="trading-conditions-title">{copy.conditionsTitle}</h2>
          <Link href="/pricing">
            {copy.pricingLink} <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <dl className="atc-grid">
          <div>
            <dt>
              <Lightning size={18} aria-hidden="true" /> {copy.latency}
            </dt>
            <dd>
              0.05 <span>s</span>
            </dd>
            <dd className="atc-detail">Target execution · not a guarantee</dd>
          </div>
          <div>
            <dt>
              <ArrowsHorizontal size={18} aria-hidden="true" /> {copy.spreads}
            </dt>
            <dd>
              0.00 <span>pips</span>
            </dd>
            <dd className="atc-detail">{copy.variablePricing}</dd>
          </div>
          <div>
            <dt>
              <Coins size={18} aria-hidden="true" /> Pricing controls
            </dt>
            <dd>Custom</dd>
            <dd className="atc-detail">Commission & spread configuration</dd>
          </div>
          <div>
            <dt>
              <GlobeHemisphereWest size={18} aria-hidden="true" />{" "}
              {copy.executionModel}
            </dt>
            <dd className="atc-routing">A-book</dd>
            <dd className="atc-detail">{copy.directRouting}</dd>
          </div>
        </dl>
        <p className="atc-note">{copy.conditionsNote}</p>
      </div>
    </section>
  );
}
