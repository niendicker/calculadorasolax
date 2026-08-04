import { NextResponse } from 'next/server';
import { cache } from '@/lib/tariff/cache';

const ANEEL_CKAN_API = 'https://dadosabertos.aneel.gov.br/api/3/action';
const DEFAULT_RESOURCE_ID = process.env.ANEEL_TARIFF_RESOURCE_ID || 'fcf2906c-7c32-4b9b-a637-054e7a5234f4';

interface CkanDatastoreRecord {
  _id: number;
  [key: string]: string | number | null;
}

interface CkanDatastoreResponse {
  success: boolean;
  result: {
    records: CkanDatastoreRecord[];
    total: number;
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const distributor = searchParams.get('distributor')?.trim();

    if (!distributor) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: distributor' },
        { status: 400 }
      );
    }

    let records = cache.getDataset();

    if (!records) {
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

      records = data.result.records;
      cache.setDataset(records);
    }

    if (!records) {
      return NextResponse.json({ accessantAgents: [] });
    }

    const GENERATOR_PREFIXES = ['EOL', 'UFV', 'UTE', 'UHE', 'PCH', 'CGH', 'CGU', 'UTN'];

    const accessantAgents = new Set<string>();
    const queryDist = distributor.toLowerCase().trim();

    for (const record of records) {
      const agent = String(record.SigAgente || '').toLowerCase().trim();

      if (agent === queryDist) {
        const accessant = String(record.SigAgenteAcessante || '').trim();
        if (accessant && accessant !== 'Não se aplica') {
          const isGenerator = GENERATOR_PREFIXES.some((prefix) =>
            accessant.toUpperCase().startsWith(prefix)
          );
          if (!isGenerator) {
            accessantAgents.add(accessant);
          }
        }
      }
    }

    const sortedAgents = Array.from(accessantAgents).sort();

    return NextResponse.json({ accessantAgents: sortedAgents });
  } catch (error) {
    console.error('[API] Error in tariffs/accessant-agents:', error);

    if (error instanceof Error && error.message.includes('AbortError')) {
      return NextResponse.json({ error: 'Timeout ao consultar ANEEL' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Erro ao consultar agentes acessantes' }, { status: 502 });
  }
}
