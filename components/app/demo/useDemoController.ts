'use client';

import { useMemo, useState } from 'react';
import { DEMO_SIMULATIONS, buildDemoSimulation } from '@/lib/demo/demo-simulations';
import type { DemoSimulationData, DemoTab } from '@/lib/demo/types';
import type { LoadPresetItem } from '@/lib/types';
import type { ApprovedInverterCombo, BatteryCatalogOption, InverterCatalogOption } from '../types';

type AppTab = 'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile';

export function useDemoController({
  activeTab,
  loadPresets,
  batteryCatalog,
  approvedInverterCombos,
  inverterCatalog,
  loadDemoSimulation,
  exitDemoMode,
  convertDemoToSimulation,
  changeTab,
}: {
  activeTab: AppTab;
  loadPresets: LoadPresetItem[];
  batteryCatalog: BatteryCatalogOption[];
  approvedInverterCombos: ApprovedInverterCombo[];
  inverterCatalog: InverterCatalogOption[];
  loadDemoSimulation: (id: string, data: DemoSimulationData, activeTab: DemoTab) => void;
  exitDemoMode: () => unknown;
  convertDemoToSimulation: () => void;
  changeTab: (tab: AppTab) => void;
}) {
  const [demoPickerOpen, setDemoPickerOpen] = useState(false);
  const [unavailableDemoIds, setUnavailableDemoIds] = useState<Set<string>>(new Set());

  const demoDataById = useMemo(() => {
    const entries = DEMO_SIMULATIONS.map((definition) => [
      definition.id,
      buildDemoSimulation(definition, loadPresets, batteryCatalog, approvedInverterCombos, inverterCatalog),
    ] as const);
    return new Map(entries);
  }, [loadPresets, batteryCatalog, approvedInverterCombos, inverterCatalog]);

  function openDemoPicker() {
    setDemoPickerOpen(true);
  }

  async function selectDemo(id: string) {
    const data = demoDataById.get(id);
    if (!data) {
      setUnavailableDemoIds((ids) => new Set(ids).add(id));
      return;
    }
    const response = await fetch('/api/demo/session', { method: 'POST' }).catch(() => null);
    if (!response || !response.ok) {
      setUnavailableDemoIds((ids) => new Set(ids).add(id));
      return;
    }
    loadDemoSimulation(id, data, activeTab as DemoTab);
    setUnavailableDemoIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
    setDemoPickerOpen(false);
    changeTab('sizing');
  }

  async function closeDemoSession() {
    await fetch('/api/demo/session', { method: 'DELETE' }).catch(() => undefined);
  }

  async function leaveDemo() {
    await closeDemoSession();
    exitDemoMode();
    changeTab('project');
  }

  async function convertDemo() {
    await closeDemoSession();
    convertDemoToSimulation();
    changeTab('project');
  }

  return {
    examples: DEMO_SIMULATIONS,
    demoPickerOpen,
    setDemoPickerOpen,
    unavailableDemoIds,
    openDemoPicker,
    selectDemo,
    leaveDemo,
    convertDemo,
  };
}
