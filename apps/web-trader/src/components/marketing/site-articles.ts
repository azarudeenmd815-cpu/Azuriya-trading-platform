import { businessArticles } from "./site-article-business-data";
import { infrastructureArticles } from "./site-article-infrastructure-data";
import { operationsArticles } from "./site-article-operations-data";
import { teamArticles } from "./site-article-team-data";
import type { SitePage } from "./site-types";

export const articlePages: SitePage[] = [
  ...businessArticles,
  ...infrastructureArticles,
  ...operationsArticles,
  ...teamArticles,
];

export const articleReadingPaths = [
  {
    title: "Launch a trading community",
    description:
      "Define the offer, guide new members and set clear team permissions.",
    paths: [
      "/insights/influencer-brokerage-launch-checklist",
      "/insights/trading-community-onboarding",
      "/insights/trading-community-team-permissions",
    ],
  },
  {
    title: "Run brokerage operations",
    description:
      "Connect account records, MT5 groups and controlled money movement.",
    paths: [
      "/insights/brokerage-crm-account-operations",
      "/insights/mt5-manager-account-groups",
      "/insights/brokerage-deposit-withdrawal-controls",
    ],
  },
  {
    title: "Operate a prop firm",
    description:
      "Follow an evaluation from setup through risk review and payout decisions.",
    paths: [
      "/insights/prop-firm-evaluation-lifecycle",
      "/insights/prop-firm-challenge-risk-rules",
      "/insights/prop-firm-payout-review",
    ],
  },
  {
    title: "Validate the infrastructure",
    description:
      "Assess platform connections, liquidity arrangements and incident readiness.",
    paths: [
      "/insights/trading-platform-integration-checklist",
      "/insights/a-book-liquidity-provider-checklist",
      "/insights/trading-operations-incident-response",
    ],
  },
];

export function getReadingMinutes(page: SitePage): number {
  const copy = [
    page.description,
    ...page.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ]),
    ...(page.faqs ?? []).flatMap((faq) => [faq.question, faq.answer]),
  ].join(" ");
  return Math.max(1, Math.ceil(copy.trim().split(/\s+/).length / 200));
}

export function formatArticleDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export const insightsPage: SitePage = {
  path: "/insights",
  title: "A clearer view of your trading business.",
  navLabel: "Insights & articles",
  seoTitle: "Brokerage, Prop Firm & Trading Community Articles | Azuriya",
  eyebrow: "THE AZURIYA JOURNAL",
  description:
    "Practical articles on influencer brokerage operations, prop firm risk rules, copy trading, MT5 deposits and the teams behind a trading community.",
  kind: "index",
  cta: {
    label: `Browse all ${articlePages.length} articles`,
    href: "#article-library",
  },
  highlights: [
    {
      title: "Plan the operation",
      text: "Turn your audience, account workflows and commercial model into a practical launch scope.",
    },
    {
      title: "Understand the infrastructure",
      text: "Ask better questions about providers, platform permissions, funding and execution.",
    },
    {
      title: "Build the right controls",
      text: "Connect program rules, account authority and team communication with clear ownership.",
    },
  ],
  sections: [
    {
      id: "our-editorial-approach",
      title: "Useful answers, with the detail to act on them.",
      paragraphs: [
        "These articles are written for people building or running trading communities. Each guide focuses on a specific operating question, with checklists, examples and links to the relevant Azuriya workspace.",
        "Azuriya editorial is the site’s publishing label. Guides separate product illustrations from production requirements and link to official documentation for platform-specific information. Publication dates show when an article was first added; revision dates are added when the content changes. The guides describe operational planning and do not recommend trades or promise commercial results.",
      ],
      links: [
        { label: "About Azuriya", href: "/about" },
        { label: "Prepare an inquiry or correction", href: "/contact" },
      ],
    },
  ],
  related: ["/solutions/influencers", "/resources", "/platform"],
};
