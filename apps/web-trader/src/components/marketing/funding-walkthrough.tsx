"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Check,
  CheckCircle,
  CreditCard,
  CurrencyDollar,
  DeviceMobile,
  LockKey,
  Monitor,
  ShieldCheck,
  Wallet,
} from "@phosphor-icons/react";
import "./funding-walkthrough.css";

const steps = ["Choose amount", "Select method", "Provider checkout"];

export function FundingWalkthrough({ compact = false }: { compact?: boolean }) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"card" | "bank">("card");

  return (
    <div className={`fw-walkthrough${compact ? " fw-compact" : ""}`}>
      <div className="fw-heading">
        <span>
          <Image
            src="/marketing/platforms/metatrader-5.png"
            alt=""
            width={30}
            height={30}
          />
          <strong>MetaTrader 5</strong>
          <span className="fw-heading-divider" />
          Native payments
        </span>
        <span className="fw-demo-label">Illustrative walkthrough</span>
      </div>

      <div className="fw-device-layout">
        <div className="fw-desktop">
          <div className="fw-desktop-topbar">
            <span>
              <Monitor size={15} /> Desktop terminal
            </span>
            <span>Example account</span>
          </div>
          <div className="fw-desktop-content">
            <aside className="fw-terminal-nav" aria-label="Preview context">
              <span className="fw-account-label">YOUR WORKSPACE</span>
              <span>
                <CurrencyDollar size={17} /> Trading
              </span>
              <span>
                <Wallet size={17} /> Accounts
              </span>
              <strong>
                <CreditCard size={17} /> Payments
              </strong>
              <div className="fw-nav-bottom">
                <ShieldCheck size={17} /> Broker configured
              </div>
            </aside>
            <div className="fw-payment-content">
              <div className="fw-payment-title">
                <span className="fw-payment-icon">
                  <Wallet size={22} />
                </span>
                <div>
                  <span>FUND YOUR TRADING ACCOUNT</span>
                  <h3>Deposit from your terminal.</h3>
                </div>
              </div>

              <div className="fw-step-content" aria-live="polite">
                {step === 0 && (
                  <div className="fw-amount-step">
                    <div className="fw-field-label">Example deposit amount</div>
                    <div className="fw-amount-display">
                      <span>1,000.00</span>
                      <span>USD</span>
                    </div>
                    <p>
                      Choose an amount and an available currency inside MT5.
                      Your broker sets the supported currencies and limits.
                    </p>
                    <div className="fw-detail-row">
                      <span>Account currency</span>
                      <strong>USD</strong>
                    </div>
                  </div>
                )}
                {step === 1 && (
                  <div className="fw-method-step">
                    <div className="fw-field-label">
                      Explore example payment methods
                    </div>
                    <div className="fw-methods">
                      <button
                        type="button"
                        aria-pressed={method === "card"}
                        onClick={() => setMethod("card")}
                      >
                        <CreditCard size={24} />
                        <span>
                          <strong>Payment card</strong>
                          <small>Provider checkout</small>
                        </span>
                        {method === "card" && <CheckCircle size={20} />}
                      </button>
                      <button
                        type="button"
                        aria-pressed={method === "bank"}
                        onClick={() => setMethod("bank")}
                      >
                        <Bank size={24} />
                        <span>
                          <strong>Bank transfer</strong>
                          <small>Where supported</small>
                        </span>
                        {method === "bank" && <CheckCircle size={20} />}
                      </button>
                    </div>
                    <p>
                      Methods and providers are available according to your
                      broker&apos;s configuration and your region.
                    </p>
                  </div>
                )}
                {step === 2 && (
                  <div className="fw-provider-step">
                    <div className="fw-checkout-summary">
                      <span className="fw-checkout-icon">
                        <LockKey size={25} />
                      </span>
                      <div>
                        <strong>Complete with your payment provider</strong>
                        <p>
                          {method === "card"
                            ? "Enter card details on the provider’s secure page."
                            : "Follow your provider’s bank transfer instructions."}
                        </p>
                      </div>
                    </div>
                    <div className="fw-detail-row">
                      <span>Example amount</span>
                      <strong>1,000.00 USD</strong>
                    </div>
                    <div className="fw-detail-row">
                      <span>Next</span>
                      <strong>Return to MetaTrader 5</strong>
                    </div>
                    <p>
                      The account is credited after payment completion and
                      broker approval. Processing times depend on the method.
                    </p>
                  </div>
                )}
              </div>

              <div className="fw-preview-actions">
                <span>
                  <LockKey size={14} /> No payment is processed
                </span>
                <button
                  type="button"
                  onClick={() => setStep(step === 2 ? 0 : step + 1)}
                >
                  {step === 2 ? "Restart preview" : "Next step"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
          <div className="fw-terminal-footer">
            <span>
              <CreditCard size={13} /> Payments
            </span>
            <span>Desktop &amp; mobile</span>
          </div>
        </div>

        {!compact && (
          <div
            className="fw-mobile"
            aria-label="Illustrative mobile funding view"
          >
            <div className="fw-mobile-camera" />
            <div className="fw-mobile-screen">
              <div className="fw-mobile-topbar">
                <ArrowLeft size={17} />
                <strong>Deposit</strong>
                <Wallet size={17} />
              </div>
              <div className="fw-mobile-eyebrow">TRADING ACCOUNT</div>
              <div className="fw-mobile-amount">
                1,000.00 <small>USD</small>
              </div>
              <div className="fw-mobile-summary">
                <span>Payment method</span>
                <strong>
                  {method === "card" ? (
                    <CreditCard size={19} />
                  ) : (
                    <Bank size={19} />
                  )}
                  {method === "card" ? "Payment card" : "Bank transfer"}
                </strong>
              </div>
              <div className="fw-mobile-flow">
                {steps.map((title, index) => (
                  <div
                    key={title}
                    className={index === step ? "fw-mobile-current" : ""}
                  >
                    <span>
                      {index < step ? <Check size={12} /> : index + 1}
                    </span>
                    {title}
                  </div>
                ))}
              </div>
              <div className="fw-mobile-security">
                <ShieldCheck size={24} />
                <strong>Your provider handles the payment.</strong>
                <p>Return to MT5 when the payment flow is complete.</p>
              </div>
              <div className="fw-mobile-label">
                <DeviceMobile size={13} /> Mobile illustration
              </div>
            </div>
            <div className="fw-mobile-home" />
          </div>
        )}
      </div>

      <div
        className="fw-walkthrough-controls"
        role="group"
        aria-label="Funding walkthrough steps"
      >
        {steps.map((title, index) => (
          <button
            key={title}
            type="button"
            aria-pressed={index === step}
            onClick={() => setStep(index)}
          >
            <span>{index < step ? <Check size={15} /> : index + 1}</span>
            {title}
            {index === step && <ArrowRight size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}
