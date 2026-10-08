import type { ComponentType } from "react";
import {
  ArrowsLeftRight,
  Bank,
  ChartLineUp,
  Code,
  Copy,
  CreditCard,
  GitBranch,
  Lightning,
  PlugsConnected,
  SquaresFour,
  Trophy,
  Users,
} from "@phosphor-icons/react/dist/ssr";
import { FlowTracks } from "./flow-tracks";
import { DiagramMotionToggle } from "./marketing-motion";
import "./launch-visuals.css";

type VisualIcon = ComponentType<{
  size?: number;
  weight?: "regular" | "duotone";
  "aria-hidden"?: boolean;
}>;

const coreModules: readonly { label: string; Icon: VisualIcon }[] = [
  { label: "Brokerage", Icon: Bank },
  { label: "Prop", Icon: Trophy },
  { label: "Trading platform", Icon: ChartLineUp },
  { label: "CRM", Icon: Users },
  { label: "Payments", Icon: CreditCard },
  { label: "Copy trading", Icon: Copy },
  { label: "APIs", Icon: Code },
  { label: "Integrations", Icon: PlugsConnected },
];

const corePaths = [
  "M 0 32 H 32 Q 44 32 44 44 V 146 Q 44 158 56 158 H 100",
  "M 0 116 H 20 Q 32 116 32 128 V 146 Q 32 158 44 158 H 100",
  "M 0 200 H 20 Q 32 200 32 188 V 170 Q 32 158 44 158 H 100",
  "M 0 284 H 32 Q 44 284 44 272 V 170 Q 44 158 56 158 H 100",
];

function CoreModuleGroup({ side }: { side: "left" | "right" }) {
  const modules =
    side === "left" ? coreModules.slice(0, 4) : coreModules.slice(4);
  return (
    <ul className={`lv-core-modules lv-core-modules-${side}`}>
      {modules.map(({ label, Icon }) => (
        <li key={label}>
          <span className="lv-module-icon">
            <Icon size={23} weight="duotone" aria-hidden />
          </span>
          <span>{label}</span>
          <span className="lv-module-port" aria-hidden />
        </li>
      ))}
    </ul>
  );
}

/** The architecture is illustrative; its modules retain the existing section labels. */
export function CoreEcosystemGraphic() {
  return (
    <div className="lv-graphic lv-core-graphic">
      <div className="lv-core-layout">
        <CoreModuleGroup side="left" />
        <FlowTracks
          id="azuriya-core-inbound"
          viewBox="0 0 100 316"
          paths={corePaths}
          className="lv-core-bridge lv-core-bridge-left"
        />
        <div className="lv-core-hub">
          <span className="lv-hub-mark" aria-hidden>
            <SquaresFour size={46} weight="duotone" />
          </span>
          <strong>AZURIYA CORE</strong>
          <span>Your operating layer</span>
          <div className="lv-hub-ports" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <FlowTracks
          id="azuriya-core-outbound"
          viewBox="0 0 100 316"
          paths={corePaths}
          className="lv-core-bridge lv-core-bridge-right"
          reverse
          delay={-1.6}
        />
        <CoreModuleGroup side="right" />
        <FlowTracks
          id="azuriya-core-mobile"
          viewBox="0 0 100 56"
          paths={[
            "M 50 0 V 16 Q 50 28 38 28 H 37 Q 25 28 25 40 V 56",
            "M 50 0 V 16 Q 50 28 62 28 H 63 Q 75 28 75 40 V 56",
          ]}
          className="lv-core-mobile-bridge"
        />
      </div>
      <div className="lv-graphic-controls">
        <DiagramMotionToggle />
      </div>
    </div>
  );
}

const comparisonSystems = [
  { label: "Trading platform", Icon: ChartLineUp },
  { label: "CRM & back office", Icon: Users },
  { label: "Payments", Icon: CreditCard },
  { label: "Copy trading", Icon: Copy },
];

/** A decorative overview supplements, without replacing, the detailed comparison table. */
export function BuildComparisonGraphic() {
  return (
    <div
      className="lv-graphic lv-comparison-graphic"
      role="img"
      aria-label="Separate trading, CRM, payments, and copy trading systems converge into one Azuriya operating stack."
    >
      <div className="lv-comparison-head" aria-hidden>
        <span>Build yourself</span>
        <span>Azuriya</span>
      </div>
      <div className="lv-comparison-layout" aria-hidden>
        <div className="lv-independent-systems">
          {comparisonSystems.map(({ label, Icon }) => (
            <div className="lv-independent-system" key={label}>
              <Icon size={25} weight="duotone" />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <svg
          className="lv-comparison-bridge"
          viewBox="0 0 100 216"
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d="M 0 51 H 25 Q 38 51 38 64 V 95 Q 38 108 51 108 H 100" />
          <path d="M 0 165 H 25 Q 38 165 38 152 V 121 Q 38 108 51 108 H 100" />
          <circle cx="75" cy="108" r="4" />
        </svg>
        <div className="lv-unified-stack">
          <div className="lv-unified-stack-heading">
            <span className="lv-stack-mark">
              <SquaresFour size={30} weight="duotone" />
            </span>
            <strong>AZURIYA CORE</strong>
          </div>
          <div className="lv-stack-systems">
            {comparisonSystems.map(({ label, Icon }) => (
              <div key={label}>
                <Icon size={18} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type AutomationGraphicTool = {
  name: string;
  logo?: string;
};

/** Tool names come from the catalog; the diagram depicts an illustrative workflow. */
export function OperationsAutomationGraphic({
  tools,
}: {
  tools: readonly AutomationGraphicTool[];
}) {
  return (
    <div className="lv-graphic lv-automation-graphic">
      <div className="lv-automation-layout">
        <div className="lv-automation-trigger">
          <span className="lv-automation-icon">
            <Lightning size={29} weight="duotone" aria-hidden />
          </span>
          <strong>Trigger</strong>
          <span className="lv-trigger-port" aria-hidden />
        </div>
        <svg
          className="lv-automation-bridge lv-automation-bridge-in"
          viewBox="0 0 100 180"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M 0 90 H 100" />
          <circle cx="50" cy="90" r="4" />
        </svg>
        <div className="lv-automation-workflow">
          <span className="lv-automation-icon">
            <GitBranch size={30} weight="duotone" aria-hidden />
          </span>
          <strong>Workflow</strong>
          <div className="lv-automation-tools">
            {tools.slice(0, 4).map((tool) => (
              <span key={tool.name}>{tool.name}</span>
            ))}
          </div>
        </div>
        <svg
          className="lv-automation-bridge lv-automation-bridge-out"
          viewBox="0 0 100 180"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M 0 90 H 35 Q 50 90 50 75 V 45 Q 50 30 65 30 H 100" />
          <path d="M 0 90 H 100" />
          <path d="M 0 90 H 35 Q 50 90 50 105 V 135 Q 50 150 65 150 H 100" />
        </svg>
        <ul className="lv-automation-destinations">
          {[
            { label: "CRM", Icon: Users },
            { label: "Funding", Icon: ArrowsLeftRight },
            { label: "Community", Icon: Users },
          ].map(({ label, Icon }) => (
            <li key={label}>
              <Icon size={21} weight="duotone" aria-hidden />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
