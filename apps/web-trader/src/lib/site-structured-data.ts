import type { SitePage } from "../components/marketing/site-types";
import { articlePages } from "../components/marketing/site-articles";
import { absoluteSiteUrl, getSiteOrigin } from "./seo";

export function getWebsiteStructuredData() {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Azuriya",
    description:
      "Brokerage, prop firm and trading community technology for influencers and their teams.",
    inLanguage: "en",
    ...(origin ? { "@id": `${origin}/#website`, url: `${origin}/` } : {}),
  };
}

export function getPageStructuredData(page: SitePage) {
  const origin = getSiteOrigin();
  const url = absoluteSiteUrl(page.path);
  const hub = page.article
    ? { name: "Insights & articles", path: "/insights" }
    : page.kind === "article"
      ? { name: "Resources", path: "/resources" }
      : page.kind === "solution"
        ? { name: "Solutions", path: "/solutions" }
        : page.kind === "legal"
          ? { name: "Legal centre", path: "/legal" }
          : undefined;
  const crumbs = [
    { name: "Home", path: "/" },
    ...(hub && hub.path !== page.path ? [hub] : []),
    { name: page.navLabel, path: page.path },
  ];
  const graph: Record<string, unknown>[] = [];
  if (origin)
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: absoluteSiteUrl(crumb.path),
      })),
    });
  if (page.article)
    graph.push({
      "@type": "Article",
      ...(url
        ? {
            "@id": `${url}#article`,
            url,
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            image: absoluteSiteUrl(`/share/${page.path.split("/").at(-1)}`),
          }
        : {}),
      headline: page.title,
      description: page.description,
      articleSection: page.article.category,
      inLanguage: "en",
      datePublished: page.article.publishedAt,
      ...(page.article.updatedAt
        ? { dateModified: page.article.updatedAt }
        : {}),
      author: {
        "@type": "Organization",
        name: page.article.author,
        ...(origin ? { url: `${origin}/insights#our-editorial-approach` } : {}),
      },
      publisher: {
        "@type": "Organization",
        name: "Azuriya",
        ...(origin ? { url: `${origin}/` } : {}),
      },
      citation: page.sources?.map((source) => source.href),
    });
  else
    graph.push({
      "@type": page.path === "/insights" ? "CollectionPage" : "WebPage",
      name: page.title,
      description: page.description,
      inLanguage: "en",
      ...(url ? { url, "@id": url } : {}),
      ...(page.path === "/insights" && origin
        ? {
            mainEntity: {
              "@type": "ItemList",
              itemListElement: articlePages.map((article, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: article.title,
                url: absoluteSiteUrl(article.path),
              })),
            },
          }
        : {}),
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
