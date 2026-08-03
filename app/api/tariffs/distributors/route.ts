import { NextResponse } from 'next/server';
import { cache } from '@/lib/tariff/cache';

const ANEEL_CKAN_API = 'https://dadosabertos.aneel.gov.br/api/3/action';
const DEFAULT_RESOURCE_ID = process.env.ANEEL_TARIFF_RESOURCE_ID || 'fcf2906c-7c32-4b9b-a637-054e7a5234f4';

interface CkanDatastoreResponse {
  success: boolean;
  result: {
    records: Array<{ [key: string]: string | number | null }>;
    total: number;
  };
}

export async function GET() {
  try {
    const cached = cache.getDistributors();
    if (cached) {
      return NextResponse.json({ distributors: cached });
    }

    const url = new URL(`${ANEEL_CKAN_API}/datastore_search`);
    url.searchParams.append('resource_id', DEFAULT_RESOURCE_ID);
    url.searchParams.append('limit', '10000');

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`ANEEL API responded with HTTP ${response.status}`);
    }

    const data: CkanDatastoreResponse = await response.json();
    if (!data.success || !data.result?.records) {
      throw new Error('Invalid ANEEL response structure');
    }

    const distributors = new Set<string>();
    for (const record of data.result.records) {
      const distributorField = findDistributorField(record);
      if (distributorField) {
        const name = String(record[distributorField]).trim();
        if (name) {
          distributors.add(name);
        }
      }
    }

    const sortedDistributors = Array.from(distributors).sort();
    cache.setDistributors(sortedDistributors);

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
  const possibleNames = ['DsDistribuidora', 'Distribuidora', 'DISTRIBUIDORA'];

  for (const name of possibleNames) {
    if (name in record) return name;
  }

  const recordKeys = Object.keys(record);
  for (const key of recordKeys) {
    for (const name of possibleNames) {
      if (key.toLowerCase() === name.toLowerCase()) return key;
    }
  }

  return null;
}
