"use client";

import { useId, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CaretDown,
  CaretUp,
  ChartLineUp,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import "./dashboard-trading-journal.css";

type Period = "1W" | "1M" | "3M";
type JournalTrade = {
  id: string;
  team: string;
  symbol: string;
  side: "Buy" | "Sell";
  lot: string;
  entryDate: string;
  entryTime: string;
  entryPrice: string;
  exitDate: string;
  exitTime: string;
  exitPrice: string;
  realizedPnl: string;
};
type JournalFixture = {
  tradeIds: readonly string[];
  netPnl: string;
  wins: number;
  losses: number;
  winRate: string;
  best: string;
  worst: string;
  chart: {
    path: string;
    area: string;
    cumulative: readonly string[];
    zeroY: number;
    lastY: number;
    ticks: readonly { amount: string; y: number }[];
    dates: readonly string[];
  };
};

// Illustrative closed trades, not trading records. Financial values are decimal strings.
export const journalTrades = [
  {
    id: "J-0741",
    team: "Gold Elite",
    symbol: "XAUUSD",
    side: "Buy",
    lot: "0.50",
    entryDate: "2026-07-15",
    entryTime: "09:12",
    entryPrice: "2350.100",
    exitDate: "2026-07-15",
    exitTime: "10:38",
    exitPrice: "2354.420",
    realizedPnl: "216.00",
  },
  {
    id: "J-0742",
    team: "FX Intraday",
    symbol: "EURUSD",
    side: "Sell",
    lot: "1.00",
    entryDate: "2026-07-18",
    entryTime: "08:35",
    entryPrice: "1.08240",
    exitDate: "2026-07-18",
    exitTime: "10:14",
    exitPrice: "1.08162",
    realizedPnl: "78.00",
  },
  {
    id: "J-0743",
    team: "Scalping Pro",
    symbol: "GBPUSD",
    side: "Buy",
    lot: "0.25",
    entryDate: "2026-07-24",
    entryTime: "13:21",
    entryPrice: "1.28810",
    exitDate: "2026-07-24",
    exitTime: "13:48",
    exitPrice: "1.28690",
    realizedPnl: "-30.00",
  },
  {
    id: "J-0744",
    team: "Algo Team",
    symbol: "EURUSD",
    side: "Buy",
    lot: "0.50",
    entryDate: "2026-07-30",
    entryTime: "07:40",
    entryPrice: "1.08100",
    exitDate: "2026-07-30",
    exitTime: "09:52",
    exitPrice: "1.08224",
    realizedPnl: "62.00",
  },
  {
    id: "J-0821",
    team: "Gold Elite",
    symbol: "XAUUSD",
    side: "Sell",
    lot: "0.25",
    entryDate: "2026-08-08",
    entryTime: "10:06",
    entryPrice: "2400.200",
    exitDate: "2026-08-08",
    exitTime: "11:42",
    exitPrice: "2398.400",
    realizedPnl: "45.00",
  },
  {
    id: "J-0822",
    team: "FX Intraday",
    symbol: "EURUSD",
    side: "Buy",
    lot: "0.75",
    entryDate: "2026-08-12",
    entryTime: "08:19",
    entryPrice: "1.09010",
    exitDate: "2026-08-12",
    exitTime: "09:35",
    exitPrice: "1.08922",
    realizedPnl: "-66.00",
  },
  {
    id: "J-0823",
    team: "Scalping Pro",
    symbol: "GBPUSD",
    side: "Sell",
    lot: "0.50",
    entryDate: "2026-08-21",
    entryTime: "12:44",
    entryPrice: "1.30220",
    exitDate: "2026-08-21",
    exitTime: "13:08",
    exitPrice: "1.30106",
    realizedPnl: "57.00",
  },
  {
    id: "J-0824",
    team: "Algo Team",
    symbol: "EURUSD",
    side: "Sell",
    lot: "1.00",
    entryDate: "2026-08-28",
    entryTime: "07:36",
    entryPrice: "1.10300",
    exitDate: "2026-08-28",
    exitTime: "08:58",
    exitPrice: "1.10338",
    realizedPnl: "-38.00",
  },
  {
    id: "J-0931",
    team: "Gold Elite",
    symbol: "XAUUSD",
    side: "Buy",
    lot: "0.50",
    entryDate: "2026-09-02",
    entryTime: "09:24",
    entryPrice: "2510.100",
    exitDate: "2026-09-02",
    exitTime: "11:08",
    exitPrice: "2516.340",
    realizedPnl: "312.00",
  },
  {
    id: "J-0932",
    team: "FX Intraday",
    symbol: "EURUSD",
    side: "Buy",
    lot: "1.00",
    entryDate: "2026-09-04",
    entryTime: "08:12",
    entryPrice: "1.11120",
    exitDate: "2026-09-04",
    exitTime: "10:19",
    exitPrice: "1.11266",
    realizedPnl: "146.00",
  },
  {
    id: "J-0933",
    team: "Scalping Pro",
    symbol: "GBPUSD",
    side: "Buy",
    lot: "0.25",
    entryDate: "2026-09-10",
    entryTime: "13:04",
    entryPrice: "1.32200",
    exitDate: "2026-09-10",
    exitTime: "13:29",
    exitPrice: "1.32092",
    realizedPnl: "-27.00",
  },
  {
    id: "J-0934",
    team: "Algo Team",
    symbol: "EURUSD",
    side: "Sell",
    lot: "0.50",
    entryDate: "2026-09-12",
    entryTime: "07:50",
    entryPrice: "1.11440",
    exitDate: "2026-09-12",
    exitTime: "09:24",
    exitPrice: "1.11246",
    realizedPnl: "97.00",
  },
  {
    id: "J-0935",
    team: "Gold Elite",
    symbol: "XAUUSD",
    side: "Buy",
    lot: "0.50",
    entryDate: "2026-09-24",
    entryTime: "10:14",
    entryPrice: "2641.000",
    exitDate: "2026-09-24",
    exitTime: "11:46",
    exitPrice: "2639.220",
    realizedPnl: "-89.00",
  },
  {
    id: "J-0936",
    team: "FX Intraday",
    symbol: "EURUSD",
    side: "Sell",
    lot: "1.00",
    entryDate: "2026-09-25",
    entryTime: "08:42",
    entryPrice: "1.11240",
    exitDate: "2026-09-25",
    exitTime: "10:11",
    exitPrice: "1.11094",
    realizedPnl: "146.00",
  },
  {
    id: "J-0937",
    team: "Scalping Pro",
    symbol: "GBPUSD",
    side: "Sell",
    lot: "0.50",
    entryDate: "2026-09-28",
    entryTime: "12:39",
    entryPrice: "1.33140",
    exitDate: "2026-09-28",
    exitTime: "13:17",
    exitPrice: "1.32952",
    realizedPnl: "94.00",
  },
  {
    id: "J-0938",
    team: "Algo Team",
    symbol: "EURUSD",
    side: "Buy",
    lot: "0.50",
    entryDate: "2026-09-30",
    entryTime: "07:28",
    entryPrice: "1.10960",
    exitDate: "2026-09-30",
    exitTime: "09:06",
    exitPrice: "1.11110",
    realizedPnl: "75.00",
  },
] as const satisfies readonly JournalTrade[];

// Precomputed summaries and chart geometry reconcile to the fixtures above.
// Only chart coordinates use floating-point numbers; this preview performs no trading math.
export const journalFixtures = {
  "All teams": {
    "1W": {
      tradeIds: ["J-0935", "J-0936", "J-0937", "J-0938"],
      netPnl: "226.00",
      wins: 3,
      losses: 1,
      winRate: "75.0%",
      best: "146.00",
      worst: "-89.00",
      chart: {
        path: "M0 120.00 H180.00 V146.70 H360.00 V102.90 H540.00 V74.70 H720.00 V52.20",
        area: "M0 120.00 H180.00 V146.70 H360.00 V102.90 H540.00 V74.70 H720.00 V52.20 L720 180 L0 180 Z",
        cumulative: ["0.00", "-89.00", "57.00", "151.00", "226.00"],
        zeroY: 120,
        ticks: [
          {
            amount: "$400",
            y: 0,
          },
          {
            amount: "$250",
            y: 45,
          },
          {
            amount: "$100",
            y: 90,
          },
          {
            amount: "−$50",
            y: 135,
          },
          {
            amount: "−$200",
            y: 180,
          },
        ],
        dates: ["24 Sep", "25 Sep", "30 Sep"],
        lastY: 52.2,
      },
    },
    "1M": {
      tradeIds: [
        "J-0931",
        "J-0932",
        "J-0933",
        "J-0934",
        "J-0935",
        "J-0936",
        "J-0937",
        "J-0938",
      ],
      netPnl: "754.00",
      wins: 6,
      losses: 2,
      winRate: "75.0%",
      best: "312.00",
      worst: "-89.00",
      chart: {
        path: "M0 180.00 H90.00 V117.60 H180.00 V88.40 H270.00 V93.80 H360.00 V74.40 H450.00 V92.20 H540.00 V63.00 H630.00 V44.20 H720.00 V29.20",
        area: "M0 180.00 H90.00 V117.60 H180.00 V88.40 H270.00 V93.80 H360.00 V74.40 H450.00 V92.20 H540.00 V63.00 H630.00 V44.20 H720.00 V29.20 L720 180 L0 180 Z",
        cumulative: [
          "0.00",
          "312.00",
          "458.00",
          "431.00",
          "528.00",
          "439.00",
          "585.00",
          "679.00",
          "754.00",
        ],
        zeroY: 180,
        ticks: [
          {
            amount: "$900",
            y: 0,
          },
          {
            amount: "$675",
            y: 45,
          },
          {
            amount: "$450",
            y: 90,
          },
          {
            amount: "$225",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["02 Sep", "12 Sep", "30 Sep"],
        lastY: 29.2,
      },
    },
    "3M": {
      tradeIds: [
        "J-0741",
        "J-0742",
        "J-0743",
        "J-0744",
        "J-0821",
        "J-0822",
        "J-0823",
        "J-0824",
        "J-0931",
        "J-0932",
        "J-0933",
        "J-0934",
        "J-0935",
        "J-0936",
        "J-0937",
        "J-0938",
      ],
      netPnl: "1078.00",
      wins: 11,
      losses: 5,
      winRate: "68.8%",
      best: "312.00",
      worst: "-89.00",
      chart: {
        path: "M0 180.00 H45.00 V147.60 H90.00 V135.90 H135.00 V140.40 H180.00 V131.10 H225.00 V124.35 H270.00 V134.25 H315.00 V125.70 H360.00 V131.40 H405.00 V84.60 H450.00 V62.70 H495.00 V66.75 H540.00 V52.20 H585.00 V65.55 H630.00 V43.65 H675.00 V29.55 H720.00 V18.30",
        area: "M0 180.00 H45.00 V147.60 H90.00 V135.90 H135.00 V140.40 H180.00 V131.10 H225.00 V124.35 H270.00 V134.25 H315.00 V125.70 H360.00 V131.40 H405.00 V84.60 H450.00 V62.70 H495.00 V66.75 H540.00 V52.20 H585.00 V65.55 H630.00 V43.65 H675.00 V29.55 H720.00 V18.30 L720 180 L0 180 Z",
        cumulative: [
          "0.00",
          "216.00",
          "294.00",
          "264.00",
          "326.00",
          "371.00",
          "305.00",
          "362.00",
          "324.00",
          "636.00",
          "782.00",
          "755.00",
          "852.00",
          "763.00",
          "909.00",
          "1003.00",
          "1078.00",
        ],
        zeroY: 180,
        ticks: [
          {
            amount: "$1200",
            y: 0,
          },
          {
            amount: "$900",
            y: 45,
          },
          {
            amount: "$600",
            y: 90,
          },
          {
            amount: "$300",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["15 Jul", "28 Aug", "30 Sep"],
        lastY: 18.3,
      },
    },
  },
  "Gold Elite": {
    "1W": {
      tradeIds: ["J-0935"],
      netPnl: "-89.00",
      wins: 0,
      losses: 1,
      winRate: "0.0%",
      best: "-89.00",
      worst: "-89.00",
      chart: {
        path: "M0 60.00 H720.00 V113.40",
        area: "M0 60.00 H720.00 V113.40 L720 180 L0 180 Z",
        cumulative: ["0.00", "-89.00"],
        zeroY: 60,
        ticks: [
          {
            amount: "$100",
            y: 0,
          },
          {
            amount: "$25",
            y: 45,
          },
          {
            amount: "−$50",
            y: 90,
          },
          {
            amount: "−$125",
            y: 135,
          },
          {
            amount: "−$200",
            y: 180,
          },
        ],
        dates: ["24 Sep", "24 Sep", "24 Sep"],
        lastY: 113.4,
      },
    },
    "1M": {
      tradeIds: ["J-0931", "J-0935"],
      netPnl: "223.00",
      wins: 1,
      losses: 1,
      winRate: "50.0%",
      best: "312.00",
      worst: "-89.00",
      chart: {
        path: "M0 180.00 H360.00 V67.68 H720.00 V99.72",
        area: "M0 180.00 H360.00 V67.68 H720.00 V99.72 L720 180 L0 180 Z",
        cumulative: ["0.00", "312.00", "223.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$500",
            y: 0,
          },
          {
            amount: "$375",
            y: 45,
          },
          {
            amount: "$250",
            y: 90,
          },
          {
            amount: "$125",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["02 Sep", "02 Sep", "24 Sep"],
        lastY: 99.72,
      },
    },
    "3M": {
      tradeIds: ["J-0741", "J-0821", "J-0931", "J-0935"],
      netPnl: "484.00",
      wins: 3,
      losses: 1,
      winRate: "75.0%",
      best: "312.00",
      worst: "-89.00",
      chart: {
        path: "M0 180.00 H180.00 V124.46 H360.00 V112.89 H540.00 V32.66 H720.00 V55.54",
        area: "M0 180.00 H180.00 V124.46 H360.00 V112.89 H540.00 V32.66 H720.00 V55.54 L720 180 L0 180 Z",
        cumulative: ["0.00", "216.00", "261.00", "573.00", "484.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$700",
            y: 0,
          },
          {
            amount: "$525",
            y: 45,
          },
          {
            amount: "$350",
            y: 90,
          },
          {
            amount: "$175",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["15 Jul", "08 Aug", "24 Sep"],
        lastY: 55.54,
      },
    },
  },
  "FX Intraday": {
    "1W": {
      tradeIds: ["J-0936"],
      netPnl: "146.00",
      wins: 1,
      losses: 0,
      winRate: "100.0%",
      best: "146.00",
      worst: "146.00",
      chart: {
        path: "M0 180.00 H720.00 V92.40",
        area: "M0 180.00 H720.00 V92.40 L720 180 L0 180 Z",
        cumulative: ["0.00", "146.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$300",
            y: 0,
          },
          {
            amount: "$225",
            y: 45,
          },
          {
            amount: "$150",
            y: 90,
          },
          {
            amount: "$75",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["25 Sep", "25 Sep", "25 Sep"],
        lastY: 92.4,
      },
    },
    "1M": {
      tradeIds: ["J-0932", "J-0936"],
      netPnl: "292.00",
      wins: 2,
      losses: 0,
      winRate: "100.0%",
      best: "146.00",
      worst: "146.00",
      chart: {
        path: "M0 180.00 H360.00 V114.30 H720.00 V48.60",
        area: "M0 180.00 H360.00 V114.30 H720.00 V48.60 L720 180 L0 180 Z",
        cumulative: ["0.00", "146.00", "292.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$400",
            y: 0,
          },
          {
            amount: "$300",
            y: 45,
          },
          {
            amount: "$200",
            y: 90,
          },
          {
            amount: "$100",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["04 Sep", "04 Sep", "25 Sep"],
        lastY: 48.6,
      },
    },
    "3M": {
      tradeIds: ["J-0742", "J-0822", "J-0932", "J-0936"],
      netPnl: "304.00",
      wins: 3,
      losses: 1,
      winRate: "75.0%",
      best: "146.00",
      worst: "-66.00",
      chart: {
        path: "M0 180.00 H180.00 V151.92 H360.00 V175.68 H540.00 V123.12 H720.00 V70.56",
        area: "M0 180.00 H180.00 V151.92 H360.00 V175.68 H540.00 V123.12 H720.00 V70.56 L720 180 L0 180 Z",
        cumulative: ["0.00", "78.00", "12.00", "158.00", "304.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$500",
            y: 0,
          },
          {
            amount: "$375",
            y: 45,
          },
          {
            amount: "$250",
            y: 90,
          },
          {
            amount: "$125",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["18 Jul", "12 Aug", "25 Sep"],
        lastY: 70.56,
      },
    },
  },
  "Scalping Pro": {
    "1W": {
      tradeIds: ["J-0937"],
      netPnl: "94.00",
      wins: 1,
      losses: 0,
      winRate: "100.0%",
      best: "94.00",
      worst: "94.00",
      chart: {
        path: "M0 180.00 H720.00 V95.40",
        area: "M0 180.00 H720.00 V95.40 L720 180 L0 180 Z",
        cumulative: ["0.00", "94.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$200",
            y: 0,
          },
          {
            amount: "$150",
            y: 45,
          },
          {
            amount: "$100",
            y: 90,
          },
          {
            amount: "$50",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["28 Sep", "28 Sep", "28 Sep"],
        lastY: 95.4,
      },
    },
    "1M": {
      tradeIds: ["J-0933", "J-0937"],
      netPnl: "67.00",
      wins: 1,
      losses: 1,
      winRate: "50.0%",
      best: "94.00",
      worst: "-27.00",
      chart: {
        path: "M0 90.00 H360.00 V102.15 H720.00 V59.85",
        area: "M0 90.00 H360.00 V102.15 H720.00 V59.85 L720 180 L0 180 Z",
        cumulative: ["0.00", "-27.00", "67.00"],
        zeroY: 90,
        ticks: [
          {
            amount: "$200",
            y: 0,
          },
          {
            amount: "$100",
            y: 45,
          },
          {
            amount: "$0",
            y: 90,
          },
          {
            amount: "−$100",
            y: 135,
          },
          {
            amount: "−$200",
            y: 180,
          },
        ],
        dates: ["10 Sep", "10 Sep", "28 Sep"],
        lastY: 59.85,
      },
    },
    "3M": {
      tradeIds: ["J-0743", "J-0823", "J-0933", "J-0937"],
      netPnl: "94.00",
      wins: 2,
      losses: 2,
      winRate: "50.0%",
      best: "94.00",
      worst: "-30.00",
      chart: {
        path: "M0 90.00 H180.00 V103.50 H360.00 V77.85 H540.00 V90.00 H720.00 V47.70",
        area: "M0 90.00 H180.00 V103.50 H360.00 V77.85 H540.00 V90.00 H720.00 V47.70 L720 180 L0 180 Z",
        cumulative: ["0.00", "-30.00", "27.00", "0.00", "94.00"],
        zeroY: 90,
        ticks: [
          {
            amount: "$200",
            y: 0,
          },
          {
            amount: "$100",
            y: 45,
          },
          {
            amount: "$0",
            y: 90,
          },
          {
            amount: "−$100",
            y: 135,
          },
          {
            amount: "−$200",
            y: 180,
          },
        ],
        dates: ["24 Jul", "21 Aug", "28 Sep"],
        lastY: 47.7,
      },
    },
  },
  "Algo Team": {
    "1W": {
      tradeIds: ["J-0938"],
      netPnl: "75.00",
      wins: 1,
      losses: 0,
      winRate: "100.0%",
      best: "75.00",
      worst: "75.00",
      chart: {
        path: "M0 180.00 H720.00 V112.50",
        area: "M0 180.00 H720.00 V112.50 L720 180 L0 180 Z",
        cumulative: ["0.00", "75.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$200",
            y: 0,
          },
          {
            amount: "$150",
            y: 45,
          },
          {
            amount: "$100",
            y: 90,
          },
          {
            amount: "$50",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["30 Sep", "30 Sep", "30 Sep"],
        lastY: 112.5,
      },
    },
    "1M": {
      tradeIds: ["J-0934", "J-0938"],
      netPnl: "172.00",
      wins: 2,
      losses: 0,
      winRate: "100.0%",
      best: "97.00",
      worst: "75.00",
      chart: {
        path: "M0 180.00 H360.00 V121.80 H720.00 V76.80",
        area: "M0 180.00 H360.00 V121.80 H720.00 V76.80 L720 180 L0 180 Z",
        cumulative: ["0.00", "97.00", "172.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$300",
            y: 0,
          },
          {
            amount: "$225",
            y: 45,
          },
          {
            amount: "$150",
            y: 90,
          },
          {
            amount: "$75",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["12 Sep", "12 Sep", "30 Sep"],
        lastY: 76.8,
      },
    },
    "3M": {
      tradeIds: ["J-0744", "J-0824", "J-0934", "J-0938"],
      netPnl: "196.00",
      wins: 3,
      losses: 1,
      winRate: "75.0%",
      best: "97.00",
      worst: "-38.00",
      chart: {
        path: "M0 180.00 H180.00 V142.80 H360.00 V165.60 H540.00 V107.40 H720.00 V62.40",
        area: "M0 180.00 H180.00 V142.80 H360.00 V165.60 H540.00 V107.40 H720.00 V62.40 L720 180 L0 180 Z",
        cumulative: ["0.00", "62.00", "24.00", "121.00", "196.00"],
        zeroY: 180,
        ticks: [
          {
            amount: "$300",
            y: 0,
          },
          {
            amount: "$225",
            y: 45,
          },
          {
            amount: "$150",
            y: 90,
          },
          {
            amount: "$75",
            y: 135,
          },
          {
            amount: "$0",
            y: 180,
          },
        ],
        dates: ["30 Jul", "28 Aug", "30 Sep"],
        lastY: 62.4,
      },
    },
  },
} as const satisfies Record<string, Record<Period, JournalFixture>>;

function pnlLabel(value: string) {
  const negative = value.startsWith("-");
  const amount = negative ? value.slice(1) : value;
  const [integer, fraction = "00"] = amount.split(".");
  return `${negative ? "−" : "+"}$${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${day} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month)]} ${year}`;
}

export function DashboardTradingJournal({
  team,
  period,
  onPeriodChange,
}: {
  team: string;
  period: Period;
  onPeriodChange: (period: Period) => void;
}) {
  const gradientId = useId();
  const selectedTeam =
    team in journalFixtures
      ? (team as keyof typeof journalFixtures)
      : "All teams";
  const fixture: JournalFixture = journalFixtures[selectedTeam][period];
  const [side, setSide] = useState("All trades");
  const [query, setQuery] = useState("");
  const [expandedScope, setExpandedScope] = useState("");
  const scope = `${selectedTeam}-${period}-${side}-${query}`;
  const expanded = expandedScope === scope;
  const trades = journalTrades
    .filter((trade) => fixture.tradeIds.includes(trade.id))
    .toReversed();
  const filtered = trades.filter(
    (trade) =>
      (side === "All trades" || trade.side === side) &&
      `${trade.id} ${trade.symbol} ${trade.team} ${trade.entryDate} ${trade.exitDate}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const visible = expanded ? filtered : filtered.slice(0, 5);
  const metricTone = (value: string) =>
    value.startsWith("-") ? "tj-negative" : "tj-positive";

  return (
    <section className="tj-journal" aria-label="Illustrative trading journal">
      <div className="tj-heading">
        <div>
          <span className="tj-heading-icon">
            <ChartLineUp size={19} />
          </span>
          <h3>Trading journal</h3>
        </div>
        <div className="tj-scope-controls">
          <span>Simulated closed trades · {selectedTeam}</span>
          <div
            className="tj-periods"
            role="group"
            aria-label="Trading journal period"
          >
            {(["1W", "1M", "3M"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`Show ${value === "1W" ? "one week" : value === "1M" ? "one month" : "three months"} of closed trades`}
                aria-pressed={period === value}
                onClick={() => onPeriodChange(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="tj-performance">
        <aside className="tj-summary" aria-label="Closed-trade summary">
          <span>Net realized P&amp;L</span>
          <strong className={metricTone(fixture.netPnl)}>
            {pnlLabel(fixture.netPnl)}
          </strong>
          <small>{fixture.tradeIds.length} example trades · USD</small>
          <dl>
            <div>
              <dt>Wins / losses</dt>
              <dd>
                <b className="tj-positive">{fixture.wins}</b>
                <span>/</span>
                <b className="tj-negative">{fixture.losses}</b>
              </dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd>{fixture.winRate}</dd>
            </div>
            <div>
              <dt>Best trade</dt>
              <dd className={metricTone(fixture.best)}>
                {pnlLabel(fixture.best)}
              </dd>
            </div>
            <div>
              <dt>Worst trade</dt>
              <dd className={metricTone(fixture.worst)}>
                {pnlLabel(fixture.worst)}
              </dd>
            </div>
          </dl>
        </aside>
        <div className="tj-chart-panel">
          <div className="tj-chart-heading">
            <h4>Realized P&amp;L history</h4>
            <span>Period total · USD</span>
          </div>
          <div
            className="tj-chart"
            role="img"
            aria-label={`${selectedTeam} realized P&L history for ${period}`}
          >
            <div className="tj-chart-axis">
              {fixture.chart.ticks.map((tick) => (
                <span key={tick.y} style={{ top: `${(tick.y / 180) * 100}%` }}>
                  {tick.amount}
                </span>
              ))}
            </div>
            <svg
              viewBox="0 0 720 180"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2859c5" stopOpacity=".32" />
                  <stop offset="100%" stopColor="#2859c5" stopOpacity=".015" />
                </linearGradient>
              </defs>
              {fixture.chart.ticks.map((tick) => (
                <line
                  key={tick.y}
                  x1="0"
                  x2="720"
                  y1={tick.y}
                  y2={tick.y}
                  className="tj-grid-line"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {[0, 180, 360, 540, 720].map((x) => (
                <line
                  key={x}
                  x1={x}
                  x2={x}
                  y1="0"
                  y2="180"
                  className="tj-grid-vertical"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                x1="0"
                x2="720"
                y1={fixture.chart.zeroY}
                y2={fixture.chart.zeroY}
                className="tj-zero-line"
                vectorEffect="non-scaling-stroke"
              />
              <path d={fixture.chart.area} fill={`url(#${gradientId})`} />
              <path
                d={fixture.chart.path}
                className="tj-pnl-line"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx="720"
                cy={fixture.chart.lastY}
                r="3.5"
                className="tj-last-point"
              />
            </svg>
          </div>
          <div className="tj-chart-dates">
            {fixture.chart.dates.map((date, index) => (
              <span key={`${date}-${index}`}>{date}</span>
            ))}
          </div>
          <p>
            Closed-trade fixtures only. Chart and summary include all trades in
            the selected team and period.
          </p>
        </div>
      </div>
      <div className="tj-history-heading">
        <div>
          <h4>Trade history</h4>
          <span>
            {filtered.length} {filtered.length === 1 ? "trade" : "trades"} shown
            by filter · times UTC
          </span>
        </div>
        <div className="tj-history-controls">
          <div
            className="tj-side-filter"
            role="group"
            aria-label="Filter closed trades by side"
          >
            {["All trades", "Buy", "Sell"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={side === value}
                onClick={() => setSide(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <label className="tj-search">
            <MagnifyingGlass size={15} />
            <input
              type="search"
              aria-label="Search closed trades"
              placeholder="Instrument, team or date"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </div>
      <div
        className="tj-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable closed-trade history"
      >
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Side</th>
              <th>Lot</th>
              <th>Entry date / time</th>
              <th>Entry price</th>
              <th>Exit date / time</th>
              <th>Exit price</th>
              <th>Realized P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((trade) => (
              <tr key={trade.id}>
                <td>
                  <strong>{trade.symbol}</strong>
                  <small>{trade.team}</small>
                </td>
                <td>
                  <span
                    className={`tj-trade-side ${trade.side === "Buy" ? "tj-positive" : "tj-negative"}`}
                  >
                    {trade.side === "Buy" ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownRight size={13} />
                    )}
                    {trade.side}
                  </span>
                </td>
                <td>{trade.lot}</td>
                <td>
                  <span>{dateLabel(trade.entryDate)}</span>
                  <small>{trade.entryTime}</small>
                </td>
                <td>{trade.entryPrice}</td>
                <td>
                  <span>{dateLabel(trade.exitDate)}</span>
                  <small>{trade.exitTime}</small>
                </td>
                <td>{trade.exitPrice}</td>
                <td>
                  <strong className={metricTone(trade.realizedPnl)}>
                    {pnlLabel(trade.realizedPnl)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="tj-empty">
            <MagnifyingGlass size={24} />
            <strong>No matching closed trades</strong>
            <span>Try another instrument, team or date.</span>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSide("All trades");
                setExpandedScope("");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
      <div className="tj-footer">
        <span>
          Showing {visible.length} of {filtered.length} filtered trades ·
          illustrative history
        </span>
        {filtered.length > 5 && (
          <button
            type="button"
            onClick={() => setExpandedScope(expanded ? "" : scope)}
            aria-expanded={expanded}
          >
            {expanded
              ? "Show fewer trades"
              : `Show all ${filtered.length} trades`}
            {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>
        )}
      </div>
    </section>
  );
}
