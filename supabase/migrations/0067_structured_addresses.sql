-- Project installation address and profile company address move from a
-- single free-text field to a structured address (CEP, endereço, número,
-- complemento, bairro, cidade, UF) filled via ViaCEP in the app — see
-- lib/address.ts. Existing plain-text values are preserved as the "street"
-- field of the new shape instead of being dropped; lib/address.ts's
-- addressFromJson also tolerates a lingering plain string at read time, so
-- this migration and the app code degrade gracefully either way.

alter table projects alter column address type jsonb using (
  case
    when address is null or address = '' then null
    else jsonb_build_object('street', address)
  end
);

-- company_address was `not null default ''` as a text column; the structured
-- shape has no meaningful "empty" default of its own, so it becomes nullable
-- instead (same as projects.address always was).
alter table profiles alter column company_address drop not null;
alter table profiles alter column company_address drop default;
alter table profiles alter column company_address type jsonb using (
  case
    when company_address is null or company_address = '' then null
    else jsonb_build_object('street', company_address)
  end
);
