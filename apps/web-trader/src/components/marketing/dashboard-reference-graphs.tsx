import { useId } from "react";
import "./dashboard-reference-graphs.css";

type Period = "1W" | "1M" | "3M";

// Six independent illustrative intervals. Current values reconcile to the
// community totals; comparison values are a separate sample, not prior results.
export const communityVolumeSamples = {
  "All teams": {
    "1W": {
      total: "3,842",
      maximum: "900",
      current: ["502", "610", "728", "624", "693", "685"],
      comparison: ["530", "632", "802", "650", "710", "732"],
      ticks: ["0", "300", "600", "900"],
    },
    "1M": {
      total: "14,292",
      maximum: "3000",
      current: ["1940", "2246", "2488", "2640", "2418", "2560"],
      comparison: ["2090", "2360", "2820", "2750", "2660", "2680"],
      ticks: ["0", "1000", "2000", "3000"],
    },
    "3M": {
      total: "38,946",
      maximum: "8000",
      current: ["5760", "6340", "6680", "7020", "6120", "7026"],
      comparison: ["6120", "6540", "7280", "7400", "6690", "7480"],
      ticks: ["0", "2000", "4000", "6000", "8000"],
    },
  },
  "Gold Elite": {
    "1W": {
      total: "2,398",
      maximum: "600",
      ticks: ["0", "200", "400", "600"],
      current: ["313", "380", "454", "389", "432", "430"],
      comparison: ["330", "393", "500", "405", "442", "459"],
    },
    "1M": {
      total: "8,920",
      maximum: "2000",
      ticks: ["0", "500", "1000", "1500", "2000"],
      current: ["1210", "1401", "1552", "1647", "1509", "1601"],
      comparison: ["1303", "1472", "1759", "1715", "1660", "1676"],
    },
    "3M": {
      total: "24,330",
      maximum: "6000",
      ticks: ["0", "2000", "4000", "6000"],
      current: ["3598", "3960", "4173", "4385", "3823", "4391"],
      comparison: ["3822", "4084", "4547", "4622", "4179", "4674"],
    },
  },
  "FX Intraday": {
    "1W": {
      total: "880",
      maximum: "200",
      ticks: ["0", "50", "100", "150", "200"],
      current: ["114", "139", "166", "142", "158", "161"],
      comparison: ["120", "144", "182", "147", "161", "172"],
    },
    "1M": {
      total: "3,284",
      maximum: "800",
      ticks: ["0", "200", "400", "600", "800"],
      current: ["445", "516", "571", "606", "555", "591"],
      comparison: ["479", "542", "647", "631", "610", "618"],
    },
    "3M": {
      total: "8,950",
      maximum: "2000",
      ticks: ["0", "500", "1000", "1500", "2000"],
      current: ["1323", "1456", "1535", "1613", "1406", "1617"],
      comparison: ["1405", "1501", "1672", "1700", "1536", "1721"],
    },
  },
  "Scalping Pro": {
    "1W": {
      total: "390",
      maximum: "100",
      ticks: ["0", "25", "50", "75", "100"],
      current: ["50", "61", "73", "63", "70", "73"],
      comparison: ["52", "63", "80", "65", "71", "78"],
    },
    "1M": {
      total: "1,460",
      maximum: "400",
      ticks: ["0", "100", "200", "300", "400"],
      current: ["198", "229", "254", "269", "247", "263"],
      comparison: ["213", "240", "287", "280", "271", "275"],
    },
    "3M": {
      total: "3,990",
      maximum: "1000",
      ticks: ["0", "250", "500", "750", "1000"],
      current: ["590", "649", "684", "719", "626", "722"],
      comparison: ["626", "669", "745", "757", "684", "768"],
    },
  },
  "Algo Team": {
    "1W": {
      total: "174",
      maximum: "50",
      ticks: ["0", "10", "20", "30", "40", "50"],
      current: ["25", "30", "35", "30", "33", "21"],
      comparison: ["28", "32", "40", "33", "36", "23"],
    },
    "1M": {
      total: "628",
      maximum: "150",
      ticks: ["0", "50", "100", "150"],
      current: ["87", "100", "111", "118", "107", "105"],
      comparison: ["95", "106", "127", "124", "119", "111"],
    },
    "3M": {
      total: "1,676",
      maximum: "400",
      ticks: ["0", "100", "200", "300", "400"],
      current: ["249", "275", "288", "303", "265", "296"],
      comparison: ["267", "286", "316", "321", "291", "317"],
    },
  },
} as const;

