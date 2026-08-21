import { useState } from 'react';
import type { Client, MarginSettings, SavedProject, UserServiceItem, UserStockItem } from '@/lib/types';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption } from '../types';
import { buildPdfFileName } from '../helpers';

export function useProjectPdfDownload({
  savedProjects,
  clients,
  profile,
  userStockItems,
  marginSettings,
  userServices,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  reportStatus,
}: {
  savedProjects: SavedProject[];
  clients: Client[];
  profile: InlineProfile | null;
  userStockItems: UserStockItem[];
  marginSettings: MarginSettings;
  userServices: UserServiceItem[];
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  reportStatus: (message: string) => void;
}) {
  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);

  async function downloadProjectPdf(id: string) {
    const project = savedProjects.find((item) => item.id === id);
    if (!project) return;
    setDownloadingProjectId(id);
    try {
      const { buildProjectQuotePdfBlob, buildProjectQuotePdfInputFromSavedProject } = await import('../project-quote-pdf');
      const input = buildProjectQuotePdfInputFromSavedProject(project, {
        client: clients.find((client) => client.id === project.clientId) ?? null,
        profile,
        userStockItems,
        marginSettings,
        userServices,
        batteryCatalog,
        inverterCatalog,
        accessoryCatalog,
      });
      if (!input) return;
      const blob = await buildProjectQuotePdfBlob(input);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${buildPdfFileName(project.name)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      reportStatus('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setDownloadingProjectId(null);
    }
  }

  return { downloadingProjectId, downloadProjectPdf };
}
