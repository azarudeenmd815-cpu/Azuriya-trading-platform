-- Allow each partial fill to produce an immutable history event. Migration 040
-- used a broad event-type key that retained only the first partial-fill event.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  WHERE c.conrelid = 'brokerage_order_history'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (organization_id, brand_id, environment_id, product_instance_id, order_id, event_type)%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE brokerage_order_history DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX brokerage_order_history_singleton_event
  ON brokerage_order_history(organization_id,brand_id,environment_id,product_instance_id,order_id,event_type)
  WHERE event_type IN ('created','cancelled','filled','rejected','expired');
