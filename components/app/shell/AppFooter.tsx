import { Tooltip } from '@/components/ui/tooltip';

export function AppFooter() {
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? '';
  return (
    <footer className="shrink-0 border-t bg-background/95 px-4 py-2 text-center text-xs text-muted-foreground lg:px-6">
      SolaX Calculator · {new Date().getFullYear()} · Dimensionamento de sistemas híbridos solar + bateria
      {commitSha && (
        <>
          {' · '}
          <Tooltip content={commitSha} contentClassName="left-auto right-0 w-max max-w-[calc(100vw-2rem)] whitespace-nowrap">
            {commitSha.slice(0, 7)}
          </Tooltip>
        </>
      )}
    </footer>
  );
}
