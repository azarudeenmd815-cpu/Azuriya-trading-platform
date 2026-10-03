import type { CSSProperties } from "react";
import "./flow-tracks.css";

type FlowTracksProps = {
  id: string;
  viewBox: string;
  paths: string[];
  className?: string;
  reverse?: boolean;
  delay?: number;
};

/** Routing geometry is illustrative; moving segments represent the flow direction. */
export function FlowTracks({
  id,
  viewBox,
  paths,
  className = "",
  reverse = false,
  delay = 0,
}: FlowTracksProps) {
  return (
    <svg
      className={`af-tracks ${className}`}
      viewBox={viewBox}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-flow-diagram={id}
    >
      {paths.map((path, index) => (
        <g key={path}>
          <path
            className="af-rail"
            d={path}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={`af-packet${reverse ? " af-packet-reverse" : ""}`}
            d={path}
            pathLength={100}
            vectorEffect="non-scaling-stroke"
            data-flow-track={`${id}-${index + 1}`}
            style={
              { "--af-delay": `${delay - index * 0.18}s` } as CSSProperties
            }
          />
        </g>
      ))}
    </svg>
  );
}
