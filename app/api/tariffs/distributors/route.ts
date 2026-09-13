import { NextResponse } from 'next/server';
import { fetchAneelDataset } from '@/lib/tariff/aneel-service';

export async function GET() {
  try {
    const distributors = new Set<string>();
    for (const record of await fetchAneelDataset()) {
      const distributorField = findDistributorField(record);
      if (distributorField) {
        const name = String(record[distributorField]).trim();
        if (name) {
          distributors.add(name);
        }
      }
    }

    const sortedDistributors = Array.from(distributors).sort();
    return NextResponse.json({ distributors: sortedDistributors });
  } catch (error) {
    console.error('[API] Error in tariffs/distributors:', error);

    if (error instanceof Error && error.message.includes('AbortError')) {
      return NextResponse.json({ error: 'Timeout ao consultar ANEEL' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Erro ao consultar distribuidoras da ANEEL' }, { status: 502 });
  }
}

function findDistributorField(record: Record<string, unknown>): string | null {
  const possibleNames = ['SigAgente', 'DsDistribuidora', 'Distribuidora', 'DISTRIBUIDORA'];

  for (const name of possibleNames) {
    if (name in record && record[name] != null) return name;
  }

  const recordKeys = Object.keys(record);
  for (const key of recordKeys) {
    for (const name of possibleNames) {
      if (key.toLowerCase() === name.toLowerCase() && record[key] != null) return key;
    }
  }

  return null;
}
