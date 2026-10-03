"use client";
import { memo, useEffect, useState } from "react";
import type { Instrument } from "@azuriya/api-types";
import { useTerminal } from "@/lib/store";
import {
  compareDecimals,
  formatDecimal,
  spreadPoints,
} from "@/lib/decimal-display";
import { Icon } from "./icons";
function changeWatchlist(
  patch: Partial<
    ReturnType<typeof useTerminal.getState>["config"]["watchlist"]
  >,
) {
  const state = useTerminal.getState();
  state.updateConfig({ watchlist: { ...state.config.watchlist, ...patch } });
}
function moveSymbol(symbol: string, target: string) {
  const symbols = [...useTerminal.getState().config.watchlist.symbols];
  const old = symbols.indexOf(symbol),
    next = symbols.indexOf(target);
  if (old < 0 || next < 0 || old === next) return;
  symbols.splice(old, 1);
  symbols.splice(next, 0, symbol);
  changeWatchlist({ symbols });
}
const WatchRow = memo(function WatchRow({
  instrument,
  favorite,
}: {
  instrument: Instrument;
  favorite: boolean;
}) {
  const quote = useTerminal((state) => state.quotes[instrument.symbol]);
  const previous = useTerminal(
    (state) => state.previousQuotes[instrument.symbol],
  );
  const selected = useTerminal((state) => state.symbol === instrument.symbol);
  const connection = useTerminal((state) => state.connection);
  const select = useTerminal((state) => state.selectSymbol);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (!quote || !previous) return;
    const value = compareDecimals(quote.bid, previous.bid);
    setFlash(value > 0 ? "flash-up" : value < 0 ? "flash-down" : "");
    const timer = setTimeout(() => setFlash(""), 420);
    return () => clearTimeout(timer);
  }, [quote, previous]);
  const toggleFavorite = () => {
    const favorites = useTerminal.getState().config.watchlist.favorites;
    changeWatchlist({
      favorites: favorite
        ? favorites.filter((item) => item !== instrument.symbol)
        : [...favorites, instrument.symbol],
    });
  };
  return (
    <div
      className={`watch-row watch-row-v2 ${selected ? "selected" : ""} ${flash} ${connection !== "LIVE" ? "stale-quote" : ""}`}
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData("text/plain", instrument.symbol)
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        moveSymbol(event.dataTransfer.getData("text/plain"), instrument.symbol);
      }}
    >
      <button
        className={`favorite-button ${favorite ? "favorite" : ""}`}
        aria-label={`Favorite ${instrument.symbol}`}
        aria-pressed={favorite}
        onClick={toggleFavorite}
      >
        <Icon name="star" size={11} />
      </button>
      <button
        className="watch-select"
        onClick={() => select(instrument.symbol)}
        aria-label={`Select ${instrument.symbol}`}
        aria-pressed={selected}
      >
        <div className="watch-symbol">
          <strong>{instrument.symbol}</strong>
          <small>
            {instrument.trading_status === "OPEN"
              ? instrument.asset_class
              : instrument.trading_status}
          </small>
        </div>
        <div className="watch-price">
          <span>{formatDecimal(quote?.bid, instrument.digits, false)}</span>
          <small>{connection === "LIVE" ? "BID" : "STALE"}</small>
        </div>
        <div className="watch-price">
          <span>{formatDecimal(quote?.ask, instrument.digits, false)}</span>
          <small>
            {quote
              ? spreadPoints(quote.bid, quote.ask, instrument.digits)
              : "—"}{" "}
            pts
          </small>
        </div>
      </button>
    </div>
  );
});
export function Watchlist({ instruments }: { instruments: Instrument[] }) {
  const watchlist = useTerminal((state) => state.config.watchlist);
  const [search, setSearch] = useState("");
  const [manage, setManage] = useState(false);
  const categories: Record<string, string[]> = {
    FX: ["FOREX", "FX"],
    Metals: ["METAL", "METALS"],
    Indices: ["INDEX", "INDICES"],
    Crypto: ["CRYPTO"],
  };
  const filtered = watchlist.symbols
    .map((symbol) => instruments.find((item) => item.symbol === symbol))
    .filter((item): item is Instrument => !!item)
    .filter(
      (item) =>
        `${item.symbol} ${item.display_name}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (watchlist.category === "All" || watchlist.category === "Favorites"
          ? watchlist.category !== "Favorites" ||
            watchlist.favorites.includes(item.symbol)
          : categories[watchlist.category]?.includes(
              item.asset_class.toUpperCase(),
            )),
    );
  return (
    <aside
      className={`watchlist ${watchlist.compact ? "compact-watchlist" : ""}`}
    >
      <div className="panel-title">
        <span>
          Markets{" "}
          <span className="count-badge">{watchlist.symbols.length}</span>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Manage watchlist"
            title="Add, remove, or reorder instruments"
            onClick={() => setManage(!manage)}
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Toggle compact watchlist"
            title="Compact rows"
            aria-pressed={watchlist.compact}
            onClick={() => changeWatchlist({ compact: !watchlist.compact })}
          >
            <Icon name="density" size={15} />
          </button>
        </div>
      </div>
      <div className="search-field">
        <Icon name="search" size={15} />
        <input
          id="market-search"
          aria-label="Search markets"
          placeholder="Search markets"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <div className="market-filters">
        {["All", "Favorites", "FX", "Metals", "Indices", "Crypto"].map(
          (item) => (
            <button
              key={item}
              className={watchlist.category === item ? "active" : ""}
              onClick={() => changeWatchlist({ category: item })}
            >
              {item === "Favorites" ? "★" : item}
            </button>
          ),
        )}
      </div>
      {manage && (
        <div className="watchlist-manager">
          <strong>Watchlist instruments</strong>
          {instruments.map((instrument) => {
            const index = watchlist.symbols.indexOf(instrument.symbol);
            return (
              <div key={instrument.symbol}>
                <label>
                  <input
                    type="checkbox"
                    checked={index >= 0}
                    onChange={(event) =>
                      changeWatchlist({
                        symbols: event.target.checked
                          ? [...watchlist.symbols, instrument.symbol]
                          : watchlist.symbols.filter(
                              (item) => item !== instrument.symbol,
                            ),
                      })
                    }
                  />
                  {instrument.symbol}
                </label>
                <button
                  aria-label={`Move ${instrument.symbol} up`}
                  disabled={index <= 0}
                  onClick={() =>
                    moveSymbol(instrument.symbol, watchlist.symbols[index - 1])
                  }
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${instrument.symbol} down`}
                  disabled={index < 0 || index >= watchlist.symbols.length - 1}
                  onClick={() =>
                    moveSymbol(instrument.symbol, watchlist.symbols[index + 1])
                  }
                >
                  ↓
                </button>
              </div>
            );
          })}
          <small>
            Drag rows to reorder. Settings save with your workspace.
          </small>
        </div>
      )}
      <div className="watch-heading">
        <span>SYMBOL</span>
        <span>BID</span>
        <span>ASK / SPREAD</span>
      </div>
      <div className="watch-rows">
        {filtered.map((instrument) => (
          <WatchRow
            key={instrument.symbol}
            instrument={instrument}
            favorite={watchlist.favorites.includes(instrument.symbol)}
          />
        ))}
        {!filtered.length && (
          <div className="small-empty">
            No matching markets.
            <br />
            <button className="table-button" onClick={() => setManage(true)}>
              Manage watchlist
            </button>
          </div>
        )}
      </div>
      <div className="watchlist-note">
        <Icon name="info" size={14} />
        <p>
          Simulated market data
          <br />
          <span>Drag rows to reorder your workspace.</span>
        </p>
      </div>
      <div className="market-shortcuts">
        <span>
          <kbd>/</kbd>Search markets
        </span>
        <span>
          <kbd>⌘ / Ctrl K</kbd>Command palette
        </span>
        <span>
          <kbd>M</kbd>Toggle markets
        </span>
      </div>
    </aside>
  );
}
