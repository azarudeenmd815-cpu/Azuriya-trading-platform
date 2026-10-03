export type SiteVisual =
  | "portal"
  | "brokerage"
  | "prop"
  | "copy"
  | "community"
  | "admin"
  | "liquidity"
  | "platforms"
  | "funding"
  | "risk"
  | "commercial"
  | "network";

export type SiteSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  links?: { label: string; href: string }[];
};

export type SiteArticle = {
  category:
    | "Brokerage"
    | "Prop firms"
    | "Copy trading"
    | "Infrastructure"
    | "Community";
  publishedAt: string;
  updatedAt?: string;
  author: string;
};

export type SitePage = {
  path: string;
  title: string;
  navLabel: string;
  eyebrow: string;
  description: string;
  kind:
    | "product"
    | "solution"
    | "article"
    | "index"
    | "company"
    | "legal"
    | "status";
  seoTitle?: string;
  article?: SiteArticle;
  visual?: SiteVisual;
  highlights: { title: string; text: string }[];
  sections: SiteSection[];
  steps?: { title: string; text: string }[];
  faqs?: { question: string; answer: string }[];
  related: string[];
  cta?: { label: string; href: string };
  sources?: { label: string; href: string }[];
};