function numberLabel(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function roundedBar(width: number, y: number) {
  const left = 34;
  const right = left + width;
  const bottom = y + 26;
  return `M${left + 5} ${y} H${right - 5} Q${right} ${y} ${right} ${y + 5} V${bottom - 5} Q${right} ${bottom} ${right - 5} ${bottom} H${left + 5} Q${left} ${bottom} ${left} ${bottom - 5} V${y + 5} Q${left} ${y} ${left + 5} ${y} Z`;
}

export function DashboardCommunityVolume({
  period,
  team = "All teams",
}: {
  period: Period;
  team?: string;
}) {
  const descriptionId = useId();
  const scope = Object.prototype.hasOwnProperty.call(
    communityVolumeSamples,
    team,
  )
    ? (team as keyof typeof communityVolumeSamples)
    : "All teams";
  const sample = communityVolumeSamples[scope][period];
  const plotWidth = 414;
  const maximum = Number(sample.maximum);
  return (
    <div
      className="az-chart rg-community-volume"
      role="img"
      aria-label={`Illustrative community volume trend for ${period}`}
      aria-describedby={descriptionId}
    >
      <p id={descriptionId} className="az-sr-only">
        {`${scope}, ${period}: current illustrative trading volume totals ${sample.total} lots across six sampled intervals. ${sample.current
          .map(
            (current, index) =>
              `Interval ${index + 1}: current ${numberLabel(current)} lots, comparison ${numberLabel(sample.comparison[index])} lots.`,
          )
          .join(
            " ",
          )} The comparison is an independent illustrative sample, not previous trading results. All values are simulated.`}
      </p>
      <div className="rg-sample-description">
        <span>Six sampled intervals · {scope}</span>
        <span>{sample.total} lots</span>
      </div>
      <svg viewBox="0 0 470 266" aria-hidden="true">
        {sample.ticks.map((tick) => {
          const x = 34 + (Number(tick) / maximum) * plotWidth;
          return (
            <g key={tick}>
              <line className="rg-volume-grid" x1={x} x2={x} y1="5" y2="237" />
              <text
                className="rg-volume-tick"
                x={x}
                y="258"
                textAnchor={
                  tick === "0"
                    ? "start"
                    : Number(tick) === maximum
                      ? "end"
                      : "middle"
                }
              >
                {numberLabel(tick)}
              </text>
            </g>
          );
        })}
        {sample.current.map((current, index) => {
          const comparison = sample.comparison[index];
          const y = 8 + index * 39;
          // Floating-point values are limited to SVG plotting coordinates.
          const currentWidth = (Number(current) / maximum) * plotWidth;
          const comparisonWidth = (Number(comparison) / maximum) * plotWidth;
          return (
            <g key={index}>
              <title>{`Interval ${index + 1}: current ${numberLabel(current)} lots; comparison ${numberLabel(comparison)} lots`}</title>
              <text className="rg-volume-label" x="1" y={y + 17}>
                {String(index + 1).padStart(2, "0")}
              </text>
              <path
                className="rg-volume-comparison"
                d={roundedBar(comparisonWidth, y)}
              />
              <path
                className="rg-volume-current"
                d={roundedBar(currentWidth, y)}
                data-volume-bar={index + 1}
                data-volume-lots={current}
              />
            </g>
          );
        })}
      </svg>
      <div className="rg-volume-legend">
        <span>
          <i className="rg-current-key" />
          Current sample
        </span>
        <span>
          <i className="rg-comparison-key" />
          Comparison sample
        </span>
        <small>Lots</small>
      </div>
      <p className="rg-volume-note">
        Comparison uses an independent illustrative sample.
      </p>
    </div>
  );
}
