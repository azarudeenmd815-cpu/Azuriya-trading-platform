import type { SitePage } from "./site-types";
import {
  ecosystemCount,
  ecosystemCategories,
} from "../../lib/ecosystem-catalog";

export const ecosystemPage: SitePage = {
  path: "/integrations",
  title: "Your platforms. Your connected world.",
  navLabel: "Platform & tool directory",
  eyebrow: "THE AZURIYA ECOSYSTEM",
  description: `Explore ${ecosystemCount} distinct platforms and tools across ${ecosystemCategories.length} categories, including trading, copy trading, journals, bridges, automation, CRM, payments and AI.`,
  kind: "index",
  highlights: [
    {
      title: "500+ platforms & tools",
      text: "Browse a sourced catalog of distinct products and business applications.",
    },
    {
      title: "Search by your workflow",
      text: "Filter specialist trading technology, automation and operational tooling.",
    },
    {
      title: "Agree the connection scope",
      text: "Connections depend on provider APIs, permissions and technical review.",
    },
  ],
  sections: [
    {
      id: "catalog-scope",
      title: "A directory around your operation.",
      paragraphs: [
        "Catalog listings reference public product websites and industry directories. They do not establish an Azuriya partnership or an active native integration. Contact the team to review your proposed connections.",
      ],
    },
  ],
  related: ["/trading-platforms", "/platform", "/contact"],
};
