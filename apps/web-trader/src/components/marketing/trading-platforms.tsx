import Image from "next/image";
import {
  ArrowUpRight,
  ChatCircleDots,
  CurrencyCircleDollar,
  PlugsConnected,
  ShieldCheck,
  Triangle,
} from "@phosphor-icons/react/dist/ssr";
import platformSources from "../../../public/marketing/platforms/sources.json";
import "./trading-platforms.css";
import { FlowTracks } from "./flow-tracks";

const platformCatalog = platformSources;
const wideLogos = new Set(["tradovate", "esignal", "cqg"]);
const darkLogoSurfaces = new Set(["quantower", "tradovate"]);
const featuredPlatforms = platformCatalog.filter((platform) =>
  ["metatrader-5", "ctrader", "tradelocker"].includes(platform.slug),
);

function PlatformArchitecture() {
  return (
    <figure
      className="pc-architecture"
      aria-label="Illustration of trading platform APIs connecting to Azuriya account, funding and community management"
    >
      <figcaption className="pc-architecture-caption">
        <span>One workspace. Every connection.</span>
        <span>Platform architecture</span>
      </figcaption>
      <div className="pc-architecture-map">
        <div className="pc-architecture-platforms">
          <span className="pc-architecture-label">Your platforms</span>
          <div className="pc-architecture-stack">
            {featuredPlatforms.map((platform) => (
              <div className="pc-architecture-platform" key={platform.slug}>
                <Image
                  src={`/marketing/platforms/${platform.file}`}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                />
                <span>{platform.name}</span>
              </div>
            ))}
          </div>
          <span className="pc-architecture-more">+ 29 platform options</span>
        </div>
        <div className="pc-architecture-connector">
          <FlowTracks
            id="platform-input"
            viewBox="0 0 80 248"
            paths={[
              "M 0 38 H 18 Q 26 38 26 46 V 116 Q 26 124 34 124 H 80",
              "M 0 124 H 80",
              "M 0 210 H 18 Q 26 210 26 202 V 132 Q 26 124 34 124 H 80",
            ]}
          />
        </div>
        <div className="pc-architecture-hub">
          <span className="pc-architecture-hub-mark">
            <Triangle weight="fill" size={34} aria-hidden="true" />
          </span>
          <strong>azuriya.</strong>
          <span>Your management portal</span>
          <div className="pc-architecture-hub-tags">
            <span>Accounts</span>
            <span>Trades</span>
            <span>Copy settings</span>
          </div>
        </div>
        <div className="pc-architecture-connector">
          <FlowTracks
            id="platform-output"
            viewBox="0 0 80 248"
            delay={-1.9}
            paths={[
              "M 0 124 H 46 Q 54 124 54 116 V 46 Q 54 38 62 38 H 80",
              "M 0 124 H 80",
              "M 0 124 H 46 Q 54 124 54 132 V 202 Q 54 210 62 210 H 80",
            ]}
          />
        </div>
        <div className="pc-architecture-services">
          <span className="pc-architecture-label">Your operation</span>
          <div className="pc-architecture-stack">
            <span className="pc-architecture-service">
              <ShieldCheck size={21} aria-hidden="true" />
              <span>Admin controls</span>
            </span>
            <span className="pc-architecture-service">
              <CurrencyCircleDollar size={21} aria-hidden="true" />
              <span>Funding</span>
            </span>
            <span className="pc-architecture-service">
              <ChatCircleDots size={21} aria-hidden="true" />
              <span>Community</span>
            </span>
          </div>
        </div>
      </div>
      <div className="pc-architecture-footnote">
        <PlugsConnected size={15} aria-hidden="true" />
        Configured API connectors · illustrative architecture
      </div>
    </figure>
  );
}

export function TradingPlatforms() {
  return (
    <section
      id="trading-platforms"
      className="pc-section az-container"
      aria-labelledby="pc-heading"
    >
      <div className="pc-overview">
        <div className="pc-introduction">
          <span className="pc-label">
            <PlugsConnected size={17} weight="regular" aria-hidden="true" />
            Platform integration catalog
          </span>
          <h2 id="pc-heading">
            Your trading platforms.
            <br />
            <span>One portal.</span>
          </h2>
          <p>
            Built to bring your trading stack together. Manage accounts, trades
            and copy settings through your configured platform APIs and
            connectors.
          </p>
        </div>
        <PlatformArchitecture />
      </div>

      <div className="pc-catalog-heading">
        <span>{platformCatalog.length} platforms in the catalog</span>
        <span>Choose the tools your team already knows</span>
      </div>
      <div className="pc-catalog" aria-label="Trading platform catalog">
        {platformCatalog.map((platform) => (
          <a
            key={platform.slug}
            className="pc-platform"
            href={platform.website}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${platform.name} official website (opens in a new tab)`}
          >
            <div
              className={`pc-logo${darkLogoSurfaces.has(platform.slug) ? " pc-logo-dark" : ""}${wideLogos.has(platform.slug) ? " pc-logo-wide" : ""}`}
            >
              <Image
                src={`/marketing/platforms/${platform.file}`}
                alt={`${platform.name} logo`}
                width={wideLogos.has(platform.slug) ? 116 : 48}
                height={48}
                unoptimized
                data-platform-logo={platform.slug}
              />
            </div>
            <span className="pc-platform-name">{platform.name}</span>
            <ArrowUpRight
              className="pc-platform-arrow"
              size={14}
              aria-hidden="true"
            />
          </a>
        ))}
      </div>
      <div className="pc-catalog-note">
        <PlugsConnected size={19} weight="regular" aria-hidden="true" />
        <p>
          Connection availability and supported actions depend on each
          platform’s API, your provider and the configured connector. This
          catalog describes the platform ecosystem; the local preview uses
          simulated execution. Logos belong to their respective owners.
        </p>
      </div>
    </section>
  );
}
