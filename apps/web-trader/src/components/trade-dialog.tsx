"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
export function TradeDialog({
  title,
  subtitle,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const current = useRef({ busy, onClose });
  current.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = dialog.current;
    container?.querySelector<HTMLElement>("input,button,select")?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !current.current.busy) {
        event.stopPropagation();
        current.current.onClose();
      }
      if (event.key === "Tab" && container) {
        const targets = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]',
          ),
        );
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    container?.addEventListener("keydown", handler);
    return () => {
      container?.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog trade-dialog"
      >
        <div className="dialog-heading">
          <div>
            {subtitle && <span className="eyebrow">{subtitle}</span>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
