-- CNPJ/CPF da empresa do vendedor, usado nas solicitações de orçamento por
-- email para fornecedores (emissão de NF / cotação de frete). Opcional.
alter table public.profiles add column if not exists company_document text;
