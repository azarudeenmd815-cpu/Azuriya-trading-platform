import Image from "next/image";
import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  GlobeHemisphereWest,
  PlugsConnected,
  ShieldCheck,
  Triangle,
} from "@phosphor-icons/react/dist/ssr";
import "./liquidity-network.css";
import "./liquidity-logos.css";
import { FlowTracks } from "./flow-tracks";
import { DiagramMotionToggle } from "./marketing-motion";

const accountPlatforms = [
  {
    name: "MetaTrader 5",
    file: "metatrader-5.png",
    detail: "MT5 account groups",
  },
  { name: "cTrader", file: "ctrader.ico", detail: "Platform accounts" },
  {
    name: "TradeLocker",
    file: "tradelocker.webp",
    detail: "Brokerage accounts",
  },
];

const assetRoot = "/marketing/infrastructure";

const sourceSheets = {
  directory: {
    file: "liquidity-provider-directory.png",
    width: 2346,
    height: 524,
  },
  one: { file: "liquidity-provider-logos-one.png", width: 802, height: 404 },
  two: { file: "liquidity-provider-logos-two.png", width: 786, height: 346 },
  three: {
    file: "liquidity-provider-logos-three.png",
    width: 776,
    height: 336,
  },
  isam: {
    file: "provider-logos/isam-securities.svg",
    width: 371,
    height: 50,
  },
  ixo: { file: "provider-logos/ixo-prime.png", width: 120, height: 120 },
  pu: { file: "provider-logos/pu-prime.png", width: 120, height: 120 },
} as const;

type ProviderLogo = {
  name: string;
  sheet: keyof typeof sourceSheets;
  x: number;
  y: number;
  width: number;
  height: number;
  surface?: "dark" | "red" | "teal";
  surfaceColor?: string;
};

// Rectangular crops retain the complete user-supplied marks and their aspect
// ratios. Three clearer brand originals replace low-contrast screenshot tiles.
// The unlabeled marks were
// matched to the official MetaTrader 5 directory: PU Prime, VS Capital,
// Vantage Global Prime and GTC Prime. This list does not assert a partnership.
// https://www.metatrader5.com/en/stocks-ecns/liquidity_providers_ecns
const providers: ProviderLogo[] = [
  {
    name: "Luramic",
    sheet: "one",
    x: 659,
    y: 224,
    width: 93,
    height: 104,
    surface: "dark",
  },
  { name: "RoboMarkets", sheet: "one", x: 501, y: 238, width: 112, height: 71 },
  {
    name: "Taurex Prime",
    sheet: "directory",
    x: 1548,
    y: 100,
    width: 106,
    height: 43,
    surface: "red",
    surfaceColor: "#a8374c",
  },
  {
    name: "FxPro",
    sheet: "one",
    x: 204,
    y: 96,
    width: 100,
    height: 54,
    surface: "red",
  },
  { name: "FxGrow", sheet: "two", x: 645, y: 65, width: 116, height: 61 },
  { name: "BitDelta", sheet: "three", x: 631, y: 74, width: 104, height: 40 },
  {
    name: "iSAM Securities",
    sheet: "isam",
    x: 0,
    y: 0,
    width: 371,
    height: 50,
    surface: "teal",
  },
  {
    name: "Global Markets Group Prime",
    sheet: "one",
    x: 347,
    y: 79,
    width: 116,
    height: 89,
  },
  {
    name: "Exura Prime",
    sheet: "one",
    x: 503,
    y: 111,
    width: 107,
    height: 34,
    surface: "dark",
  },
  {
    name: "Vantage Global Prime",
    sheet: "one",
    x: 653,
    y: 75,
    width: 112,
    height: 104,
  },
  { name: "GTC Prime", sheet: "one", x: 48, y: 251, width: 107, height: 50 },
  { name: "CMS Prime", sheet: "one", x: 207, y: 246, width: 91, height: 60 },
  { name: "PU Prime", sheet: "pu", x: 0, y: 0, width: 120, height: 120 },
  { name: "GBE Prime", sheet: "two", x: 349, y: 48, width: 100, height: 98 },
  { name: "Scope Prime", sheet: "two", x: 495, y: 82, width: 112, height: 29 },
  { name: "Axi Prime", sheet: "two", x: 48, y: 213, width: 89, height: 68 },
  {
    name: "DBG Markets",
    sheet: "two",
    x: 189,
    y: 222,
    width: 116,
    height: 54,
    surface: "dark",
    surfaceColor: "#141513",
  },
  {
    name: "VS Capital",
    sheet: "two",
    x: 341,
    y: 196,
    width: 116,
    height: 106,
    surface: "dark",
  },
  { name: "IXO Prime", sheet: "ixo", x: 0, y: 43, width: 120, height: 38 },
  {
    name: "LP Prime",
    sheet: "two",
    x: 655,
    y: 225,
    width: 104,
    height: 78,
    surface: "dark",
    surfaceColor: "#071019",
  },
  {
    name: "FinPrime Group",
    sheet: "three",
    x: 169,
    y: 75,
    width: 114,
    height: 39,
  },
  {
    name: "IC Markets Global",
    sheet: "three",
    x: 37,
    y: 209,
    width: 77,
    height: 76,
  },
  {
    name: "Macro Global",
    sheet: "three",
    x: 322,
    y: 226,
    width: 114,
    height: 43,
  },
];

