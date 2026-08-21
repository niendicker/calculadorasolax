import type { ProjectServiceLine, ProjectInfo, ResidentialOptions, Solution } from '@/lib/types';

export type DemoTab = 'project' | 'sizing' | 'catalog' | 'purchases' | 'myStock' | 'clients' | 'profile';

export interface DemoSimulationDefinition {
  id: string;
  name: string;
  description: string;
  desiredFeatures: ResidentialOptions['desiredFeatures'];
  gridType: NonNullable<ResidentialOptions['gridType']>;
}

export interface DemoSimulationData {
  residentialOptions: ResidentialOptions;
}

export interface DemoSnapshot {
  projectInfo: ProjectInfo;
  currentProjectId: string | null;
  projectDetailsVisible: boolean;
  residentialOptions: ResidentialOptions;
  solution: Solution | null;
  secondarySolution: Solution | null;
  services: ProjectServiceLine[];
  activeTab: DemoTab;
}
