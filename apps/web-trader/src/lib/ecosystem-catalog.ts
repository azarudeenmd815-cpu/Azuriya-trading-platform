import rawCatalog from "./ecosystem-catalog.json";

export const ecosystemCategories = [
  {
    id: "trading-platforms",
    name: "Trading platforms",
    description: "Terminals, charting and execution environments",
  },
  {
    id: "copy-trading",
    name: "Copy traders",
    description: "Account copying and trade distribution tools",
  },
  {
    id: "trading-journals",
    name: "Trading journals",
    description: "Trade review, journaling and performance analysis",
  },
  {
    id: "bridges-liquidity",
    name: "Bridges & liquidity",
    description: "Routing, aggregation and connectivity technology",
  },
  {
    id: "risk-security",
    name: "Risk & security",
    description: "Trading risk, identity and security tooling",
  },
  {
    id: "broker-prop-crm",
    name: "Brokerage & prop technology",
    description: "Specialist CRM and trading-business infrastructure",
  },
  {
    id: "automation",
    name: "Automation tools",
    description: "Workflow orchestration and app connectivity",
  },
  {
    id: "payments-finance",
    name: "Payments & finance",
    description: "Payments, accounting and financial operations",
  },
  {
    id: "sales-crm",
    name: "Sales & CRM",
    description: "Client relationships and customer operations",
  },
  {
    id: "data-analytics",
    name: "Data & analytics",
    description: "Databases, reporting and business intelligence",
  },
  {
    id: "ai-tools",
    name: "AI platforms",
    description: "Models, AI services and business tooling",
  },
  {
    id: "developer-tools",
    name: "Developer tools",
    description: "APIs, cloud services and developer workflows",
  },
  {
    id: "communication",
    name: "Communication",
    description: "Messaging, email and team collaboration",
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Campaigns, content and audience tools",
  },
  {
    id: "operations",
    name: "Business operations",
    description: "Productivity, support and operational systems",
  },
] as const;

export type EcosystemCategoryId = (typeof ecosystemCategories)[number]["id"];
export type EcosystemItem = {
  id: string;
  name: string;
  category: EcosystemCategoryId;
  href: string;
  source: string;
  sourceType: string;
  logo?: string;
  logoSurface?: string;
  tags: string[];
  status: string;
};

export const ecosystemCatalog = rawCatalog as readonly EcosystemItem[];
export const ecosystemCount = ecosystemCatalog.length;
export const ecosystemCategoryCounts = Object.fromEntries(
  ecosystemCategories.map(({ id }) => [
    id,
    ecosystemCatalog.filter((item) => item.category === id).length,
  ]),
) as Record<EcosystemCategoryId, number>;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function filterEcosystem(
  query = "",
  category: EcosystemCategoryId | "all" = "all",
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return ecosystemCatalog.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    const text = normalize(
      [
        item.name,
        ...item.tags,
        ecosystemCategories.find((group) => group.id === item.category)?.name,
      ].join(" "),
    );
    return words.every((word) => text.includes(word));
  });
}

export function ecosystemItems(ids: readonly string[]) {
  return ids.flatMap((id) => {
    const item = ecosystemCatalog.find((entry) => entry.id === id);
    return item ? [item] : [];
  });
}
