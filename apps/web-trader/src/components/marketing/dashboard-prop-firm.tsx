"use client";

import { useId, useState } from "react";
import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  Clock,
  CurrencyDollar,
  Flag,
  LockKey,
  Medal,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendUp,
  Wallet,
} from "@phosphor-icons/react";
import "./dashboard-prop-firm.css";

// Immutable display fixtures. Production challenge values and decisions come from versioned APIs.
const programs = {
  "25000.00": {
    name: "$25k",
    balance: "25000.00",
    equity: "25620.00",
    peak: "25930.00",
    profit: "620.00",
    dailyUsed: "160.00",
    drawdownUsed: "310.00",
    targets: { "8.00": "2000.00", "10.00": "2500.00", "12.00": "3000.00" },
    verification: { "4.00": "1000.00", "5.00": "1250.00", "6.00": "1500.00" },
    daily: {
      "3.00": ["750.00", "590.00"],
      "4.00": ["1000.00", "840.00"],
      "5.00": ["1250.00", "1090.00"],
    },
    loss: {
      "6.00": ["1500.00", "1190.00", "23500.00"],
      "8.00": ["2000.00", "1690.00", "23000.00"],
      "10.00": ["2500.00", "2190.00", "22500.00"],
    },
  },
  "50000.00": {
    name: "$50k",
    balance: "50000.00",
    equity: "51240.00",
    peak: "51860.00",
    profit: "1240.00",
    dailyUsed: "320.00",
    drawdownUsed: "620.00",
    targets: { "8.00": "4000.00", "10.00": "5000.00", "12.00": "6000.00" },
    verification: { "4.00": "2000.00", "5.00": "2500.00", "6.00": "3000.00" },
    daily: {
      "3.00": ["1500.00", "1180.00"],
      "4.00": ["2000.00", "1680.00"],
      "5.00": ["2500.00", "2180.00"],
    },
    loss: {
      "6.00": ["3000.00", "2380.00", "47000.00"],
      "8.00": ["4000.00", "3380.00", "46000.00"],
      "10.00": ["5000.00", "4380.00", "45000.00"],
    },
  },
  "100000.00": {
    name: "$100k",
    balance: "100000.00",
    equity: "102480.00",
    peak: "103720.00",
    profit: "2480.00",
    dailyUsed: "640.00",
    drawdownUsed: "1240.00",
    targets: { "8.00": "8000.00", "10.00": "10000.00", "12.00": "12000.00" },
    verification: { "4.00": "4000.00", "5.00": "5000.00", "6.00": "6000.00" },
    daily: {
      "3.00": ["3000.00", "2360.00"],
      "4.00": ["4000.00", "3360.00"],
      "5.00": ["5000.00", "4360.00"],
    },
    loss: {
      "6.00": ["6000.00", "4760.00", "94000.00"],
      "8.00": ["8000.00", "6760.00", "92000.00"],
      "10.00": ["10000.00", "8760.00", "90000.00"],
    },
  },
} as const;

