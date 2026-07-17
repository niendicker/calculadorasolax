import { useState, type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from '../shell/slots';

/** Tabs render their title bar and summary panel via portals (see
 *  components/app/shell/slots.tsx) instead of inline markup, so component
 *  tests need real portal targets in the DOM for that content — e.g. header
 *  action buttons — to be queryable at all.
 *
 *  The portal targets are rendered *inside* the same React tree as `children`
 *  (via refs, not `document.createElement` + manual `document.body.append`)
 *  so that @testing-library/react's automatic cleanup() actually unmounts
 *  them between tests — otherwise portaled content would leak into every
 *  later test in the file. */
function Shell({ children }: { children: ReactNode }) {
  const [titleBar, setTitleBar] = useState<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState<HTMLDivElement | null>(null);

  return (
    <>
      <div ref={setTitleBar} />
      <div ref={setSummary} />
      <TitleBarPortalProvider value={titleBar}>
        <SummaryPortalProvider value={summary}>
          <SetSummaryActiveProvider value={() => {}}>{children}</SetSummaryActiveProvider>
        </SummaryPortalProvider>
      </TitleBarPortalProvider>
    </>
  );
}

export function renderWithShell(ui: ReactElement) {
  return render(<Shell>{ui}</Shell>);
}
