import { productPages } from "./site-product-data";
import { resourcePages } from "./site-resource-data";
import { legalPages } from "./site-legal-data";
import { articlePages, insightsPage } from "./site-articles";
import type { SitePage } from "./site-types";
import { ecosystemPage } from "./ecosystem-page-data";

const directoryPage: SitePage = {
  path: "/sitemap",
  title: "Find your way around Azuriya.",
  navLabel: "Site directory",
  eyebrow: "SITE DIRECTORY",
  description:
    "Explore every product, solution, practical guide and policy. One clear directory for the whole Azuriya website.",
  kind: "index",
  highlights: [
    {
      title: "Explore the product",
      text: "See account operations, copy trading, native funding and community workspaces in context.",
    },
    {
      title: "Plan your operation",
      text: "Find a solution for your audience, team and intended trading infrastructure.",
    },
    {
      title: "Understand the details",
      text: "Read practical guides, preview boundaries and the legal document frameworks.",
    },
  ],
  sections: [
    {
      id: "navigation",
      title: "A connected website for a connected platform.",
      paragraphs: [
        "Use the directory above to filter by topic or search by page name. The footer on every public page also provides direct links to the platform, solution, resource, company and legal sections.",
      ],
    },
  ],
  related: ["/platform", "/solutions", "/resources", "/legal"],
};

export const sitePages: SitePage[] = [
  ecosystemPage,
  ...productPages,
  ...resourcePages,
  ...legalPages,
  insightsPage,
  ...articlePages,
  directoryPage,
];
export function getSitePage(path: string) {
  return sitePages.find((page) => page.path === path);
}
export type SiteCategory =
  | "Platform"
  | "Solutions"
  | "Resources"
  | "Company"
  | "Legal";
export function getSiteCategory(page: SitePage): SiteCategory {
  if (page.kind === "legal") return "Legal";
  if (page.path.startsWith("/solutions")) return "Solutions";
  if (
    page.kind === "article" ||
    page.path === "/resources" ||
    page.path === "/insights" ||
    page.path === "/help" ||
    page.kind === "status"
  )
    return "Resources";
  if (page.kind === "company" || page.path === "/sitemap") return "Company";
  return "Platform";
}
