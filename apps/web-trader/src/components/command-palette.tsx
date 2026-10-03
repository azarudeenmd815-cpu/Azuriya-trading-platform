"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument, TradingAccount } from "@azuriya/api-types";
import { useTerminal } from "@/lib/store";
import type { WorkspaceControls } from "@/lib/use-workspaces";
import { openActivity, togglePanel } from "./workspace-layout";
import { Icon } from "./icons";
interface Command {
  id: string;
  label: string;
  section: string;
  action: () => void;
}
export function CommandPalette({
  instruments,
  accounts,
  workspaces,
}: {
  instruments: Instrument[];
  accounts: TradingAccount[];
  workspaces: WorkspaceControls;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const commands = useMemo<Command[]>(
    () => [
      ...instruments.map((item) => ({
        id: `symbol:${item.symbol}`,
        label: `Open ${item.symbol}`,
        section: item.display_name,
        action: () => useTerminal.getState().selectSymbol(item.symbol),
      })),
      ...accounts.map((account) => ({
        id: `account:${account.id}`,
        label: `Switch account: ${account.name}`,
        section: account.account_number,
        action: () => useTerminal.getState().selectAccount(account.id),
      })),
      ...(workspaces.list.data || []).map((workspace) => ({
        id: `workspace:${workspace.id}`,
        label: `Switch workspace: ${workspace.name}`,
        section: "Workspaces",
        action: () => void workspaces.switchWorkspace(workspace.id),
      })),
      {
        id: "workspace:new",
        label: "New workspace",
        section: "Workspaces",
        action: () => window.dispatchEvent(new Event("azuriya:new-workspace")),
      },
      ...(["markets", "ticket", "bottom"] as const).map((panel) => ({
        id: `panel:${panel}`,
        label: `Toggle ${panel === "ticket" ? "order ticket" : panel === "bottom" ? "bottom panel" : "markets"}`,
        section: "Panels",
        action: () => togglePanel(panel),
      })),
      ...["Positions", "Orders", "History", "Activity"].map((tab) => ({
        id: `activity:${tab}`,
        label: `Open ${tab.toLowerCase()}`,
        section: "Account",
        action: () => openActivity(tab),
      })),
      {
        id: "chart:fit",
        label: "Fit chart",
        section: "Selected chart",
        action: () =>
          window.dispatchEvent(
            new CustomEvent("azuriya:chart-action", { detail: "fit" }),
          ),
      },
    ],
    [instruments, accounts, workspaces.list.data, workspaces.switchWorkspace],
  );
  const results = commands.filter((command) =>
    `${command.label} ${command.section}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  useEffect(() => {
    setSelected(0);
  }, [query]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      const target = event.target as HTMLElement;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      )
        return;
      if (open) return;
      const value = event.key.toLowerCase();
      if (value === "/") {
        event.preventDefault();
        const state = useTerminal.getState();
        state.updateConfig({
          panels: { ...state.config.panels, markets: true },
        });
        setTimeout(() => document.getElementById("market-search")?.focus(), 0);
      }
      if (value === "m") togglePanel("markets");
      if (value === "o") togglePanel("ticket");
      if (value === "p") openActivity("Positions");
      if (value === "h") openActivity("History");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      input.current?.focus();
    } else previousFocus.current?.focus();
  }, [open]);
  const run = (command: Command) => {
    setOpen(false);
    command.action();
  };
  return (
    <>
      <button
        className="command-button"
        aria-label="Open command palette"
        onClick={() => {
          setOpen(true);
          setQuery("");
        }}
      >
        <Icon name="search" size={13} />
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="command-search">
              <Icon name="search" />
              <input
                ref={input}
                aria-label="Search commands"
                placeholder="Search symbols, workspaces, commands…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelected((value) =>
                      Math.min(value + 1, results.length - 1),
                    );
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelected((value) => Math.max(0, value - 1));
                  }
                  if (event.key === "Enter" && results[selected]) {
                    event.preventDefault();
                    run(results[selected]);
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    input.current?.focus();
                  }
                }}
              />
              <kbd>ESC</kbd>
            </div>
            <div
              className="command-results"
              role="listbox"
              aria-label="Commands"
            >
              {results.map((command, index) => (
                <button
                  key={command.id}
                  role="option"
                  aria-selected={selected === index}
                  className={selected === index ? "selected" : ""}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => run(command)}
                >
                  <span>{command.label}</span>
                  <small>{command.section}</small>
                </button>
              ))}
              {!results.length && <p>No commands found.</p>}
            </div>
            <footer>
              ↑ ↓ navigate <span>↵ open</span>
              <span>Trading actions require the order ticket.</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
