'use client';

import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, FolderOpen, Save, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDeleteButton, ConfirmDeleteModalButton } from '@/components/ui/confirm-delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCOUNT_LIMITS, isLimitError } from '@/lib/limits';
import type { Client, SavedProject } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDocument, formatPhone, maskDocument } from '../helpers';
import { PageHeader } from '../shell/slots';
import { SearchInput } from '../shared-ui';
import { projectStatusLabels } from '../types';

function emptyClientForm() {
  return { name: '', email: '', phone: '', document: '', notes: '' };
}

/** CPF/CNPJ shown masked by default (see maskDocument) with a click-to-reveal
 *  toggle — unlike phone/email, a document number is sensitive enough that a
 *  glance at a shared screen shouldn't expose the whole thing, but the
 *  installer still needs a way to read/copy it when actually required. */
function MaskedDocumentReveal({ document }: { document: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      {revealed ? document : maskDocument(document)}
      <button
        type="button"
        aria-label={revealed ? 'Ocultar documento' : 'Mostrar documento'}
        onClick={(event) => {
          event.stopPropagation();
          setRevealed((current) => !current);
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </span>
  );
}

export function ClientsTab({
  clients,
  savedProjects,
  onAdd,
  onUpdate,
  onRemove,
  onOpenProject,
}: {
  clients: Client[];
  savedProjects: SavedProject[];
  onAdd: (input: { name: string; email: string; phone: string; document: string; notes: string }) => Promise<Client>;
  onUpdate: (
    id: string,
    partial: Partial<{ name: string; email: string; phone: string; document: string; notes: string }>
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Loads the project into the wizard and switches to the Projeto tab —
   *  reached from a client's own project list, so a client's history doesn't
   *  require hunting for their name over on Projeto. */
  onOpenProject: (id: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyClientForm());
  const [initialForm, setInitialForm] = useState(emptyClientForm());
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [documentRevealed, setDocumentRevealed] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredClients = clients.filter((client) =>
    [client.name, client.email, client.phone, client.document].some((field) =>
      field.toLowerCase().includes(normalizedSearch)
    )
  );

  function openNew() {
    setEditingId(null);
    const next = emptyClientForm();
    setForm(next);
    setInitialForm(next);
    setActionError(null);
    setDocumentRevealed(false);
    setFormOpen(true);
  }

  function openEdit(client: Client) {
    setEditingId(client.id);
    const next = {
      name: client.name,
      email: client.email,
      phone: client.phone,
      document: client.document,
      notes: client.notes,
    };
    setForm(next);
    setInitialForm(next);
    setActionError(null);
    setDocumentRevealed(false);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
  }

  const isDirty = Object.keys(form).some((key) => form[key as keyof typeof form] !== initialForm[key as keyof typeof initialForm]);
  const atClientLimit = clients.length >= ACCOUNT_LIMITS.clients;

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
    } catch (error) {
      setActionError(
        isLimitError(error) ? error.message : 'Não foi possível salvar o cliente. Verifique sua conexão e tente novamente.'
      );
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
      const message = 'Não foi possível remover o cliente. Verifique sua conexão e tente novamente.';
      setActionError(message);
      throw new Error(message);
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
      <PageHeader>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Clientes ({clients.length}/{ACCOUNT_LIMITS.clients})
          </h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os clientes usados nos projetos.</p>
        </div>
        {!formOpen && (
          <Button onClick={openNew} disabled={atClientLimit}>
            <UserRound className="h-4 w-4" />
            Novo cliente
          </Button>
        )}
      </PageHeader>

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
              <div className="space-y-3">
                <div className="max-w-xs">
                  <SearchInput value={search} onChange={setSearch} placeholder="Pesquisar cliente..." />
                </div>
                {filteredClients.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhum cliente encontrado para essa pesquisa.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredClients.map((client) => {
                      const projects = savedProjects.filter((project) => project.clientId === client.id);
                      const expanded = expandedClientId === client.id;
                      return (
                        <div
                          key={client.id}
                          className={cn(
                            'rounded-lg border bg-background',
                            removingIds.has(client.id) && 'opacity-60'
                          )}
                        >
                          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium">{client.name}</p>
                              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                {[client.email, client.phone].filter(Boolean).length > 0 && (
                                  <span>{[client.email, client.phone].filter(Boolean).join(' · ')}</span>
                                )}
                                {client.document && (
                                  <>
                                    {(client.email || client.phone) && <span>·</span>}
                                    <MaskedDocumentReveal document={client.document} />
                                  </>
                                )}
                                {!client.email && !client.phone && !client.document && <span>Sem dados de contato</span>}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {projects.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-expanded={expanded}
                                  onClick={() => setExpandedClientId(expanded ? null : client.id)}
                                >
                                  <FolderOpen className="h-4 w-4" />
                                  {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
                                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(client)}
                                disabled={removingIds.has(client.id)}
                              >
                                Editar
                              </Button>
                              <ConfirmDeleteModalButton
                                ariaLabel={`Excluir cliente ${client.name}`}
                                itemName={client.name}
                                itemType="cliente"
                                label="Excluir"
                                disabled={removingIds.has(client.id)}
                                onConfirm={() => handleRemove(client.id)}
                              />
                            </div>
                          </div>
                          {expanded && projects.length > 0 && (
                            <div className="space-y-1.5 border-t p-3">
                              {projects.map((project) => (
                                <div
                                  key={project.id}
                                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate">{project.name}</span>
                                    <Badge variant="outline" className="shrink-0 text-[0.65rem]">
                                      {projectStatusLabels[project.status]}
                                    </Badge>
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 shrink-0 px-2 text-xs"
                                    onClick={() => onOpenProject(project.id)}
                                  >
                                    Abrir
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="clientFormName">
                  Nome <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="clientFormName"
                  autoFocus
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
                    onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientFormDocument">CPF/CNPJ</Label>
                <div className="relative">
                  <Input
                    id="clientFormDocument"
                    type={documentRevealed ? 'text' : 'password'}
                    autoComplete="off"
                    className="pr-10"
                    value={form.document}
                    onChange={(event) => setForm({ ...form, document: formatDocument(event.target.value) })}
                    placeholder="Documento do cliente"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={documentRevealed ? 'Ocultar documento' : 'Mostrar documento'}
                    onClick={() => setDocumentRevealed((current) => !current)}
                  >
                    {documentRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
                {isDirty ? (
                  <ConfirmDeleteButton
                    ariaLabel="Descartar alterações do cliente"
                    label="Cancelar"
                    title="Descartar alterações?"
                    description="Os dados preenchidos neste formulário serão perdidos."
                    confirmLabel="Descartar"
                    triggerVariant="outline"
                    disabled={saving}
                    onConfirm={closeForm}
                  />
                ) : (
                  <Button type="button" variant="ghost" disabled={saving} onClick={closeForm}>
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={!form.name.trim() || saving}>
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando...' : 'Salvar cliente'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
