import type { MetadataRoute } from "next";
import { absoluteSiteUrl, isPublicIndexingEnabled } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!isPublicIndexingEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/terminal" },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
