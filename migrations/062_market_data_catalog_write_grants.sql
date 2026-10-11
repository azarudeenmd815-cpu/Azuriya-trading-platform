-- Core catalog and entitlement administration runs through the restricted
-- application role with azuriya.core=true; tenant contexts remain read-only.
GRANT INSERT,UPDATE,DELETE ON market_data_instruments,market_data_sources,market_data_instrument_access TO azuriya_app;
