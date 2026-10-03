"use client";

import { useId, useState, useSyncExternalStore } from "react";
import {
  EqualsIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import {
  calculateRevenueExample,
  EXAMPLE_MARKUP_OPTIONS,
  formatExampleUsd,
} from "@/lib/marketing-revenue";
import styles from "./revenue-calculator.module.css";

const subscribeToClientReady = () => () => {};
const getClientReady = () => true;
const getServerReady = () => false;

export function RevenueCalculator() {
  const id = useId();
  // Native input changes before hydration cannot update the illustrative totals.
  const clientReady = useSyncExternalStore(
    subscribeToClientReady,
    getClientReady,
    getServerReady,
  );
  const [markup, setMarkup] = useState<string>("1.00");
  const [monthlyLots, setMonthlyLots] = useState("10000");
  const example = calculateRevenueExample(markup, monthlyLots);
  const formattedLots = monthlyLots.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return (
    <div
      className={styles.calculator}
      data-revenue-calculator="true"
      role="group"
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.header}>
        <h3 id={`${id}-title`}>Your commercial model</h3>
        <SlidersHorizontalIcon size={19} aria-hidden="true" />
      </div>

      <div className={styles.body}>
        <fieldset
          className={styles.markup}
          aria-describedby={`${id}-markup-description`}
        >
          <legend>Your extra markup per lot</legend>
          <div className={styles.options}>
            {EXAMPLE_MARKUP_OPTIONS.map((option) => (
              <label key={option} className={styles.option}>
                <input
                  type="radio"
                  name={`${id}-markup`}
                  value={option}
                  checked={markup === option}
                  disabled={!clientReady}
                  onChange={() => setMarkup(option)}
                />
                <span>{formatExampleUsd(option)}</span>
              </label>
            ))}
          </div>
          <p
            id={`${id}-markup-description`}
            className={styles.markupDescription}
          >
            Up to $5.00 extra above the $2.00 base commission.
          </p>
        </fieldset>

        <div className={styles.equation}>
          <div>
            <span className={styles.equationLabel}>Base commission</span>
            <strong>{formatExampleUsd(example.baseCommission)}</strong>
          </div>
          <PlusIcon size={14} className={styles.operator} aria-hidden="true" />
          <div>
            <span className={styles.equationLabel}>Your markup</span>
            <strong className={styles.accent}>
              {formatExampleUsd(markup)}
            </strong>
          </div>
          <EqualsIcon
            size={14}
            className={styles.operator}
            aria-hidden="true"
          />
          <div>
            <span className={styles.equationLabel}>Trader pays</span>
            <strong>{formatExampleUsd(example.traderCommission)}</strong>
          </div>
        </div>
        <p className={styles.basis}>All commissions shown in USD per lot.</p>

        <div className={styles.volume}>
          <div className={styles.volumeHeader}>
            <label htmlFor={`${id}-volume`}>Monthly trading volume</label>
            <span>
              <strong>{formattedLots}</strong> lots
            </span>
          </div>
          <input
            id={`${id}-volume`}
            className={styles.range}
            type="range"
            min="1000"
            max="50000"
            step="1000"
            value={monthlyLots}
            disabled={!clientReady}
            onChange={(event) => setMonthlyLots(event.currentTarget.value)}
            aria-valuetext={`${formattedLots} lots per month`}
          />
          <div className={styles.rangeLabels} aria-hidden="true">
            <span>1,000 lots</span>
            <span>50,000 lots</span>
          </div>
        </div>
      </div>

      <div className={styles.result}>
        <div className={styles.resultHeader}>
          <span>Monthly example revenue</span>
          <span className={styles.exampleLabel}>Illustrative</span>
        </div>
        <output
          className={styles.revenue}
          aria-live="polite"
          aria-atomic="true"
          htmlFor={`${id}-volume`}
        >
          {formatExampleUsd(example.monthlyRevenue)}
        </output>
        <span className={styles.formula}>
          {formatExampleUsd(markup)} markup × {formattedLots} lots
        </span>
      </div>

      <p className={styles.note}>
        An example before costs, not a revenue guarantee. Actual pricing, volume
        and revenue may differ.
      </p>
    </div>
  );
}
