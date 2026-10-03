import type { MetadataRoute } from "next";
import { sitePages } from "../components/marketing/site-pages";
import {
  absoluteSiteUrl,
  isIndexablePage,
  isPublicIndexingEnabled,
} from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicIndexingEnabled()) return [];

  const publicPages = sitePages.filter(isIndexablePage);
  return [
    { url: absoluteSiteUrl("/")! },
    { url: absoluteSiteUrl("/mt5-deposits")! },
    ...publicPages.map((page) => {
      const lastModified = page.article?.updatedAt ?? page.article?.publishedAt;
      return {
        url: absoluteSiteUrl(page.path)!,
        ...(lastModified ? { lastModified } : {}),
      };
    }),
  ];
}
