'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { AppTab } from './useTabNavigation';

export function useAuthenticatedNavigation({
  authenticated,
  onRequireAuthentication,
  changeTab,
  setPendingSupplyImport,
}: {
  authenticated: boolean;
  onRequireAuthentication: () => void;
  changeTab: (tab: AppTab) => void;
  setPendingSupplyImport: Dispatch<SetStateAction<boolean>>;
}) {
  function openAuthenticatedTab(tab: 'clients' | 'purchases' | 'myStock') {
    if (!authenticated) {
      onRequireAuthentication();
      return;
    }
    changeTab(tab);
  }

  function openClientsManager() {
    openAuthenticatedTab('clients');
  }

  function openPurchasesTab() {
    openAuthenticatedTab('purchases');
  }

  function openPortfolioTab() {
    openAuthenticatedTab('myStock');
  }

  function quoteSolution() {
    if (!authenticated) {
      onRequireAuthentication();
      return;
    }
    setPendingSupplyImport(true);
    changeTab('purchases');
  }

  return { openClientsManager, openPurchasesTab, openPortfolioTab, quoteSolution };
}
