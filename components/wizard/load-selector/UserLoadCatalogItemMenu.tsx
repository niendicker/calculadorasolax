'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserLoadCatalogItem } from '@/lib/types';

export function UserLoadCatalogItemMenu({
  item,
  onUpdate,
  onRemove,
}: {
  item: UserLoadCatalogItem;
  onUpdate: (id: string, partial: Partial<{ name: string; powerW: number; ipInRatio: number }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [view, setView] = useState<'menu' | 'edit' | 'confirm-delete'>('menu');
  const [editName, setEditName] = useState(item.name);
  const [editPower, setEditPower] = useState(String(item.powerW));
  const [editIpIn, setEditIpIn] = useState(String(item.ipInRatio));
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  function close() {
    setOpen(false);
    setView('menu');
  }

  // Gates the createPortal call below until after client mount — document
  // doesn't exist during SSR, so this can't be a lazy useState initializer
  // without causing a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const popRect = popoverRef.current?.getBoundingClientRect();
    if (!rect || !popRect) return;

    const gap = 8;
    const margin = 12;

    let left = rect.right - popRect.width;
    left = Math.min(Math.max(margin, left), window.innerWidth - popRect.width - margin);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top =
      spaceBelow >= popRect.height || spaceBelow >= spaceAbove ? rect.bottom + gap : rect.top - gap - popRect.height;
    top = Math.min(Math.max(margin, top), window.innerHeight - popRect.height - margin);

    setPosition({ top, left });
  }, [open, view]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function toggleMenu() {
    if (!open) {
      setEditName(item.name);
      setEditPower(String(item.powerW));
      setEditIpIn(String(item.ipInRatio));
      setView('menu');
    }
    setOpen((current) => !current);
  }

  async function handleSave() {
    if (!editName.trim() || !editPower) return;
    setSaving(true);
    try {
      await onUpdate(item.id, {
        name: editName.trim(),
        powerW: Number(editPower) || item.powerW,
        ipInRatio: Number(editIpIn) || 1,
      });
      close();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await onRemove(item.id);
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Opções de ${item.name}`}
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`Opções de ${item.name}`}
            className="fixed z-[1000] w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.top === 0 && position.left === 0 ? 'hidden' : 'visible',
            }}
          >
            {view === 'menu' && (
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setView('edit')}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setView('confirm-delete')}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              </div>
            )}

            {view === 'edit' && (
              <div className="space-y-2 p-1">
                <div>
                  <Label htmlFor={`edit-name-${item.id}`}>Nome</Label>
                  <Input id={`edit-name-${item.id}`} value={editName} onChange={(event) => setEditName(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`edit-power-${item.id}`}>Potência (VA)</Label>
                    <Input
                      id={`edit-power-${item.id}`}
                      type="number"
                      min={1}
                      value={editPower}
                      onChange={(event) => setEditPower(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edit-ipin-${item.id}`}>IP/IN</Label>
                    <Input
                      id={`edit-ipin-${item.id}`}
                      type="number"
                      min={1}
                      step={0.1}
                      value={editIpIn}
                      onChange={(event) => setEditIpIn(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setView('menu')}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={handleSave} disabled={saving || !editName.trim() || !editPower}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}

            {view === 'confirm-delete' && (
              <div className="space-y-2 p-1">
                <p className="text-sm font-medium">Remover carga?</p>
                <p className="text-xs text-muted-foreground">
                  &quot;{item.name}&quot; sai do seu catálogo pessoal. Não afeta projetos que já a usam.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setView('menu')}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
                    Remover
                  </Button>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
