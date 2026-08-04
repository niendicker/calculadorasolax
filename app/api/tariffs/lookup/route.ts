import { NextResponse } from 'next/server';
import { fetchTariffsFromAneel } from '@/lib/tariff/aneel-service';
import { cache } from '@/lib/tariff/cache';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const distributor = searchParams.get('distributor')?.trim();
    const subgroup = searchParams.get('subgroup')?.trim();
    const tariffMode = searchParams.get('tariffMode')?.trim();
    const accessantAgent = searchParams.get('accessantAgent')?.trim() || undefined;
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

    const cacheKey = `${distributor}|${subgroup}|${tariffMode}|${accessantAgent || ''}|${referenceDate}`;
    const cached = cache.getTariff(cacheKey);
    if (cached) {
      return NextResponse.json({ tariffs: cached });
    }

    const result = await fetchTariffsFromAneel({
      distributor,
      subgroup,
      tariffMode,
      accessantAgent,
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