type ProgramSize = keyof typeof programs;
type Category = "Program setup" | "Risk rules" | "Payouts";
type Rule = {
  key: string;
  label: string;
  initial: string;
  options: readonly (readonly [string, string])[];
};
const rules: Record<Category, readonly Rule[]> = {
  "Program setup": [
    {
      key: "model",
      label: "Challenge model",
      initial: "two-step",
      options: [
        ["two-step", "Two-step evaluation"],
        ["one-step", "One-step evaluation"],
      ],
    },
    {
      key: "target",
      label: "Evaluation profit target",
      initial: "8.00",
      options: [
        ["8.00", "8.00%"],
        ["10.00", "10.00%"],
        ["12.00", "12.00%"],
      ],
    },
    {
      key: "verification",
      label: "Verification profit target",
      initial: "5.00",
      options: [
        ["4.00", "4.00%"],
        ["5.00", "5.00%"],
        ["6.00", "6.00%"],
      ],
    },
    {
      key: "days",
      label: "Minimum trading days",
      initial: "5",
      options: [
        ["5", "5 trading days"],
        ["7", "7 trading days"],
        ["10", "10 trading days"],
      ],
    },
    {
      key: "deadline",
      label: "Evaluation time limit",
      initial: "unlimited",
      options: [
        ["unlimited", "No time limit"],
        ["30", "30 calendar days"],
        ["60", "60 calendar days"],
      ],
    },
    {
      key: "platform",
      label: "Program trading platform",
      initial: "MetaTrader 5",
      options: [
        ["MetaTrader 5", "MetaTrader 5"],
        ["cTrader", "cTrader"],
        ["TradeLocker", "TradeLocker"],
      ],
    },
    {
      key: "leverage",
      label: "Program leverage",
      initial: "1:100",
      options: [
        ["1:30", "1:30"],
        ["1:50", "1:50"],
        ["1:100", "1:100"],
      ],
    },
    {
      key: "reset",
      label: "Evaluation reset",
      initial: "review",
      options: [
        ["review", "After operator review"],
        ["expiry", "After program expiry"],
        ["disabled", "No resets"],
      ],
    },
  ],
  "Risk rules": [
    {
      key: "drawdown",
      label: "Drawdown model",
      initial: "static",
      options: [
        ["static", "Static balance floor"],
        ["equity-trailing", "Trailing equity high-water mark"],
        ["balance-trailing", "Trailing end-of-day balance"],
      ],
    },
    {
      key: "daily",
      label: "Daily loss limit",
      initial: "5.00",
      options: [
        ["3.00", "3.00%"],
        ["4.00", "4.00%"],
        ["5.00", "5.00%"],
      ],
    },
    {
      key: "maximum",
      label: "Maximum loss limit",
      initial: "10.00",
      options: [
        ["6.00", "6.00%"],
        ["8.00", "8.00%"],
        ["10.00", "10.00%"],
      ],
    },
    {
      key: "lots",
      label: "Aggregate lot limit",
      initial: "5.00",
      options: [
        ["2.00", "2.00 lots"],
        ["5.00", "5.00 lots"],
        ["10.00", "10.00 lots"],
      ],
    },
    {
      key: "exposure",
      label: "Single-symbol exposure",
      initial: "30.00",
      options: [
        ["20.00", "20.00% of margin"],
        ["30.00", "30.00% of margin"],
        ["50.00", "50.00% of margin"],
      ],
    },
    {
      key: "consistency",
      label: "Best-day consistency cap",
      initial: "30.00",
      options: [
        ["20.00", "20.00% of total profit"],
        ["30.00", "30.00% of total profit"],
        ["40.00", "40.00% of total profit"],
      ],
    },
    {
      key: "news",
      label: "High-impact news window",
      initial: "5min",
      options: [
        ["2min", "2 minutes before / after"],
        ["5min", "5 minutes before / after"],
        ["blocked", "Block throughout the event"],
      ],
    },
    {
      key: "weekend",
      label: "Weekend positions",
      initial: "close",
      options: [
        ["close", "Close before Friday cutoff"],
        ["allowed", "Holding permitted"],
      ],
    },
    {
      key: "automation",
      label: "Expert advisor policy",
      initial: "approved",
      options: [
        ["approved", "Approved EAs only"],
        ["review", "Individual strategy review"],
      ],
    },
  ],
  Payouts: [
    {
      key: "split",
      label: "Trader profit split",
      initial: "80.00",
      options: [
        ["80.00", "80.00% trader / 20.00% firm"],
        ["85.00", "85.00% trader / 15.00% firm"],
        ["90.00", "90.00% trader / 10.00% firm"],
      ],
    },
    {
      key: "first",
      label: "First payout eligibility",
      initial: "14",
      options: [
        ["14", "14 calendar days"],
        ["21", "21 calendar days"],
        ["30", "30 calendar days"],
      ],
    },
    {
      key: "cadence",
      label: "Payout frequency",
      initial: "14",
      options: [
        ["14", "Every 14 days"],
        ["30", "Every 30 days"],
      ],
    },
    {
      key: "minimum",
      label: "Minimum payout request",
      initial: "100.00",
      options: [
        ["100.00", "$100.00 USD"],
        ["200.00", "$200.00 USD"],
        ["500.00", "$500.00 USD"],
      ],
    },
    {
      key: "reserve",
      label: "Retained profit buffer",
      initial: "5.00",
      options: [
        ["0.00", "0.00%"],
        ["5.00", "5.00%"],
        ["10.00", "10.00%"],
      ],
    },
    {
      key: "scaling",
      label: "Account scaling increment",
      initial: "25.00",
      options: [
        ["20.00", "20.00%"],
        ["25.00", "25.00%"],
        ["40.00", "40.00%"],
      ],
    },
    {
      key: "scalingTarget",
      label: "Scaling profit threshold",
      initial: "10.00",
      options: [
        ["10.00", "10.00% over review period"],
        ["15.00", "15.00% over review period"],
        ["20.00", "20.00% over review period"],
      ],
    },
    {
      key: "payoutReview",
      label: "Payout approval workflow",
      initial: "dual",
      options: [
        ["dual", "Risk + finance approval"],
        ["finance", "Finance review + risk clearance"],
      ],
    },
  ],
};
const initialSettings = Object.fromEntries(
  Object.values(rules)
    .flat()
    .map((rule) => [rule.key, rule.initial]),
);
const dailyHeadroom = {
  "3.00": "78.67",
  "4.00": "84.00",
  "5.00": "87.20",
} as const;
const maxHeadroom = {
  "6.00": "79.33",
  "8.00": "84.50",
  "10.00": "87.60",
} as const;
const targetProgress = {
  "8.00": "31.00",
  "10.00": "24.80",
  "12.00": "20.67",
} as const;
const verificationProgress = {
  "4.00": "62.00",
  "5.00": "49.60",
  "6.00": "41.33",
} as const;
const fundedTraderShare = {
  "25000.00": { "80.00": "496.00", "85.00": "527.00", "90.00": "558.00" },
  "50000.00": { "80.00": "992.00", "85.00": "1054.00", "90.00": "1116.00" },
  "100000.00": { "80.00": "1984.00", "85.00": "2108.00", "90.00": "2232.00" },
} as const;
const drawdownLabels = {
  static: "Static balance floor",
  "equity-trailing": "Trailing equity high-water mark",
  "balance-trailing": "Trailing end-of-day balance",
} as const;
const staticCushion = {
  "25000.00": { "6.00": "2120.00", "8.00": "2620.00", "10.00": "3120.00" },
  "50000.00": { "6.00": "4240.00", "8.00": "5240.00", "10.00": "6240.00" },
  "100000.00": { "6.00": "8480.00", "8.00": "10480.00", "10.00": "12480.00" },
} as const;
const trailingFloor = {
  "25000.00": { "6.00": "24430.00", "8.00": "23930.00", "10.00": "23430.00" },
  "50000.00": { "6.00": "48860.00", "8.00": "47860.00", "10.00": "46860.00" },
  "100000.00": { "6.00": "97720.00", "8.00": "95720.00", "10.00": "93720.00" },
} as const;
const equitySamplePercent = [
  "0.00",
  "-0.50",
  "0.35",
  "0.20",
  "0.70",
  "-0.30",
  "1.20",
  "1.10",
  "2.10",
  "1.40",
  "2.20",
  "1.85",
  "2.95",
  "2.50",
  "3.40",
  "3.20",
  "3.72",
  "2.90",
  "3.40",
  "2.30",
  "2.80",
  "2.48",
] as const;

