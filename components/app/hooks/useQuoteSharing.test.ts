// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAddress } from '@/lib/address';
import type { Client, ProjectInfo, ResidentialOptions, SavedProject, Solution } from '@/lib/types';
import { useQuoteSharing } from './useQuoteSharing';

const pdfMocks = vi.hoisted(() => ({ buildProjectQuotePdfBlob: vi.fn() }));
vi.mock('../project-quote-pdf', () => pdfMocks);

const client: Client = {
  id: 'client-1',
  name: 'Ana Cliente',
  email: 'ana@example.com',
  phone: '(11) 99999-9999',
  document: '',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const projectInfo: ProjectInfo = {
  name: 'Casa de praia',
  clientId: client.id,
  address: emptyAddress(),
  notes: '',
};

const residentialOptions: ResidentialOptions = {
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
};

const solution: Solution = {
  inverterId: 'inverter-1',
  inverterModel: 'X1-Hybrid-5.0kW-G4',
  batteryId: 'battery-1',
  batteryModel: 'TP-HS3.6',
  batteryQty: 1,
  pvPowerKw: null,
  accessories: [],
};

const savedProject: SavedProject = {
  id: 'project-1',
  name: projectInfo.name,
  clientId: client.id,
  address: emptyAddress(),
  notes: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'draft',
  residentialOptions,
  solution: null,
  services: [],
};

function setShareApi({ canShare, share }: { canShare?: (data?: ShareData) => boolean; share?: (data?: ShareData) => Promise<void> }) {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
}

function setup(overrides: Partial<Parameters<typeof useQuoteSharing>[0]> = {}) {
  const updateProjectStatus = vi.fn().mockResolvedValue(undefined);
  const props = {
    projectInfo,
    residentialOptions,
    solution: null,
    secondarySolution: null,
    clients: [client],
    profile: null,
    savedProjects: [savedProject],
    currentProjectId: savedProject.id,
    batteryCatalog: [],
    inverterCatalog: [],
    accessoryCatalog: [],
    productMedia: {},
    userStockItems: [],
    marginSettings: { inverterPercent: 0, batteryPercent: 0, accessoryPercent: 0 },
    services: [],
    userServices: [],
    nominalW: 0,
    peakW: 0,
    dailyKwh: 0,
    updateProjectStatus,
    ...overrides,
  } as Parameters<typeof useQuoteSharing>[0];
  const hook = renderHook(() => useQuoteSharing(props));
  return { ...hook, props, updateProjectStatus };
}

beforeEach(() => {
  pdfMocks.buildProjectQuotePdfBlob.mockReset();
  setShareApi({});
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useQuoteSharing', () => {
  it('does not offer WhatsApp sharing without a client phone', async () => {
    const { result } = setup({ clients: [{ ...client, phone: '' }] });

    expect(result.current.canSendQuoteByWhatsApp).toBe(false);
    await act(async () => {
      await result.current.sendQuoteByWhatsApp();
    });

    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the WhatsApp fallback and marks a draft as sent', async () => {
    const { result, updateProjectStatus } = setup();

    await act(async () => {
      await result.current.sendQuoteByWhatsApp();
    });

    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/5511999999999?text='), '_blank', 'noopener,noreferrer');
    expect(updateProjectStatus).toHaveBeenCalledWith(savedProject.id, 'sent');
    expect(result.current.sendingQuote).toBe(false);
  });

  it('shares a PDF through the native Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareApi({ canShare: vi.fn().mockReturnValue(true), share });
    pdfMocks.buildProjectQuotePdfBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    const { result, updateProjectStatus } = setup({ solution });

    await act(async () => {
      await result.current.sendQuoteByWhatsApp();
    });

    expect(pdfMocks.buildProjectQuotePdfBlob).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Orçamento: Casa de praia') }));
    expect(window.open).not.toHaveBeenCalled();
    expect(updateProjectStatus).toHaveBeenCalledWith(savedProject.id, 'sent');
  });

  it('falls back to WhatsApp when native file sharing fails', async () => {
    setShareApi({ canShare: vi.fn().mockReturnValue(true), share: vi.fn().mockRejectedValue(new Error('share failed')) });
    pdfMocks.buildProjectQuotePdfBlob.mockRejectedValue(new Error('PDF failed'));
    const { result, updateProjectStatus } = setup({ solution });

    await act(async () => {
      await result.current.sendQuoteByWhatsApp();
    });

    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/'), '_blank', 'noopener,noreferrer');
    expect(updateProjectStatus).toHaveBeenCalledWith(savedProject.id, 'sent');
    expect(result.current.sendingQuote).toBe(false);
  });

  it('stops quietly when the user cancels native sharing', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    setShareApi({ canShare: vi.fn().mockReturnValue(true), share: vi.fn().mockRejectedValue(abortError) });
    pdfMocks.buildProjectQuotePdfBlob.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    const { result, updateProjectStatus } = setup({ solution });

    await act(async () => {
      await result.current.sendQuoteByWhatsApp();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(updateProjectStatus).not.toHaveBeenCalled();
    expect(result.current.sendingQuote).toBe(false);
  });
});
