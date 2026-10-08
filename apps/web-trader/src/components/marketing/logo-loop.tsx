"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import "./logo-loop.css";

export function LogoLoop({
  label,
  children,
  duplicate,
}: {
  label: string;
  children: ReactNode;
  duplicate: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) =>
      setInView(entries[0].isIntersecting),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={root}
      className="az-logo-loop"
      data-paused={paused}
      data-in-view={inView}
      role="region"
      aria-label={label}
    >
      <div
        className="az-logo-viewport"
        tabIndex={0}
        aria-label={`${label}. Scroll horizontally to explore.`}
      >
        <div className="az-logo-track">
          <ul className="az-logo-group">{children}</ul>
          <ul
            className="az-logo-group az-logo-duplicate"
            aria-hidden="true"
            inert
          >
            {duplicate}
          </ul>
        </div>
      </div>
      <button
        type="button"
        className="az-logo-pause"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
        aria-label={`${paused ? "Resume" : "Pause"} ${label.toLowerCase()}`}
      >
        {paused ? (
          <Play size={15} aria-hidden="true" />
        ) : (
          <Pause size={15} aria-hidden="true" />
        )}
        {paused ? "Resume logos" : "Pause logos"}
      </button>
    </div>
  );
}
