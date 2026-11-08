import {expect,it} from 'vitest';
import {commercialIndustrialOptionsFromJson} from './row-mappers';
import {defaultCiOptions} from './defaults';

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
