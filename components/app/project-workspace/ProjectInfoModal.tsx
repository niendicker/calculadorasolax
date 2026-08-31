'use client';

// Generic "edit one identification field" dialog — extracted out of
// ProjectWorkspace.tsx (same reasoning as ProjectWorkspaceShell and
// ProjectInfoEditor: it only touches ProjectInfo/Client, nothing
// residential-specific) so the C&I workspace can reuse it as-is for its own
// "Visão geral" summary rows instead of duplicating a focus-trapped modal.
// Pure extraction: markup, classes and behavior are unchanged.

import { useEffect, useRef, useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { Client, ProjectInfo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AddressFields } from '../address-fields';

export type ProjectInfoEditField = 'name' | 'client' | 'address' | null;

export function ProjectInfoModal({ field, projectInfo, clients, onClose, onSave }: {
  field: ProjectInfoEditField;
  projectInfo: ProjectInfo;
  clients: Client[];
  onClose: () => void;
  onSave: (partial: Partial<ProjectInfo>) => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [name, setName] = useState(projectInfo.name);
  const [clientId, setClientId] = useState(projectInfo.clientId ?? '');
  const [address, setAddress] = useState(projectInfo.address);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!field) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

    const getFocusableElements = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) ?? []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => getFocusableElements()[0]?.focus());

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [field]);

  if (!field) return null;

  const title = field === 'name' ? 'Nome da instalação' : field === 'client' ? 'Cliente' : 'Endereço da instalação';
  const description = field === 'name'
    ? 'Atualize o nome usado para identificar esta instalação.'
    : field === 'client'
      ? 'Selecione o cliente relacionado a esta instalação.'
      : 'Atualize os dados do endereço da instalação.';
  const save = () => {
    if (field === 'name') onSave({ name });
    if (field === 'client') onSave({ clientId: clientId || null });
    if (field === 'address') onSave({ address });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[1px]" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label={`Fechar edição de ${title.toLocaleLowerCase('pt-BR')}`} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-info-modal-title" aria-describedby="project-info-modal-description" className={cn('relative z-10 my-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border bg-card text-card-foreground shadow-2xl', field === 'address' ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-start justify-between gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h2 id="project-info-modal-title" className="text-lg font-semibold tracking-tight">{title}</h2>
              <p id="project-info-modal-description" className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Fechar edição de ${title.toLocaleLowerCase('pt-BR')}`} onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        <div className="p-5 sm:p-6">
          {field === 'name' && (
            <div className="space-y-1.5">
              <Label htmlFor="workspaceProjectNameModal">Nome da instalação</Label>
              <Input id="workspaceProjectNameModal" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!name.trim()} autoFocus />
              {!name.trim() && <p className="text-xs text-destructive" role="alert">Informe um nome para a instalação.</p>}
            </div>
          )}
          {field === 'client' && (
            <div className="space-y-1.5">
              <Label htmlFor="workspaceProjectClientModal">Cliente</Label>
              <Select id="workspaceProjectClientModal" value={clientId} onChange={(event) => setClientId(event.target.value)} autoFocus>
                <option value="">Sem cliente selecionado</option>
                {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </div>
          )}
          {field === 'address' && (
            <AddressFields address={address} onChange={(partial) => setAddress((current) => ({ ...current, ...partial }))} idPrefix="workspaceProjectAddressModal" />
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={save} disabled={field === 'name' && !name.trim()}>Salvar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
