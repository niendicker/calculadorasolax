import { useState } from 'react';
import type { ProductEditorTab } from '../types';

/** The open/tab/openNew/openEdit skeleton shared by every catalog editor
 * (InvertersEditor, BatteriesEditor, AccessoriesEditor): each opens the form
 * panel reset to the "general" tab, whether starting a new row or editing an
 * existing one. Each editor still owns its own `form`/`setForm` state (from
 * AdminPanel) and its own filter state — this only covers what was
 * previously copy-pasted identically across all three. */
export function useCatalogEditorForm<Row extends { id?: string }>(
  emptyForm: Partial<Row>,
  setForm: (value: Partial<Row>) => void
) {
  const [formOpen, setFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<ProductEditorTab>('general');

  function openNew() {
    setForm(emptyForm);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function openEdit(row: Row) {
    setForm(row);
    setActiveFormTab('general');
    setFormOpen(true);
  }

  function close() {
    setFormOpen(false);
  }

  return { formOpen, activeFormTab, setActiveFormTab, openNew, openEdit, close };
}
