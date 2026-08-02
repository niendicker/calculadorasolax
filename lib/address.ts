import type { Address } from '@/lib/types';

export function emptyAddress(): Address {
  return { postalCode: '', street: '', number: '', complement: '', district: '', city: '', state: '' };
}

export function isAddressEmpty(address: Address): boolean {
  return Object.values(address).every((value) => !value.trim());
}

/** Parses a project/profile address column into an `Address` — the column
 *  was a plain text field before this type existed, so a lingering legacy
 *  string value (or `null`) is treated as a bare street line instead of
 *  being dropped, and anything already structured passes through unchanged. */
export function addressFromJson(value: unknown): Address {
  if (!value) return emptyAddress();
  if (typeof value === 'string') return { ...emptyAddress(), street: value };
  const raw = value as Partial<Record<keyof Address, unknown>>;
  return {
    postalCode: typeof raw.postalCode === 'string' ? raw.postalCode : '',
    street: typeof raw.street === 'string' ? raw.street : '',
    number: typeof raw.number === 'string' ? raw.number : '',
    complement: typeof raw.complement === 'string' ? raw.complement : '',
    district: typeof raw.district === 'string' ? raw.district : '',
    city: typeof raw.city === 'string' ? raw.city : '',
    state: typeof raw.state === 'string' ? raw.state : '',
  };
}

/** Single display line for an address — used in the PDF report, the
 *  project summary panel and the shareable project text. */
export function formatAddress(address: Address | null | undefined): string {
  if (!address) return '';
  const line1 = [address.street, address.number].filter(Boolean).join(', ');
  const cityState = address.city && address.state ? `${address.city}/${address.state}` : address.city || address.state;
  const line2 = [address.district, cityState].filter(Boolean).join(' - ');
  return [line1, address.complement, line2, address.postalCode].filter(Boolean).join(' - ');
}
