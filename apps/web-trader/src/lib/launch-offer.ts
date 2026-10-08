export const launchOffer = {
  monthlyFee: "0.00",
  revenueSharePercent: 35,
  allocatedSlots: 97,
  totalSlots: 100,
  termsHref: "/legal/terms#launch-offer",
} as const;

function cents(value: string): bigint {
  if (!/^\d+\.\d{2}$/.test(value))
    throw new Error("Use a non-negative decimal amount with two places.");
  return BigInt(value.replace(".", ""));
}

function decimal(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export function addDecimalAmounts(...amounts: string[]): string {
  return decimal(amounts.reduce((total, amount) => total + cents(amount), 0n));
}

export function formatOfferMoney(
  value: string,
  symbol = "$",
  showCents = true,
): string {
  cents(value);
  const [whole, fraction] = value.split(".");
  return `${symbol}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${showCents ? `.${fraction}` : ""}`;
}

export function revenueShareExample(revenue: string) {
  const total = cents(revenue);
  const share = (total * BigInt(launchOffer.revenueSharePercent)) / 100n;
  return {
    revenue,
    azuriyaShare: decimal(share),
    businessShare: decimal(total - share),
  };
}

// Published monthly list prices checked 8 October 2026 against the supplied
// reference and Leverate's official website. No promotion or taxes assumed.
export const leverateReference = [
  {
    name: "Start-up Brokers",
    platform: "1490.00",
    crm: "2000.00",
    total: addDecimalAmounts("1490.00", "2000.00"),
    yearly: "41880.00",
  },
  {
    name: "Professional Brokers",
    platform: "2990.00",
    crm: "3490.00",
    total: addDecimalAmounts("2990.00", "3490.00"),
    yearly: "77760.00",
  },
] as const;

export const leverateSource = "https://leverate.com/prop-firm/";
