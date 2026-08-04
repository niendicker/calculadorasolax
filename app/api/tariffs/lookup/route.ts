import { NextResponse } from 'next/server';
import { fetchTariffsFromAneel } from '@/lib/tariff/aneel-service';
import { cache } from '@/lib/tariff/cache';

const ANEEL_CKAN_API = 'https://dadosabertos.aneel.gov.br/api/3/action';
const DEFAULT_RESOURCE_ID = process.env.ANEEL_TARIFF_RESOURCE_ID || 'fcf2906c-7c32-4b9b-a637-054e7a5234f4';
const GENERATOR_PREFIXES = ['EOL', 'UFV', 'UTE', 'UHE', 'PCH', 'CGH', 'CGU', 'UTN'];

interface CkanDatastoreResponse {
  success: boolean;
  result: {
    records: Array<Record<string, string | number | null>>;
  };
}

async function getFirstGeneratorAgent(distributor: string): Promise<string | null> {
  try {
    let records = cache.getDataset();

    if (!records) {
      const url = new URL(`${ANEEL_CKAN_API}/datastore_search`);
      url.searchParams.append('resource_id', DEFAULT_RESOURCE_ID);
      url.searchParams.append('limit', '10000');

      const response = await fetch(url.toString(), {
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) return null;

      const data: CkanDatastoreResponse = await response.json();
      if (!data.success || !data.result?.records) return null;

      records = data.result.records;
      cache.setDataset(records);
    }

    const queryDist = distributor.toLowerCase().trim();
    for (const record of records) {
      const agent = String(record.SigAgente || '').toLowerCase().trim();

      if (agent === queryDist) {
        const accessant = String(record.SigAgenteAcessante || '').trim();
        if (accessant && accessant !== 'Não se aplica') {
          const isGenerator = GENERATOR_PREFIXES.some((prefix) =>
            accessant.toUpperCase().startsWith(prefix)
          );
          if (isGenerator) {
            return accessant;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[API] Error getting first generator agent:', error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const distributor = searchParams.get('distributor')?.trim();
    const subgroup = searchParams.get('subgroup')?.trim();
    const tariffMode = searchParams.get('tariffMode')?.trim();
    const referenceDate = searchParams.get('referenceDate')?.trim();

    if (!distributor || !subgroup || !tariffMode || !referenceDate) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: distributor, subgroup, tariffMode, referenceDate' },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
      return NextResponse.json({ error: 'Data deve estar no formato YYYY-MM-DD' }, { status: 400 });
    }

    const generatorAgent = await getFirstGeneratorAgent(distributor);
    const consumerClass = generatorAgent || undefined;

    const cacheKey = `${distributor}|${subgroup}|${tariffMode}|${consumerClass || ''}|${referenceDate}`;
    const cached = cache.getTariff(cacheKey);
    if (cached) {
      return NextResponse.json({ tariffs: cached });
    }

    const result = await fetchTariffsFromAneel({
      distributor,
      subgroup,
      tariffMode,
      accessantAgent: generatorAgent || undefined,
      referenceDate,
    });

    if (!result) {
      return NextResponse.json({ error: 'Nenhuma tarifa encontrada para os parâmetros informados' }, { status: 404 });
    }

    cache.setTariff(cacheKey, result);

    return NextResponse.json({ tariffs: result });
  } catch (error) {
    console.error('[API] Error in tariffs/lookup:', error);

    if (error instanceof Error && error.message.includes('AbortError')) {
      return NextResponse.json({ error: 'Timeout ao consultar ANEEL' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Erro ao consultar tarifas da ANEEL' }, { status: 502 });
  }
}
