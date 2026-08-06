'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ShoppingCart } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Solution } from '@/lib/types';

export interface ImportCandidate {
  id: string;
  name: string;
  solution: Solution;
}

/** Popup listing every project with a calculated solution, in the same
 *  fixed/portaled popover pattern as `AddProductCard` (MyStockTab) — a
 *  project whose items don't all have an offer from the supplier that would
 *  actually be used is shown disabled with a tooltip explaining what's
 *  missing, instead of only failing after the fact. */
export function ImportProjectPicker({
  candidates,
  checkCompatibility,
  onImport,
}: {
  candidates: ImportCandidate[];
  checkCompatibility: (solution: Solution) => { compatible: boolean; missing: string[] };
  onImport: (candidate: ImportCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

    let left = rect.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - popRect.width - margin);

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    let top =
      spaceBelow >= popRect.height || spaceBelow >= spaceAbove ? rect.bottom + gap : rect.top - gap - popRect.height;
    top = Math.min(Math.max(margin, top), window.innerHeight - popRect.height - margin);

    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleSelect(candidate: ImportCandidate) {
    onImport(candidate);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={buttonVariants({ variant: 'outline' })}
      >
        <ShoppingCart className="h-4 w-4" />
        Importar itens do projeto
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Escolha um projeto para importar"
            className="fixed z-[1000] max-h-96 w-80 overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.top === 0 && position.left === 0 ? 'hidden' : 'visible',
            }}
          >
            <div className="space-y-1">
              {candidates.map((candidate) => {
                const { compatible, missing } = checkCompatibility(candidate.solution);
                const row = (
                  <button
                    type="button"
                    disabled={!compatible}
                    onClick={() => handleSelect(candidate)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition',
                      compatible ? 'hover:bg-muted' : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{candidate.name}</span>
                    {compatible ? (
                      <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    )}
                  </button>
                );
                return (
                  <div key={candidate.id}>
                    {compatible ? (
                      row
                    ) : (
                      <Tooltip
                        className="flex w-full"
                        content={`Sem oferta dos fornecedores selecionados para: ${missing.join(', ')}.`}
                      >
                        {row}
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
