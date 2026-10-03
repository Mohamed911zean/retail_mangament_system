CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'immutable_stock_movement_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'immutable_stock_movement_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_money_ledger_no_update
BEFORE UPDATE ON money_ledger
BEGIN
  SELECT RAISE(ABORT, 'immutable_money_ledger_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_money_ledger_no_delete
BEFORE DELETE ON money_ledger
BEGIN
  SELECT RAISE(ABORT, 'immutable_money_ledger_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'immutable_audit_log_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'immutable_audit_log_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_no_update
BEFORE UPDATE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_item_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_items_no_delete
BEFORE DELETE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_item_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_items_no_update
BEFORE UPDATE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_purchase_item_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchase_items_no_delete
BEFORE DELETE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_purchase_item_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_return_items_no_update
BEFORE UPDATE ON sale_return_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_return_item_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_return_items_no_delete
BEFORE DELETE ON sale_return_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_return_item_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_guarded_update
BEFORE UPDATE ON sales
WHEN OLD.id <> NEW.id
  OR OLD.invoice_number <> NEW.invoice_number
  OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.user_id <> NEW.user_id
  OR OLD.shift_id IS NOT NEW.shift_id
  OR OLD.subtotal_piasters <> NEW.subtotal_piasters
  OR OLD.line_discount_piasters <> NEW.line_discount_piasters
  OR OLD.invoice_discount_piasters <> NEW.invoice_discount_piasters
  OR OLD.tax_piasters <> NEW.tax_piasters
  OR OLD.rounding_adjustment_piasters <> NEW.rounding_adjustment_piasters
  OR OLD.total_piasters <> NEW.total_piasters
  OR OLD.paid_piasters <> NEW.paid_piasters
  OR OLD.due_piasters <> NEW.due_piasters
  OR OLD.payment_status <> NEW.payment_status
  OR OLD.notes IS NOT NEW.notes
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_sales_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sales_no_delete
BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(ABORT, 'immutable_sales_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchases_guarded_update
BEFORE UPDATE ON purchases
WHEN OLD.id <> NEW.id
  OR OLD.purchase_number <> NEW.purchase_number
  OR OLD.supplier_id IS NOT NEW.supplier_id
  OR OLD.user_id <> NEW.user_id
  OR OLD.total_piasters <> NEW.total_piasters
  OR OLD.paid_piasters <> NEW.paid_piasters
  OR OLD.due_piasters <> NEW.due_piasters
  OR OLD.payment_status <> NEW.payment_status
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_purchases_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchases_no_delete
BEFORE DELETE ON purchases
BEGIN
  SELECT RAISE(ABORT, 'immutable_purchases_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_returns_guarded_update
BEFORE UPDATE ON sale_returns
WHEN OLD.id <> NEW.id
  OR OLD.return_number <> NEW.return_number
  OR OLD.original_sale_id <> NEW.original_sale_id
  OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.user_id <> NEW.user_id
  OR OLD.shift_id IS NOT NEW.shift_id
  OR OLD.total_piasters <> NEW.total_piasters
  OR OLD.cash_refunded_piasters <> NEW.cash_refunded_piasters
  OR OLD.credited_to_account_piasters <> NEW.credited_to_account_piasters
  OR OLD.reason IS NOT NEW.reason
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_sale_returns_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_returns_no_delete
BEFORE DELETE ON sale_returns
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_returns_delete');
END;
