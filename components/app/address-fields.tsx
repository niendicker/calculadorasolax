'use client';

import { useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Address } from '@/lib/types';

type CepLookupState = 'idle' | 'loading' | 'not-found';

type ViaCepResponse = { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };

/** Looks up a CEP via ViaCEP and reports back the fields it can fill in
 *  (street/district/city/state) — the caller still owns the address state,
 *  this just resolves one field at a time like the rest of the form. */
function useCepLookup(onResolved: (fields: Pick<Address, 'street' | 'district' | 'city' | 'state'>) => void) {
  const [state, setState] = useState<CepLookupState>('idle');

  async function lookup(postalCode: string) {
    const digits = postalCode.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setState('loading');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await response.json()) as ViaCepResponse;
      if (data.erro) {
        setState('not-found');
        return;
      }
      onResolved({
        street: data.logradouro ?? '',
        district: data.bairro ?? '',
        city: data.localidade ?? '',
        state: data.uf ?? '',
      });
      setState('idle');
    } catch {
      setState('idle');
    }
  }

  function reset() {
    setState('idle');
  }

  return { state, lookup, reset };
}

/** Structured address form (CEP, endereço, número, complemento, bairro,
 *  cidade, UF) shared by the project's installation address and the
 *  company address on the profile — CEP auto-fills everything except
 *  number/complement, which ViaCEP can't know. `idPrefix` keeps each
 *  instance's field ids unique when more than one renders on the same page. */
export function AddressFields({
  address,
  onChange,
  idPrefix,
}: {
  address: Address;
  onChange: (partial: Partial<Address>) => void;
  idPrefix: string;
}) {
  const { state: cepState, lookup, reset } = useCepLookup((fields) => onChange(fields));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}PostalCode`}>CEP</Label>
        <div className="relative">
          <Input
            id={`${idPrefix}PostalCode`}
            className="pr-10"
            value={address.postalCode}
            onChange={(event) => {
              onChange({ postalCode: event.target.value });
              reset();
            }}
            onBlur={(event) => void lookup(event.target.value)}
            placeholder="00000-000"
          />
          <button
            type="button"
            aria-label="Preencher endereço pelo CEP"
            title="Preencher endereço pelo CEP"
            disabled={cepState === 'loading'}
            onClick={() => void lookup(address.postalCode)}
            className="absolute top-1/2 right-2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {cepState === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {cepState === 'loading' ? (
          <p className="text-xs text-muted-foreground">Buscando endereço...</p>
        ) : cepState === 'not-found' ? (
          <p className="text-xs text-destructive">CEP não encontrado. Preencha o endereço manualmente.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Preenche o resto do endereço automaticamente.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}Number`}>Número</Label>
        <Input
          id={`${idPrefix}Number`}
          value={address.number}
          onChange={(event) => onChange({ number: event.target.value })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}Street`}>Endereço</Label>
        <Input
          id={`${idPrefix}Street`}
          value={address.street}
          onChange={(event) => onChange({ street: event.target.value })}
          placeholder="Rua, avenida..."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}Complement`}>Complemento</Label>
        <Input
          id={`${idPrefix}Complement`}
          value={address.complement}
          onChange={(event) => onChange({ complement: event.target.value })}
          placeholder="Opcional"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}District`}>Bairro</Label>
        <Input
          id={`${idPrefix}District`}
          value={address.district}
          onChange={(event) => onChange({ district: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}City`}>Cidade</Label>
        <Input
          id={`${idPrefix}City`}
          value={address.city}
          onChange={(event) => onChange({ city: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}State`}>UF</Label>
        <Input
          id={`${idPrefix}State`}
          maxLength={2}
          value={address.state}
          onChange={(event) => onChange({ state: event.target.value.toUpperCase() })}
        />
      </div>
    </div>
  );
}
