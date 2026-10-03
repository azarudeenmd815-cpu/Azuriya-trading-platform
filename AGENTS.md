# Engineering rules

- Preserve domain package boundaries; native core has no third-party trading-platform dependencies.
- Use exact decimal arithmetic and JSON decimal strings for all financial values; floats are allowed only for chart rendering.
- Never bypass order validation, risk checks, or authenticated tenant/account ownership.
- Ledger and audit records are append-only. Persist trading transitions atomically before publishing events.
- Clients use versioned APIs/events; no database access or authoritative trading math in React.
- Keep dependencies minimal, errors explicit, and simulated execution clearly labelled.
- Run formatting, relevant deterministic tests, and builds before finishing.
