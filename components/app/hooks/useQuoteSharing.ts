import { useState } from 'react';
import type { Client, MarginSettings, ProjectInfo, ProjectServiceLine, ResidentialOptions, SavedProject, Solution, UserServiceItem, UserStockItem } from '@/lib/types';
import { buildClientQuoteText, buildPdfFileName, buildWhatsAppShareUrl, calculateSystemCost } from '../helpers';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption, ProductMedia } from '../types';

export function useQuoteSharing({
  projectInfo,
  residentialOptions,
  solution,
  secondarySolution,
  clients,
  profile,
  savedProjects,
  currentProjectId,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  productMedia,
  userStockItems,
  marginSettings,
  services,
  userServices,
  nominalW,
  peakW,
  dailyKwh,
  updateProjectStatus,
}: {
  projectInfo: ProjectInfo;
  residentialOptions: ResidentialOptions;
  solution: Solution | null;
  secondarySolution: Solution | null;
  clients: Client[];
  profile: InlineProfile | null;
  savedProjects: SavedProject[];
  currentProjectId: string | null;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  productMedia: Record<string, ProductMedia>;
  userStockItems: UserStockItem[];
  marginSettings: MarginSettings;
  services: ProjectServiceLine[];
  userServices: UserServiceItem[];
  nominalW: number;
  peakW: number;
  dailyKwh: number;
  updateProjectStatus: (id: string, status: 'sent') => Promise<void> | void;
}) {
  const [sendingQuote, setSendingQuote] = useState(false);
  const quoteClient = clients.find((client) => client.id === projectInfo.clientId) ?? null;
  const canSendQuoteByWhatsApp = Boolean(quoteClient?.phone);

  async function sendQuoteByWhatsApp() {
    if (!quoteClient?.phone) return;
    const shareableProject = {
      name: projectInfo.name,
      address: projectInfo.address,
      topology: residentialOptions.topology,
      gridType: residentialOptions.gridType,
      loadsCount: residentialOptions.loads.length,
      peakW,
      dailyKwh,
      solution,
    };
    const systemCost = solution || services.length > 0
      ? calculateSystemCost(solution, userStockItems, services, userServices, marginSettings, batteryCatalog, residentialOptions)
      : null;
    const quoteText = buildClientQuoteText(shareableProject, quoteClient.name, batteryCatalog, services, systemCost);
    const whatsAppUrl = buildWhatsAppShareUrl(quoteClient.phone, quoteText);
    if (!whatsAppUrl) return;

    const markSent = () => {
      if (!currentProjectId) return;
      const current = savedProjects.find((project) => project.id === currentProjectId);
      if (current?.status === 'draft') void updateProjectStatus(currentProjectId, 'sent');
    };

    if (solution && typeof navigator.canShare === 'function') {
      try {
        setSendingQuote(true);
        const { buildProjectQuotePdfBlob } = await import('../project-quote-pdf');
        const blob = await buildProjectQuotePdfBlob({
          projectInfo,
          client: quoteClient,
          profile,
          solution,
          secondarySolution,
          secondaryBatteryModel: residentialOptions.secondaryBatteryModel,
          loads: residentialOptions.loads,
          operationHours: residentialOptions.operationHours,
          topology: residentialOptions.topology,
          selectedBatteryModel: residentialOptions.batteryModel,
          gridType: residentialOptions.gridType,
          nominalW,
          peakW,
          dailyKwh,
          userStockItems,
          marginSettings,
          services,
          userServices,
          whiteTariff: residentialOptions.whiteTariff,
          pv: residentialOptions.pv,
          desiredFeatures: residentialOptions.desiredFeatures,
          microgrid: residentialOptions.microgrid,
          generator: residentialOptions.generator,
          atsPhotoUrl: residentialOptions.atsPhotoUrl,
          atsBackupAcknowledged: residentialOptions.atsBackupAcknowledged,
          batteryCatalog,
          inverterCatalog,
          accessoryCatalog,
          productMedia,
        });
        const file = new File([blob], `${buildPdfFileName(projectInfo.name)}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: quoteText });
          markSent();
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      } finally {
        setSendingQuote(false);
      }
    }

    window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
    markSent();
  }

  return { sendingQuote, canSendQuoteByWhatsApp, sendQuoteByWhatsApp };
}
