'use client';

import { useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserLoadCatalogItem } from '@/lib/types';
import { CatalogEmptyState } from '../shared-ui';

export function MyLoadsTab({
  userLoadCatalog,
  onAdd,
  onUpdate,
  onRemove,
}: {
  userLoadCatalog: UserLoadCatalogItem[];
  onAdd: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  onUpdate: (id: string, partial: Partial<{ name: string; powerW: number; ipInRatio: number }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas Cargas</h1>
        <p className="text-sm text-muted-foreground">
          Cargas que você cadastrou manualmente durante o dimensionamento, salvas para reutilizar em outros projetos.
        </p>
      </div>
      <UserLoadCatalogSection items={userLoadCatalog} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} />
    </div>
  );
}

function UserLoadCatalogSection({
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  items: UserLoadCatalogItem[];
  onAdd: (input: { name: string; powerW: number; ipInRatio: number }) => Promise<void>;
  onUpdate: (id: string, partial: Partial<{ name: string; powerW: number; ipInRatio: number }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [powerW, setPowerW] = useState('');
  const [ipInRatio, setIpInRatio] = useState('1');
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setName('');
    setPowerW('');
    setIpInRatio('1');
    setActionError(null);
    setAddOpen(true);
  }

  function openEdit(item: UserLoadCatalogItem) {
    setAddOpen(false);
    setEditingId(item.id);
    setName(item.name);
    setPowerW(String(item.powerW));
    setIpInRatio(String(item.ipInRatio));
    setActionError(null);
  }

  function closeForm() {
    setAddOpen(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      if (editingId) {
        await onUpdate(editingId, {
          name,
          powerW: Number(powerW) || 0,
          ipInRatio: Number(ipInRatio) || 1,
        });
      } else {
        await onAdd({
          name,
          powerW: Number(powerW) || 0,
          ipInRatio: Number(ipInRatio) || 1,
        });
      }
      closeForm();
    } catch {
      setActionError('Não foi possível salvar a carga. Verifique sua conexão e tente novamente.');
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
      setActionError('Não foi possível remover a carga. Verifique sua conexão e tente novamente.');
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  const formCard = (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-load-name">Nome</Label>
        <Input id="new-load-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do equipamento" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-load-power">Potência (VA)</Label>
          <Input
            id="new-load-power"
            type="number"
            min={1}
            value={powerW}
            onChange={(event) => setPowerW(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-load-ipin">IP/IN</Label>
          <Input
            id="new-load-ipin"
            type="number"
            min={1}
            step={0.1}
            value={ipInRatio}
            onChange={(event) => setIpInRatio(event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:flex sm:justify-end">
        <Button variant="ghost" size="sm" onClick={closeForm}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        {!addOpen && !editingId && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Adicionar carga
          </Button>
        )}
      </div>

      {addOpen && formCard}

      {items.length === 0 && !addOpen ? (
        <CatalogEmptyState label="Nenhuma carga cadastrada ainda. Clique em “Adicionar carga” ou crie uma na aba Manual do Dimensionamento." />
      ) : (
        <div className="space-y-2">
          {items.map((item) =>
            editingId === item.id ? (
              <div key={item.id}>{formCard}</div>
            ) : (
              <div key={item.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.powerW} VA nominal · IP/IN {item.ipInRatio}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)} disabled={removingIds.has(item.id)}>
                      Editar
                    </Button>
                    <ConfirmDeleteButton
                      ariaLabel={`Remover carga ${item.name}`}
                      title="Remover carga?"
                      description="Essa carga sai do seu catálogo pessoal. Não afeta projetos que já a usam."
                      confirmLabel="Remover"
                      disabled={removingIds.has(item.id)}
                      onConfirm={() => handleRemove(item.id)}
                    />
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