function money(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
function selectedLabel(key: string, value: string) {
  return (
    Object.values(rules)
      .flat()
      .find((rule) => rule.key === key)
      ?.options.find(([option]) => option === value)?.[1] ?? value
  );
}

export function PropFirmView() {
  const chartId = useId().replaceAll(":", "");
  const [size, setSize] = useState<ProgramSize>("50000.00");
  const [category, setCategory] = useState<Category>("Program setup");
  const [settings, setSettings] =
    useState<Record<string, string>>(initialSettings);
  const [stage, setStage] = useState("Evaluation 1");
  const [reviewed, setReviewed] = useState(false);
  const program = programs[size];
  const target =
    program.targets[settings.target as keyof typeof program.targets];
  const verification =
    program.verification[
      settings.verification as keyof typeof program.verification
    ];
  const daily = program.daily[settings.daily as keyof typeof program.daily];
  const loss = program.loss[settings.maximum as keyof typeof program.loss];
  const isTrailing = settings.drawdown !== "static";
  const isFunded = stage === "Funded";
  const isVerification = stage === "Verification";
  const activeTarget = isVerification ? verification : target;
  const activeTargetPercent = isVerification
    ? settings.verification
    : settings.target;
  const qualificationProgress = isVerification
    ? verificationProgress[
        settings.verification as keyof typeof verificationProgress
      ]
    : targetProgress[settings.target as keyof typeof targetProgress];
  const chartUpperPercent = isFunded ? "5.00" : activeTargetPercent;
  const monitorName = isFunded
    ? "Funded account equity monitor"
    : isVerification
      ? "Verification equity monitor"
      : "Evaluation equity monitor";
  // Floating-point values below are SVG coordinates only; financial summaries use decimal-string fixtures.
  const chartY = (percent: number) =>
    35 +
    ((Number(chartUpperPercent) - percent) /
      (Number(chartUpperPercent) + Number(settings.maximum))) *
      160;
  const equityPath = equitySamplePercent
    .map(
      (percent, index) =>
        `${index === 0 ? "M" : "L"}${68 + (471 * index) / (equitySamplePercent.length - 1)} ${chartY(Number(percent))}`,
    )
    .join(" ");
  let peakPercent = 0;
  const trailingPath = equitySamplePercent
    .map((percent, index) => {
      peakPercent = Math.max(peakPercent, Number(percent));
      const x = 68 + (471 * index) / (equitySamplePercent.length - 1);
      const y = chartY(peakPercent - Number(settings.maximum));
      return index === 0 ? `M${x} ${y}` : `H${x} V${y}`;
    })
    .join(" ");
  const stages = [
    {
      name: "Evaluation 1",
      icon: Target,
      metric: `${settings.target}% profit target`,
      detail: `${money(target)} to qualify`,
    },
    {
      name: "Verification",
      icon: ShieldCheck,
      metric:
        settings.model === "one-step"
          ? "Not required"
          : `${settings.verification}% profit target`,
      detail:
        settings.model === "one-step"
          ? "One-step program selected"
          : `${money(verification)} to qualify`,
    },
    {
      name: "Funded",
      icon: Medal,
      metric: `${settings.split}% trader share`,
      detail: `Payout review every ${settings.cadence} days`,
    },
  ];
  const update = (key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === "model" && value === "one-step" && stage === "Verification")
      setStage("Evaluation 1");
    setReviewed(false);
  };

  return (
    <section
      className="dp-view"
      aria-label="Prop firm program preview"
      data-prop-firm-preview
    >
      <div className="dp-program-bar">
        <div className="dp-program-name">
          <span className="dp-program-icon">
            <Flag size={20} weight="duotone" />
          </span>
          <span>
            <strong>Azuriya Evaluation</strong>
            <small>Program PF-002 · USD · v2.4</small>
          </span>
        </div>
        <div
          className="dp-presets"
          role="group"
          aria-label="Evaluation account size"
        >
          {(Object.keys(programs) as ProgramSize[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === size}
              aria-label={`${money(programs[key].balance)} evaluation account`}
              onClick={() => {
                setSize(key);
                setReviewed(false);
              }}
            >
              {programs[key].name}
            </button>
          ))}
        </div>
        <span className="dp-preview-label">
          <span />
          Demo program
        </span>
      </div>

      <div
        className="dp-lifecycle"
        role="group"
        aria-label="Challenge lifecycle stages"
      >
        {stages.map((item, index) => (
          <button
            key={item.name}
            type="button"
            className={`dp-stage ${stage === item.name ? "dp-stage-active" : ""}`}
            aria-pressed={stage === item.name}
            aria-label={`${item.name} stage`}
            disabled={
              item.name === "Verification" && settings.model === "one-step"
            }
            onClick={() => setStage(item.name)}
          >
            <span className="dp-stage-top">
              <span className="dp-stage-number">0{index + 1}</span>
              <item.icon size={18} weight="duotone" />
              <strong>{item.name}</strong>
              {index < stages.length - 1 && (
                <ArrowRight className="dp-stage-arrow" size={16} />
              )}
            </span>
            <span className="dp-stage-metric">{item.metric}</span>
            <span className="dp-stage-detail">{item.detail}</span>
          </button>
        ))}
      </div>

      <div className="dp-workbench">
        <div className="dp-monitor-stack">
          <section className="dp-panel dp-equity" aria-label={monitorName}>
            <div className="dp-panel-head">
              <h3>
                <ChartLineUp size={16} />
                {isFunded
                  ? "Funded equity & payout"
                  : isVerification
                    ? "Verification equity & drawdown"
                    : "Evaluation equity & drawdown"}
              </h3>
              <span className="dp-chip">{stage}</span>
            </div>
            <div className="dp-equity-totals">
              <div>
                <small>Account equity</small>
                <strong>{money(program.equity)}</strong>
                <span>
                  <TrendUp size={12} />+{money(program.profit)} · +2.48%
                </span>
              </div>
              <div className="dp-equity-side">
                <small>High-water mark</small>
                <strong>{money(program.peak)}</strong>
                <small>{selectedLabel("drawdown", settings.drawdown)}</small>
              </div>
            </div>
            <svg
              className="dp-equity-chart"
              viewBox="0 0 560 222"
              role="img"
              aria-label={`${program.name} ${isFunded ? "funded" : isVerification ? "verification" : "evaluation"} equity illustration with ${isTrailing ? "trailing" : "static"} drawdown floor`}
            >
              <defs>
                <linearGradient
                  id={`${chartId}-equity`}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#2861cc" stopOpacity=".17" />
                  <stop offset="100%" stopColor="#2861cc" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[35, 75, 115, 155, 195].map((y) => (
                <line
                  key={y}
                  x1="68"
                  x2="548"
                  y1={y}
                  y2={y}
                  stroke="#e8edf4"
                  strokeDasharray="3 4"
                />
              ))}
              {[68, 164, 260, 356, 452, 548].map((x) => (
                <line key={x} x1={x} x2={x} y1="25" y2="195" stroke="#f0f3f8" />
              ))}
              <text x="0" y="40" className="dp-chart-axis">
                +{chartUpperPercent}%
              </text>
              <text x="0" y={chartY(0) + 4} className="dp-chart-axis">
                {program.name}
              </text>
              <text x="0" y="199" className="dp-chart-axis">
                −{settings.maximum}%
              </text>
              <line
                x1="68"
                x2="548"
                y1={isFunded ? chartY(3.72) : 35}
                y2={isFunded ? chartY(3.72) : 35}
                stroke="#91b4ed"
                strokeDasharray="5 4"
              />
              <text
                x="542"
                y={isFunded ? chartY(3.72) - 7 : 28}
                textAnchor="end"
                className="dp-chart-target"
              >
                {isFunded
                  ? "Equity high-water mark"
                  : `${activeTargetPercent}% profit target`}
              </text>
              <path
                d={`${equityPath} L539 195 L68 195 Z`}
                fill={`url(#${chartId}-equity)`}
              />
              <path
                d={equityPath}
                fill="none"
                stroke="#2861cc"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d={isTrailing ? `${trailingPath} H548` : "M68 195 H548"}
                fill="none"
                stroke="#d29a49"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <circle
                cx="539"
                cy={chartY(2.48)}
                r="4"
                fill="#2861cc"
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x="542"
                y={
                  isTrailing ? chartY(3.72 - Number(settings.maximum)) - 8 : 187
                }
                textAnchor="end"
                className="dp-chart-floor"
              >
                {isTrailing
                  ? "Illustrative trailing floor"
                  : "Static drawdown floor"}
              </text>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Today"].map(
                (day, index) => (
                  <text
                    key={day}
                    x={68 + index * 96}
                    y="217"
                    textAnchor={index === 5 ? "end" : "start"}
                    className="dp-chart-axis"
                  >
                    {day}
                  </text>
                ),
              )}
            </svg>
            <div className="dp-chart-legend">
              <span>
                <i />
                Equity
              </span>
              <span>
                <i />
                Drawdown limit
              </span>
              <small>Illustrative equity path · demo values</small>
            </div>
            {isFunded ? (
              <div
                className="dp-funded-metrics"
                role="group"
                aria-label="Funded payout cycle metrics"
              >
                <div>
                  <small>Illustrative trader share</small>
                  <strong>
                    {money(
                      fundedTraderShare[size][
                        settings.split as keyof (typeof fundedTraderShare)[typeof size]
                      ],
                    )}
                  </strong>
                  <span>
                    {settings.split}% of {money(program.profit)} gross profit
                  </span>
                </div>
                <div>
                  <small>Payout cycle</small>
                  <strong>Day 9 / {settings.first}</strong>
                  <span>First eligibility after {settings.first} days</span>
                </div>
                <p>
                  <LockKey size={12} />
                  Payout request not submitted · risk & finance review required
                </p>
                <small>
                  Share shown before retained buffer, adjustments and payout
                  approval.
                </small>
              </div>
            ) : (
              <>
                <div className="dp-target-row">
                  <span>
                    <Target size={14} />
                    {isVerification ? "Verification" : "Evaluation"} target{" "}
                    <strong>{money(activeTarget)}</strong>
                  </span>
                  <b>{qualificationProgress}% complete</b>
                </div>
                <div className="dp-progress">
                  <span
                    style={{
                      width: `${qualificationProgress}%`,
                    }}
                  />
                </div>
              </>
            )}
          </section>

          <section
            className="dp-panel dp-risk-panel"
            aria-label={
              isFunded ? "Funded risk headroom" : "Challenge risk headroom"
            }
          >
            <div className="dp-panel-head">
              <h3>
                <ShieldCheck size={16} />
                Risk headroom
              </h3>
              <span className="dp-health">
                <CheckCircle size={12} />
                Within demo limits
              </span>
            </div>
            <div className="dp-risk-row">
              <div>
                <span>Daily loss budget</span>
                <strong>
                  {money(daily[1])}
                  <small>remaining</small>
                </strong>
              </div>
              <div className="dp-meter-track">
                <span
                  style={{
                    width: `${dailyHeadroom[settings.daily as keyof typeof dailyHeadroom]}%`,
                  }}
                />
              </div>
              <p>
                {money(program.dailyUsed)} used of {money(daily[0])}
                <span>Resets 00:00 UTC</span>
              </p>
            </div>
            <div className="dp-risk-row">
              <div>
                <span>
                  {isTrailing
                    ? "Trailing drawdown budget"
                    : "Static loss floor cushion"}
                </span>
                <strong>
                  {money(
                    isTrailing
                      ? loss[1]
                      : staticCushion[size][
                          settings.maximum as keyof (typeof staticCushion)[typeof size]
                        ],
                  )}
                  <small>remaining</small>
                </strong>
              </div>
              <div className="dp-meter-track">
                <span
                  style={{
                    width: isTrailing
                      ? `${maxHeadroom[settings.maximum as keyof typeof maxHeadroom]}%`
                      : "100%",
                  }}
                />
              </div>
              <p>
                {isTrailing
                  ? `${money(program.drawdownUsed)} used of ${money(loss[0])}`
                  : `${money(loss[0])} starting loss allowance`}
                <span>
                  {isTrailing
                    ? `Trailing floor ${money(trailingFloor[size][settings.maximum as keyof (typeof trailingFloor)[typeof size]])}`
                    : `Balance floor ${money(loss[2])}`}
                </span>
              </p>
            </div>
            <div className="dp-risk-micro">
              <span>
                <strong>{isFunded ? "9 days" : `3 / ${settings.days}`}</strong>
                {isFunded ? "Cycle elapsed" : "Trading days"}
              </span>
              <span>
                <strong>1.80 / {settings.lots}</strong>Open lots
              </span>
              <span>
                <strong>18.40%</strong>Best-day contribution
              </span>
            </div>
          </section>

          <section
            className="dp-panel dp-payout-card"
            aria-label="Funded account payout preview"
          >
            <div
              className="dp-split-ring"
              style={{
                background: `conic-gradient(#2861cc ${settings.split}%, #e7edf7 0)`,
              }}
            >
              <span>
                <b>{settings.split}%</b>
                <small>Trader share</small>
              </span>
            </div>
            <div>
              <h3>
                <Wallet size={15} />
                Funded account terms
              </h3>
              <p>
                First payout after <strong>{settings.first} days</strong>.
                Reviewed every <strong>{settings.cadence} days</strong>.
              </p>
              <div className="dp-payout-tags">
                <span>Minimum {money(settings.minimum)}</span>
                <span>Scaling +{settings.scaling}%</span>
                <span>{settings.reserve}% retained buffer</span>
              </div>
            </div>
          </section>
        </div>

        <section
          className="dp-panel dp-settings"
          aria-label="Prop firm rule configuration"
        >
          <div className="dp-panel-head">
            <h3>
              <SlidersHorizontal size={16} />
              Program configuration
            </h3>
            <span className="dp-settings-count">25 controls</span>
          </div>
          <div
            className="dp-categories"
            role="group"
            aria-label="Prop firm settings categories"
          >
            {(Object.keys(rules) as Category[]).map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="dp-rule-fields">
            {rules[category].map((rule) => (
              <label key={rule.key}>
                <span>{rule.label}</span>
                <select
                  aria-label={rule.label}
                  value={settings[rule.key]}
                  onChange={(event) => update(rule.key, event.target.value)}
                  disabled={
                    rule.key === "verification" && settings.model === "one-step"
                  }
                >
                  {rule.options.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="dp-enforcement">
            <LockKey size={17} />
            <div>
              <strong>Server safeguards always enforced</strong>
              <p>
                Order validation · risk checks · authenticated account ownership
                · audit trail
              </p>
            </div>
          </div>
          <button
            className="dp-review-button"
            type="button"
            onClick={() => setReviewed(true)}
          >
            <CheckCircle size={16} />
            Review program preview
            <ArrowRight size={15} />
          </button>
          <p className="dp-review-status" role="status">
            {reviewed
              ? "Preview reviewed. No challenge, funded account or payout was created."
              : "Changes affect this demonstration only."}
          </p>
        </section>
      </div>

      <section
        className="dp-panel dp-rule-summary"
        aria-label="Selected prop firm program rules"
      >
        <div className="dp-panel-head">
          <h3>
            <Flag size={15} />
            {program.name} program rule sheet
          </h3>
          <span className="dp-chip">
            {reviewed ? "Preview reviewed" : "Draft preview"}
          </span>
        </div>
        <div className="dp-summary-grid">
          <div>
            <Target size={16} />
            <span>
              Qualification
              <strong>
                {settings.target}% /{" "}
                {settings.model === "one-step"
                  ? "single phase"
                  : `${settings.verification}%`}
              </strong>
              <small>
                {settings.days} trading days ·{" "}
                {selectedLabel("deadline", settings.deadline)}
              </small>
            </span>
          </div>
          <div>
            <ShieldCheck size={16} />
            <span>
              Risk thresholds
              <strong>
                {settings.daily}% daily · {settings.maximum}% maximum
              </strong>
              <small>
                {
                  drawdownLabels[
                    settings.drawdown as keyof typeof drawdownLabels
                  ]
                }
              </small>
            </span>
          </div>
          <div>
            <CurrencyDollar size={16} />
            <span>
              Trader terms<strong>{settings.split}% profit share</strong>
              <small>
                {selectedLabel("payoutReview", settings.payoutReview)}
              </small>
            </span>
          </div>
          <div>
            <Clock size={16} />
            <span>
              Execution policy
              <strong>
                {settings.platform} · {settings.leverage}
              </strong>
              <small>
                {settings.news === "blocked"
                  ? "High-impact news blocked"
                  : `${settings.news === "2min" ? "2" : "5"}-minute news window`}{" "}
                ·{" "}
                {settings.weekend === "close"
                  ? "Friday cutoff"
                  : "Weekend holding"}
              </small>
            </span>
          </div>
        </div>
        <details className="dp-full-rules">
          <summary>
            Inspect all 25 configured rules
            <span>
              <SlidersHorizontal size={13} />
              Rule details
            </span>
          </summary>
          <dl>
            {Object.values(rules)
              .flat()
              .map((rule) => (
                <div key={rule.key}>
                  <dt>{rule.label}</dt>
                  <dd>
                    {selectedLabel(rule.key, settings[rule.key])}
                    {rule.key === "verification" &&
                    settings.model === "one-step"
                      ? " · Not required"
                      : ""}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      </section>
    </section>
  );
}
