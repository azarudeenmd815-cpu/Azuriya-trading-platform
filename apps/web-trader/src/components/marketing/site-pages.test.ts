import { describe, expect, it } from "vitest";
import { getSitePage, sitePages } from "./site-pages";
import type { SitePage } from "./site-types";

const expectedPaths = [
  "/platform",
  "/brokerage",
  "/prop-firm",
  "/copy-trading",
  "/community",
  "/admin-portal",
  "/liquidity",
  "/trading-platforms",
  "/integrations",
  "/funding",
  "/risk-management",
  "/pricing",
  "/solutions",
  "/solutions/influencers",
  "/solutions/brokers",
  "/solutions/prop-firms",
  "/solutions/educators",
  "/about",
  "/contact",
  "/partners",
  "/resources",
  "/resources/getting-started",
  "/resources/a-book-execution",
  "/resources/mt5-funding",
  "/help",
  "/status",
  "/legal",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/risk-disclosure",
  "/legal/execution",
  "/legal/aml-kyc",
  "/legal/complaints",
  "/legal/platform-disclaimer",
  "/sitemap",
  "/insights",
  "/insights/influencer-brokerage-launch-checklist",
  "/insights/brokerage-crm-account-operations",
  "/insights/commission-markups-per-lot",
  "/insights/trading-community-team-permissions",
  "/insights/cross-platform-copy-trading-risk-controls",
  "/insights/a-book-liquidity-provider-checklist",
  "/insights/prop-firm-challenge-risk-rules",
  "/insights/mt5-deposit-reconciliation",
  "/insights/mt5-manager-account-groups",
  "/insights/brokerage-deposit-withdrawal-controls",
  "/insights/trading-platform-integration-checklist",
  "/insights/trading-operations-incident-response",
  "/insights/prop-firm-payout-review",
  "/insights/prop-firm-evaluation-lifecycle",
  "/insights/trading-community-support-workflows",
  "/insights/trading-community-onboarding",
];

function pageText(page: SitePage): string {
  return [
    page.title,
    page.description,
    ...page.highlights.flatMap(({ title, text }) => [title, text]),
    ...page.sections.flatMap(({ title, paragraphs, bullets }) => [
      title,
      ...paragraphs,
      ...(bullets ?? []),
    ]),
    ...(page.faqs ?? []).flatMap(({ question, answer }) => [question, answer]),
  ].join(" ");
}

describe("visitor site registry", () => {
  it("registers the full product, solution, resource and legal page collection exactly once", () => {
    const paths = sitePages.map(({ path }) => path);

    expect(paths).toHaveLength(expectedPaths.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths].sort()).toEqual([...expectedPaths].sort());
  });

  it("finds registered pages and leaves unknown routes available for a 404", () => {
    for (const page of sitePages) {
      expect(getSitePage(page.path), page.path).toBe(page);
    }

    expect(getSitePage("/this-page-does-not-exist")).toBeUndefined();
    expect(getSitePage("/legal/not-a-policy")).toBeUndefined();
  });

  it("provides readable page metadata and unique section anchors for navigation", () => {
    for (const page of sitePages) {
      expect(page.path, page.path).toMatch(
        /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
      );
      expect(page.title.trim(), page.path).not.toBe("");
      expect(page.navLabel.trim(), page.path).not.toBe("");
      expect(page.eyebrow.trim(), page.path).not.toBe("");
      expect(page.description.trim(), page.path).not.toBe("");
      expect(page.highlights, page.path).toHaveLength(3);

      for (const highlight of page.highlights) {
        expect(highlight.title.trim(), page.path).not.toBe("");
        expect(highlight.text.trim(), page.path).not.toBe("");
      }

      const ids = page.sections.map(({ id }) => id);
      expect(ids.length, page.path).toBeGreaterThan(0);
      expect(new Set(ids).size, page.path).toBe(ids.length);

      for (const section of page.sections) {
        expect(section.id, `${page.path}#${section.id}`).toMatch(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        );
        expect(section.title.trim(), page.path).not.toBe("");
        expect(
          section.paragraphs.length,
          `${page.path}#${section.id}`,
        ).toBeGreaterThan(0);
        expect(
          section.paragraphs.every((text) => text.trim().length > 0),
          page.path,
        ).toBe(true);
      }
    }
  });

  it("resolves every internal section link, related page and action to a real route", () => {
    const allowed = new Set([
      "/",
      "/mt5-deposits",
      "/terminal",
      ...sitePages.map(({ path }) => path),
    ]);

    for (const page of sitePages) {
      const links = [
        ...page.sections.flatMap(
          ({ links }) => links?.map(({ href }) => href) ?? [],
        ),
        ...page.related,
        ...(page.cta ? [page.cta.href] : []),
      ];

      for (const href of links) {
        if (!href.startsWith("/")) continue;
        const pathname = href.split(/[?#]/)[0] || "/";
        expect(allowed.has(pathname), `${page.path} links to ${href}`).toBe(
          true,
        );
      }
    }
  });

  it("keeps legal pages substantive and clearly identified as draft frameworks", () => {
    const policies = sitePages.filter(({ kind }) => kind === "legal");
    expect(policies).toHaveLength(9);

    for (const policy of policies) {
      const copy = pageText(policy);
      expect(policy.sections.length, policy.path).toBeGreaterThanOrEqual(4);
      expect(copy.length, policy.path).toBeGreaterThan(1200);
      expect(copy, policy.path).toMatch(/\bdraft\b/i);
      expect(copy, policy.path).toMatch(/\breview\b/i);
    }

    const legalCentre = getSitePage("/legal");
    expect(legalCentre).toBeDefined();
    const status = legalCentre?.sections.find(
      ({ id }) => id === "document-status",
    );
    expect(status?.paragraphs.join(" ")).toContain("no stated effective date");
    expect(status?.paragraphs.join(" ")).toContain(
      "not been approved as live customer agreements",
    );
  });

  it("preserves the exact illustrative commission split and separates it from guaranteed earnings", () => {
    const pricing = getSitePage("/pricing");
    expect(pricing).toBeDefined();
    const commission = pricing?.sections.find(
      ({ id }) => id === "pricing-markup-example",
    );

    expect(commission?.title).toBe(
      "$2.00 base + up to $5.00 extra = $7.00 total.",
    );
    expect(commission?.paragraphs.join(" ")).toContain(
      "$7.00 per lot: $2.00 base plus $5.00 additional markup",
    );
    expect(commission?.paragraphs.join(" ")).toContain(
      "not a quoted provider rate, a guaranteed margin or an earnings forecast",
    );
  });

  it("describes status and contact as preview interfaces rather than live external services", () => {
    const status = getSitePage("/status");
    const contact = getSitePage("/contact");
    expect(status).toBeDefined();
    expect(contact).toBeDefined();

    expect(pageText(status!)).toContain("not connected");
    expect(pageText(status!)).toContain("publishes no uptime percentage");
    expect(pageText(contact!)).toContain(
      "does not send or submit it externally",
    );
    expect(pageText(contact!)).toContain(
      "does not send a message, open a support ticket or promise a response time",
    );
  });
});
