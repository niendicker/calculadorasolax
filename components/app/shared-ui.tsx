'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ClipboardCopy, FileText, Lightbulb, Paperclip, Search, X, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductDocument } from '@/lib/types';
import { getGuideContent } from '@/content/guide';
import { cn } from '@/lib/utils';
import type { ProductMedia } from './types';

const microgridGuide = getGuideContent('pt').sections.find((section) => section.id === 'microgrid');

export function MicrogridGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || !microgridGuide) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="microgrid-guide-dialog-title"
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Guia básico</p>
            <h2 id="microgrid-guide-dialog-title" className="mt-1 font-heading text-xl font-semibold">
              {microgridGuide.title}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar Saiba mais" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-5 text-sm leading-6">
          <p className="text-muted-foreground">{microgridGuide.intro}</p>
          {microgridGuide.attention && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              <p><span className="font-semibold">Atenção:</span> {microgridGuide.attention}</p>
            </div>
          )}
          <ul className="space-y-3 text-muted-foreground">
            {microgridGuide.details.map((detail) => (
              <li key={detail} className="flex items-start gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{detail}</span>
              </li>
            ))}
          </ul>
          {microgridGuide.tips && (
            <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                Resumo
              </p>
              <ul className="mt-2 space-y-1 pl-6">
                {microgridGuide.tips.map((tip) => <li key={tip} className="list-disc">{tip}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

/** Not in lucide-react (a generic icon set with no brand logos) — a small
 * local glyph instead of pulling in a whole brand-icon library for one icon,
 * used on every "Compartilhar cotação" button that shares to WhatsApp. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.32a8.188 8.188 0 0 1-1.26-4.38c.01-4.54 3.7-8.24 8.25-8.24M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.86-.87 2.07 0 1.22.89 2.39 1 2.56.14.17 1.76 2.67 4.25 3.73.59.27 1.05.42 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.16-.48-.27-.25-.14-1.47-.74-1.69-.82-.23-.08-.37-.12-.56.12-.16.25-.64.81-.78.97-.15.17-.29.19-.53.07-.26-.13-1.06-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.24-.02-.36.11-.49.11-.11.27-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.11-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43-.14 0-.3-.01-.47-.01z" />
    </svg>
  );
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

export function SupplyLoadingSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando fornecedores e ofertas">
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-lg border bg-card p-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocPreviewModal({ doc, onClose }: { doc: ProductDocument | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <div className="relative min-h-0 flex-1 overflow-auto bg-background p-4">
          <Image src={image.url} alt={image.alt} fill sizes="90vw" className="object-contain" />
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Shows a share/report message as a single-view preview before it's copied,
 * so the user reads exactly what will land on the clipboard instead of it
 * being copied silently on click. */
export function SharePreviewModal({ text, onClose }: { text: string | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!text) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCopied(false);
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [text, onClose]);

  if (!text || !mounted) return null;

  async function handleCopy() {
    await navigator.clipboard.writeText(text as string);
    setCopied(true);
    setTimeout(onClose, 700);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Prévia da mensagem"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-medium">Prévia da mensagem</p>
          <Button variant="ghost" size="icon-sm" aria-label="Fechar pré-visualização" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{text}</pre>
        </div>
        <div className="shrink-0 border-t p-3">
          <Button size="sm" className="w-full" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied ? 'Dados copiados!' : 'Copiar'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** The product's photo alone — kept separate from ProductAttachments so
 * callers can lay the image out apart from the name/quantity/documents
 * (e.g. a right-hand image column next to a left-hand text column). */
export function ProductImage({
  media,
  onPreviewImage,
  className,
}: {
  media: ProductMedia | undefined;
  onPreviewImage: (image: { url: string; alt: string }) => void;
  className?: string;
}) {
  if (!media?.imageUrl) return null;

  return (
    <button
      type="button"
      onClick={() => onPreviewImage({ url: media.imageUrl as string, alt: media.model })}
      className={cn(
        'relative h-24 overflow-hidden rounded-lg bg-background transition sm:h-full',
        className
      )}
    >
      <Image src={media.imageUrl} alt={media.model} fill sizes="160px" className="object-contain p-2" />
    </button>
  );
}

export function ProductAttachments({
  media,
  onPreview,
  inline = false,
  className,
}: {
  media: ProductMedia | undefined;
  onPreview: (doc: ProductDocument) => void;
  inline?: boolean;
  className?: string;
}) {
  if (!media || media.documents.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', inline ? '' : 'mt-2', className)}>
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

export function ProductDocumentsList({
  model,
  documents,
  onPreviewDoc,
  className,
  compact = false,
}: {
  model: string;
  documents: ProductDocument[];
  onPreviewDoc: (doc: ProductDocument) => void;
  className?: string;
  compact?: boolean;
}) {
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const visibleDocuments = showAllDocuments ? documents : documents.slice(0, 2);
  const hiddenDocumentsCount = documents.length - visibleDocuments.length;

  if (documents.length === 0) return null;

  return (
    <div className={cn('min-w-0 border-t pt-2', compact && 'border-border/40 pt-2.5', className)}>
      <div
        className={cn(
          'mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
          compact && 'mb-2 text-[11px] uppercase tracking-[0.03em] text-muted-foreground/85'
        )}
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Documentos ({documents.length})</span>
      </div>
      <div className={cn('grid gap-1.5 sm:grid-cols-2', showAllDocuments && 'max-h-24 overflow-y-auto pr-1')}>
        {visibleDocuments.map((document) => (
          <button
            key={`${model}-${document.url}`}
            type="button"
            title={document.name || 'Documento'}
            className={cn(
              'flex min-w-0 w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-primary transition hover:bg-primary/10',
              compact &&
                'rounded-lg border border-border/45 bg-background/90 px-2.5 py-2 text-[12px] text-foreground hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
            )}
            onClick={() => onPreviewDoc(document)}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{document.name || 'Documento'}</span>
          </button>
        ))}
      </div>
      {documents.length > 2 && (
        <button
          type="button"
          className={cn(
            'mt-1 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground',
            compact && 'mt-1.5 px-0 text-[11px] uppercase tracking-[0.03em]'
          )}
          onClick={() => setShowAllDocuments((current) => !current)}
        >
          {showAllDocuments ? 'Mostrar menos' : `Ver mais ${hiddenDocumentsCount}`}
        </button>
      )}
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
  nickname,
  imageUrl,
  documents,
  badges,
  statusBadges,
  specs,
  description,
  onPreviewImage,
  onPreviewDoc,
  stockControl,
  topRightAction,
  compactContent = false,
  appearance = 'default',
}: {
  fallbackIcon: React.ReactNode;
  model: string;
  /** Optional friendly name set by the admin — shown as the card's title in
   *  place of the raw model code, with the model kept underneath as a small
   *  caption so it's still visible. */
  nickname?: string | null;
  imageUrl: string | null;
  documents: ProductDocument[];
  badges?: string[];
  statusBadges?: string[];
  specs?: [string, string][];
  description?: string | null;
  onPreviewImage: (image: { url: string; alt: string }) => void;
  onPreviewDoc: (doc: ProductDocument) => void;
  stockControl?: React.ReactNode;
  /** Pinned to the card's top-right corner (e.g. a delete button) — separate
   * from stockControl, which sits at the bottom with the rest of the card's
   * own actions. */
  topRightAction?: React.ReactNode;
  /** Keeps portfolio cards stable when friendly names or model codes are long. */
  compactContent?: boolean;
  appearance?: 'default' | 'summary';
}) {
  const summary = appearance === 'summary';

  return (
    <div
      className={cn(
        'relative grid gap-3 rounded-xl border bg-card p-3 text-left shadow-sm sm:grid-cols-[112px_1fr]',
        summary && 'gap-4 rounded-2xl border-border/60 p-4 shadow-none'
      )}
    >
      {topRightAction && <div className="absolute right-2 top-2 z-10">{topRightAction}</div>}
      <div
        className={cn(
          'flex h-28 items-center justify-center overflow-hidden rounded-lg',
          imageUrl ? 'bg-card' : 'border bg-card',
          summary && 'h-32 rounded-xl bg-muted/15 sm:h-full sm:min-h-32'
        )}
      >
        {imageUrl ? (
          <button
            type="button"
            className={cn('relative h-full w-full cursor-zoom-in transition hover:opacity-90', summary && 'p-2')}
            onClick={() => onPreviewImage({ url: imageUrl, alt: model })}
          >
            <Image src={imageUrl} alt={model} fill sizes="112px" className="object-contain" />
          </button>
        ) : (
          fallbackIcon
        )}
      </div>
      <div className={cn('min-w-0 space-y-1.5', topRightAction && 'pr-9', summary && 'space-y-2.5 self-start')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p
              className={cn(
                'min-w-0 break-words text-base font-semibold leading-snug',
                compactContent && 'line-clamp-2',
                summary && 'text-lg font-semibold uppercase leading-tight tracking-[0.01em]'
              )}
              title={nickname || model}
            >
              {nickname || model}
            </p>
            {statusBadges && statusBadges.length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-1">
                {statusBadges.map((badge) => (
                  <Badge
                    key={badge}
                    variant="outline"
                    className={cn(summary && 'border-primary/20 bg-primary/5 text-primary')}
                  >
                    {badge}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        {nickname && (
          <p
            className={cn(
              'mt-0.5 break-words text-xs text-muted-foreground',
              compactContent && 'line-clamp-2',
              summary && 'mt-1 text-[11px] font-normal uppercase tracking-[0.03em] text-muted-foreground/80'
            )}
            title={model}
          >
            {model}
          </p>
        )}
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {badges.map((badge) => (
              <Badge
                key={badge}
                variant="secondary"
                className={cn(summary && 'border-transparent bg-muted/80 font-normal text-muted-foreground')}
              >
                {badge}
              </Badge>
            ))}
          </div>
        )}
        {description && (
          <p className={cn('text-xs leading-5 text-muted-foreground', summary && 'text-[12px] leading-5 text-muted-foreground/90')}>
            {description}
          </p>
        )}
        {specs && specs.length > 0 && (
          <div
            className={cn(
              'overflow-hidden rounded-md border bg-muted/10 text-xs',
              summary && 'rounded-lg border-border/45 bg-muted/[0.04]'
            )}
          >
            {specs.map(([label, value], index) => (
              <div
                key={label}
                className={cn(
                  'grid grid-cols-[minmax(4.5rem,0.65fr)_minmax(0,1.35fr)] gap-2 px-2.5 py-1.5',
                  index > 0 && 'border-t',
                  summary && 'gap-3 px-3 py-2',
                  summary && index > 0 && 'border-border/35'
                )}
              >
                <span
                  className={cn(
                    'font-medium text-muted-foreground',
                    summary && 'text-[11px] uppercase tracking-[0.02em] text-muted-foreground/85'
                  )}
                >
                  {label}
                </span>
                <span className={cn('text-foreground', summary && 'text-[13px] font-medium leading-5')}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <ProductDocumentsList model={model} documents={documents} onPreviewDoc={onPreviewDoc} compact={summary} className="sm:col-span-2" />
      {stockControl && <div className="min-w-0 sm:col-span-2">{stockControl}</div>}
    </div>
  );
}
