-- Raises the per-user cap on "Meu Portfólio" (user_stock_items) from 14 to 20.
-- Must match ACCOUNT_LIMITS.userStockItems in lib/limits.ts.

drop trigger if exists user_stock_items_limit_check on user_stock_items;
create trigger user_stock_items_limit_check
  before insert on user_stock_items
  for each row execute function enforce_user_row_limit(20);
