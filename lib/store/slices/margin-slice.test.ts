import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWizardStore } from '../wizard-store';
import { createSupabaseMock } from '@/lib/test-helpers/supabase-mock';
import { resetWizardStore } from '@/lib/test-helpers/wizard-store-reset';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: createClientMock }));

function resetStore() {
  resetWizardStore();
  createClientMock.mockReset();
}

describe('fetchMarginSettings', () => {
  beforeEach(() => resetStore());

  it('is a no-op when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));

    await useWizardStore.getState().fetchMarginSettings();

    expect(useWizardStore.getState().marginSettings).toEqual({
      inverterPercent: 0,
      batteryPercent: 0,
      accessoryPercent: 0,
    });
  });

  it('maps profile columns into marginSettings', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({
        tableResults: {
          profiles: {
            data: { margin_inverter_percent: 10, margin_battery_percent: 20, margin_accessory_percent: 30 },
            error: null,
          },
        },
      })
    );

    await useWizardStore.getState().fetchMarginSettings();

    expect(useWizardStore.getState().marginSettings).toEqual({
      inverterPercent: 10,
      batteryPercent: 20,
      accessoryPercent: 30,
    });
  });

  it('defaults missing columns to 0 when the profile row has none set', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: {}, error: null } } })
    );

    await useWizardStore.getState().fetchMarginSettings();

    expect(useWizardStore.getState().marginSettings).toEqual({
      inverterPercent: 0,
      batteryPercent: 0,
      accessoryPercent: 0,
    });
  });

  it('defaults to 0 when there is no profile row at all', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: null } } })
    );

    await useWizardStore.getState().fetchMarginSettings();

    expect(useWizardStore.getState().marginSettings).toEqual({
      inverterPercent: 0,
      batteryPercent: 0,
      accessoryPercent: 0,
    });
  });

  it('propagates a Supabase error', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().fetchMarginSettings()).rejects.toBeTruthy();
  });
});

describe('updateMarginPercent', () => {
  beforeEach(() => resetStore());

  it('throws not_authenticated when there is no logged-in user', async () => {
    createClientMock.mockReturnValue(createSupabaseMock({ user: null }));

    await expect(useWizardStore.getState().updateMarginPercent('inverter', 15)).rejects.toThrow('not_authenticated');
  });

  it('propagates a Supabase error instead of updating state', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: { message: 'db down' } } } })
    );

    await expect(useWizardStore.getState().updateMarginPercent('inverter', 15)).rejects.toBeTruthy();
    expect(useWizardStore.getState().marginSettings.inverterPercent).toBe(0);
  });

  it('updates inverterPercent', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: null } } })
    );

    await useWizardStore.getState().updateMarginPercent('inverter', 12);

    expect(useWizardStore.getState().marginSettings.inverterPercent).toBe(12);
  });

  it('updates batteryPercent', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: null } } })
    );

    await useWizardStore.getState().updateMarginPercent('battery', 22);

    expect(useWizardStore.getState().marginSettings.batteryPercent).toBe(22);
  });

  it('updates accessoryPercent', async () => {
    createClientMock.mockReturnValue(
      createSupabaseMock({ tableResults: { profiles: { data: null, error: null } } })
    );

    await useWizardStore.getState().updateMarginPercent('accessory', 33);

    expect(useWizardStore.getState().marginSettings.accessoryPercent).toBe(33);
  });
});
