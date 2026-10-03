/** Exact decimal string presentation only. The server owns all trading calculations. */
const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
export function isPositiveDecimal(value: string) {
  return /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
}
export function formatDecimal(
  value: string | undefined,
  digits = 2,
  group = true,
): string {
  if (value === undefined || value === null || value === "") return "—";
  const match = DECIMAL.exec(value);
  if (!match) return "—";
  const [, sign, whole, fraction = ""] = match;
  // Presentation rounds using integers; never convert financial strings to Number.
  const shifted = BigInt(
    whole + fraction.padEnd(digits + 1, "0").slice(0, digits),
  );
  const round =
    fraction.length > digits && fraction.charCodeAt(digits) >= 53 ? 1n : 0n;
  const result = (shifted + round).toString().padStart(digits + 1, "0");
  const integer = digits ? result.slice(0, -digits) : result;
  const formatted = group
    ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : integer;
  return `${sign && shifted + round > 0n ? "-" : ""}${formatted}${digits ? "." + result.slice(-digits) : ""}`;
}
export function money(value: string | undefined, currency = "USD") {
  const display = formatDecimal(value);
  return display === "—"
    ? display
    : `${currency === "USD" ? "$" : currency + " "}${display}`;
}
export function signClass(value?: string) {
  return !value || !/[1-9]/.test(value)
    ? ""
    : value.startsWith("-")
      ? "negative"
      : "positive";
}
export function compareDecimals(left: string, right: string): number {
  const l = DECIMAL.exec(left);
  const r = DECIMAL.exec(right);
  if (!l || !r) return 0;
  const scale = Math.max(l[3]?.length || 0, r[3]?.length || 0);
  const toInt = (parts: RegExpExecArray) =>
    BigInt((parts[1] || "") + parts[2] + (parts[3] || "").padEnd(scale, "0"));
  const a = toInt(l);
  const b = toInt(r);
  return a > b ? 1 : a < b ? -1 : 0;
}
export function spreadPoints(bid: string, ask: string, digits: number): string {
  const b = DECIMAL.exec(bid);
  const a = DECIMAL.exec(ask);
  if (!b || !a) return "—";
  const units = (parts: RegExpExecArray) =>
    BigInt(parts[2] + (parts[3] || "").padEnd(digits, "0").slice(0, digits));
  return (units(a) - units(b)).toString();
}
