-- W04 Cycle 3: keep immutable fills consistent with the canonical order row.
-- The order-domain service updates and locks the parent before inserting each
-- fill.  This trigger protects direct SQL writers and serializes those writes
-- with execution/cancellation through the same parent-row lock.
CREATE FUNCTION enforce_native_fill_insertion_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  order_row brokerage_orders%ROWTYPE;
  existing_quantity numeric;
BEGIN
  SELECT *
    INTO order_row
    FROM brokerage_orders
   WHERE organization_id = NEW.organization_id
     AND brand_id = NEW.brand_id
     AND environment_id = NEW.environment_id
     AND product_instance_id = NEW.product_instance_id
     AND id = NEW.order_id
     AND account_id = NEW.account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Native order fill parent does not exist in scope'
      USING ERRCODE = '23514';
  END IF;

  IF order_row.status IN ('pending', 'rejected', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Native order state cannot accept a fill'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
    INTO existing_quantity
    FROM brokerage_order_fills
   WHERE organization_id = NEW.organization_id
     AND brand_id = NEW.brand_id
     AND environment_id = NEW.environment_id
     AND product_instance_id = NEW.product_instance_id
     AND order_id = NEW.order_id
     AND account_id = NEW.account_id;

  IF existing_quantity + NEW.quantity > order_row.quantity THEN
    RAISE EXCEPTION 'Native order fills exceed order quantity'
      USING ERRCODE = '23514';
  END IF;

  IF existing_quantity + NEW.quantity <> order_row.filled_quantity THEN
    RAISE EXCEPTION 'Native fill does not match committed order aggregate'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER brokerage_order_fill_insertion_guard
  BEFORE INSERT ON brokerage_order_fills
  FOR EACH ROW
  EXECUTE FUNCTION enforce_native_fill_insertion_guard();
