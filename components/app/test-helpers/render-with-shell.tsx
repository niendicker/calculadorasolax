import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SetSummaryActiveProvider, SummaryPortalProvider, TitleBarPortalProvider } from '../shell/slots';

/** Tabs render their title bar and summary panel via portals (see
 *  components/app/shell/slots.tsx) instead of inline markup, so component
 *  tests need real portal targets in the DOM for that content — e.g. header
 *  action buttons — to be queryable at all. */
export function renderWithShell(ui: ReactElement) {
  const titleBar = document.createElement('div');
  const summary = document.createElement('div');
  document.body.append(titleBar, summary);

  const utils = render(
    <TitleBarPortalProvider value={titleBar}>
      <SummaryPortalProvider value={summary}>
        <SetSummaryActiveProvider value={() => {}}>{ui}</SetSummaryActiveProvider>
      </SummaryPortalProvider>
    </TitleBarPortalProvider>
  );

  return { ...utils, titleBar, summary };
}
