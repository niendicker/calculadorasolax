import { NextResponse } from 'next/server';
import { fetchAneelDataset } from '@/lib/tariff/aneel-service';

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

    const records = await fetchAneelDataset();

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
