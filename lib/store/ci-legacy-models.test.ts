import {expect,it} from 'vitest';
import {commercialIndustrialOptionsFromJson} from './row-mappers';
import {defaultCiOptions} from './defaults';
import { stsBackup } from '@/supabase/functions/_shared/commercial-industrial/sts.test-fixtures';

it('initializes automatic STS when opening a saved project with backup and no transfer selection', () => {
 const backup = { ...stsBackup(), sts: undefined };
 const loaded = commercialIndustrialOptionsFromJson({ backup });
 expect(loaded.backup?.sts).toMatchObject({ mode: 'auto', accessoryId: null, powerFactor: 0 });
 expect(backup.sts).toBeUndefined();
});

it('preserves saved electrical data while replacing a legacy manual STS choice', () => {
 const backup = stsBackup();
 backup.sts = { ...backup.sts!, mode: 'manual', accessoryId: 'old-model', gridBusScope: 'backup_bus', maxGridPassageKw: 150 };
 const loaded = commercialIndustrialOptionsFromJson({ backup });
 expect(loaded.backup?.sts).toEqual({ ...backup.sts, mode: 'auto', accessoryId: null });
 expect(backup.sts.mode).toBe('manual');
});

it('retains legacy integrated models and quantities when merging current defaults',()=>{
 const saved={bessProductId:'legacy-cabinet',sizing:{mode:'fixed',moduleCount:4,minModules:null,maxModules:null}};
 const loaded=commercialIndustrialOptionsFromJson(saved);
 expect(loaded.bessSystem).toBeUndefined();
 expect({...defaultCiOptions,...loaded}).toMatchObject(saved);
 expect(loaded.bessProductId).toBe('legacy-cabinet');
});

it('preserves model IDs and AC operating voltage through save/load defaults',()=>{
 const saved={lineVoltageV:220,bessProductId:null,bessSystem:{kind:'model',sourceKind:'assembly',pcsId:'pcs',batteryId:'battery'}};
 expect(commercialIndustrialOptionsFromJson(saved)).toMatchObject(saved);
});

it('does not revive a financial ranking when opening new options',()=>{
 expect(commercialIndustrialOptionsFromJson({}).rankingCriterion).toBeUndefined();
});
