"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { useMarketingTheme } from "./marketing-theme";
import "./flow-tracks.css";
import "./scroll-reveals.css";

const MotionContext = createContext({ paused: false, toggle: () => {} });

export function MarketingMotion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [paused, setPaused] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const theme = useMarketingTheme();
  useEffect(() => {
    const root = surface.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(
        "main > section:not(.az-hero), main > .az-final-cta",
      ),
    );
    const revealItems = new Map<HTMLElement, HTMLElement[]>();
    let observer: IntersectionObserver | undefined;
    const revealAll = () => {
      observer?.disconnect();
      targets.forEach((target) => {
        target.classList.remove("az-scroll-pending");
        revealItems
          .get(target)
          ?.forEach((item) =>
            item.classList.remove("az-scroll-stagger-pending"),
          );
      });
    };
    const configure = () => {
      revealAll();
      if (preference.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.remove("az-scroll-pending");
              revealItems
                .get(entry.target as HTMLElement)
                ?.forEach((item) =>
                  item.classList.remove("az-scroll-stagger-pending"),
                );
              observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0, rootMargin: "0px 0px -8% 0px" },
      );
      targets.forEach((target) => {
        // Preserve above-the-fold content and direct anchor destinations.
        if (
          target.getBoundingClientRect().top >= window.innerHeight &&
          `#${target.id}` !== window.location.hash
        ) {
          const items = Array.from(
            target.querySelectorAll<HTMLElement>(
              ".az-section-heading, .az-section-intro, .ab-section-heading, .sp-experience-heading, [data-scroll-reveal-item]",
            ),
          ).filter(
            (item) =>
              !item.parentElement?.closest(
                ".az-section-heading, .az-section-intro, .ab-section-heading, .sp-experience-heading, [data-scroll-reveal-item]",
              ),
          );
          revealItems.set(target, items);
          items.forEach((item, index) => {
            const revealClass =
              item.dataset.scrollRevealItem === "visual"
                ? "az-scroll-visual"
                : "az-scroll-stagger";
            const directionClass =
              revealClass === "az-scroll-visual"
                ? ""
                : index % 2 === 0
                  ? "az-scroll-from-left"
                  : "az-scroll-from-right";
            item.classList.add(
              revealClass,
              "az-scroll-stagger-pending",
              ...(directionClass ? [directionClass] : []),
            );
            item.style.transitionDelay = `${Math.min(index, 6) * 75}ms`;
          });
          target.classList.add("az-scroll-reveal", "az-scroll-pending");
          observer?.observe(target);
        }
      });
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      preference.removeEventListener("change", configure);
      revealAll();
    };
  }, []);
  return (
    <MotionContext.Provider
      value={{ paused, toggle: () => setPaused((value) => !value) }}
    >
      <div
        ref={surface}
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
