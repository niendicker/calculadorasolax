'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DateRangePickerProps {
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string; // ISO date 'YYYY-MM-DD'
  onChange: (range: { startDate: string; endDate: string }) => void;
  maxDays?: number;
  minDays?: number;
  className?: string;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseIso(iso: string): [number, number, number] {
  const clean = (iso || '').slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  return [y || 2026, m || 1, d || 1];
}

function toIsoString(year: number, monthZeroBased: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(monthZeroBased + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = parseIso(iso);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const [y1, m1, d1] = parseIso(startIso);
  const [y2, m2, d2] = parseIso(endIso);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  if (t2 < t1) return 0;
  return Math.round((t2 - t1) / (24 * 60 * 60 * 1000)) + 1;
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = parseIso(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  maxDays = 7,
  minDays = 1,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Parse start date to initialize month view
  const [initialY, initialM] = parseIso(startDate || new Date().toISOString().slice(0, 10));
  const [viewYear, setViewYear] = useState<number>(initialY);
  const [viewMonth, setViewMonth] = useState<number>(initialM - 1); // 0-indexed

  // Internal draft state while popover is open
  const [draftStart, setDraftStart] = useState<string>(startDate);
  const [draftEnd, setDraftEnd] = useState<string>(endDate);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [step, setStep] = useState<'start' | 'end'>('start');

  // Sync draft with props when opened
  useEffect(() => {
    if (isOpen) {
      setDraftStart(startDate);
      setDraftEnd(endDate);
      setStep('start');
      setHoveredDate(null);
      const [y, m] = parseIso(startDate || new Date().toISOString().slice(0, 10));
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [isOpen, startDate, endDate]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard Escape listener
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if (isOpen) {
      dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Maximum allowed end date when draftStart is selected
  const maxAllowedEndIso = draftStart ? addDaysIso(draftStart, maxDays - 1) : null;

  function handleDayClick(dayIso: string) {
    if (step === 'start' || !draftStart) {
      setDraftStart(dayIso);
      setDraftEnd(dayIso);
      setStep('end');
    } else {
      // Step === 'end'
      if (dayIso < draftStart) {
        // Clicked date before start date -> restart with this date as start
        setDraftStart(dayIso);
        setDraftEnd(dayIso);
        setStep('end');
      } else {
        const days = diffDaysInclusive(draftStart, dayIso);
        if (days <= maxDays) {
          setDraftEnd(dayIso);
          setStep('start');
        }
      }
    }
  }

  function handleApply() {
    if (draftStart && draftEnd) {
      onChange({ startDate: draftStart, endDate: draftEnd });
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  // Generate calendar days for viewYear & viewMonth
  const firstDayOfWeek = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const totalDaysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();

  const days: { day: number; iso: string }[] = [];
  for (let d = 1; d <= totalDaysInMonth; d++) {
    days.push({ day: d, iso: toIsoString(viewYear, viewMonth, d) });
  }

  // Current duration
  const activeDuration = diffDaysInclusive(draftStart, draftEnd);
  const selectedDuration = diffDaysInclusive(startDate, endDate);

  return (
    <div className={cn('relative inline-block w-full', className)} ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Selecionar período: de ${formatDisplayDate(startDate)} a ${formatDisplayDate(endDate)}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-medium transition hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
      >
        <div className="flex items-center gap-2 truncate">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="tabular-nums text-foreground">
            {formatDisplayDate(startDate)} – {formatDisplayDate(endDate)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {selectedDuration} {selectedDuration === 1 ? 'dia' : 'dias'}
          </span>
          <ChevronDown
            className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Popover / Custom Dropdown Menu */}
      {isOpen && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Calendário de seleção de período"
          className="absolute left-0 top-full z-50 mt-1.5 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header: Month / Year Navigation */}
          <div className="flex items-center justify-between pb-1.5 border-b border-border/50">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleNextMonth}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-[10.5px] font-medium text-muted-foreground my-1.5">
            {WEEKDAY_NAMES.map((name) => (
              <span key={name} className="py-0.5">
                {name}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {/* Empty slots before first day of month */}
            {Array.from({ length: firstDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} className="h-7" />
            ))}

            {/* Month Days */}
            {days.map(({ day, iso }) => {
              const isStart = iso === draftStart;
              const isEnd = iso === draftEnd;
              const inRange = draftStart && draftEnd && iso >= draftStart && iso <= draftEnd;
              const inHoverRange =
                step === 'end' &&
                draftStart &&
                hoveredDate &&
                hoveredDate >= draftStart &&
                iso >= draftStart &&
                iso <= hoveredDate &&
                diffDaysInclusive(draftStart, hoveredDate) <= maxDays;

              // Bloqueio automático de range superior:
              // Se já escolheu o início e está escolhendo o fim, datas além de maxAllowedEndIso ficam bloqueadas.
              const isBeyondMax = Boolean(step === 'end' && maxAllowedEndIso && iso > maxAllowedEndIso);
              const isDisabled = isBeyondMax;

              return (
                <div
                  key={iso}
                  className={cn(
                    'relative flex h-7 items-center justify-center',
                    !isDisabled && (inRange || inHoverRange) && 'bg-primary/10',
                    isStart && 'rounded-l-md',
                    isEnd && 'rounded-r-md'
                  )}
                >
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDayClick(iso)}
                    onMouseEnter={() => setHoveredDate(iso)}
                    aria-label={`${day} de ${MONTH_NAMES[viewMonth]} de ${viewYear}`}
                    title={
                      isBeyondMax
                        ? `Bloqueado: limite máximo de ${maxDays} dias`
                        : `${day} de ${MONTH_NAMES[viewMonth]} de ${viewYear}`
                    }
                    className={cn(
                      'flex h-6.5 w-6.5 items-center justify-center rounded-md text-xs font-medium transition',
                      isStart || isEnd
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : inRange || inHoverRange
                        ? 'text-primary font-medium hover:bg-primary/20'
                        : 'text-foreground hover:bg-muted',
                      isDisabled && 'opacity-25 cursor-not-allowed hover:bg-transparent text-muted-foreground'
                    )}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer simples: Duração e Ações */}
          <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
            <span className="text-[11px] font-medium text-muted-foreground">
              {activeDuration > 0
                ? `${activeDuration} ${activeDuration === 1 ? 'dia' : 'dias'}`
                : 'Selecione o período'}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="xs"
                onClick={handleApply}
                disabled={!draftStart || !draftEnd || activeDuration < minDays || activeDuration > maxDays}
                className="h-7 px-3 text-xs"
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
