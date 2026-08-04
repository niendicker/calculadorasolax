'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isLimitError } from '@/lib/limits';
import type { Client } from '@/lib/types';
import { formatPhone } from '../../helpers';

/** Minimal client form (name + phone only) opened right from the project
 * draft's client picker, so creating a project for a brand-new client
 * doesn't require leaving the draft to the full Clientes page and coming
 * back. Email, document and notes can still be filled in later there. */
export function QuickAddClientModal({
  open,
  onClose,
  onAdd,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  onCreated: (client: Client) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName('');
    setPhone('');
    setError(null);
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const client = await onAdd({ name, phone, email: '', document: '', notes: '' });
      onCreated(client);
    } catch (err) {
      setError(isLimitError(err) ? err.message : 'Não foi possível salvar o cliente. Tente novamente.');
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Novo cliente"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <form
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
        onSubmit={(event) => { event.preventDefault(); void handleSave(); }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-medium">Novo cliente</p>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar" disabled={saving} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="quickClientName">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quickClientName"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quickClientPhone">Telefone</Label>
            <Input
              id="quickClientPhone"
              value={phone}
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              placeholder="(00) 00000-0000"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Você pode completar e-mail, documento e observações depois em Clientes.
          </p>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t p-3">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving ? 'Salvando...' : 'Salvar cliente'}
          </Button>
        </div>
      </form>
    </div>,
    document.body
  );
}
