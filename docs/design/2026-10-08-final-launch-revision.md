# Final Azuriya launch revision — 8 October 2026

## Delivered presentation

The landing page opens with the hero, detailed pricing, commission model, brokerage/prop product choices, and the build comparison. Brand ownership and the dashboard follow. The duplicate “Everything you need to launch” block and the separate “Tally the platform and CRM subscription” block are absent.

The supplied 3944 × 2564 MacBook PNG is unchanged. Its camera and bezel render above the interactive dashboard iframe. The embedded sidebar carries the curved Azuriya mark and BACK OFFICE. The logical dashboard viewport remains 1200 × 775, with desktop navigation and internal scrolling preserved as the laptop scales.

The build comparison groups trading, operations, and delivery into readable paired values. The brokerage and prop choices each include a workflow graphic and capability groups.

## Commercial presentation

Every pricing card shows $0 per month and 35% revenue share. Each contains 32 feature/value rows grouped into trading platform, CRM/client portal, and scope/support. The allocation is the user-supplied 97 of 100, with 3 remaining. It is a capacity figure; no invented closing date or timed countdown was added.

Published Leverate reference prices, verified on 8 October 2026 at https://leverate.com/prop-firm/:

- Start-up: €1,490 trading platform + €2,000 CRM = €3,490/month.
- Professional: €2,990 trading platform + €3,490 CRM = €6,480/month.
- Premium: custom quote; no invented numerical total.

These figures appear within the relevant cards and are identified as comparison prices, not previous Azuriya charges. Capacity, providers, and service scope are agreed; competitor quotas are not imported as Azuriya promises. Terms explain eligible revenue and separate third-party costs. Integer-cents arithmetic remains intact.

The existing 738-entry, 15-category ecosystem directory, local logo assets, automation section, globe CTA, curved footer mark, language dropdown, cookie panel, and reduced-motion support are preserved. Catalog entries retain “Integration on request.”

## Verification evidence

- Full deterministic suite: 107 web tests plus 4 broker-admin tests, all passing.
- Both application production builds passed. The final ordering also passed a fresh web production build and Vercel build.
- 14 targeted browser checks passed across the production run and focused retests: launch journeys, navigation, pricing/reference totals, directory, responsive bounds, calculator, carousel, reduced motion, MacBook geometry/layering/scrolling, language and cookies.
- All 28 landing sections were audited at 320, 390, 768, 1280, and 1512px, in both themes. No page overflow, broken images, console errors, or page errors were found. Offscreen marquee items are intentionally clipped.
- Staged production checks covered desktop, tablet, and mobile in both themes, plus pricing, integrations, MT5 deposits, brokerage, prop firm, and offer terms. The final section-order correction passed another four theme/viewport checks and the launch journey.
- Live globe animation and pause/resume passed on the production Vercel URL without page errors.
- Prettier passes for revised marketing source and browser specs. A broader workspace formatting command reports existing warnings in unrelated broker-admin, chart, and schema files; those files were left outside this UI revision.
- Vercel upload dry run: 988 files, approximately 17.2MB, with no environment files, local audit output, dependency/build directories, or scratch screenshots/Python scripts included. The native frame and ecosystem source/logo assets are included.

Artifacts: `.local/ui-audit/latest-launch-final/`, `pricing-correction/`, `production-release/`, `staged-production-release/`, `final-staged-release/`, `main-production-release/`, and browser results under `final-retest/`, `staged-production-tests/`, and `final-staged-tests/`.

## Release

Project: `azars-projects-01530c83/azuriya-trading-platform`, root directory `apps/web-trader`.

Final deployment: `https://azuriya-trading-platform-qvqobtr32-azars-projects-01530c83.vercel.app`.

Main domains: `https://azuriya-trading-platform.vercel.app` and `https://launch-offer.azuriyatech.com`.

The release was staged using the production environment, verified, then promoted. No Git commit, pull request, backend change, live billing change, or trade/funding execution was introduced by this revision.
