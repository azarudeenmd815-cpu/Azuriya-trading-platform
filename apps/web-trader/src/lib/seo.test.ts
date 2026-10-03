import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { sitePages } from "../components/marketing/site-pages";
import {
  absoluteSiteUrl,
  getSeoMetadata,
  getSiteOrigin,
  isIndexablePage,
  isPublicIndexingEnabled,
  serializeJsonLd,
} from "./seo";

const input = {
  title: "Brokerage operations | Azuriya",
  description: "A practical guide to running account and community operations.",
  path: "/insights/brokerage-operations",
};

describe("public SEO configuration", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("SEO_ALLOW_INDEXING", "false");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes a public HTTPS domain without inventing one", () => {
    expect(getSiteOrigin()).toBeUndefined();
    expect(getSiteOrigin("  https://EXAMPLE.com/  ")).toBe(
      "https://example.com",
    );
    expect(getSiteOrigin("https://www.example.com")).toBe(
      "https://www.example.com",
    );
  });

  it.each([
    "not-a-url",
    "http://example.com",
    "https://localhost",
    "https://app.localhost",
    "https://broker.internal",
    "https://app.local",
    "https://preview.test",
    "https://preview.invalid",
    "https://machine",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://[::1]",
    "https://2130706433",
    "https://user:password@example.com",
    "https://example.com:3000",
    "https://example.com/subdirectory",
    "https://example.com/?draft=true",
    "https://example.com/#preview",
    "https://example.com.",
    "https://example..com",
    "https://example.com\\",
    "https://exam\nple.com",
  ])("rejects an unsuitable canonical origin: %s", (value) => {
    expect(getSiteOrigin(value)).toBeUndefined();
  });

  it("requires a domain and an explicit public launch setting", () => {
    expect(isPublicIndexingEnabled()).toBe(false);
    vi.stubEnv("SEO_ALLOW_INDEXING", "true");
    expect(isPublicIndexingEnabled()).toBe(false);
    vi.stubEnv("SITE_URL", "https://example.com");
    expect(isPublicIndexingEnabled()).toBe(true);
    vi.stubEnv("SEO_ALLOW_INDEXING", "TRUE");
    expect(isPublicIndexingEnabled()).toBe(false);
  });

  it.each([
    { runtime: "development", deployment: "production" },
    { runtime: "production", deployment: "preview" },
    { runtime: "production", deployment: "development" },
  ])(
    "keeps development and Vercel previews non-indexable: %o",
    ({ runtime, deployment }) => {
      vi.stubEnv("SITE_URL", "https://example.com");
      vi.stubEnv("SEO_ALLOW_INDEXING", "true");
      vi.stubEnv("NODE_ENV", runtime);
      vi.stubEnv("VERCEL_ENV", deployment);
      expect(isPublicIndexingEnabled()).toBe(false);
      expect(getSeoMetadata(input).robots).toEqual({
        index: false,
        follow: true,
      });
      expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
      expect(sitemap()).toEqual([]);
    },
  );

  it("emits no canonical or fabricated share URLs before domain configuration", () => {
    const metadata = getSeoMetadata(input);
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.metadataBase).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("url");
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("builds page-specific canonical, article and share metadata", () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    vi.stubEnv("SEO_ALLOW_INDEXING", "true");
    const metadata = getSeoMetadata({
      ...input,
      type: "article",
      publishedTime: "2026-10-01",
      modifiedTime: "2026-10-01",
      imagePath: "/share/brokerage-operations",
    });
    expect(metadata.alternates).toEqual({
      canonical: "https://example.com/insights/brokerage-operations",
    });
    expect(metadata.metadataBase?.toString()).toBe("https://example.com/");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-10-01",
      modifiedTime: "2026-10-01",
      url: "https://example.com/insights/brokerage-operations",
      images: [
        {
          url: "https://example.com/share/brokerage-operations",
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["https://example.com/share/brokerage-operations"],
    });
  });

  it("keeps excluded pages noindex while allowing their noindex directive to be crawled", () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    vi.stubEnv("SEO_ALLOW_INDEXING", "true");
    expect(getSeoMetadata({ ...input, index: false }).robots).toEqual({
      index: false,
      follow: true,
    });
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/terminal" },
      sitemap: "https://example.com/sitemap.xml",
    });
    expect(isIndexablePage({ path: "/legal/privacy", kind: "legal" })).toBe(
      false,
    );
    expect(isIndexablePage({ path: "/status", kind: "status" })).toBe(false);
    expect(isIndexablePage({ path: "/sitemap", kind: "index" })).toBe(false);
    expect(isIndexablePage({ path: "/terminal/orders", kind: "product" })).toBe(
      false,
    );
    expect(isIndexablePage({ path: "/insights", kind: "index" })).toBe(true);
  });

  it("creates a sitemap from the live registry and real editorial dates", () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    vi.stubEnv("SEO_ALLOW_INDEXING", "true");
    const entries = sitemap();
    const expectedPaths = [
      "/",
      "/mt5-deposits",
      ...sitePages.filter(isIndexablePage).map((page) => page.path),
    ];
    expect(entries.map(({ url }) => new URL(url).pathname).sort()).toEqual(
      expectedPaths.sort(),
    );
    expect(new Set(entries.map(({ url }) => url)).size).toBe(entries.length);
    const article = sitePages.find((page) => page.article);
    expect(article).toBeDefined();
    expect(
      entries.find(({ url }) => new URL(url).pathname === article!.path)
        ?.lastModified,
    ).toBe(article!.article!.updatedAt ?? article!.article!.publishedAt);
    expect(
      entries.find(({ url }) => new URL(url).pathname === "/")?.lastModified,
    ).toBeUndefined();
    expect(entries.every((entry) => !entry.url.includes("localhost"))).toBe(
      true,
    );
  });

  it("only resolves clean internal paths against a validated origin", () => {
    expect(absoluteSiteUrl("/insights", "https://example.com")).toBe(
      "https://example.com/insights",
    );
    for (const path of [
      "https://evil.com",
      "//evil.com/path",
      "/\\evil.com",
      "/a?draft=1",
      "/a#section",
      "/a b",
      "/../outside",
    ]) {
      expect(absoluteSiteUrl(path, "https://example.com")).toBeUndefined();
    }
    expect(absoluteSiteUrl("/insights", "https://localhost")).toBeUndefined();
  });

  it("escapes script termination and line separators without altering article data", () => {
    const data = {
      headline: "</script><script>alert('x')</script>",
      body: "line\u2028paragraph\u2029end",
    };
    const serialized = serializeJsonLd(data);
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(JSON.parse(serialized)).toEqual(data);
  });
});
