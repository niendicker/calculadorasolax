import { TOOLTIP_BUBBLE_CLASSES } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function AppFooter() {
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? '';
  return (
    <footer className="shrink-0 border-t bg-background/95 px-4 py-2 text-center text-xs text-muted-foreground lg:px-6">
      SolaX Calculator · {new Date().getFullYear()} · Dimensionamento de sistemas híbridos solar + bateria
      {commitSha && (
        <>
          {' · '}
          <span className="group relative">
            {commitSha.slice(0, 7)}
            <span
              className={cn(
                TOOLTIP_BUBBLE_CLASSES,
                'left-auto right-0 top-auto bottom-full mt-0 mb-2 w-max max-w-[calc(100vw-2rem)] whitespace-nowrap'
              )}
            >
              {commitSha}
            </span>
          </span>
        </>
      )}
    </footer>
  );
}
