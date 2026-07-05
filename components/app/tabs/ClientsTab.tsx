'use client';

import { useState } from 'react';
import { Save, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Client } from '@/lib/types';
import { cn } from '@/lib/utils';

function emptyClientForm() {
  return { name: '', email: '', phone: '', document: '', notes: '' };
}

export function ClientsTab({
  clients,
  onAdd,
  onUpdate,
  onRemove,
}: {
  clients: Client[];
  onAdd: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  onUpdate: (
    id: string,
    partial: Partial<{ name: string; email: string; phone: string; document: string; notes: string }>
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyClientForm());
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  function openNew() {
    setEditingId(null);
    setForm(emptyClientForm());
    setActionError(null);
    setFormOpen(true);
  }

  function openEdit(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email,
      phone: client.phone,
      document: client.document,
      notes: client.notes,
    });
    setActionError(null);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      if (editingId) {
        await onUpdate(editingId, form);
      } else {
        await onAdd(form);
      }
      setFormOpen(false);
    } catch {
      setActionError('Não foi possível salvar o cliente. Verifique sua conexão e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingIds((current) => new Set(current).add(id));
    setActionError(null);
    try {
      await onRemove(id);
    } catch {
      setActionError('Não foi possível remover o cliente. Verifique sua conexão e tente novamente.');
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os clientes usados nos projetos.</p>
        </div>
        {!formOpen && (
          <Button onClick={openNew}>
            <UserRound className="h-4 w-4" />
            Novo cliente
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {actionError && (
            <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {actionError}
            </div>
          )}
          {!formOpen ? (
            clients.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum cliente cadastrado ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between',
                      removingIds.has(client.id) && 'opacity-60'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[client.email, client.phone, client.document].filter(Boolean).join(' · ') || 'Sem dados de contato'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(client)} disabled={removingIds.has(client.id)}>
                        Editar
                      </Button>
                      <ConfirmDeleteButton
                        ariaLabel={`Remover cliente ${client.name}`}
                        title="Remover cliente?"
                        description="Os projetos que usam esse cliente ficarão sem cliente associado."
                        confirmLabel="Remover"
                        disabled={removingIds.has(client.id)}
                        onConfirm={() => handleRemove(client.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="clientFormName">Nome</Label>
                <Input
                  id="clientFormName"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="clientFormEmail">Email</Label>
                  <Input
                    id="clientFormEmail"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="cliente@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientFormPhone">Telefone</Label>
                  <Input
                    id="clientFormPhone"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientFormDocument">CPF/CNPJ</Label>
                <Input
                  id="clientFormDocument"
                  value={form.document}
                  onChange={(event) => setForm({ ...form, document: event.target.value })}
                  placeholder="Documento do cliente"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientFormNotes">Observações</Label>
                <textarea
                  id="clientFormNotes"
                  className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:px-2.5 md:text-sm"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:flex sm:justify-end">
                <Button variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando...' : 'Salvar cliente'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
