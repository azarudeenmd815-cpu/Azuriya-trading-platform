import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  articlePages,
  articleReadingPaths,
  getReadingMinutes,
  insightsPage,
} from "../components/marketing/site-articles";
import {
  getPageStructuredData,
  getWebsiteStructuredData,
} from "./site-structured-data";
import { getSitePageMetadata } from "./site-page-metadata";

describe("article content and search representation", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("SEO_ALLOW_INDEXING", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("publishes distinct guides with editorial dates, source links and detailed checklists", () => {
    expect(articlePages).toHaveLength(16);
    expect(new Set(articlePages.map((page) => page.seoTitle)).size).toBe(
      articlePages.length,
    );
    expect(new Set(articlePages.map((page) => page.description)).size).toBe(
      articlePages.length,
    );
    for (const page of articlePages) {
      expect(page.article?.publishedAt, page.path).toBe("2026-10-01");
      expect(page.article?.author, page.path).toBe("Azuriya editorial");
      expect(page.sections.length, page.path).toBeGreaterThanOrEqual(5);
      expect(
        page.sections.some((section) => section.bullets?.length),
        page.path,
      ).toBe(true);
      expect(page.sources?.length, page.path).toBeGreaterThan(0);
      for (const source of page.sources ?? [])
        expect(new URL(source.href).protocol).toBe("https:");
      expect(getReadingMinutes(page), page.path).toBeGreaterThan(1);
    }
  });

  it("connects each reading path to three distinct, published articles", () => {
    expect(articleReadingPaths).toHaveLength(4);
    const published = new Set(articlePages.map((page) => page.path));
    for (const readingPath of articleReadingPaths) {
      expect(readingPath.paths).toHaveLength(3);
      expect(new Set(readingPath.paths).size).toBe(3);
      for (const path of readingPath.paths)
        expect(published.has(path), path).toBe(true);
    }
  });

  it("uses only confirmed URLs and truthful editorial identity in article data", () => {
    const page = articlePages[0]!;
    const preview = getPageStructuredData(page);
    expect(JSON.stringify(preview)).not.toMatch(
      /localhost|example\.com|BreadcrumbList/,
    );
    const article = preview["@graph"].find(
      (item) => item["@type"] === "Article",
    )!;
    expect(article.author).toEqual({
      "@type": "Organization",
      name: page.article?.author,
    });
    expect(article.url).toBeUndefined();
    expect(article.dateModified).toBeUndefined();
    vi.stubEnv("SITE_URL", "https://example.com");
    const production = getPageStructuredData(page);
    const published = production["@graph"].find(
      (item) => item["@type"] === "Article",
    )!;
    expect(published.url).toBe(`https://example.com${page.path}`);
    expect(published.image).toBe(
      `https://example.com/share/${page.path.split("/").at(-1)}`,
    );
    const breadcrumb = production["@graph"].find(
      (item) => item["@type"] === "BreadcrumbList",
    )!;
    expect(breadcrumb.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://example.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Insights & articles",
        item: "https://example.com/insights",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: page.navLabel,
        item: `https://example.com${page.path}`,
      },
    ]);
  });

  it("describes the visible collection and website without invented review scores or author credentials", () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    const collection = getPageStructuredData(insightsPage)["@graph"].find(
      (item) => item["@type"] === "CollectionPage",
    )!;
    expect(
      (collection.mainEntity as { itemListElement: unknown[] }).itemListElement,
    ).toHaveLength(articlePages.length);
    expect(getWebsiteStructuredData().url).toBe("https://example.com/");
    expect(JSON.stringify(collection)).not.toMatch(
      /aggregateRating|reviewCount|Person|SearchAction/,
    );
  });

  it("gives each article its own canonical, title and share image when configured", () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    for (const page of articlePages) {
      const metadata = getSitePageMetadata(page);
      expect(metadata.title).toBe(page.seoTitle);
      expect(metadata.alternates?.canonical).toBe(
        `https://example.com${page.path}`,
      );
      expect(metadata.openGraph).toMatchObject({
        type: "article",
        publishedTime: page.article?.publishedAt,
        images: [
          {
            url: `https://example.com/share/${page.path.split("/").at(-1)}`,
            width: 1200,
            height: 630,
          },
        ],
      });
    }
  });
});
