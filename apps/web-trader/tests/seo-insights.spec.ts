import { expect, test } from "@playwright/test";
import {
  articlePages,
  articleReadingPaths,
} from "../src/components/marketing/site-articles";

test("journal renders crawlable articles, filters by topic and recovers from empty searches", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/insights")).text();
  for (const article of articlePages)
    expect(html).toContain(`href="${article.path}"`);
  await page.goto("/insights");
  const library = page.getByRole("region", { name: "Explore the articles." });
  await expect(library.locator(".ai-card")).toHaveCount(articlePages.length);
  await library.getByRole("button", { name: "Brokerage", exact: true }).click();
  await expect(library.locator(".ai-card")).toHaveCount(
    articlePages.filter((article) => article.article?.category === "Brokerage")
      .length,
  );
  await library
    .getByRole("button", { name: "Infrastructure", exact: true })
    .click();
  await expect(library.locator(".ai-card")).toHaveCount(
    articlePages.filter(
      (article) => article.article?.category === "Infrastructure",
    ).length,
  );
  const search = library.getByRole("searchbox", { name: "Search articles" });
  await search.fill("MT5 funding reconciliation");
  await expect(library.locator(".ai-card")).toHaveCount(1);
  await search.fill("unmatched-topic-9999");
  await expect(
    library.getByText("No articles match this search."),
  ).toBeVisible();
  await library.getByRole("button", { name: "Show all articles" }).click();
  await expect(search).toHaveValue("");
  await expect(library.locator(".ai-card")).toHaveCount(articlePages.length);
  await library.locator(".ai-card h3 a").first().click();
  await expect(page).toHaveURL(
    /\/insights\/influencer-brokerage-launch-checklist$/,
  );
});

test("articles show readable content, sources, metadata and working contents links", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const article of articlePages) {
    await page.goto(article.path);
    await expect(page).toHaveTitle(article.seoTitle!);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      article.description,
    );
    await expect(page.locator(".ai-article-meta time").first()).toHaveAttribute(
      "datetime",
      article.article!.publishedAt,
    );
    await expect(page.locator(".sp-content-section")).toHaveCount(
      article.sections.length,
    );
    await expect(page.locator(".sp-sources a")).toHaveCount(
      article.sources!.length,
    );
    const graph = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent();
    const node = JSON.parse(graph!)["@graph"].find(
      (item: { "@type": string }) => item["@type"] === "Article",
    );
    expect(node.headline).toBe(article.title);
    expect(node.datePublished).toBe(article.article!.publishedAt);
    expect(node.author.name).toBe(article.article!.author);
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link")
      .last()
      .click();
    await expect(
      page.locator(`#${article.sections.at(-1)!.id}`),
    ).toBeInViewport();
  }
  expect(errors).toEqual([]);
});

test("reading paths provide crawlable sequences and the hero reaches all articles", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/insights")).text();
  for (const readingPath of articleReadingPaths)
    for (const path of readingPath.paths)
      expect(html).toContain(`href="${path}"`);
  await page.goto("/insights");
  const paths = page.getByRole("region", {
    name: "A reading path for your role.",
  });
  await expect(paths.locator(".ai-reading-path")).toHaveCount(4);
  await expect(paths.locator("ol a")).toHaveCount(12);
  await page
    .getByRole("link", {
      name: `Browse all ${articlePages.length} articles`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/#article-library$/);
  await expect(page.locator("#article-library-title")).toBeInViewport();
  await paths
    .getByRole("link", { name: "MT5 Manager account groups", exact: true })
    .click();
  await expect(page).toHaveURL(/\/insights\/mt5-manager-account-groups$/);
});

test("preview crawl rules, share images and phone layouts are usable", async ({
  page,
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("<loc>");
  for (const image of [
    "/opengraph-image",
    `/share/${articlePages[0]!.path.split("/").at(-1)}`,
  ]) {
    const response = await request.get(image);
    expect(response.status(), image).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  }
  expect((await request.get("/share/missing-article")).status()).toBe(404);
  for (const path of [
    "/insights",
    articlePages[2]!.path,
    "/insights/trading-operations-incident-response",
  ]) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, follow",
    );
    for (const width of [320, 768, 1512]) {
      await page.setViewportSize({ width, height: 982 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
});
