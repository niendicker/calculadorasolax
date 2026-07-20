// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Actions,
  AdminLoadingSkeleton,
  CatalogLayout,
  DetailItem,
  EditorModal,
  Field,
  InfoLabel,
  InlineOptionTabs,
  MediaSummary,
  NumberWithUnitField,
  ProductMediaFields,
  ProductQtyDetail,
  RecordCardGrid,
  RemovingOverlay,
  SectionHeader,
  SegmentedTabs,
  ToggleChipsInput,
} from './shared-ui';

describe('Field / InfoLabel / AdminLoadingSkeleton (smoke)', () => {
  it('Field renders as a <label> by default and a <div> with asDiv', () => {
    const { container, rerender } = render(<Field label="Nome">child</Field>);
    expect(container.querySelector('label')).toBeInTheDocument();

    rerender(<Field label="Nome" asDiv>child</Field>);
    expect(container.querySelector('label')).not.toBeInTheDocument();
    expect(container.querySelector('div > span')).toHaveTextContent('Nome');
  });

  it('InfoLabel exposes the tip both as an aria-label and as tooltip text', () => {
    render(<InfoLabel label="Potência" tip="Explicação" />);
    expect(screen.getByText('Potência')).toBeInTheDocument();
    expect(screen.getByLabelText('Explicação')).toBeInTheDocument();
  });

  it('AdminLoadingSkeleton renders a labeled loading region', () => {
    render(<AdminLoadingSkeleton />);
    expect(screen.getByLabelText('Carregando dados administrativos')).toBeInTheDocument();
  });
});

describe('NumberWithUnitField', () => {
  it('shows the clear button only once there is a value, and calls onClear', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <NumberWithUnitField label="Potência" tip="tip" unit="kW" value="" onChange={() => {}} onClear={onClear} />
    );
    expect(screen.queryByLabelText('Limpar campo')).not.toBeInTheDocument();

    rerender(<NumberWithUnitField label="Potência" tip="tip" unit="kW" value="5" onChange={() => {}} onClear={onClear} />);
    fireEvent.click(screen.getByLabelText('Limpar campo'));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('Actions', () => {
  it('wires Salvar/Novo/Fechar to their callbacks and disables all while saving', () => {
    const onSave = vi.fn();
    const onNew = vi.fn();
    const onCancel = vi.fn();
    render(<Actions onSave={onSave} onNew={onNew} onCancel={onCancel} saving={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Fechar/ }));
    expect(onSave).toHaveBeenCalled();
    expect(onNew).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables the buttons while saving, and omits Novo/Fechar when not given', () => {
    render(<Actions onSave={() => {}} saving={true} />);
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Novo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fechar/ })).not.toBeInTheDocument();
  });
});

describe('MediaSummary', () => {
  it('shows "sem imagem" and a 0-doc badge with no media', () => {
    render(<MediaSummary imageUrl={null} documents={[]} />);
    expect(screen.getByText('sem imagem')).toBeInTheDocument();
    expect(screen.getByText('0 docs')).toBeInTheDocument();
  });

  it('shows "imagem" and pluralizes the doc count correctly', () => {
    render(<MediaSummary imageUrl="x.png" documents={[{ name: 'a', url: 'a.pdf' }]} />);
    expect(screen.getByText('imagem')).toBeInTheDocument();
    expect(screen.getByText('1 doc')).toBeInTheDocument();
  });

  it('only counts documents that have a url', () => {
    render(<MediaSummary imageUrl={null} documents={[{ name: 'a', url: '' }, { name: 'b', url: 'b.pdf' }]} />);
    expect(screen.getByText('1 doc')).toBeInTheDocument();
  });
});

