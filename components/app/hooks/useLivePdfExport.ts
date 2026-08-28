import { useState } from 'react';
import type { MarginSettings, ProjectInfo, ProjectServiceLine, ResidentialOptions, Solution, UserServiceItem, UserStockItem, Client } from '@/lib/types';
import { buildPdfFileName } from '../helpers';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption, ProductMedia } from '../types';

export type LivePdfReport = {
  blob: Blob;
  generatedAt: Date;
};

export function useLivePdfExport({
  projectInfo,
  projectId,
  residentialOptions,
  solution,
  secondarySolution,
  client,
  profile,
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
  canCalculate,
  reportStatus,
}: {
  projectInfo: ProjectInfo;
  projectId: string | null;
  residentialOptions: ResidentialOptions;
  solution: Solution | null;
  secondarySolution: Solution | null;
  client: Client | null;
  profile: InlineProfile | null;
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
  canCalculate: boolean;
  reportStatus: (message: string) => void;
}) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastGeneratedReport, setLastGeneratedReport] = useState<(LivePdfReport & { projectId: string | null }) | null>(null);

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${buildPdfFileName(projectInfo.name)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!solution || !canCalculate) return;
    setExportingPdf(true);
    try {
      const { buildProjectQuotePdfBlob } = await import('../project-quote-pdf');
      const blob = await buildProjectQuotePdfBlob({
        projectInfo,
        client,
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
        peakCalcMode: residentialOptions.peakCalcMode,
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
      setLastGeneratedReport({ projectId, blob, generatedAt: new Date() });
      downloadBlob(blob);
    } catch {
      reportStatus('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  }

  const lastReport = lastGeneratedReport?.projectId === projectId ? lastGeneratedReport : null;

  function downloadLastReport() {
    if (lastReport) downloadBlob(lastReport.blob);
  }

  function clearLastReport() {
    setLastGeneratedReport(null);
  }

  return { exportingPdf, exportPdf, lastReport, downloadLastReport, clearLastReport };
}
