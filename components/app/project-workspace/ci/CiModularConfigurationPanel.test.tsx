// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultCiOptions } from '@/lib/store/defaults';
import { modularFixture } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';
import type { CommercialIndustrialOptions } from '@/supabase/functions/_shared/commercial-industrial/types';
import { CiModularConfigurationPanel } from './CiModularConfigurationPanel';
import { modularSelection } from '@/supabase/functions/_shared/commercial-industrial/modular.test-fixtures';

const mocks = vi.hoisted(() => ({ load: vi.fn(), integrated: vi.fn() }));
vi.mock('@/lib/data/ci-modular-catalog-repository', () => ({ loadCiModularCatalog: mocks.load }));
vi.mock('@/lib/data/ci-accessories-repository',()=>({loadCiAccessoryCatalog:vi.fn().mockResolvedValue({products:[],rules:[],stsIds:[]})}));
vi.mock('@/lib/data/ci-bess-products-repository', () => ({ listActiveCiBessProducts: mocks.integrated }));
function Controlled() {
  const [options, setOptions] = useState<CommercialIndustrialOptions>({...defaultCiOptions,bessSystem:{...modularSelection(),mode:'fixed',compatibilityId:null}});
  return <><CiModularConfigurationPanel ciOptions={options} onChange={(partial) => setOptions(old=>({...old,...partial}))} onNavigateNext={vi.fn()} /><output aria-label="Composição salva">{JSON.stringify(options.bessSystem)}</output></>;
}
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(modularFixture()); mocks.integrated.mockResolvedValue([]); });

describe('C&I modular configuration', () => {
  it('selects a PCS and approved battery, retains the configuration on repeated mode clicks, and previews independent sizing', async () => {
    render(<Controlled />);
    const pcs = await screen.findByLabelText('Inversor / PCS');
    const fixture = modularFixture();
    fireEvent.change(pcs, { target: { value: fixture.pcs[0].inverter_id } });
    fireEvent.change(screen.getByLabelText('Bateria / compatibilidade aprovada'), { target: { value: fixture.rules[0].id } });
    expect(screen.getByLabelText('Baterias em série por string')).toHaveValue(2);
    expect(screen.getByRole('button', { name: 'Avançar para Curvas e aplicações' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Strings em paralelo por PCS'), { target: { value: '2' } });
    expect(screen.getByLabelText('Strings em paralelo por PCS')).toHaveValue(2);
    expect(screen.getByLabelText('Composição salva')).toHaveTextContent('"compatibilityId":"30000000-0000-0000-0000-000000000001"');
    fireEvent.click(screen.getByRole('button', { name: 'Comparar composições' }));
    expect(screen.getByLabelText('Máximo: Quantidade de PCS')).toHaveValue(2);
    expect(screen.getByLabelText('Máximo: Strings em paralelo por PCS')).toHaveValue(2);
    expect(screen.getByText('Composições avaliadas')).toBeInTheDocument();
  });

  it('does not list draft approvals and offers recovery after a failed request', async () => {
    const fixture = modularFixture(); fixture.rules[0].approval_status = 'draft';
    mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(fixture);
    render(<Controlled />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText(/Nenhuma compatibilidade modular aprovada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avançar para Curvas e aplicações' })).toBeDisabled();
  });
});
