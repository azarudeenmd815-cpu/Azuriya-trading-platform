# Azuriya Core UI implementation

The 3 October UI brief is applied to the existing Core, Business Admin, Client Portal and sign-in surfaces. The source remains this repository; no trading or marketing application was created.

Dark tokens: canvas #000000, panels #141414, raised surfaces #242424, sidebar #0B0B0B, borders #333333, primary text #F5F5F5, supporting text #B8B8B8, links #9AAFFF. White tokens: canvas #FFFFFF, panels/sidebar #F7F8FB, raised surfaces #EEF0F5, borders #DFE2E9, primary text #172235, supporting text #56657A. Solid primary blue #3869FC and hover #2E5DF0 are shared. Healthy/error/warning colors follow the supplied palette. Tenant primary colors retain their authorized brand override and use a contrast-aware foreground.

The actual Euclid Square Regular, Medium and Bold files are copied unchanged from the user's adjacent project. Weight faces 400/500/700 load locally; Gotham numeral overrides are absent. Tables use tabular numerals. Dashboard headings are 32 px/700, small mobile headings 24 px. Panels use 20 px corners and 1 px borders; selected navigation has 14 px corners; primary controls are pills and toolbar controls have 44 px targets. No gradients or glass treatment were introduced.

Theme initialization runs before React using `data-marketing-theme` and the saved `azuriya.marketing-theme` preference. Storage failures leave switching functional. Theme changes preserve route/form state and update tenant dark/light logo selection. The exact supplied Azuriya PNG is confined to platform/Core identity; customer logos and neutral fallbacks remain available.

Operational pages retain their relevant API-backed tables and forms: account MFA/recovery and tenant policy, invitations, domains/DNS/certificate states, applications/service accounts, API keys, signed webhooks/delivery attempt history/replay, scoped support access, branding, memberships, audit, platform queues/health/metrics. One-time secrets and recovery codes appear in transient dialogs. Client pages emphasize own identity/workspace/security; operational finance remains unavailable.

Responsive grids use minmax(0,1fr); overview panels stack below 900 px, small controls/form rows wrap, and metrics become one column below 480 px. Wide tables have labelled keyboard-accessible scroll containers. Focus outlines, named icon buttons, dialog semantics, mobile focus handling and reduced-motion styles remain in place.

See `activation-verification.md` for exact tested widths, screenshots and the outstanding mobile-interaction/200%-zoom manual checks.
