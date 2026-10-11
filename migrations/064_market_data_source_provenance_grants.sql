-- Runtime administration may disable/rename a source, but must never relabel
-- its existing simulated snapshots as verified provider prices. Source kind
-- and provenance are chosen at registration and immutable to azuriya_app.
REVOKE UPDATE ON market_data_sources FROM azuriya_app;
GRANT UPDATE (slug,active) ON market_data_sources TO azuriya_app;
