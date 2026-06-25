import { createClient } from 'jsr:@supabase/supabase-js@2';

interface SingleLoad {
  powerW: number;
  hoursPerDay: number;
  qty: number;
}

interface ResidentialOptions {
  topology: 'HighVoltage' | 'LowVoltage';
  gridType: 'singlePhase_220' | 'splitPhase_220' | 'threePhase_220' | 'threePhase_380';
  loads: SingleLoad[];
  microGrid: 'Gerador' | 'Microinversor' | 'Desabilitada' | null;
}

interface Inverter {
  id: string;
  model: string;
  power_kw: number;
  phases: number;
  topology: string;
  grid_types: string[];
  max_battery_qty: number;
}

interface Battery {
  id: string;
  model: string;
  capacity_kwh: number;
  topology: string;
}

const topologyMap: Record<string, string[]> = {
  HighVoltage: ['HV', 'BOTH'],
  LowVoltage: ['LV', 'BOTH'],
};

const gridPhases: Record<string, number> = {
  singlePhase_220: 1,
  splitPhase_220: 1,
  threePhase_220: 3,
  threePhase_380: 3,
};

function totalPeakW(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + l.powerW * l.qty, 0);
}

function totalDailyKwh(loads: SingleLoad[]): number {
  return loads.reduce((acc, l) => acc + (l.powerW * l.hoursPerDay * l.qty) / 1000, 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const options: ResidentialOptions = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const peakW = totalPeakW(options.loads);
    const peakKw = peakW / 1000;
    const dailyKwh = totalDailyKwh(options.loads);
    const phases = gridPhases[options.gridType];
    const allowedTopologies = topologyMap[options.topology];

    // Find compatible inverters: topology matches, phases match, power >= peak
    const { data: inverters, error: invErr } = await supabase
      .from('inverters')
      .select('*')
      .in('topology', allowedTopologies)
      .eq('phases', phases)
      .gte('power_kw', peakKw * 0.8)
      .order('power_kw', { ascending: true });

    if (invErr || !inverters?.length) {
      return Response.json({ error: 'no_inverter' }, { status: 422 });
    }

    // Pick smallest inverter that covers the peak load
    const inverter: Inverter = inverters.find((inv) => inv.power_kw >= peakKw) ?? inverters.at(-1)!;

    // Battery topology key
    const batTopology = options.topology === 'HighVoltage' ? 'HV' : 'LV';

    const { data: batteries, error: batErr } = await supabase
      .from('batteries')
      .select('*')
      .eq('topology', batTopology)
      .order('capacity_kwh', { ascending: true });

    if (batErr || !batteries?.length) {
      return Response.json({ error: 'no_battery' }, { status: 422 });
    }

    // Determine target storage: daily consumption × 0.5 (50% coverage)
    const targetKwh = dailyKwh * 0.5;

    // Find battery combo: pick smallest battery that with reasonable qty covers target
    let chosenBattery: Battery | null = null;
    let chosenQty = 1;

    for (const bat of batteries as Battery[]) {
      const qty = Math.ceil(targetKwh / bat.capacity_kwh);
      const cappedQty = Math.min(qty, inverter.max_battery_qty);
      if (bat.capacity_kwh * cappedQty >= targetKwh * 0.8) {
        chosenBattery = bat;
        chosenQty = cappedQty;
        break;
      }
    }

    if (!chosenBattery) {
      // Fallback: largest battery at max qty
      chosenBattery = (batteries as Battery[]).at(-1)!;
      chosenQty = inverter.max_battery_qty;
    }

    // PV recommendation: dailyKwh / 4 peak sun hours (Brazil average)
    const pvPowerKw = dailyKwh / 4;

    // Accessories based on grid type
    const accessories: string[] = [];
    if (options.gridType === 'threePhase_380') accessories.push('Transformador de isolação');
    if (options.microGrid === 'Gerador') accessories.push('Módulo EPS');

    return Response.json(
      {
        inverterId: inverter.id,
        inverterModel: inverter.model,
        batteryId: chosenBattery.id,
        batteryModel: chosenBattery.model,
        batteryQty: chosenQty,
        pvPowerKw: Math.ceil(pvPowerKw * 10) / 10,
        accessories,
      },
      {
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
});