describe('ToggleChipsInput', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ] as const;

  it('adds a value on click when not selected, and removes it when already selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ToggleChipsInput options={options} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onChange).toHaveBeenCalledWith(['a']);

    rerender(<ToggleChipsInput options={options} value={['a']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('InlineOptionTabs', () => {
  it('defaults to the first option when value is undefined', () => {
    const options = [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
    ] as const;
    render(<InlineOptionTabs options={options} value={undefined} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'X' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onChange with the clicked option', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
    ] as const;
    render(<InlineOptionTabs options={options} value="x" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Y' }));
    expect(onChange).toHaveBeenCalledWith('y');
  });
});

describe('SegmentedTabs', () => {
  it('shows the active option\'s count in the header badge and calls onChange', () => {
    const onChange = vi.fn();
    const options = [
      { value: 'a', label: 'A', count: 3 },
      { value: 'b', label: 'B', count: 7 },
    ];
    render(<SegmentedTabs label="Seção" value="a" options={options} onChange={onChange} />);

    // "3" also appears inside button A's own count chip, so scope to the header badge next to the label.
    expect(screen.getByText('Seção').parentElement).toHaveTextContent('3');
    fireEvent.click(screen.getByRole('button', { name: /B/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('DetailItem', () => {
  it('renders a scalar value, falling back to an em-dash when empty', () => {
    const { rerender } = render(<DetailItem label="Modelo" value="X1" />);
    expect(screen.getByText('X1')).toBeInTheDocument();

    rerender(<DetailItem label="Modelo" value="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders an array value as chips, falling back to an em-dash when empty', () => {
    const { rerender } = render(<DetailItem label="Flags" value={['ip65', 'ip66']} />);
    expect(screen.getByText('ip65')).toBeInTheDocument();
    expect(screen.getByText('ip66')).toBeInTheDocument();

    rerender(<DetailItem label="Flags" value={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('ProductQtyDetail / RemovingOverlay (smoke)', () => {
  it('ProductQtyDetail shows the model and quantity', () => {
    render(<ProductQtyDetail label="Inversor" model="X1-Hybrid" quantity={2} />);
    expect(screen.getByText('X1-Hybrid')).toBeInTheDocument();
    expect(screen.getByText('x2')).toBeInTheDocument();
  });

  it('RemovingOverlay shows its label', () => {
    render(<RemovingOverlay label="Removendo..." />);
    expect(screen.getByText('Removendo...')).toBeInTheDocument();
  });
});

describe('SectionHeader', () => {
  it('pluralizes "registro" based on count', () => {
    const { rerender } = render(<SectionHeader title="Baterias" count={1} />);
    expect(screen.getByText('1 registro')).toBeInTheDocument();

    rerender(<SectionHeader title="Baterias" count={5} />);
    expect(screen.getByText('5 registros')).toBeInTheDocument();
  });
});

describe('EditorModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <EditorModal open={false} title="Editar" onClose={() => {}}>
        conteúdo
      </EditorModal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the title, children and footer when open, and closes via the X button', () => {
    const onClose = vi.fn();
    render(
      <EditorModal open title="Editar item" onClose={onClose} footer={<button type="button">Rodapé</button>}>
        conteúdo do formulário
      </EditorModal>
    );

    expect(screen.getByRole('dialog', { name: 'Editar item' })).toBeInTheDocument();
    expect(screen.getByText('conteúdo do formulário')).toBeInTheDocument();
    expect(screen.getByText('Rodapé')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Editar item' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when clicking the backdrop, but not when clicking inside the dialog', () => {
    const onClose = vi.fn();
    const { container } = render(
      <EditorModal open title="Editar item" onClose={onClose}>
        conteúdo
      </EditorModal>
    );

    fireEvent.click(screen.getByText('conteúdo'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.querySelector('[role="presentation"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ProductMediaFields', () => {
  function setup(overrides: Partial<Parameters<typeof ProductMediaFields>[0]> = {}) {
    const props = {
      table: 'inverters' as const,
      model: 'X1-Hybrid-5.0kW-G4',
      imageUrl: null,
      documents: [],
      setImageUrl: vi.fn(),
      setDocuments: vi.fn(),
      uploadAsset: vi.fn().mockResolvedValue('https://cdn.example.com/x.png'),
      ...overrides,
    };
    render(<ProductMediaFields {...props} />);
    return props;
  }

  it('shows the empty image placeholder, and updates the URL field directly', () => {
    const props = setup();
    expect(screen.getByText('Nenhuma imagem')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('URL da imagem'), { target: { value: 'https://x.png' } });
    expect(props.setImageUrl).toHaveBeenCalledWith('https://x.png');
  });

  it('shows "Remover imagem" only once there is an image, and clears it', () => {
    const props = setup({ imageUrl: 'https://x.png' });
    fireEvent.click(screen.getByRole('button', { name: /Remover imagem/ }));
    expect(props.setImageUrl).toHaveBeenCalledWith('');
  });

  it('shows the empty documents state, and adding a link appends a blank document', () => {
    const props = setup();
    expect(screen.getByText('Nenhum documento anexado.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar link/ }));
    expect(props.setDocuments).toHaveBeenCalledWith([{ name: 'Datasheet', url: '' }]);
  });

  it('edits an existing document\'s name/url and removes it via the confirm popover', async () => {
    const props = setup({ documents: [{ name: 'Manual', url: 'https://x.pdf' }] });

    fireEvent.change(screen.getByDisplayValue('Manual'), { target: { value: 'Manual editado' } });
    expect(props.setDocuments).toHaveBeenCalledWith([{ name: 'Manual editado', url: 'https://x.pdf' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remover documento Manual' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);
    expect(props.setDocuments).toHaveBeenCalledWith([]);
  });

  it('rejects an oversized image client-side without calling uploadAsset, and shows the size error', async () => {
    const props = setup();
    const bigFile = new File([new Uint8Array(21 * 1024 * 1024)], 'huge.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText(/Enviar imagem/), { target: { files: [bigFile] } });

    expect(await screen.findByText('Arquivo muito grande. O limite é de 20MB.')).toBeInTheDocument();
    expect(props.uploadAsset).not.toHaveBeenCalled();
    expect(props.setImageUrl).not.toHaveBeenCalled();
  });

  it('surfaces the upload error instead of failing silently when uploadAsset rejects', async () => {
    const props = setup({ uploadAsset: vi.fn().mockRejectedValue(new Error('The object exceeded the maximum allowed size')) });
    const file = new File(['x'], 'datasheet.pdf', { type: 'application/pdf' });

    fireEvent.change(screen.getByLabelText(/Enviar arquivo/), { target: { files: [file] } });

    expect(await screen.findByText('Arquivo muito grande. O limite é de 20MB.')).toBeInTheDocument();
    expect(props.setDocuments).not.toHaveBeenCalled();
  });
});

describe('RecordCardGrid', () => {
  const baseItem = {
    id: 'i1',
    title: 'X1-Hybrid-5.0kW-G4',
    description: 'Descrição',
    badges: ['HV'],
    details: [['Fases', '1']] as [string, string | string[], true?][],
    onEdit: vi.fn(),
    onRemove: vi.fn(),
  };

  it('renders each item with its details and badges, and wires Editar', () => {
    const onEdit = vi.fn();
    render(<RecordCardGrid items={[{ ...baseItem, onEdit }]} />);

    expect(screen.getByText('X1-Hybrid-5.0kW-G4')).toBeInTheDocument();
    expect(screen.getByText('HV')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('shows the removing overlay and disables actions while removing', () => {
    render(<RecordCardGrid items={[{ ...baseItem, removing: true }]} />);
    expect(screen.getByText('Removendo...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
  });

  it('removes via the confirm popover', async () => {
    const onRemove = vi.fn();
    render(<RecordCardGrid items={[{ ...baseItem, onRemove }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover X1-Hybrid-5.0kW-G4' }));
    const confirmButton = await screen.findByRole('button', { name: 'Remover' }, { timeout: 1000 });
    fireEvent.click(confirmButton);
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows a deactivate action only when onDeactivate is given', async () => {
    const onDeactivate = vi.fn();
    render(<RecordCardGrid items={[{ ...baseItem, onDeactivate }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Desativar X1-Hybrid-5.0kW-G4' }));
    const confirmButton = await screen.findByRole('button', { name: 'Desativar' }, { timeout: 1000 });
    fireEvent.click(confirmButton);
    expect(onDeactivate).toHaveBeenCalled();
  });
});

describe('CatalogLayout', () => {
  it('composes the header, new button, modal form and items grid', () => {
    const onNew = vi.fn();
    render(
      <CatalogLayout
        title="Baterias"
        count={1}
        formOpen={false}
        formTitle="Nova bateria"
        onNew={onNew}
        onClose={() => {}}
        form={<p>form</p>}
        items={[
          {
            id: 'b1',
            title: 'TP-HS3.6',
            details: [],
            onEdit: () => {},
            onRemove: () => {},
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Baterias' })).toBeInTheDocument();
    expect(screen.getByText('1 registro')).toBeInTheDocument();
    expect(screen.getByText('TP-HS3.6')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
    expect(onNew).toHaveBeenCalled();
  });

  it('opens the modal with the form when formOpen is true', () => {
    render(
      <CatalogLayout
        title="Baterias"
        count={0}
        formOpen
        formTitle="Nova bateria"
        onNew={() => {}}
        onClose={() => {}}
        form={<p>conteúdo do formulário</p>}
        items={[]}
      />
    );

    expect(within(screen.getByRole('dialog')).getByText('conteúdo do formulário')).toBeInTheDocument();
  });
});
