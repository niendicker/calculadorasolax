export function AppFooter({ version, onOpenAbout }: { version: string; onOpenAbout: () => void }) {
  return (
    <footer className="hidden shrink-0 items-center justify-center gap-2 border-t bg-background/95 px-4 py-2 text-center text-xs text-muted-foreground lg:flex lg:px-6">
      <span>{new Date().getFullYear()} · Dimensionamento de sistemas híbridos solar + bateria</span>
      <span aria-hidden="true">·</span>
      <button type="button" className="underline-offset-2 hover:text-foreground hover:underline" onClick={onOpenAbout}>
        Sobre e contribuir
      </button>
      <span aria-hidden="true">·</span>
      <span>v{version}</span>
    </footer>
  );
}
