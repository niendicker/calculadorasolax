// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductDocument } from '@/lib/types';
import type { ProductMedia } from './types';
import {
  BatteryCardsSkeleton,
  CatalogEmptyState,
  CatalogProductCard,
  CollapsibleSection,
  DocPreviewModal,
  ImagePreviewModal,
  Metric,
  ProductAttachments,
  ProductImage,
  ProjectListSkeleton,
  ReportInfoRow,
  ReportMetric,
  Requirement,
  SearchInput,
  SolutionSkeleton,
} from './shared-ui';

describe('Metric', () => {
  it('renders label, value and unit, shrinking the text size as the value grows longer', () => {
    const { rerender } = render(<Metric label="Nominal" value="3.00" unit="kVA" />);
    expect(screen.getByText('Nominal')).toBeInTheDocument();
    expect(screen.getByText('3.00')).toHaveClass('text-xl');
    expect(screen.getByText('kVA')).toBeInTheDocument();

    rerender(<Metric label="Nominal" value="123456" unit="kVA" />);
    expect(screen.getByText('123456')).toHaveClass('text-base');

    rerender(<Metric label="Nominal" value="12345678" unit="kVA" />);
    expect(screen.getByText('12345678')).toHaveClass('text-sm');

    rerender(<Metric label="Nominal" value="1234567890" unit="kVA" />);
    expect(screen.getByText('1234567890')).toHaveClass('text-xs');
  });

  it('omits the unit paragraph when none is given, and tints when accented', () => {
    const { container, rerender } = render(<Metric label="Nominal" value="3.00" />);
    expect(screen.queryByText('kVA')).not.toBeInTheDocument();
    expect(container.firstChild).not.toHaveClass('border-primary/30');

    rerender(<Metric label="Nominal" value="3.00" accent />);
    expect(container.firstChild).toHaveClass('border-primary/30');
  });
});

