import { describe, expect, it } from 'vitest';
import { evaluateSts, validateStsSelection } from './sts';
import type { DispatchPoint } from './types';
import { calculateModularStudy } from './modular';
import { modularFixture, modularOptions } from './modular.test-fixtures';

import { stsFixture, stsBackup } from './sts.test-fixtures';
const point=(loadKw:number,chargeKw=0,solarGenerationKw=0): DispatchPoint=>({timestamp:'2026-01-01T12:00:00Z',tariffPeriod:'offPeak',loadKw,chargeKw,dischargeKw:0,solarGenerationKw,gridImportKw:Math.max(0,loadKw+chargeKw-solarGenerationKw),socKwh:0});
describe('STS C&I nominal sizing',()=>{
  it('selects the smallest approved continuous current and applies margin exactly once',()=>{
    const result=evaluateSts(stsBackup(),[point(80)],stsFixture(),1)!;
    expect(result.selected?.spec.accessory_id).toBe('small');
    expect(result.requiredCurrentA).toBeCloseTo(88000/(Math.sqrt(3)*380*0.9));
    expect(result.selected?.totalBrl).toBe(5000);
    expect(result.message).toContain('não é garantida');
  });
  it('honors the voltage-specific rating and never uses breaker current',()=>{
    const b=stsBackup();b.safetyMarginPercent=0;b.targetPowerKw=120;b.targetPeakPowerKw=120;b.sts!.maxGridPassageKw=0;b.sts!.powerFactor=1;b.sts!.lineVoltageV=400;
    const context=stsFixture();context.catalog.rules.forEach(r=>r.line_voltage_v=400);context.catalog.specs[0].rated_current_400v_a=100;
    expect(evaluateSts(b,[],context,1)?.selected?.spec.accessory_id).toBe('large');
  });
  it.each(['charging','export'])('checks %s through the common grid bus',kind=>{
    const trace=kind==='charging'?[point(80,100)]:[point(20,0,220)];
    const r=evaluateSts(stsBackup(),trace,stsFixture(),1)!;
    expect(r.selected?.spec.accessory_id).toBe('large');
    expect(r.requiredGridPowerKw).toBeCloseTo((kind==='charging'?180:200)*1.1);
  });
  it('does not reduce STS capacity by energy utilization factors',()=>{
    const b=stsBackup();b.inputMode='detailed';b.loads=[{id:'motor',name:'Carga',powerW:150000,quantity:1,usageFactor:0.1}];
    const r=evaluateSts(b,[],stsFixture(),1)!;
    expect(r.requiredBackupPowerKw).toBe(165);
    expect(r.selected?.spec.accessory_id).toBe('large');
  });
  it('requires a continuous rating covering the peak without transient overload',()=>{
    const b=stsBackup();b.targetPeakPowerKw=250;
    expect(evaluateSts(b,[],stsFixture(),1)?.status).toBe('no_match');
  });
  it('uses the configured maximum PCS per STS independently of current rating',()=>{
    const context=stsFixture();context.catalog.rules[0].max_pcs=1;
    expect(evaluateSts(stsBackup(),[],context,1)?.selected?.spec.accessory_id).toBe('small');
    expect(evaluateSts(stsBackup(),[],context,2)?.selected?.spec.accessory_id).toBe('large');
    expect(evaluateSts(stsBackup(),[],context,3)?.status).toBe('no_match');
  });
  it('validates manual selection rather than silently substituting another STS',()=>{
    const b=stsBackup();b.sts!.mode='manual';b.sts!.accessoryId='small';b.sts!.maxGridPassageKw=220;
    expect(evaluateSts(b,[],stsFixture(),1)?.status).toBe('no_match');
  });
  it.each(['revoked','draft','inactive','accessoryInactive','unsupportedFrequency','missingDocument'])('rejects %s catalog entries',state=>{
    const context=stsFixture();context.catalog.specs=context.catalog.specs.slice(0,1);
    const rule=context.catalog.rules[0];const spec=context.catalog.specs[0];
    if(state==='revoked'||state==='draft')rule.approval_status=state;
    if(state==='inactive')spec.active=false;
    if(state==='accessoryInactive')spec.accessoryActive=false;
    if(state==='unsupportedFrequency')spec.frequency_hz=[50];
    if(state==='missingDocument')rule.firmware='';
    expect(evaluateSts(stsBackup(),[],context,1)?.status).toBe('no_match');
  });
  it('never uses another PCS or an integrated product compatibility',()=>{
    const c=stsFixture();c.target={bessProductId:'bess',unitsPerModule:1};
    expect(evaluateSts(stsBackup(),[],c,1)?.status).toBe('no_match');
    c.catalog.rules.forEach(r=>{r.pcs_id=null;r.bess_product_id='bess';});
    expect(evaluateSts(stsBackup(),[],c,1)?.selected?.spec.accessory_id).toBe('small');
  });
  it('blocks missing prices for the technically selected model, but accepts explicit zero',()=>{
    const c=stsFixture();delete c.prices.small;
    expect(()=>evaluateSts(stsBackup(),[],c,1)).toThrow('Portfólio');
    c.prices.small=0;
    expect(evaluateSts(stsBackup(),[],c,1)?.selected?.totalBrl).toBe(0);
    c.controllerAccessoryId='small';
    expect(()=>evaluateSts(stsBackup(),[],c,1)).toThrow('controlador');
  });
  it('does not assume FP=1 or let a client-provided selection bypass server resolution',()=>{
    const b=stsBackup();b.sts!.powerFactor=0;
    expect(validateStsSelection(b.sts).join(' ')).toContain('fator de potência');
    expect(()=>evaluateSts(b,[],stsFixture(),1)).toThrow('fator de potência');
    expect(()=>evaluateSts(stsBackup(),[],undefined,1)).toThrow('servidor');
    b.enabled=false;
    expect(evaluateSts(b,[],undefined,1)).toBeUndefined();
  });
  it('includes exactly one STS in modular CAPEX, composition and financial detail',()=>{
    const options=modularOptions();options.backup={...stsBackup(),targetPowerKw:20,targetPeakPowerKw:20,autonomyHours:0.1};
    const c=stsFixture();const result=calculateModularStudy(options,modularFixture(),{pcsUnitBrl:40000,batteryUnitBrl:30000},c);
    expect(result.scenarios[0].capex).toBe(109000);
    expect(result.scenarios[0].composition?.items.filter(i=>i.productId==='large')).toHaveLength(1);
    expect(result.selected?.cashFlow[0].nominalCashFlow).toBe(-result.selected!.capex);
    expect(result.stsContext?.catalog.rules[0].max_pcs).toBe(2);
    expect(result.scenarios.every(s=>s.sts?.pcsCount===s.composition?.pcsCount)).toBe(true);
  });
  it('invalidates oversized candidates without recommending an undersized transfer system',()=>{
    const options=modularOptions();options.backup={...stsBackup(),targetPowerKw:500,targetPeakPowerKw:500};
    const result=calculateModularStudy(options,modularFixture(),{pcsUnitBrl:1,batteryUnitBrl:1},stsFixture());
    expect(result.scenarios.every(s=>!s.technicalValidity&&s.sts?.status==='no_match')).toBe(true);
    expect(result.recommendation.scenarioId).toBeNull();
    expect(result.backup?.status).toBe('insufficient_transfer');
  });
});


it('does not reuse a PCS approval across different AC voltage or frequency',()=>{
  const b=stsBackup();const c=stsFixture();b.sts!.lineVoltageV=400;
  expect(evaluateSts(b,[],c,1)?.status).toBe('no_match');
  b.sts!.lineVoltageV=380;b.sts!.frequencyHz=50;
  expect(evaluateSts(b,[],c,1)?.status).toBe('no_match');
  c.catalog.rules[0].frequency_hz=50;
  expect(evaluateSts(b,[],c,1)?.selected?.spec.accessory_id).toBe('small');
});


it('sizes a dedicated backup bus from its declared passage instead of unrelated installation loads',()=>{
  const b=stsBackup();b.sts!.gridBusScope='backup_bus';
  expect(evaluateSts(b,[point(1000)],stsFixture(),1)?.selected?.spec.accessory_id).toBe('small');
  expect(evaluateSts(b,[point(1000,100)],stsFixture(),1)?.selected?.spec.accessory_id).toBe('large');
  b.sts!.maxGridPassageKw=0;
  expect(()=>evaluateSts(b,[],stsFixture(),1)).toThrow('declare a máxima passagem');
});
