import type { SitePage } from "../components/marketing/site-types";
import { getSeoMetadata, isIndexablePage } from "./seo";

export function getSitePageMetadata(page: SitePage) {
  return getSeoMetadata({
    title: page.seoTitle ?? `${page.navLabel} | Azuriya`,
    description: page.description,
    path: page.path,
    index: isIndexablePage(page),
    ...(page.article
      ? ({
          type: "article",
          publishedTime: page.article.publishedAt,
          modifiedTime: page.article.updatedAt,
          imagePath: `/share/${page.path.split("/").at(-1)}`,
        } as const)
      : {}),
  });
}
