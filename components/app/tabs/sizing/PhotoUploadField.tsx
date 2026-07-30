'use client';

import { useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PhotoUploadField({
  label,
  photoUrl,
  slot,
  onUploadPhoto,
  onChange,
}: {
  label: string;
  photoUrl: string | null;
  slot: 'ats' | 'microgrid' | 'generator';
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await onUploadPhoto(file, slot);
      onChange(url);
    } catch {
      setError('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploading(false);
    }
  }

  const inputId = `photo-upload-${slot}`;

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border bg-card p-3">
        {photoUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={label}
              className="h-20 w-20 shrink-0 rounded-md border bg-background object-cover"
            />
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className="flex flex-wrap gap-2">
                <label htmlFor={inputId} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}>
                  Trocar foto
                </label>
                <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input py-6 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-muted/60 hover:text-foreground"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="font-medium text-foreground">{uploading ? 'Enviando...' : 'Anexar foto'}</span>
            {!uploading && <span className="text-xs">{label}</span>}
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
