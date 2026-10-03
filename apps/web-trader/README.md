# Azuriya web trader

The Next.js terminal uses versioned REST and cookie-authenticated WebSocket events. Account values, margin previews, risk checks, execution, and P&L are server-authoritative. Financial values remain decimal strings; exact integer formatting is display-only. Only the chart adapter converts prices into numbers for rendering.

Run `pnpm install` at the repository root, then `pnpm dev`. `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8080`; configure it before building when hosting elsewhere. The backend's allowed browser origins must include the actual frontend origin. Use the same hostname for both services so session cookies work consistently.

`pnpm test` runs deterministic presentation/store/candle tests. `pnpm typecheck` and `pnpm build` validate the app. With the backend running, `pnpm exec playwright install chromium` inside this directory and `pnpm test:browser` at the root run the browser workflow. It registers isolated accounts using generated credentials, executes and partially/closes a position, adds/removes protection, cancels a limit order, verifies fills/audit, signs out/in, and checks mobile layout. Do not run the browser workflow against production.

Charts show observed bid ticks from the current browser session (up to 3,600 ticks per symbol), aggregated into 5-second, 1-minute, 5-minute, or 15-minute candles. They do not fabricate historical prices or persist browser history. The first candle begins on connection; leave the terminal open to collect more. The chart's crosshair exposes OHLC, and fit resets the visible range.

The WebSocket client uses the HttpOnly auth cookie, labels lost connectivity honestly, reconnects with capped backoff, and refetches canonical REST state after reconnect. Replayed quotes are ignored. There is no browser token storage. Actions use stable idempotency keys for retries of the same order/close request. SL/TP changes are explicit server requests; position close supports quantity.

TradingView Lightweight Charts is used under Apache 2.0. Attribution appears on the chart and in the chart footer; see `THIRD_PARTY_NOTICES.md` for the upstream notice.
