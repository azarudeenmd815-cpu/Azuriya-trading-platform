# Azuriya ecosystem and launch presentation

Completed frontend implementation and verification on 8 October 2026.

## Delivered

- New `/integrations` directory with 738 distinct platforms and tools in 15 categories. Search, category selection, result counts, empty state, category expansion, and deep category links work. The catalog uses 734 local logo assets and consistent text marks for four remaining entries.
- Homepage ecosystem category preview and automation section covering Zapier, Make, n8n, Pipedream, Activepieces, Microsoft Power Automate, Workato, Tray.ai, UiPath, IFTTT, Integrately and Bardeen.
- Code-native Core architecture and build-versus-Azuriya graphics, with curved routes and responsive compositions.
- The globe renderer underlying the user-supplied Framer GlobeMorph in the bottom CTA. It loads only in view, pauses outside the viewport or when requested, and has a local reduced-motion/unavailable fallback.
- Smooth vector Azuriya footer mark retaining the existing framed A silhouette.
- Homepage pricing cards and a dedicated `/pricing` page: $0 fixed monthly subscription plus a prominently stated 35% share of eligible revenue. Written offer terms describe scope, external charges, eligibility, reporting and settlement.
- Operator-supplied allocation: 97 of 100 launch slots, leaving 3. The display is a capacity counter; no expiry date or automatic artificial decrement was added.
- Reference pricing tally: €1,490 + €2,000 = €3,490/month for Leverate Start-up, and €2,990 + €3,490 = €6,480/month for Professional. The 12-month references are €41,880 and €77,760. Figures are published-price references checked 7 October 2026, excluding promotions, taxes and extras. Package scopes differ.
- Navigation, footer, site registry, metadata and static-route handling include the new pages.
- Explicit language choices now take precedence over late country suggestions; obsolete locale requests are cancelled when the preferences component unmounts.

## Verification

- Web trader: 107 unit tests passed across 16 files.
- 12 selected browser journeys passed across targeted runs. The three new ecosystem/pricing/responsive checks and both visitor preference checks passed against the compiled production server.
- Both web-trader and broker-admin production builds passed. Web trader was rebuilt after the final language race fix.
- Responsive production checks covered 320, 390, 768, 1024 and 1512 pixels in light and dark themes.
- Live vendor globe readiness and pause/resume passed. Reduced motion uses the local graphic and does not mount the external iframe.
- Header and card containment passed at all five widths, with no production page errors.
- All files touched in this feature pass passed Prettier.
- Independent read-only React component review reported no actionable findings.

## Data scope and sources

Catalog listings have the status **Integration on request**. The count describes distinct products in the ecosystem, not confirmed native Azuriya connections. Provider APIs, permissions and the agreed technical scope determine availability.

- n8n catalog: https://n8n.io/integrations/
- TradeLocker specialist categories: https://tradelocker.com/partners/
- Leverate reference: https://leverate.com/prop-firm/
- Supplied Framer asset: https://framer.com/m/GlobeMorph-EQi6Q2.js@rpqp20ugovX8JEbvoUoT
- Globe renderer: https://tkartik.com/globe-to-flat-map/van-der-grinten-map.html

Per-entry sources and asset provenance are recorded in `apps/web-trader/src/lib/ecosystem-catalog.json` and `apps/web-trader/public/marketing/ecosystem/sources.json`. Third-party notices identify the external globe renderer, Natural Earth fallback data and brand assets.

## Review artifacts

Production screenshots: `.local/ui-audit/expanded-final/`.
Production globe/header/card measurements: `.local/ui-audit/expanded-final/production-smoke.json`.
Local preview: http://127.0.0.1:3000/
Directory: http://127.0.0.1:3000/integrations
Pricing: http://127.0.0.1:3000/pricing
