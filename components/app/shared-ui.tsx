'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductDocument } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { ProductMedia } from './types';

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
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
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-8 md:pl-8"
      />
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
