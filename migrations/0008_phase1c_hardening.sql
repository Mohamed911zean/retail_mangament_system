CREATE TRIGGER IF NOT EXISTS trg_sales_void_is_final
BEFORE UPDATE ON sales
WHEN OLD.status = 'voided' AND NEW.status <> 'voided'
BEGIN
  SELECT RAISE(ABORT, 'void_is_final');
END;
CREATE TRIGGER IF NOT EXISTS trg_sales_void_requires_metadata
BEFORE UPDATE ON sales
WHEN NEW.status = 'voided'
 AND (NEW.voided_at IS NULL OR NEW.voided_by_user_id IS NULL OR NEW.void_reason IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'void_requires_metadata');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchases_void_is_final
BEFORE UPDATE ON purchases
WHEN OLD.status = 'voided' AND NEW.status <> 'voided'
BEGIN
  SELECT RAISE(ABORT, 'void_is_final');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchases_void_requires_metadata
BEFORE UPDATE ON purchases
WHEN NEW.status = 'voided'
 AND (NEW.voided_at IS NULL OR NEW.voided_by_user_id IS NULL OR NEW.void_reason IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'void_requires_metadata');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_returns_void_is_final
BEFORE UPDATE ON sale_returns
WHEN OLD.status = 'voided' AND NEW.status <> 'voided'
BEGIN
  SELECT RAISE(ABORT, 'void_is_final');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_returns_void_requires_metadata
BEFORE UPDATE ON sale_returns
WHEN NEW.status = 'voided'
 AND (NEW.voided_at IS NULL OR NEW.voided_by_user_id IS NULL OR NEW.void_reason IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'void_requires_metadata');
END;
CREATE TRIGGER IF NOT EXISTS trg_expenses_void_is_final
BEFORE UPDATE ON expenses
WHEN OLD.status = 'voided' AND NEW.status <> 'voided'
BEGIN
  SELECT RAISE(ABORT, 'void_is_final');
END;
CREATE TRIGGER IF NOT EXISTS trg_expenses_void_requires_metadata
BEFORE UPDATE ON expenses
WHEN NEW.status = 'voided'
 AND (NEW.voided_at IS NULL OR NEW.voided_by_user_id IS NULL OR NEW.void_reason IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'void_requires_metadata');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_guarded_update
BEFORE UPDATE ON expenses
WHEN OLD.id <> NEW.id
  OR OLD.category <> NEW.category
  OR OLD.description <> NEW.description
  OR OLD.amount_piasters <> NEW.amount_piasters
  OR OLD.payment_method <> NEW.payment_method
  OR OLD.expense_at <> NEW.expense_at
  OR OLD.user_id <> NEW.user_id
  OR OLD.shift_id IS NOT NEW.shift_id
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_expenses_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_expenses_no_delete
BEFORE DELETE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'immutable_expenses_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_counts_no_delete
BEFORE DELETE ON stock_counts
BEGIN
  SELECT RAISE(ABORT, 'immutable_stock_counts_delete');
END;
CREATE TRIGGER IF NOT EXISTS trg_stock_counts_guarded_update
BEFORE UPDATE ON stock_counts
WHEN OLD.status IN ('posted','voided') AND (
    NEW.status <> OLD.status
    OR OLD.id <> NEW.id
    OR OLD.started_at <> NEW.started_at
    OR OLD.posted_at IS NOT NEW.posted_at
    OR OLD.user_id <> NEW.user_id
    OR OLD.notes IS NOT NEW.notes
    OR OLD.created_at <> NEW.created_at
    OR OLD.device_id <> NEW.device_id
  )
BEGIN
  SELECT RAISE(ABORT, 'guarded_stock_counts_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_stock_count_items_posted_immutable
BEFORE UPDATE ON stock_count_items
WHEN EXISTS (
  SELECT 1 FROM stock_counts
  WHERE stock_counts.id = OLD.stock_count_id
    AND stock_counts.status IN ('posted','voided')
)
BEGIN
  SELECT RAISE(ABORT, 'immutable_posted_stock_count_item');
END;
CREATE TRIGGER IF NOT EXISTS trg_stock_count_items_no_delete
BEFORE DELETE ON stock_count_items
WHEN EXISTS (
  SELECT 1 FROM stock_counts
  WHERE stock_counts.id = OLD.stock_count_id
    AND stock_counts.status IN ('posted','voided')
)
BEGIN
  SELECT RAISE(ABORT, 'immutable_posted_stock_count_item');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_payment_status_insert
BEFORE INSERT ON sales
WHEN (NEW.payment_status = 'paid' AND NEW.due_piasters <> 0)
  OR (NEW.payment_status = 'credit' AND NEW.paid_piasters <> 0)
  OR (NEW.payment_status = 'partial' AND (NEW.paid_piasters <= 0 OR NEW.due_piasters <= 0))
BEGIN
  SELECT RAISE(ABORT, 'payment_status_mismatch');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchases_payment_status_insert
BEFORE INSERT ON purchases
WHEN (NEW.payment_status = 'paid' AND NEW.due_piasters <> 0)
  OR (NEW.payment_status = 'credit' AND NEW.paid_piasters <> 0)
  OR (NEW.payment_status = 'partial' AND (NEW.paid_piasters <= 0 OR NEW.due_piasters <= 0))
BEGIN
  SELECT RAISE(ABORT, 'payment_status_mismatch');
END;

CREATE INDEX IF NOT EXISTS ix_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS ix_money_ledger_sale_id ON money_ledger(sale_id);
CREATE INDEX IF NOT EXISTS ix_money_ledger_occurred_at ON money_ledger(occurred_at);
CREATE INDEX IF NOT EXISTS ix_shifts_user_id ON shifts(user_id);
CREATE INDEX IF NOT EXISTS ix_held_sales_shift_id ON held_sales(shift_id);
CREATE INDEX IF NOT EXISTS ix_held_sales_customer_id ON held_sales(customer_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_occurred_at ON stock_movements(occurred_at);
