"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { useMarketingTheme } from "./marketing-theme";
import "./flow-tracks.css";

const MotionContext = createContext({ paused: false, toggle: () => {} });

export function MarketingMotion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [paused, setPaused] = useState(false);
  const theme = useMarketingTheme();
  return (
    <MotionContext.Provider
      value={{ paused, toggle: () => setPaused((value) => !value) }}
    >
      <div
        className={`az-marketing ${className}${paused ? " af-motion-paused" : ""}`}
        data-site-theme={theme}
      >
        {children}
      </div>
    </MotionContext.Provider>
  );
}

export function DiagramMotionToggle() {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <button
      className="af-motion-control"
      type="button"
      onClick={toggle}
      aria-pressed={paused}
      aria-label={
        paused ? "Resume all flow animations" : "Pause all flow animations"
      }
    >
      {paused ? (
        <Play size={14} aria-hidden="true" />
      ) : (
        <Pause size={14} aria-hidden="true" />
      )}
      {paused ? "Resume flow animations" : "Pause flow animations"}
    </button>
  );
}
