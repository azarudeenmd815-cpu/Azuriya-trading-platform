-- W04 Cycle 2: preserve monotonic execution progress and keep order status
-- consistent with the quantity filled.  The constraint is intentionally added
-- NOT VALID so an upgrade cannot fail on legacy rows written before this
-- invariant existed. PostgreSQL still enforces a NOT VALID CHECK for every new
-- row and every subsequent update; operators can validate it after reconciling
-- any historical rows that do not satisfy the invariant.
ALTER TABLE brokerage_orders
  ADD CONSTRAINT brokerage_order_status_quantity_consistency CHECK (
    (status IN ('pending', 'rejected', 'expired', 'cancelled') AND filled_quantity = 0)
    OR (status = 'partially_filled' AND filled_quantity > 0 AND filled_quantity < quantity)
    OR (status = 'filled' AND filled_quantity = quantity)
  ) NOT VALID;

CREATE FUNCTION enforce_native_order_fill_monotonicity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.filled_quantity < OLD.filled_quantity THEN
    RAISE EXCEPTION 'Native order filled quantity cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER brokerage_order_fill_quantity_monotonic
  BEFORE UPDATE OF filled_quantity ON brokerage_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_native_order_fill_monotonicity();
