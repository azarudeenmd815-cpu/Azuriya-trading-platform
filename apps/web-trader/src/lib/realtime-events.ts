import type { RealtimeEvent } from "@azuriya/api-types";
/** Reference prices feed candles; executable quotes belong to one account. */
export function quoteEventForAccount(event: RealtimeEvent, accountId: string) {
  return accountId ? event.account_id === accountId : !event.account_id;
}
/** Stream sequence gaps are valid across tenant filtering; only exact event replays are ignored. */
export class EventDeduplicator {
  private seen = new Set<string>();
  accept(event: RealtimeEvent): boolean {
    if (!event.sequence || event.type === "system.resync") return true;
    const payload = event.payload as
      | { id?: string; symbol?: string; interval?: string; open_time?: string }
      | undefined;
    const key = [
      event.type,
      event.account_id,
      event.sequence,
      payload?.id,
      payload?.symbol,
      payload?.interval,
      payload?.open_time,
    ].join(":");
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > 4096)
      this.seen.delete(this.seen.values().next().value!);
    return true;
  }
}