describe('CollapsibleSection', () => {
  it('shows the summary and hides children while closed, and calls onToggle', () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="Detalhes" summary="3 itens" open={false} onToggle={onToggle}>
        <p>Conteúdo</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('3 itens')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Detalhes/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows children and hides the summary while open', () => {
    render(
      <CollapsibleSection title="Detalhes" summary="3 itens" open={true} onToggle={vi.fn()}>
        <p>Conteúdo</p>
      </CollapsibleSection>
    );
    expect(screen.queryByText('3 itens')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('SearchInput', () => {
  it('starts collapsed to an icon button when empty, and opens on click', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Buscar" />);
    const openButton = screen.getByRole('button', { name: 'Buscar' });
    fireEvent.click(openButton);
    expect(screen.getByPlaceholderText('Buscar')).toBeInTheDocument();
  });

  it('starts open when given a non-empty value', () => {
    render(<SearchInput value="abc" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('abc');
  });

  it('calls onChange as the user types, and shows/uses the clear button', () => {
    const onChange = vi.fn();
    render(<SearchInput value="abc" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abcd' } });
    expect(onChange).toHaveBeenCalledWith('abcd');

    const clearButton = screen.getByRole('button', { name: 'Limpar pesquisa' });
    fireEvent.mouseDown(clearButton);
    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes on blur when the value is empty', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Buscar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.blur(screen.getByPlaceholderText('Buscar'));
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('stays open on blur when there is a value', () => {
    render(<SearchInput value="abc" onChange={vi.fn()} placeholder="Buscar" />);
    fireEvent.blur(screen.getByPlaceholderText('Buscar'));
    expect(screen.getByPlaceholderText('Buscar')).toBeInTheDocument();
  });

  it('clears the value and closes on Escape', () => {
    const onChange = vi.fn();
    render(<SearchInput value="abc" onChange={onChange} placeholder="Buscar" />);
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('ignores other keys', () => {
    const onChange = vi.fn();
    render(<SearchInput value="abc" onChange={onChange} placeholder="Buscar" />);
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Requirement', () => {
  it('renders the label and reflects the done state via styling', () => {
    const { rerender } = render(
      <ul>
        <Requirement done={false} label="Topologia" />
      </ul>
    );
    expect(screen.getByText('Topologia').closest('li')).not.toHaveClass('text-foreground');

    rerender(
      <ul>
        <Requirement done={true} label="Topologia" />
      </ul>
    );
    expect(screen.getByText('Topologia').closest('li')).toHaveClass('text-foreground');
  });
});

describe('ReportMetric / ReportInfoRow', () => {
  it('renders a labeled metric card', () => {
    render(<ReportMetric label="Nominal" value="5.00 kVA" />);
    expect(screen.getByText('Nominal')).toBeInTheDocument();
    expect(screen.getByText('5.00 kVA')).toBeInTheDocument();
  });

  it('renders a label/value row', () => {
    render(<ReportInfoRow label="Cliente" value="Ana" />);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });
});

describe('skeletons', () => {
  it('renders the projects, batteries and solution loading skeletons', () => {
    render(<ProjectListSkeleton />);
    expect(screen.getByLabelText('Carregando projetos')).toBeInTheDocument();

    render(<BatteryCardsSkeleton />);
    expect(screen.getByLabelText('Carregando baterias')).toBeInTheDocument();

    render(<SolutionSkeleton />);
    expect(screen.getByLabelText('Calculando solução')).toBeInTheDocument();
  });
});

describe('DocPreviewModal', () => {
  it('renders nothing when there is no doc', () => {
    render(<DocPreviewModal doc={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the document, closes via the X button, the backdrop click, and Escape', () => {
    const doc: ProductDocument = { name: 'Datasheet', url: 'https://cdn.example.com/doc.pdf' };
    const onClose = vi.fn();
    render(<DocPreviewModal doc={doc} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Datasheet' });
    expect(within(dialog).getByTitle('Datasheet')).toHaveAttribute('src', doc.url);
    expect(within(dialog).getByRole('link', { name: 'Abrir em nova aba' })).toHaveAttribute('href', doc.url);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on Escape when there is no doc, and does not close on a click inside the modal body', () => {
    const onClose = vi.fn();
    const { rerender } = render(<DocPreviewModal doc={null} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    const doc: ProductDocument = { name: '', url: 'https://cdn.example.com/doc.pdf' };
    rerender(<DocPreviewModal doc={doc} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Documento' });
    fireEvent.click(within(dialog).getByTitle('Documento'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ImagePreviewModal', () => {
  it('renders nothing when there is no image', () => {
    render(<ImagePreviewModal image={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the image, closes via the X button, the backdrop click, and Escape', () => {
    const image = { url: 'https://cdn.example.com/x.png', alt: 'Bateria X' };
    const onClose = vi.fn();
    render(<ImagePreviewModal image={image} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Bateria X' });
    expect(within(dialog).getByRole('img', { name: 'Bateria X' })).toHaveAttribute('src', image.url);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pré-visualização' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('ProductImage', () => {
  it('renders nothing when there is no media image', () => {
    render(<ProductImage media={undefined} onPreviewImage={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the preview with the media url/model when clicked', () => {
    const media: ProductMedia = { model: 'TP-HS3.6', nickname: null, imageUrl: 'https://cdn.example.com/b.png', documents: [] };
    const onPreviewImage = vi.fn();
    render(<ProductImage media={media} onPreviewImage={onPreviewImage} />);
    fireEvent.click(screen.getByRole('img', { name: 'TP-HS3.6' }));
    expect(onPreviewImage).toHaveBeenCalledWith({ url: media.imageUrl, alt: 'TP-HS3.6' });
  });
});

describe('ProductAttachments', () => {
  it('renders nothing when there is no media or no documents', () => {
    const { rerender } = render(<ProductAttachments media={undefined} onPreview={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const emptyMedia: ProductMedia = { model: 'X', nickname: null, imageUrl: null, documents: [] };
    rerender(<ProductAttachments media={emptyMedia} onPreview={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a button per document, falling back to "Documento" for an unnamed one, and previews on click', () => {
    const media: ProductMedia = {
      model: 'X',
      nickname: null,
      imageUrl: null,
      documents: [
        { name: 'Datasheet', url: 'https://cdn.example.com/d.pdf' },
        { name: '', url: 'https://cdn.example.com/d2.pdf' },
      ],
    };
    const onPreview = vi.fn();
    render(<ProductAttachments media={media} onPreview={onPreview} />);

    fireEvent.click(screen.getByRole('button', { name: 'Datasheet' }));
    expect(onPreview).toHaveBeenCalledWith(media.documents[0]);
    expect(screen.getByRole('button', { name: 'Documento' })).toBeInTheDocument();
  });
});

describe('CatalogEmptyState', () => {
  it('renders the given label', () => {
    render(<CatalogEmptyState label="Nenhum item" />);
    expect(screen.getByText('Nenhum item')).toBeInTheDocument();
  });
});

describe('CatalogProductCard', () => {
  it('renders the fallback icon when there is no image, and "Sem anexos" when there are no documents', () => {
    render(
      <CatalogProductCard
        fallbackIcon={<span>icon</span>}
        model="X1"
        imageUrl={null}
        documents={[]}
        onPreviewImage={vi.fn()}
        onPreviewDoc={vi.fn()}
      />
    );
    expect(screen.getByText('icon')).toBeInTheDocument();
    expect(screen.getByText('Sem anexos')).toBeInTheDocument();
  });

  it('opens the image preview on click, lists documents, badges, specs, description and stockControl', () => {
    const onPreviewImage = vi.fn();
    const onPreviewDoc = vi.fn();
    const doc: ProductDocument = { name: 'Manual', url: 'https://cdn.example.com/m.pdf' };
    render(
      <CatalogProductCard
        fallbackIcon={<span>icon</span>}
        model="X1"
        imageUrl="https://cdn.example.com/x1.png"
        documents={[doc]}
        badges={['HV', 'Novo']}
        specs={[['Capacidade', '3.6 kWh']]}
        description="Descrição do produto"
        onPreviewImage={onPreviewImage}
        onPreviewDoc={onPreviewDoc}
        stockControl={<button>No estoque</button>}
      />
    );

    fireEvent.click(screen.getByRole('img', { name: 'X1' }));
    expect(onPreviewImage).toHaveBeenCalledWith({ url: 'https://cdn.example.com/x1.png', alt: 'X1' });

    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));
    expect(onPreviewDoc).toHaveBeenCalledWith(doc);

    expect(screen.getByText('HV')).toBeInTheDocument();
    expect(screen.getByText('Novo')).toBeInTheDocument();
    expect(screen.getByText('Capacidade: 3.6 kWh')).toBeInTheDocument();
    expect(screen.getByText('Descrição do produto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No estoque' })).toBeInTheDocument();
  });
});
