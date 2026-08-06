'use client';

import { Button } from '@/components/ui/button';
import { tabs, type TabKey } from './types';

/** The list of section buttons shared by the desktop sidebar and the mobile
 * drawer — same tabs, same selection behavior, just different surrounding
 * chrome (see AdminPanel), so this is the one place their markup can drift
 * out of sync from. */
export function AdminNav({ activeTab, onSelectTab }: { activeTab: TabKey; onSelectTab: (tab: TabKey) => void }) {
  return (
    <>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Button
            key={tab.key}
            type="button"
            aria-current={activeTab === tab.key ? 'page' : undefined}
            variant={activeTab === tab.key ? 'secondary' : 'ghost'}
            className="justify-start"
            onClick={() => onSelectTab(tab.key)}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Button>
        );
      })}
    </>
  );
}
