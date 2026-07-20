'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ProductMedia } from './types';

/** These cards are narrow (three per row in a sidebar), so a value with more
 * digits than the common case ("0.00") can overflow the fixed text-xl size.
 * Since it's plain digits/dot (no wrapping opportunity), shrink by length
 * instead of measuring — cheaper than a resize observer and good enough for
 * the range of lengths a formatted number normally takes. */
function valueTextSizeClass(value: string) {
  if (value.length >= 10) return 'text-xs';
  if (value.length >= 8) return 'text-sm';
  if (value.length >= 6) return 'text-base';
  return 'text-xl';
}

export function Metric({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: LucideIcon;
  /** Tints the card toward the primary color — used to visually set the
   * calculated Solução metrics apart from the Resumo tab's target values,
   * since both render the same Nominal/Pico/Energia layout otherwise. */
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2 py-2.5',
        accent ? 'border-primary/30 bg-primary/5' : 'bg-background'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1 text-[0.7rem] whitespace-nowrap',
          accent ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span>{label}</span>
      </div>
      <div className="mt-1">
        <p className={cn('break-all font-bold leading-tight tabular-nums', valueTextSizeClass(value))}>{value}</p>
        {unit && <p className="text-xs font-normal whitespace-nowrap text-muted-foreground">{unit}</p>}
      </div>
    </div>
  );
}

export function CollapsibleSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
          />
          {title}
        </span>
        {!open && <span className="min-w-0 truncate text-right text-xs text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="space-y-3 border-t p-3">{children}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Pesquisar...',
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(value.length > 0);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="icon" aria-label={ariaLabel ?? placeholder} onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!value) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('');
            setOpen(false);
          }
        }}
        className="pl-8 pr-8 md:pl-8 md:pr-8"
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar pesquisa"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Requirement({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={cn('flex items-center gap-2', done && 'text-foreground')}>
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full bg-muted-foreground/50',
          done && 'bg-accent'
        )}
      />
      <span>{label}</span>
    </li>
  );
}

export function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

export function ReportInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th className="w-36 border bg-muted px-3 py-2 text-left font-medium">{label}</th>
      <td className="border px-3 py-2">{value}</td>
    </tr>
  );
}

export function ProjectListSkeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando projetos">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-background p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64 max-w-full" />
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BatteryCardsSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-label="Carregando baterias">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[72px_1fr]">
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            <Skeleton className="h-3 w-28" />
            <div className="flex gap-1">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SolutionSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4" aria-label="Calculando solução">
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export function DocPreviewModal({ doc, onClose }: { doc: ProductDocument | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!doc) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [doc, onClose]);

  if (!doc || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={doc.name || 'Documento'}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium">{doc.name || 'Documento'}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Abrir em nova aba
            </a>
            <Button variant="ghost" size="icon-sm" aria-label="Fechar pré-visualização" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <iframe src={doc.url} className="h-full w-full" title={doc.name || 'Documento'} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ImagePreviewModal({
  image,
  onClose,
}: {
  image: { url: string; alt: string } | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!image) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [image, onClose]);

  if (!image || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium">{image.alt}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Abrir em nova aba
            </a>
            <Button variant="ghost" size="icon-sm" aria-label="Fechar pré-visualização" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ProductAttachments({
  media,
  onPreview,
  onPreviewImage,
  inline = false,
}: {
  media: ProductMedia | undefined;
  onPreview: (doc: ProductDocument) => void;
  onPreviewImage: (image: { url: string; alt: string }) => void;
  inline?: boolean;
}) {
  if (!media || (!media.imageUrl && media.documents.length === 0)) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', inline ? '' : 'mt-2')}>
      {media.imageUrl && (
        <button
          type="button"
          onClick={() => onPreviewImage({ url: media.imageUrl as string, alt: media.model })}
          className="shrink-0 rounded border bg-background transition hover:border-primary/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media.imageUrl}
            alt={media.model}
            className="h-14 w-20 object-contain p-1"
          />
        </button>
      )}
      {media.documents.map((document) => (
        <button
          key={`${media.model}-${document.url}`}
          type="button"
          onClick={() => onPreview(document)}
          className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
        >
          {document.name || 'Documento'}
        </button>
      ))}
    </div>
  );
}

export function CatalogEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function CatalogProductCard({
  fallbackIcon,
  model,
  imageUrl,
  documents,
  badges,
  specs,
  description,
  onPreviewImage,
  onPreviewDoc,
  stockControl,
}: {
  fallbackIcon: React.ReactNode;
  model: string;
  imageUrl: string | null;
  documents: ProductDocument[];
  badges?: string[];
  specs?: [string, string][];
  description?: string | null;
  onPreviewImage: (image: { url: string; alt: string }) => void;
  onPreviewDoc: (doc: ProductDocument) => void;
  stockControl?: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 text-left sm:grid-cols-[72px_1fr]">
      <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
        {imageUrl ? (
          <button
            type="button"
            className="flex h-full w-full cursor-zoom-in items-center justify-center transition hover:bg-muted/70"
            onClick={() => onPreviewImage({ url: imageUrl, alt: model })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={model} className="h-full w-full object-contain p-2" />
          </button>
        ) : (
          fallbackIcon
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-semibold leading-snug">{model}</p>
          {badges && badges.length > 0 && (
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {badges.map((badge) => (
                <Badge key={badge} variant="secondary">
                  {badge}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {specs && specs.length > 0 && (
          <div className="grid gap-1 text-xs text-muted-foreground">
            {specs.map(([label, value]) => (
              <span key={label}>
                {label}: {value}
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap gap-1">
          {documents.length > 0 ? (
            documents.map((document) => (
              <button
                key={`${model}-${document.url}`}
                type="button"
                className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs text-primary hover:bg-primary/10"
                onClick={() => onPreviewDoc(document)}
              >
                {document.name || 'Documento'}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Sem anexos</span>
          )}
        </div>
        {stockControl}
      </div>
    </div>
  );
}
