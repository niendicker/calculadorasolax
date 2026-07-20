'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { EyeOff, FileText, ImageIcon, Loader2, Pencil, Plus, Save, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoLabel } from '@/components/ui/tooltip';
import type { ProductDocument } from '@/lib/types';
import { cn } from '@/lib/utils';

export { InfoLabel };

const MAX_PRODUCT_ASSET_BYTES = 20 * 1024 * 1024;

export function Field({
  label,
  children,
  asDiv,
}: {
  label: ReactNode;
  children: ReactNode;
  asDiv?: boolean;
}) {
  const className = 'flex flex-col gap-1.5 text-sm font-medium';
  if (asDiv) {
    return (
      <div className={className}>
        <span>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={className}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function AdminLoadingSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando dados administrativos">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-3 pt-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <div key={rowIndex} className="space-y-2">
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function NumberWithUnitField({
  label,
  tip,
  icon,
  unit,
  onClear,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type' | 'inputMode'> & {
  label: string;
  tip: string;
  icon?: ReactNode;
  unit: string;
  onClear?: () => void;
}) {
  const hasValue = props.value !== undefined && props.value !== null && props.value !== '';
  return (
    <Field label={<InfoLabel label={label} tip={tip} />}>
      <div className="flex h-10 items-center rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 md:h-8">
        {icon && (
          <span className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
        )}
        <Input
          {...props}
          value={props.value ?? ''}
          type="number"
          inputMode="decimal"
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-full border-0 bg-transparent px-1 py-0 focus-visible:border-transparent focus-visible:ring-0',
            !icon && 'pl-2.5'
          )}
        />
        {onClear && hasValue && (
          <button
            type="button"
            aria-label="Limpar campo"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
            className="mr-1 flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground md:size-6"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <span className="mr-2 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {unit}
        </span>
      </div>
    </Field>
  );
}

export function Actions({
  onSave,
  onNew,
  onCancel,
  saving,
}: {
  onSave: () => void;
  onNew?: () => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-wrap gap-2 border-t bg-card/80 px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md backdrop-saturate-150">
      <Button onClick={onSave} disabled={saving}>
        <Save className="h-4 w-4" />
        Salvar
      </Button>
      {onNew && (
        <Button variant="outline" onClick={onNew} disabled={saving}>
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      )}
      {onCancel && (
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" />
          Fechar
        </Button>
      )}
    </div>
  );
}

export function ProductMediaFields({
  table,
  model,
  imageUrl,
  documents,
  setImageUrl,
  setDocuments,
  uploadAsset,
}: {
  table: 'inverters' | 'batteries' | 'accessories';
  model: string | undefined;
  imageUrl: string | null | undefined;
  documents: ProductDocument[] | undefined;
  setImageUrl: (url: string) => void;
  setDocuments: (documents: ProductDocument[]) => void;
  uploadAsset: (
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) => Promise<string>;
}) {
  const currentDocuments = documents ?? [];
  const [imageError, setImageError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  function uploadErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/exceeded the maximum allowed size|payload too large|too large/i.test(message)) {
      return 'Arquivo muito grande. O limite é de 20MB.';
    }
    if (/mime type|not supported|invalid.*type/i.test(message)) {
      return 'Tipo de arquivo não suportado.';
    }
    return message || 'Não foi possível enviar o arquivo. Tente novamente.';
  }

  // Matches the 'product-assets' bucket's file_size_limit (see migration
  // 0048) — checking client-side gives instant feedback instead of waiting
  // on a round trip just to get the same rejection back from Storage.
  function oversized(file: File): boolean {
    return file.size > MAX_PRODUCT_ASSET_BYTES;
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    if (oversized(file)) {
      setImageError('Arquivo muito grande. O limite é de 20MB.');
      return;
    }
    setUploadingImage(true);
    try {
      const url = await uploadAsset(table, model, 'image', file);
      setImageUrl(url);
    } catch (error) {
      setImageError(uploadErrorMessage(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function uploadDocument(file: File | undefined) {
    if (!file) return;
    setDocumentError(null);
    if (oversized(file)) {
      setDocumentError('Arquivo muito grande. O limite é de 20MB.');
      return;
    }
    setUploadingDocument(true);
    try {
      const url = await uploadAsset(table, model, 'documents', file);
      setDocuments([...currentDocuments, { name: file.name, url }]);
    } catch (error) {
      setDocumentError(uploadErrorMessage(error));
    } finally {
      setUploadingDocument(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4" />
          Mídia do produto
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Adicione uma imagem do produto e materiais técnicos para o relatório do cliente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
        <div className="overflow-hidden rounded-lg border bg-background">
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Imagem do produto" className="h-36 w-full object-contain p-3" />
            </>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              Nenhuma imagem
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Imagem do produto">
            <Input
              value={imageUrl ?? ''}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="URL da imagem"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'cursor-pointer',
                uploadingImage && 'pointer-events-none opacity-60'
              )}
            >
                {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {uploadingImage ? 'Enviando...' : 'Enviar imagem'}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  disabled={uploadingImage}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    uploadImage(file);
                  }}
                />
            </label>
            {imageUrl && (
              <Button type="button" variant="ghost" onClick={() => setImageUrl('')}>
                <X className="h-4 w-4" />
                Remover imagem
              </Button>
            )}
          </div>
          {imageError && <p className="text-xs text-destructive">{imageError}</p>}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Documentos para clientes
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Datasheets, manuais, certificados ou guias rápidos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'cursor-pointer',
                uploadingDocument && 'pointer-events-none opacity-60'
              )}
            >
                {uploadingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {uploadingDocument ? 'Enviando...' : 'Enviar arquivo'}
                <input
                  className="sr-only"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  disabled={uploadingDocument}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    uploadDocument(file);
                  }}
                />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocuments([...currentDocuments, { name: 'Datasheet', url: '' }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar link
            </Button>
          </div>
          {documentError && <p className="text-xs text-destructive">{documentError}</p>}
        </div>

        <div className="grid gap-2">
          {currentDocuments.length === 0 && (
            <div className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
              Nenhum documento anexado.
            </div>
          )}
          {currentDocuments.map((document, index) => (
            <div key={index} className="grid gap-2 rounded-lg border bg-background p-2">
              <Input
                value={document.name}
                onChange={(event) => {
                  const next = [...currentDocuments];
                  next[index] = { ...document, name: event.target.value };
                  setDocuments(next);
                }}
                placeholder="Nome do documento"
              />
              <div className="flex gap-2">
                <Input
                  value={document.url}
                  onChange={(event) => {
                    const next = [...currentDocuments];
                    next[index] = { ...document, url: event.target.value };
                    setDocuments(next);
                  }}
                  placeholder="URL do documento"
                />
                <ConfirmDeleteButton
                  ariaLabel={`Remover documento ${document.name}`}
                  title="Remover documento?"
                  description="O anexo será removido deste produto ao salvar o cadastro."
                  confirmLabel="Remover"
                  onConfirm={() => setDocuments(currentDocuments.filter((_, itemIndex) => itemIndex !== index))}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MediaSummary({
  imageUrl,
  documents,
}: {
  imageUrl: string | null | undefined;
  documents: ProductDocument[] | undefined;
}) {
  const documentCount = documents?.filter((document) => document.url).length ?? 0;

  return (
    <div className="flex flex-wrap gap-1">
      {imageUrl ? <Badge variant="secondary">imagem</Badge> : <Badge variant="outline">sem imagem</Badge>}
      <Badge variant={documentCount > 0 ? 'secondary' : 'outline'}>
        {documentCount} doc{documentCount === 1 ? '' : 's'}
      </Badge>
    </div>
  );
}

export function ToggleChipsInput<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  function toggle(item: T) {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/60 hover:text-foreground'
            )}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InlineOptionTabs<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  const activeValue = value ?? options[0]?.value;

  return (
    <div
      className="grid gap-1 rounded-lg bg-muted p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = activeValue === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            className={cn(
              'h-8 rounded-md px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EditorModal({
  open,
  title,
  children,
  footer,
  onClose,
  size = 'md',
  expand = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg' | 'xl';
  expand?: boolean;
}) {
  if (!open) return null;

  const maxW = size === 'xl' ? 'max-w-6xl' : size === 'lg' ? 'max-w-5xl' : 'max-w-[46rem]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-3 py-4 sm:px-6 sm:py-8"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxW} rounded-lg bg-card text-card-foreground shadow-xl ring-1 ring-border`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-b bg-card px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label={`Fechar ${title}`} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className={cn('max-h-[calc(100vh-12rem)] overflow-y-auto overflow-x-hidden px-4 pt-4', expand && 'min-h-[calc(100vh-12rem)]')}>
          <div className="space-y-4">{children}</div>
        </div>
        {footer && (
          <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t bg-card px-4 py-3">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}

export function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">
        {count} registro{count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function SegmentedTabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <Badge variant="outline">
          {options.find((option) => option.value === value)?.count ?? 0}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              }`}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.7rem] ${
                  active ? 'bg-primary/10 text-primary' : 'bg-background text-muted-foreground'
                }`}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DetailItem({ label, value, className }: { label: string; value: string | string[]; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      {Array.isArray(value) ? (
        <div className="flex flex-wrap gap-1">
          {value.length > 0
            ? value.map((v) => (
                <span key={v} className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-xs font-medium leading-tight">
                  {v || '—'}
                </span>
              ))
            : <span className="text-sm font-medium">—</span>
          }
        </div>
      ) : (
        <p className="truncate text-sm font-medium">{value || '—'}</p>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function ProductQtyDetail({
  label,
  model,
  quantity,
}: {
  label: string;
  model: string;
  quantity: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-medium">{model || '—'}</p>
        <Badge variant="secondary" className="shrink-0">
          x{quantity}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function RemovingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
        <Skeleton className="h-4 w-4 rounded-full" />
        {label}
      </div>
    </div>
  );
}

export function RecordCardGrid({
  items,
  className,
}: {
  items: {
    id: string;
    title: string;
    description?: string;
    badges?: string[];
    details: [string, string | string[], true?][];
    media?: ReactNode;
    removing?: boolean;
    onEdit: () => void;
    onRemove: () => void;
    removeDescription?: string;
    onDeactivate?: () => void;
    deactivateDescription?: string;
  }[];
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-2', className)}>
      {items.map((item) => (
        <Card key={item.id} size="sm" className={cn('relative flex h-full flex-col', item.removing && 'opacity-70')}>
          {item.removing && <RemovingOverlay label="Removendo..." />}
          <CardHeader>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate uppercase">{item.title}</CardTitle>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              {item.badges && item.badges.length > 0 && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {item.badges.map((badge) => (
                    <Badge key={badge} variant={badge.includes('inativ') ? 'outline' : 'secondary'}>
                      {badge}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex-1 space-y-3">
              {item.details.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {item.details.map(([label, value, span]) => (
                    <DetailItem key={label} label={label} value={value || '—'} className={span ? 'col-span-2' : undefined} />
                  ))}
                </div>
              )}
              {item.media}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={item.onEdit} disabled={item.removing}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              {item.onDeactivate && (
                <ConfirmDeleteButton
                  ariaLabel={`Desativar ${item.title}`}
                  title={`Desativar ${item.title}?`}
                  description={
                    item.deactivateDescription ??
                    'O registro fica inativo e para de aparecer para os usuários, sem ser removido do cadastro.'
                  }
                  confirmLabel="Desativar"
                  icon={<EyeOff className="h-4 w-4" />}
                  disabled={item.removing}
                  onConfirm={item.onDeactivate}
                />
              )}
              <ConfirmDeleteButton
                ariaLabel={`Remover ${item.title}`}
                title={`Remover ${item.title}?`}
                description={item.removeDescription ?? 'Esse registro será removido do cadastro administrativo.'}
                confirmLabel="Remover"
                disabled={item.removing}
                onConfirm={item.onRemove}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CatalogLayout({
  title,
  count,
  formOpen,
  formTitle,
  newLabel = 'Novo',
  onNew,
  onClose,
  form,
  filter,
  search,
  items,
  expandForm = false,
}: {
  title: string;
  count: number;
  formOpen: boolean;
  formTitle: string;
  newLabel?: string;
  onNew: () => void;
  onClose: () => void;
  form: ReactNode;
  filter?: ReactNode;
  search?: ReactNode;
  items: Parameters<typeof RecordCardGrid>[0]['items'];
  expandForm?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title={title} count={count} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {search}
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" />
            {newLabel}
          </Button>
        </div>
      </div>

      {filter}

      <EditorModal open={formOpen} title={formTitle} onClose={onClose} expand={expandForm}>
        {form}
      </EditorModal>

      <RecordCardGrid items={items} />
    </div>
  );
}
