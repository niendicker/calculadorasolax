import { NextResponse } from 'next/server';
import { getLatestTariffDate } from '@/lib/tariff/aneel-service';

export async function GET() {
  try {
    const latestDate = await getLatestTariffDate();

    return NextResponse.json({ latestDate: latestDate || new Date().toISOString().split('T')[0] });
  } catch (error) {
    console.error('[API] Error in tariffs/latest-date:', error);

    if (error instanceof Error && error.message.includes('AbortError')) {
      return NextResponse.json({ error: 'Timeout ao consultar ANEEL' }, { status: 504 });
    }

    return NextResponse.json({ error: 'Erro ao consultar data das tarifas' }, { status: 502 });
  }
}
