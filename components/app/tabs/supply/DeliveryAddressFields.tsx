'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { DeliveryForm } from './types';

type ViaCepResponse = { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };

/** The 8-field delivery address form + CEP autofill, shared by the cart
 * checkout (collected upfront, optional — see `nonEmptyDeliveryFields`) and
 * the "Enviar ao fornecedor" review step (required there, since the partner
 * API needs a full address to ship). Kept as one component so the CEP-lookup
 * logic exists in exactly one place. */
export function DeliveryAddressFields({
  form,
  onChange,
}: {
  form: DeliveryForm;
  onChange: (field: keyof DeliveryForm, value: string) => void;
}) {
  const [cepLookupState, setCepLookupState] = useState<'idle' | 'loading' | 'not-found'>('idle');

  async function lookupCep(postalCode: string) {
    const digits = postalCode.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLookupState('loading');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await response.json()) as ViaCepResponse;
      if (data.erro) {
        setCepLookupState('not-found');
        return;
      }
      onChange('address', data.logradouro ?? '');
      onChange('district', data.bairro ?? '');
      onChange('city', data.localidade ?? '');
      onChange('state', data.uf ?? '');
      setCepLookupState('idle');
    } catch {
      setCepLookupState('idle');
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input
        placeholder="Destinatário (opcional)"
        value={form.name}
        onChange={(event) => onChange('name', event.target.value)}
      />
      <div>
        <Input
          placeholder="CEP"
          value={form.postal_code}
          onChange={(event) => {
            onChange('postal_code', event.target.value);
            setCepLookupState('idle');
          }}
          onBlur={(event) => void lookupCep(event.target.value)}
        />
        {cepLookupState === 'loading' && <p className="mt-1 text-xs text-muted-foreground">Buscando endereço...</p>}
        {cepLookupState === 'not-found' && (
          <p className="mt-1 text-xs text-destructive">CEP não encontrado. Preencha o endereço manualmente.</p>
        )}
      </div>
      <Input placeholder="Endereço" value={form.address} onChange={(event) => onChange('address', event.target.value)} />
      <Input placeholder="Número" value={form.number} onChange={(event) => onChange('number', event.target.value)} />
      <Input
        placeholder="Complemento (opcional)"
        value={form.complement}
        onChange={(event) => onChange('complement', event.target.value)}
      />
      <Input
        placeholder="Bairro (opcional)"
        value={form.district}
        onChange={(event) => onChange('district', event.target.value)}
      />
      <Input placeholder="Cidade" value={form.city} onChange={(event) => onChange('city', event.target.value)} />
      <Input
        placeholder="UF"
        maxLength={2}
        value={form.state}
        onChange={(event) => onChange('state', event.target.value.toUpperCase())}
      />
    </div>
  );
}
