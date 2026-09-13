// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { SavedProject } from '@/lib/types';
import { useProjectPdfDownload } from './useProjectPdfDownload';

const pdfMocks = vi.hoisted(() => ({
  buildProjectQuotePdfBlob: vi.fn(),
  buildProjectQuotePdfInputFromSavedProject: vi.fn(),
}));

vi.mock('../project-quote-pdf', () => pdfMocks);

const project: SavedProject = {
  id: 'project-1',
  name: 'Casa de praia',
  clientId: null,
  address: emptyAddress(),
  notes: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'draft',
  residentialOptions: {
    topology: null,
    batteryModel: null,
    secondaryBatteryModel: null,
    inverterModel: null,
    minInverterQty: null,
    gridType: null,
    loads: [],
    peakCalcMode: 'sum',
    operationHours: 0,
    desiredFeatures: [],
    whiteTariff: null,
    microgrid: null,
    generator: null,
    pv: null,
    atsPhotoUrl: null,
    atsBackupAcknowledged: false,
    maxPowerPerPhaseW: null,
  },
  solution: null,
  services: [],
};

function setup(overrides: Partial<Parameters<typeof useProjectPdfDownload>[0]> = {}) {
  const reportStatus = vi.fn();
  const props = {
    savedProjects: [project],
    clients: [],
    profile: null,
    userStockItems: [],
    marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
    userServices: [],
    batteryCatalog: [],
    inverterCatalog: [],
    accessoryCatalog: [],
    reportStatus,
    ...overrides,
  } as Parameters<typeof useProjectPdfDownload>[0];
  const hook = renderHook(() => useProjectPdfDownload(props));
  return { ...hook, props, reportStatus };
}

beforeEach(() => {
  pdfMocks.buildProjectQuotePdfInputFromSavedProject.mockReset();
  pdfMocks.buildProjectQuotePdfBlob.mockReset();
  pdfMocks.buildProjectQuotePdfInputFromSavedProject.mockReturnValue({});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:quote');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useProjectPdfDownload', () => {
  it('does nothing when the requested project is not saved', async () => {
    const { result } = setup({ savedProjects: [] });

    await act(async () => {
      await result.current.downloadProjectPdf('missing-project');
    });

    expect(result.current.downloadingProjectId).toBeNull();
    expect(pdfMocks.buildProjectQuotePdfInputFromSavedProject).not.toHaveBeenCalled();
  });

  it('builds and downloads a saved project PDF', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    pdfMocks.buildProjectQuotePdfBlob.mockResolvedValue(blob);
    const { result } = setup();

    await act(async () => {
      await result.current.downloadProjectPdf(project.id);
    });

    expect(pdfMocks.buildProjectQuotePdfInputFromSavedProject).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ client: null, profile: null })
    );
    expect(pdfMocks.buildProjectQuotePdfBlob).toHaveBeenCalledWith({});
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(document.querySelector('a')).not.toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:quote');
    expect(result.current.downloadingProjectId).toBeNull();
  });

  it('skips the download when the saved project cannot produce PDF input', async () => {
    pdfMocks.buildProjectQuotePdfInputFromSavedProject.mockReturnValue(null);
    const { result } = setup();

    await act(async () => {
      await result.current.downloadProjectPdf(project.id);
    });

    expect(pdfMocks.buildProjectQuotePdfBlob).not.toHaveBeenCalled();
    expect(result.current.downloadingProjectId).toBeNull();
  });

  it('reports PDF generation failures and always clears the loading state', async () => {
    pdfMocks.buildProjectQuotePdfBlob.mockRejectedValue(new Error('PDF failed'));
    const { result, reportStatus } = setup();

    await act(async () => {
      await result.current.downloadProjectPdf(project.id);
    });

    expect(reportStatus).toHaveBeenCalledWith('Não foi possível gerar o PDF. Tente novamente.');
    expect(result.current.downloadingProjectId).toBeNull();
  });
});
