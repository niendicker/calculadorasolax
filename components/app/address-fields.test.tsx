// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Address } from '@/lib/types';
import { AddressFields } from './address-fields';

function ControlledAddressFields() {
  const [address, setAddress] = useState<Address>(emptyAddress());
  return (
    <AddressFields
      address={address}
      onChange={(partial) => setAddress((current) => ({ ...current, ...partial }))}
      idPrefix="test"
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AddressFields', () => {
  it('renders every address field', () => {
    render(<ControlledAddressFields />);
    expect(screen.getByLabelText('CEP')).toBeInTheDocument();
    expect(screen.getByLabelText('Endereço')).toBeInTheDocument();
    expect(screen.getByLabelText('Número')).toBeInTheDocument();
    expect(screen.getByLabelText('Complemento')).toBeInTheDocument();
    expect(screen.getByLabelText('Bairro')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
    expect(screen.getByLabelText('UF')).toBeInTheDocument();
  });

  it('auto-fills street/district/city/state from ViaCEP when a CEP is entered', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ logradouro: 'Av. Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }),
    });
    render(<ControlledAddressFields />);

    const cepInput = screen.getByLabelText('CEP');
    fireEvent.change(cepInput, { target: { value: '01310-930' } });
    fireEvent.blur(cepInput);

    expect(global.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01310930/json/');
    await waitFor(() => expect(screen.getByLabelText('Endereço')).toHaveValue('Av. Paulista'));
    expect(screen.getByLabelText('Bairro')).toHaveValue('Bela Vista');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('UF')).toHaveValue('SP');
  });

  it('does not look up a CEP with fewer than 8 digits', () => {
    render(<ControlledAddressFields />);
    const cepInput = screen.getByLabelText('CEP');
    fireEvent.change(cepInput, { target: { value: '0131' } });
    fireEvent.blur(cepInput);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows a not-found message when the CEP does not resolve, without blocking manual entry', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ erro: true }) });
    render(<ControlledAddressFields />);

    const cepInput = screen.getByLabelText('CEP');
    fireEvent.change(cepInput, { target: { value: '00000000' } });
    fireEvent.blur(cepInput);

    await waitFor(() => expect(screen.getByText('CEP não encontrado. Preencha o endereço manualmente.')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Endereço'), { target: { value: 'Rua Manual' } });
    expect(screen.getByLabelText('Endereço')).toHaveValue('Rua Manual');
  });

  it('clears the not-found message once the CEP is edited again', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ erro: true }) });
    render(<ControlledAddressFields />);

    const cepInput = screen.getByLabelText('CEP');
    fireEvent.change(cepInput, { target: { value: '00000000' } });
    fireEvent.blur(cepInput);
    await waitFor(() => expect(screen.getByText('CEP não encontrado. Preencha o endereço manualmente.')).toBeInTheDocument());

    fireEvent.change(cepInput, { target: { value: '01310930' } });
    expect(screen.queryByText('CEP não encontrado. Preencha o endereço manualmente.')).not.toBeInTheDocument();
  });

  it('uppercases the UF as it is typed', () => {
    render(<ControlledAddressFields />);
    fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'sp' } });
    expect(screen.getByLabelText('UF')).toHaveValue('SP');
  });

  it('recovers from a network failure without getting stuck loading', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    render(<ControlledAddressFields />);

    const cepInput = screen.getByLabelText('CEP');
    fireEvent.change(cepInput, { target: { value: '01310930' } });
    fireEvent.blur(cepInput);

    await waitFor(() => expect(screen.queryByText('Buscando endereço...')).not.toBeInTheDocument());
    expect(screen.queryByText('CEP não encontrado. Preencha o endereço manualmente.')).not.toBeInTheDocument();
  });
});
