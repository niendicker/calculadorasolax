'use client';

type AppTab = 'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile';

export function useDemoController({
  exitDemoMode,
  convertDemoToSimulation,
  changeTab,
}: {
  exitDemoMode: () => unknown;
  convertDemoToSimulation: () => void;
  changeTab: (tab: AppTab) => void;
}) {
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
    leaveDemo,
    convertDemo,
  };
}
