"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  Quote,
  RealtimeEvent,
  TradingAccount,
  Position,
  Order,
  Fill,
  Candle,
  Instrument,
} from "@azuriya/api-types";
import { api, API_URL } from "./api";
import { useTerminal } from "./store";
import { notify } from "./notifications";
import { EventDeduplicator, quoteEventForAccount } from "./realtime-events";
export function useRealtime(enabled: boolean) {
  const client = useQueryClient();
  const accountId = useTerminal((state) => state.accountId);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false,
      attempt = 0;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let receivedAt = Date.now();
    let connectedBefore = false,
      disconnected = false;
    const duplicates = new EventDeduplicator();
    const { setConnection, ingest, ingestCandle } = useTerminal.getState();
    const connect = () => {
      if (stopped) return;
      setConnection("RECONNECTING");
      const connection = new WebSocket(
        `${API_URL.replace(/^http/, "ws")}/api/v1/ws`,
      );
      socket = connection;
      let syncing = false;
      let buffered: RealtimeEvent[] = [];
      const resync = async () => {
        if (syncing) return;
        syncing = true;
        setConnection("RECONNECTING");
        try {
          const [, quotes] = await Promise.all([
            client.invalidateQueries(
              {
                predicate: (query) =>
                  [
                    "accounts",
                    "account",
                    "candles",
                    "instruments",
                    "effective-settings",
                    "order-preview",
                    "close-preview",
                  ].includes(String(query.queryKey[0])),
              },
              { throwOnError: true },
            ),
            api<Quote[]>(
              accountId ? `/accounts/${accountId}/quotes` : "/quotes",
            ),
          ]);
          if (
            stopped ||
            socket !== connection ||
            connection.readyState !== WebSocket.OPEN
          )
            return;
          (quotes || []).forEach(ingest);
          // REST establishes the baseline; ordered committed deltas received
          // during that read restore changes that raced with the snapshot.
          syncing = false;
          const waiting = buffered;
          buffered = [];
          waiting.forEach(applyEvent);
          setConnection("LIVE");
          if (disconnected && connectedBefore)
            notify(
              "Connection restored. Account and charts resynchronized.",
              "success",
              "connection",
            );
          connectedBefore = true;
          disconnected = false;
        } catch {
          if (!stopped && socket === connection) {
            setConnection("RECONNECTING");
            connection.close();
          }
        }
      };
      connection.onopen = () => {
        attempt = 0;
        receivedAt = Date.now();
        void resync();
      };
      connection.onmessage = (incoming) => {
        receivedAt = Date.now();
        let event: RealtimeEvent;
        try {
          event = JSON.parse(incoming.data) as RealtimeEvent;
        } catch {
          return;
        }
        if (event.type === "system.resync") {
          void resync();
          return;
        }
        if (syncing) {
          if (buffered.length >= 4096) {
            connection.close();
            return;
          }
          buffered.push(event);
          return;
        }
        applyEvent(event);
      };
      const applyEvent = (event: RealtimeEvent) => {
        if (stopped || socket !== connection || !duplicates.accept(event))
          return;
        if (event.type === "quote.updated") {
          if (quoteEventForAccount(event, accountId))
            ingest(event.payload as Quote);
          return;
        }
        if (event.type === "broker.configuration.updated") {
          useTerminal.setState({ quotes: {}, previousQuotes: {}, history: {} });
          void resync();
          return;
        }
        if (
          event.type === "margin.call.entered" &&
          event.account_id === accountId
        ) {
          notify(
            "Margin warning: reduce exposure or adjust simulated funds.",
            "info",
            `margin:${accountId}`,
          );
        }
        if (
          event.type === "fill.created" &&
          (event.payload as Fill).execution_reason === "STOP_OUT"
        ) {
          const fill = event.payload as Fill;
          notify(
            `Simulated stop-out closed ${fill.quantity} lots of ${fill.symbol} at ${fill.price}.`,
            "info",
            `stopout:${fill.id}`,
          );
        }
        if (event.type === "candle.updated") {
          ingestCandle(event.payload as Candle);
          return;
        }
        if (event.type === "instrument.updated") {
          const instrument = event.payload as Instrument;
          client.setQueryData<Instrument[]>(["instruments"], (previous) =>
            previous?.map((item) =>
              item.symbol === instrument.symbol ? instrument : item,
            ),
          );
          return;
        }
        // Commit notifications carry canonical server values; no client trading math.
        const resource = event.payload as
          | TradingAccount
          | Position
          | Order
          | Fill;
        const upsert = <T extends { id: string }>(
          previous: T[] | undefined,
          value: T,
        ): T[] | undefined => {
          if (!previous) return previous;
          return previous.some((item) => item.id === value.id)
            ? previous.map((item) => (item.id === value.id ? value : item))
            : [value, ...previous];
        };
        if (event.type === "account.updated" && resource.id) {
          client.setQueryData<TradingAccount[]>(["accounts"], (previous) =>
            upsert(previous, resource as TradingAccount),
          );
          return;
        }
        if (resource.id && "account_id" in resource) {
          const name = event.type.startsWith("position.")
            ? "positions"
            : event.type === "order.updated"
              ? "orders"
              : event.type === "fill.created"
                ? "fills"
                : undefined;
          if (name)
            client.setQueryData<Array<Position | Order | Fill>>(
              ["account", resource.account_id, name],
              (previous) =>
                upsert(previous, resource as Position | Order | Fill),
            );
          if (event.type === "order.updated") {
            const order = resource as Order;
            if (
              ["ACCEPTED", "FILLED", "REJECTED", "CANCELLED"].includes(
                order.status,
              )
            )
              notify(
                `${order.symbol} ${order.type.toLowerCase()} order ${order.status.toLowerCase()}.${order.reject_reason ? " " + order.reject_reason : ""}`,
                order.status === "REJECTED" ? "error" : "success",
                `order:${order.id}`,
              );
          }
          if (event.type === "position.closed")
            notify(
              `${(resource as Position).symbol} position closed.`,
              "success",
              `position:${resource.id}`,
            );
        }
        // The audit view is fetched from its append-only REST representation.
        if (!refresh)
          refresh = setTimeout(() => {
            refresh = undefined;
            void client.invalidateQueries({
              predicate: (query) =>
                query.queryKey[0] === "account" &&
                ["events", "transactions"].includes(String(query.queryKey[2])),
            });
          }, 1000);
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        if (stopped) return;
        disconnected = true;
        if (connectedBefore)
          notify(
            "Connection lost. Quotes are stale while reconnecting.",
            "info",
            "connection",
          );
        setConnection(navigator.onLine ? "RECONNECTING" : "OFFLINE");
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 15000));
      };
    };
    const offline = () => {
      disconnected = true;
      setConnection("OFFLINE");
      socket?.close();
    };
    const online = () => {
      clearTimeout(retry);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      connect();
    };
    const staleCheck = setInterval(() => {
      if (
        socket?.readyState === WebSocket.OPEN &&
        Date.now() - receivedAt > 15_000
      ) {
        setConnection("RECONNECTING");
        socket.close();
      }
    }, 5000);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(refresh);
      clearInterval(staleCheck);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      socket?.close();
      setConnection("OFFLINE");
    };
  }, [enabled, client, accountId]);
}