function SuppliedProviderLogo({ provider }: { provider: ProviderLogo }) {
  const source = sourceSheets[provider.sheet];

  return (
    <span
      className="ln-logo-crop"
      role="img"
      aria-label={`${provider.name} logo`}
      data-logo-surface={provider.surface ?? "light"}
      style={
        {
          "--ln-logo-ratio": provider.width / provider.height,
          backgroundColor: provider.surfaceColor,
        } as CSSProperties
      }
    >
      <span className="ln-logo-viewport">
        <Image
          className="ln-logo-sheet"
          src={`${assetRoot}/${source.file}`}
          alt=""
          aria-hidden="true"
          width={source.width}
          height={source.height}
          unoptimized
          style={{
            width: `${(source.width / provider.width) * 100}%`,
            height: `${(source.height / provider.height) * 100}%`,
            left: `${(-provider.x / provider.width) * 100}%`,
            top: `${(-provider.y / provider.height) * 100}%`,
          }}
        />
      </span>
    </span>
  );
}

export function LiquidityNetwork() {
  return (
    <section
      id="liquidity"
      className="az-section az-container ln-section"
      aria-labelledby="liquidity-title"
    >
      <div className="ln-intro">
        <div>
          <p className="az-eyebrow">
            <GlobeHemisphereWest size={17} /> DIRECT LIQUIDITY ACCESS
          </p>
          <h2 id="liquidity-title">
            An A-book model.
            <br />
            <span>A choice of liquidity.</span>
          </h2>
        </div>
        <div className="ln-intro-copy">
          <p>
            Connect directly with liquidity providers. Choose the execution
            setup for your brokerage, with {providers.length} provider options
            shown in our infrastructure references.
          </p>
          <a className="ln-text-link" href="#infrastructure">
            Explore the infrastructure <ArrowUpRight size={17} />
          </a>
        </div>
      </div>

      <div className="ln-route" aria-label="A-book execution model">
        <div className="ln-routing-caption">
          <span>From your accounts to the market.</span>
          <span>Illustrative execution architecture</span>
          <DiagramMotionToggle />
        </div>
        <div className="ln-routing-map">
          <div className="ln-routing-accounts">
            <span className="ln-routing-label">Your community accounts</span>
            <div className="ln-routing-stack">
              {accountPlatforms.map((platform) => (
                <div className="ln-account-node" key={platform.name}>
                  <Image
                    src={`/marketing/platforms/${platform.file}`}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                  />
                  <span>
                    <strong>{platform.name}</strong>
                    <span>{platform.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="ln-routing-connector" aria-hidden="true">
            <span>Platform APIs</span>
            <FlowTracks
              id="liquidity-input"
              className="ln-track-desktop"
              viewBox="0 0 80 248"
              paths={[
                "M 0 38 H 18 Q 26 38 26 46 V 116 Q 26 124 34 124 H 80",
                "M 0 124 H 80",
                "M 0 210 H 18 Q 26 210 26 202 V 132 Q 26 124 34 124 H 80",
              ]}
            />
            <FlowTracks
              id="liquidity-input-mobile"
              className="ln-track-mobile"
              viewBox="0 0 300 58"
              paths={[
                "M 50 0 V 20 Q 50 28 58 28 H 142 Q 150 28 150 36 V 58",
                "M 150 0 V 58",
                "M 250 0 V 20 Q 250 28 242 28 H 158 Q 150 28 150 36 V 58",
              ]}
            />
          </div>
          <div className="ln-routing-hub">
            <span className="ln-hub-mark">
              <Triangle size={37} weight="fill" aria-hidden="true" />
            </span>
            <strong>azuriya.</strong>
            <span className="ln-hub-subtitle">A-book routing</span>
            <div className="ln-hub-detail">
              <ShieldCheck size={15} aria-hidden="true" />
              External liquidity execution
            </div>
            <span className="ln-hub-model">No B-book dealing model</span>
          </div>
          <div className="ln-routing-connector" aria-hidden="true">
            <span>Direct liquidity</span>
            <FlowTracks
              id="liquidity-output"
              className="ln-track-desktop"
              viewBox="0 0 80 248"
              delay={-1.9}
              paths={[
                "M 0 124 H 46 Q 54 124 54 116 V 46 Q 54 38 62 38 H 80",
                "M 0 124 H 80",
                "M 0 124 H 46 Q 54 124 54 132 V 202 Q 54 210 62 210 H 80",
              ]}
            />
            <FlowTracks
              id="liquidity-output-mobile"
              className="ln-track-mobile"
              viewBox="0 0 300 58"
              delay={-1.9}
              paths={[
                "M 150 0 V 20 Q 150 28 142 28 H 58 Q 50 28 50 36 V 58",
                "M 150 0 V 58",
                "M 150 0 V 20 Q 150 28 158 28 H 242 Q 250 28 250 36 V 58",
              ]}
            />
          </div>
          <div className="ln-routing-providers">
            <span className="ln-routing-label">Liquidity provider options</span>
            <div className="ln-routing-stack">
              {[providers[3], providers[13], providers[1]].map((provider) => (
                <div className="ln-provider-node" key={provider.name}>
                  <SuppliedProviderLogo provider={provider} />
                  <span>
                    <strong>{provider.name}</strong>
                    <span>Provider option</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="ln-routing-legend">
          <span>
            <PlugsConnected size={17} /> Configured platform connectors
          </span>
          <span>
            <ShieldCheck size={17} /> Your routing & risk settings
          </span>
          <span>
            <GlobeHemisphereWest size={17} /> {providers.length} liquidity
            options
          </span>
        </div>
      </div>

      <div className="ln-directory" id="liquidity-directory">
        <div className="ln-directory-heading">
          <div>
            <span className="ln-directory-eyebrow">
              THE LIQUIDITY DIRECTORY
            </span>
            <h3>A provider for your execution setup.</h3>
          </div>
          <span className="ln-directory-count">
            <GlobeHemisphereWest size={17} aria-hidden="true" />
            {providers.length} provider options
          </span>
        </div>
        <ul
          className="ln-provider-grid"
          aria-label="Liquidity provider options"
        >
          {providers.map((provider) => (
            <li
              className="ln-provider"
              key={provider.name}
              data-liquidity-logo={provider.name}
            >
              <SuppliedProviderLogo provider={provider} />
              <span className="ln-provider-name">{provider.name}</span>
            </li>
          ))}
          <li className="ln-directory-explore">
            <a href="#infrastructure">
              <PlugsConnected size={28} aria-hidden="true" />
              <strong>Your execution setup</strong>
              <span>
                Explore the infrastructure <ArrowUpRight size={14} />
              </span>
            </a>
          </li>
        </ul>
      </div>
      <p className="ln-provider-note">
        Provider availability and connection terms depend on your configured
        infrastructure and provider agreement. Logos identify the options in the
        supplied references.
      </p>
    </section>
  );
}
