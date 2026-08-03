-- Lets a supplier be notified by email about a purchase order/quote request
-- (see app/api/purchase-orders/[orderId]/notify-supplier-email) — suppliers
-- without a partner-order API integration still need a contact channel.
alter table public.suppliers add column if not exists email text;
