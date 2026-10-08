import Link from "next/link";
import {
  AppleLogo,
  Desktop,
  DiscordLogo,
  GlobeHemisphereWest,
  GooglePlayLogo,
  InstagramLogo,
  LinkedinLogo,
  Storefront,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";

// Add confirmed Azuriya destinations here when the services are available.
// Unconfigured destinations stay visibly unavailable rather than linking elsewhere.
const destinations: Record<string, string | null> = {
  live: null,
  desktop: null,
  appStore: null,
  googlePlay: null,
  appGallery: null,
  instagram: null,
  discord: null,
  linkedin: null,
  x: null,
  youtube: null,
};

const socials = [
  { key: "instagram", label: "Instagram", Icon: InstagramLogo },
  { key: "discord", label: "Discord", Icon: DiscordLogo },
  { key: "linkedin", label: "LinkedIn", Icon: LinkedinLogo },
  { key: "x", label: "X", Icon: XLogo },
  { key: "youtube", label: "YouTube", Icon: YoutubeLogo },
];
const apps = [
  {
    key: "web",
    eyebrow: "Trade in your browser",
    label: "Azuriya Web",
    Icon: GlobeHemisphereWest,
    href: "/terminal",
  },
  { key: "desktop", eyebrow: "Download for", label: "Desktop", Icon: Desktop },
  {
    key: "appStore",
    eyebrow: "Download on the",
    label: "App Store",
    Icon: AppleLogo,
  },
  {
    key: "googlePlay",
    eyebrow: "Get it on",
    label: "Google Play",
    Icon: GooglePlayLogo,
  },
  {
    key: "appGallery",
    eyebrow: "Explore it on",
    label: "AppGallery",
    Icon: Storefront,
  },
];

export function FooterAccess() {
  return (
    <section
      className="sf-access"
      aria-label="Platform access and social channels"
    >
      <div className="sf-access-top">
        <div>
          <div className="sf-environments" aria-label="Trading environments">
            {destinations.live ? (
              <a className="sf-environment" href={destinations.live}>
                <span className="sf-status-dot" aria-hidden="true" /> Live
              </a>
            ) : (
              <button className="sf-environment" type="button" disabled>
                <span className="sf-status-dot" aria-hidden="true" />
                <span>
                  Live <small>Coming soon</small>
                </span>
              </button>
            )}
            <Link className="sf-environment" href="/terminal">
              <span className="sf-status-dot" aria-hidden="true" />
              <span>
                Demo <small>Simulated trading</small>
              </span>
            </Link>
          </div>
        </div>
        <div className="sf-social-block">
          <span className="sf-access-label">Follow the community</span>
          <div className="sf-socials" aria-label="Azuriya social channels">
            {socials.map(({ key, label, Icon }) =>
              destinations[key] ? (
                <a
                  key={key}
                  href={destinations[key]!}
                  aria-label={`Azuriya on ${label}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon size={25} weight="fill" aria-hidden="true" />
                </a>
              ) : (
                <button
                  key={key}
                  type="button"
                  disabled
                  aria-label={`${label} — coming soon`}
                  title={`${label} — coming soon`}
                >
                  <Icon size={25} weight="fill" aria-hidden="true" />
                </button>
              ),
            )}
          </div>
          <small>Social channels coming soon.</small>
        </div>
      </div>
      <div className="sf-apps" aria-label="Azuriya applications">
        {apps.map(({ key, eyebrow, label, Icon, ...app }) => {
          const href = "href" in app ? app.href : destinations[key];
          const contents = (
            <>
              <Icon
                size={30}
                weight={key === "desktop" ? "regular" : "fill"}
                aria-hidden="true"
              />
              <span>
                <small>{eyebrow}</small>
                <strong>{label}</strong>
                {!href && <span className="sf-app-status">Coming soon</span>}
              </span>
            </>
          );
          return href ? (
            <Link className="sf-app-tile" href={href} key={key}>
              {contents}
            </Link>
          ) : (
            <button className="sf-app-tile" type="button" disabled key={key}>
              {contents}
            </button>
          );
        })}
      </div>
    </section>
  );
}
