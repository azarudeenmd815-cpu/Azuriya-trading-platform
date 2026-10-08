import Link from "next/link";
import {
  ArrowUpRight,
  Lightning,
  PlugsConnected,
} from "@phosphor-icons/react/dist/ssr";
import {
  ecosystemCategories,
  ecosystemCategoryCounts,
  ecosystemCatalog,
  ecosystemCount,
  ecosystemItems,
} from "@/lib/ecosystem-catalog";
import { EcosystemLogo } from "./ecosystem-logo";
import { OperationsAutomationGraphic } from "./launch-visuals";
import "./ecosystem-directory.css";

export function EcosystemPreview() {
  const featured = ecosystemCategories.slice(0, 6);
  return (
    <section
      className="az-container ec-preview"
      id="ecosystem"
      aria-labelledby="ec-preview-title"
    >
      <div className="ec-preview-heading">
        <div>
          <div className="az-eyebrow">
            <PlugsConnected size={17} /> BUILT AROUND YOUR STACK
          </div>
          <h2 id="ec-preview-title">
            The tools you know.
            <br />
            The stack you choose.
          </h2>
          <p>
            Explore trading platforms, copy traders, journals, bridges and the
            business tools around your operation. Your connections start with
            the right scope.
          </p>
        </div>
        <div className="ec-preview-count">
          <strong>500+</strong>
          <span>
            {ecosystemCount} distinct platforms & tools
            <br />
            across {ecosystemCategories.length} categories
          </span>
        </div>
      </div>
      <div className="ec-preview-grid">
        {featured.map((group) => {
          const items = ecosystemCatalog
            .filter((item) => item.category === group.id)
            .slice(0, 4);
          return (
            <Link
              href={`/integrations?category=${group.id}`}
              className="ec-preview-category"
              key={group.id}
            >
              <div className="ec-preview-category-top">
                <span>{ecosystemCategoryCounts[group.id]} in the catalog</span>
                <ArrowUpRight size={17} />
              </div>
              <div className="ec-preview-logos">
                {items.map((item) => (
                  <EcosystemLogo key={item.id} item={item} />
                ))}
              </div>
              <h3>{group.name}</h3>
              <p>{group.description}</p>
            </Link>
          );
        })}
      </div>
      <div className="ec-preview-links">
        {ecosystemCategories.slice(6).map((group) => (
          <Link key={group.id} href={`/integrations?category=${group.id}`}>
            {group.name}
            <span>{ecosystemCategoryCounts[group.id]}</span>
          </Link>
        ))}
      </div>
      <div className="ec-preview-bottom">
        <p>
          Catalog entries describe the ecosystem. API access, provider
          permissions and technical review determine the connections available
          for your deployment.
        </p>
        <Link href="/integrations" className="az-button">
          Explore All {ecosystemCount} Platforms & Tools
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </section>
  );
}

export function AutomationEcosystem() {
  const tools = ecosystemItems([
    "zapier",
    "make",
    "n8n",
    "pipedream",
    "activepieces",
    "microsoft-power-automate",
    "workato",
    "tray-ai",
    "uipath",
    "ifttt",
    "integrately",
    "bardeen",
  ]);
  return (
    <section
      className="az-container ec-automation"
      id="automation"
      aria-labelledby="ec-automation-title"
    >
      <div className="ec-automation-heading">
        <div className="az-eyebrow">
          <Lightning size={17} /> THE WORK BETWEEN YOUR SYSTEMS
        </div>
        <h2 id="ec-automation-title">Make your operation flow.</h2>
        <p>
          Explore automation tools for the workflows around your business—from
          client handoffs and reporting to funding reviews and community
          updates.
        </p>
      </div>
      <OperationsAutomationGraphic tools={tools} />
      <div className="ec-automation-tools">
        {tools.map((item) => (
          <a
            href={item.href}
            key={item.id}
            target="_blank"
            rel="noopener noreferrer"
          >
            <EcosystemLogo item={item} />
            <span>{item.name}</span>
          </a>
        ))}
      </div>
      <div className="ec-automation-footer">
        <p>
          Workflow illustration only. Automation requires agreed connector
          scope, access controls and supported actions in each system.
        </p>
        <Link href="/integrations?category=automation">
          Explore automation tools
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
