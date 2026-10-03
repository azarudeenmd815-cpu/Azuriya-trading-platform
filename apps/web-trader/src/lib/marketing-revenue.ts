export const EXAMPLE_MARKUP_OPTIONS = [
  "0.50",
  "1.00",
  "1.50",
  "2.00",
  "3.00",
  "4.00",
  "5.00",
] as const;

export interface RevenueExample {
  baseCommission: string;
  markup: string;
  traderCommission: string;
  monthlyRevenue: string;
  monthlyLots: string;
}

function centsToDecimal(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** Illustrative marketing model only. Not used for trading or settlement. */
export function calculateRevenueExample(
  markup: string,
  monthlyLots: string,
): RevenueExample {
  if (!EXAMPLE_MARKUP_OPTIONS.some((option) => option === markup)) {
    throw new RangeError("Choose a supported example markup");
  }
  if (!/^[1-9]\d{3,4}$/.test(monthlyLots)) {
    throw new RangeError("Monthly volume must be a whole number of lots");
  }
  const lots = BigInt(monthlyLots);
  if (lots < 1000n || lots > 50000n) {
    throw new RangeError(
      "Monthly volume must be between 1,000 and 50,000 lots",
    );
  }
  const markupCents = BigInt(markup.replace(".", ""));
  return {
    baseCommission: "2.00",
    markup,
    traderCommission: centsToDecimal(200n + markupCents),
    monthlyRevenue: centsToDecimal(markupCents * lots),
    monthlyLots,
  };
}

export function formatExampleUsd(value: string): string {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new TypeError("USD examples require an exact two-decimal string");
  }
  const [whole, fraction] = value.split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
