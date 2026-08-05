'use client';

import type { ProjectStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { projectStatusLabels } from '../../types';

/** Badge-colored per status so the list reads at a glance — draft is
 *  neutral (nothing to act on yet), sent is the "waiting on the client"
 *  state, accepted/rejected are the two ways a quote resolves. */
const projectStatusStyles: Record<ProjectStatus, string> = {
  draft: 'border-border bg-muted text-muted-foreground',
  sent: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  accepted:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
};

/** A `<select>` styled like a colored badge — lets the status of a
 *  quotation be both seen and changed from the same compact control,
 *  without opening a separate form. Used on `ProjectCard` and
 *  `SelectedProjectSummary`. */
export function ProjectStatusSelect({
  status,
  onChange,
  className,
}: {
  status: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="Status da cotação"
      value={status}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as ProjectStatus)}
      className={cn(
        'h-5 shrink-0 rounded-full border px-1.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        projectStatusStyles[status],
        className
      )}
    >
      {(Object.keys(projectStatusLabels) as ProjectStatus[]).map((value) => (
        <option key={value} value={value}>
          {projectStatusLabels[value]}
        </option>
      ))}
    </select>
  );
}
