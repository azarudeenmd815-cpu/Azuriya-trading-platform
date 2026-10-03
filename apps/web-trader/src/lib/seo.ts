import { isIP } from "node:net";
import type { Metadata } from "next";
import type { SitePage } from "../components/marketing/site-types";

/** Only a confirmed, public HTTPS domain can become the canonical origin. */
export function getSiteOrigin(
  value = process.env.SITE_URL,
): string | undefined {
  if (!value?.trim()) return undefined;
  if (/[\\\u0000-\u0020]/.test(value.trim())) return undefined;

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const privateSuffixes = [
      "localhost",
      "local",
      "localdomain",
      "internal",
      "lan",
      "home",
      "test",
      "invalid",
      "example",
    ];
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !hostname.includes(".") ||
      hostname.endsWith(".") ||
      hostname.length > 253 ||
      hostname
        .split(".")
        .some(
          (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
        ) ||
      isIP(hostname) !== 0 ||
      hostname.includes(":") ||
      privateSuffixes.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      )
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function isPublicIndexingEnabled(): boolean {
  return Boolean(
    getSiteOrigin() &&
    process.env.SEO_ALLOW_INDEXING === "true" &&
    process.env.NODE_ENV !== "development" &&
    process.env.VERCEL_ENV !== "preview" &&
    process.env.VERCEL_ENV !== "development",
  );
}

/** Accept only clean, same-origin page paths, never a caller-supplied URL. */
export function absoluteSiteUrl(
  path: string,
  origin = getSiteOrigin(),
): string | undefined {
  const validatedOrigin = getSiteOrigin(origin);
  if (
    !validatedOrigin ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\?#\s]/.test(path)
  ) {
    return undefined;
  }
  const url = new URL(path, validatedOrigin);
  if (url.origin !== validatedOrigin || url.pathname !== path) return undefined;
  return url.href;
}

export function isIndexablePage(
  page: Pick<SitePage, "path" | "kind">,
): boolean {
  return (
    page.kind !== "legal" &&
    page.kind !== "status" &&
    page.path !== "/sitemap" &&
    page.path !== "/terminal" &&
    !page.path.startsWith("/terminal/")
  );
}

type SeoMetadataInput = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  imagePath?: string;
};

export function getSeoMetadata({
  title,
  description,
  path,
  index = true,
  type = "website",
  publishedTime,
  modifiedTime,
  imagePath = "/opengraph-image",
}: SeoMetadataInput): Metadata {
  const origin = getSiteOrigin();
  const canonical = absoluteSiteUrl(path, origin);
  const image = absoluteSiteUrl(imagePath, origin);
  const sharedOpenGraph = {
    title,
    description,
    siteName: "Azuriya",
    locale: "en_US",
    ...(canonical ? { url: canonical } : {}),
    ...(image
      ? {
          images: [
            {
              url: image,
              width: 1200,
              height: 630,
              alt:
                type === "article"
                  ? title
                  : "Azuriya — brokerage, prop firm and community operations",
            },
          ],
        }
      : {}),
  };

  return {
    title,
    description,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index: index && isPublicIndexingEnabled(), follow: true },
    openGraph:
      type === "article"
        ? {
            ...sharedOpenGraph,
            type: "article",
            ...(publishedTime ? { publishedTime } : {}),
            ...(modifiedTime ? { modifiedTime } : {}),
          }
        : { ...sharedOpenGraph, type: "website" },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Keep article content from terminating its JSON-LD script element. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
