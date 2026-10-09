-- Null organization is reserved for platform-wide events, never orphaned tenant scopes.
ALTER TABLE audit_events ADD CONSTRAINT audit_scope_requires_organization CHECK (
  organization_id IS NOT NULL OR (brand_id IS NULL AND environment_id IS NULL AND product_instance_id IS NULL)
);
