'use client';

import type { BatteryTopology, Client, ProjectInfo, ResidentialGridType, Solution, UserStockItem, WhiteTariffConfig } from '@/lib/types';
import { batteryQuantityBreakdown, calculateSystemCost, calculateTariffSavings, formatCurrencyBRL } from './helpers';
import { ReportInfoRow, ReportMetric } from './shared-ui';
import { gridLabels, topologyLabels, type BatteryCatalogOption, type InlineProfile } from './types';

export function PrintableReport({
  projectInfo,
  client,
  profile,
  solution,
  loads,
  topology,
  selectedBatteryModel,
  gridType,
  peakW,
  dailyKwh,
  userStockItems,
  whiteTariff,
  batteryCatalog,
}: {
  projectInfo: ProjectInfo;
  client: Client | null;
  profile: InlineProfile | null;
  solution: Solution;
  loads: { id: string; name: string; powerW: number; hoursPerDay: number; qty: number }[];
  topology: BatteryTopology | null;
  selectedBatteryModel: string | null;
  gridType: ResidentialGridType | null;
  peakW: number;
  dailyKwh: number;
  userStockItems: UserStockItem[];
  whiteTariff: WhiteTariffConfig | null;
  batteryCatalog: BatteryCatalogOption[];
}) {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const loadEnergyKwh = (load: { powerW: number; hoursPerDay: number; qty: number }) =>
    (load.powerW * load.hoursPerDay * load.qty) / 1000;

  const systemCost = calculateSystemCost(solution, userStockItems);
  const tariffSavings = calculateTariffSavings(whiteTariff);
  const batteryParts = batteryQuantityBreakdown(solution.batteryModel, solution.batteryQty, batteryCatalog);

  return (
    <div className="print-report">
      <header className="mb-8 flex items-start justify-between border-b pb-4">
        <div className="flex items-start gap-4">
          {profile?.companyLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.companyLogoUrl}
              alt={profile.companyName || 'Logomarca da empresa'}
              className="h-16 w-28 object-contain"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-primary">
              {profile?.companyName || 'SolaX Power Brasil'}
            </p>
            {profile?.companyAddress && (
              <p className="mt-1 max-w-md text-xs text-muted-foreground">{profile.companyAddress}</p>
            )}
            <h1 className="mt-2 text-2xl font-bold text-foreground">Relatório de dimensionamento</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gerado em {generatedAt}</p>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>Calculadora SolaX</p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-4 gap-3">
        <ReportMetric label="Pico de carga" value={`${(peakW / 1000).toFixed(2)} kVA`} />
        <ReportMetric label="Consumo diário" value={`${dailyKwh.toFixed(2)} kWh/dia`} />
        <ReportMetric label="Topologia" value={topology ? topologyLabels[topology] : '-'} />
        <ReportMetric label="Bateria selecionada" value={selectedBatteryModel || '-'} />
        <ReportMetric label="Rede" value={gridType ? gridLabels[gridType] : '-'} />
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Dados do projeto</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <ReportInfoRow label="Projeto" value={projectInfo.name || '-'} />
            <ReportInfoRow label="Cliente" value={client?.name || '-'} />
            <ReportInfoRow label="Email" value={client?.email || '-'} />
            <ReportInfoRow label="Telefone" value={client?.phone || '-'} />
            <ReportInfoRow label="CPF/CNPJ" value={client?.document || '-'} />
            <ReportInfoRow label="Endereço" value={projectInfo.address || '-'} />
            {projectInfo.notes && <ReportInfoRow label="Observações" value={projectInfo.notes} />}
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Produtos recomendados</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className="border px-3 py-2">Item</th>
              <th className="border px-3 py-2">Modelo</th>
              <th className="border px-3 py-2">Quantidade</th>
              <th className="border px-3 py-2">Observação</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border px-3 py-2">Inversor</td>
              <td className="border px-3 py-2">{solution.inverterModel}</td>
              <td className="border px-3 py-2">{solution.inverterQty ?? 1}</td>
              <td className="border px-3 py-2">
                {solution.inverterRatedPowerW ? `${solution.inverterRatedPowerW} VA nominal` : '-'}
              </td>
            </tr>
            <tr>
              <td className="border px-3 py-2">Bateria</td>
              <td className="border px-3 py-2">
                {batteryParts.length > 1
                  ? batteryParts.map((part) => `${part.qty}× ${part.model}`).join(' + ')
                  : solution.batteryModel}
              </td>
              <td className="border px-3 py-2">{solution.batteryQty}</td>
              <td className="border px-3 py-2">
                {solution.availableEnergyWh ? `${(solution.availableEnergyWh / 1000).toFixed(2)} kWh disponíveis` : '-'}
              </td>
            </tr>
            {solution.pvPowerKw !== null && (
              <tr>
                <td className="border px-3 py-2">Potência FV recomendada</td>
                <td className="border px-3 py-2">Arranjo fotovoltaico</td>
                <td className="border px-3 py-2">-</td>
                <td className="border px-3 py-2">{solution.pvPowerKw.toFixed(2)} kWp</td>
              </tr>
            )}
            {solution.accessories.map((accessory) => (
              <tr key={accessory}>
                <td className="border px-3 py-2">Acessório</td>
                <td className="border px-3 py-2">{accessory}</td>
                <td className="border px-3 py-2">1</td>
                <td className="border px-3 py-2">Conforme regra/catálogo aprovado</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Cargas informadas</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className="border px-3 py-2">Carga</th>
              <th className="border px-3 py-2">Potência unitária</th>
              <th className="border px-3 py-2">Quantidade</th>
              <th className="border px-3 py-2">Uso diário</th>
              <th className="border px-3 py-2">Pico</th>
              <th className="border px-3 py-2">Consumo</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={load.id}>
                <td className="border px-3 py-2">{load.name}</td>
                <td className="border px-3 py-2">{load.powerW} VA</td>
                <td className="border px-3 py-2">{load.qty}</td>
                <td className="border px-3 py-2">{load.hoursPerDay} h/dia</td>
                <td className="border px-3 py-2">{load.powerW * load.qty} VA</td>
                <td className="border px-3 py-2">{loadEnergyKwh(load).toFixed(2)} kWh/dia</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(systemCost.pricedItemsCount > 0 || tariffSavings) && (
        <section className="mb-7">
          <h2 className="mb-3 text-lg font-semibold">Análise econômica</h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {systemCost.pricedItemsCount > 0 && (
                <ReportInfoRow
                  label="Custo total do sistema"
                  value={
                    formatCurrencyBRL(systemCost.totalCost) +
                    (systemCost.isComplete
                      ? ''
                      : ` (parcial: ${systemCost.pricedItemsCount} de ${systemCost.totalItemsCount} itens com valor cadastrado)`)
                  }
                />
              )}
              {tariffSavings && (
                <>
                  <ReportInfoRow
                    label="Economia estimada com Tarifa Branca"
                    value={`${formatCurrencyBRL(tariffSavings.monthlySavings)}/mês`}
                  />
                  <ReportInfoRow
                    label="Economia anual estimada"
                    value={`${formatCurrencyBRL(tariffSavings.annualSavings)} (considerando ${tariffSavings.businessDaysPerMonth} dias úteis/mês)`}
                  />
                </>
              )}
            </tbody>
          </table>
        </section>
      )}

      {solution.comments && solution.comments.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Observações</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {solution.comments.map((comment, index) => (
              <li key={`${index}-${comment}`}>{comment}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t pt-3 text-right text-xs text-muted-foreground">
        {solution.solutionCode ? `Código: ${solution.solutionCode}` : 'Calculadora SolaX'}
      </footer>
    </div>
  );
}
