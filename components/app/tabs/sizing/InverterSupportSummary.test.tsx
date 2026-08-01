// @vitest-environment jsdom

import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ptMessages from '@/messages/pt.json';
import type { InverterCatalogOption } from '../../types';
import { InverterSupportSummary } from './InverterSupportSummary';

const supporting: InverterCatalogOption = {
  id: 'i1',
  model: 'X1-Hybrid-5.0kW-G4',
  topology: 'HV',
  phases: 1,
  standardPowerKva: 5,
  peakPowerKva: 7,
  maxPowerPerPhaseW: null,
  imageUrl: null,
  documents: [],
  flags: ['microgrid'],
};

const nonSupporting: InverterCatalogOption = { ...supporting, id: 'i2', model: 'X1-Basic', flags: [] };

function renderSummary(props: Partial<React.ComponentProps<typeof InverterSupportSummary>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt" messages={ptMessages}>
      <InverterSupportSummary
        flag="microgrid"
        featureLabel="microrrede"
        inverterCatalog={[supporting, nonSupporting]}
        availableInverterModels={null}
        selectedInverterModel={null}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe('InverterSupportSummary', () => {
  it('shows the catalog-wide count and a pending chip when nothing narrows the selection', () => {
    renderSummary();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('narrows by selectedInverterModel and shows a warning chip when the selection does not support the flag', () => {
    renderSummary({ selectedInverterModel: 'X1-Basic' });
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nenhum inversor das opções selecionadas/)).toBeInTheDocument();
  });

  it('narrows by selectedInverterModel and shows a neutral chip when the selection supports the flag', () => {
    renderSummary({ selectedInverterModel: 'X1-Hybrid-5.0kW-G4' });
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('narrows by availableInverterModels when no specific model is selected', () => {
    renderSummary({ availableInverterModels: new Set(['X1-Hybrid-5.0kW-G4', 'X1-Basic']) });
    expect(screen.getAllByText('1/2').length).toBeGreaterThan(0);
  });

  it('narrows by availableInverterModels down to zero supporting inverters', () => {
    renderSummary({ availableInverterModels: new Set(['X1-Basic']) });
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });
});
