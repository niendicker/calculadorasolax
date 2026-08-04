import { NextResponse } from 'next/server';
import { getLatestTariffDate } from '@/lib/tariff/aneel-service';

export async function GET() {
  try {
    const latestDate = await getLatestTariffDate();

    if (!latestDate) {
      return NextResponse.json({ error: 'Nenhuma data encontrada' }, { status: 404 });
    }

    return NextResponse.json({ latestDate });
  } catch (error) {
    console.error('[API] Error in tariffs/latest-date:', error);

    if (error instanceof Error && error.message.includes('AbortError')) {
      return NextResponse.json({ error: 'Timeout ao consultar ANEEL' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Erro ao consultar data das tarifas' }, { status: 502 });
  }
}
