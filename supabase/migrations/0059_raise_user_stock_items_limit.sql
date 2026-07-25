-- Raises the per-user cap on "Meu Catálogo" (user_stock_items) from 10 to 14.
-- Must match ACCOUNT_LIMITS.userStockItems in lib/limits.ts.

drop trigger if exists user_stock_items_limit_check on user_stock_items;
create trigger user_stock_items_limit_check
  before insert on user_stock_items
  for each row execute function enforce_user_row_limit(14);
