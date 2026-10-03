const baseCommissionCents = 200n;

function money(cents: bigint) {
  const integer = (cents / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${integer}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function markupCents(markup: string) {
  const [integer, fraction = ""] = markup.split(".");
  return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"));
}

// Presentation arithmetic for a labelled demo; production fees come from the API.
export function demoCommission(lots: string, markup: string) {
  return money(BigInt(lots.replaceAll(",", "")) * markupCents(markup));
}

export function demoTotalCommission(markup: string) {
  return money(baseCommissionCents + markupCents(markup));
}

export function demoAggregateCommission(
  groups: readonly { lots: string; markup: string }[],
) {
  return money(
    groups.reduce(
      (total, group) =>
        total +
        BigInt(group.lots.replaceAll(",", "")) * markupCents(group.markup),
      0n,
    ),
  );
}

export function demoAggregateVolume(volumes: readonly string[]) {
  return volumes
    .reduce((total, volume) => total + BigInt(volume.replaceAll(",", "")), 0n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
