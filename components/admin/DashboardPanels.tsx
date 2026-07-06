'use client';

import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DetailItem, SectionHeader, SegmentedTabs } from './shared-ui';
import type { AdminActivityLogRow, AdminLogAction, AdminLogEntity, SimulationRow, UserProfileRow } from './types';

export function UsersPanel({
  users,
  onResetPassword,
  saving,
}: {
  users: UserProfileRow[];
  onResetPassword: (email: string) => void;
  saving: boolean;
}) {
  const [query, setQuery] = useState('');

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.full_name, user.email, user.company_name, user.phone].some((value) => value?.toLowerCase().includes(q))
    );
  }, [users, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title="Usuários cadastrados" count={visibleUsers.length} />
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar usuário"
            className="pl-8 md:pl-8"
            placeholder="Buscar por nome, email ou empresa..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {visibleUsers.length === 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado para essa busca.</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {visibleUsers.map((user) => (
          <Card key={user.id} size="sm">
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{user.full_name || user.email}</CardTitle>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant={user.role === 'admin' ? 'secondary' : 'outline'}>
                  {user.role === 'admin' ? 'admin' : 'usuário'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm">
                <DetailItem label="Telefone" value={user.phone || '-'} />
                <DetailItem label="Empresa" value={user.company_name || '-'} />
                <DetailItem
                  label="Cadastro"
                  value={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                    new Date(user.created_at)
                  )}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={saving || !user.email}
                onClick={() => onResetPassword(user.email)}
              >
                <RefreshCw className="h-4 w-4" />
                Resetar senha
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function MetricsPanel({
  simulations,
  users,
  hasMoreSimulations = false,
  loadingMoreSimulations = false,
  onLoadMoreSimulations,
}: {
  simulations: SimulationRow[];
  users: UserProfileRow[];
  hasMoreSimulations?: boolean;
  loadingMoreSimulations?: boolean;
  onLoadMoreSimulations?: () => void;
}) {
  const gridTypeCounts = countBy(simulations, (simulation) => simulation.grid_type || 'Não informado');
  const topologyCounts = countBy(simulations, (simulation) => simulation.topology || 'Não informado');
  const inverterCounts = countBy(simulations, (simulation) => simulation.inverter_model || 'Não informado');
  const batteryCounts = countBy(simulations, (simulation) => simulation.battery_model || 'Não informado');
  const loadCounts = countLoads(simulations);
  const accessoryCounts = countAccessories(simulations);
  const weekdayCounts = countSimulationWeekdays(simulations);
  const hourCounts = countSimulationHours(simulations);
  const totalDailyKwh = simulations.reduce((acc, simulation) => acc + Number(simulation.daily_kwh || 0), 0);
  const totalPeakW = simulations.reduce((acc, simulation) => acc + Number(simulation.peak_w || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Usuários" value={String(users.length)} />
        <MetricCard label="Simulações" value={String(simulations.length)} />
        <MetricCard label="Pico médio" value={simulations.length ? `${(totalPeakW / simulations.length / 1000).toFixed(2)} kVA` : '0 kVA'} />
        <MetricCard label="Consumo médio" value={simulations.length ? `${(totalDailyKwh / simulations.length).toFixed(2)} kWh/dia` : '0 kWh/dia'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TemporalHeatmapCard title="Dimensionamentos por dia da semana" rows={weekdayCounts} columns="grid-cols-7" />
        <TemporalHeatmapCard title="Dimensionamentos por horário" rows={hourCounts} columns="grid-cols-4 sm:grid-cols-6" />
        <ChartCard title="Tipos de rede mais usados" rows={gridTypeCounts} />
        <ChartCard title="Topologias mais usadas" rows={topologyCounts} />
        <ChartCard title="Cargas mais usadas" rows={loadCounts} />
        <ChartCard title="Inversores mais recomendados" rows={inverterCounts} />
        <ChartCard title="Baterias mais recomendadas" rows={batteryCounts} />
        <ChartCard title="Acessórios mais recomendados" rows={accessoryCounts} />
      </div>

      {hasMoreSimulations && onLoadMoreSimulations && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMoreSimulations} disabled={loadingMoreSimulations}>
            {loadingMoreSimulations ? 'Carregando...' : 'Carregar mais simulações'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ActivityLogsPanel({
  logs,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  logs: AdminActivityLogRow[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<AdminLogEntity | 'all'>('all');

  const entityOptions = useMemo(() => {
    const values = new Set<AdminLogEntity>();
    for (const log of logs) values.add(log.entity_type);
    return Array.from(values).map((value) => ({
      value,
      label: entityLabel(value),
      count: logs.filter((log) => log.entity_type === value).length,
    }));
  }, [logs]);

  const visibleLogs = useMemo(() => {
    const byEntity = entityFilter === 'all' ? logs : logs.filter((log) => log.entity_type === entityFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byEntity;
    return byEntity.filter((log) =>
      [log.actor_email, log.target_label, log.summary].some((value) => value?.toLowerCase().includes(q))
    );
  }, [logs, entityFilter, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader title="Logs de alterações" count={visibleLogs.length} />
        <label className="relative block sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar log por usuário ou item"
            className="pl-8 md:pl-8"
            placeholder="Buscar por usuário ou item..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {entityOptions.length > 1 && (
        <div className="rounded-lg border bg-card p-3">
          <SegmentedTabs
            label="Entidade"
            value={entityFilter}
            options={[{ value: 'all', label: 'Todos', count: logs.length }, ...entityOptions]}
            onChange={(value) => setEntityFilter(value as AdminLogEntity | 'all')}
          />
        </div>
      )}

      {logs.length === 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Ainda não há alterações registradas em produtos, combinações ou regras.
            </p>
          </CardContent>
        </Card>
      ) : visibleLogs.length === 0 ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado para esse filtro.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visibleLogs.map((log) => (
            <Card key={log.id} size="sm">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{log.target_label}</CardTitle>
                    <p className="text-sm text-muted-foreground">{log.summary}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Badge variant="secondary">{entityLabel(log.entity_type)}</Badge>
                    <Badge variant={log.action === 'delete' || log.action === 'deactivate' ? 'outline' : 'secondary'}>
                      {actionLabel(log.action)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <DetailItem label="Usuário" value={log.actor_email || '-'} />
                  <DetailItem
                    label="Data"
                    value={new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(log.created_at))}
                  />
                  <DetailItem label="ID" value={log.target_id || '-'} />
                </div>
                <details className="rounded-lg border bg-muted/30 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Ver dados da alteração</summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <JsonBlock title="Antes" value={log.before_data} />
                    <JsonBlock title="Depois" value={log.after_data} />
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Carregando...' : 'Carregar mais logs'}
          </Button>
        </div>
      )}
    </section>
  );
}

function entityLabel(entityType: AdminLogEntity) {
  const labels: Record<AdminLogEntity, string> = {
    inverter: 'Inversor',
    battery: 'Bateria',
    accessory: 'Acessório',
    solution: 'Combinação',
    rule: 'Regra',
    load_catalog_item: 'Carga',
    load_preset: 'Preset',
  };
  return labels[entityType];
}

function actionLabel(action: AdminLogAction) {
  const labels: Record<AdminLogAction, string> = {
    create: 'Criação',
    update: 'Edição',
    delete: 'Remoção',
    deactivate: 'Inativação',
  };
  return labels[action];
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-72 overflow-auto rounded-lg bg-background p-2 text-xs">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </pre>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function TemporalHeatmapCard({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: { label: string; value: number }[];
  columns: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.every((row) => row.value === 0) ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Ainda não há dados suficientes.
          </p>
        ) : (
          <div className={cn('grid gap-2', columns)}>
            {rows.map((row) => {
              const intensity = row.value / max;
              return (
                <div
                  key={row.label}
                  className="min-w-0 rounded-lg border px-2 py-2 text-center transition-colors"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--primary) ${Math.max(8, intensity * 72)}%, var(--card))`,
                    borderColor: `color-mix(in srgb, var(--primary) ${Math.max(18, intensity * 70)}%, var(--border))`,
                  }}
                >
                  <p className="truncate text-xs font-medium text-foreground">{row.label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{row.value}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, rows, limit = 8 }: { title: string; rows: { label: string; value: number }[]; limit?: number }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const topRows = rows.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {topRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Ainda não há dados suficientes.
          </p>
        ) : (
          <div className="space-y-3">
            {topRows.map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function countLoads(simulations: SimulationRow[]) {
  const counts = new Map<string, number>();
  for (const simulation of simulations) {
    for (const load of simulation.loads ?? []) {
      const name = load.name || 'Carga sem nome';
      counts.set(name, (counts.get(name) ?? 0) + Number(load.qty || 1));
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function countAccessories(simulations: SimulationRow[]) {
  const counts = new Map<string, number>();
  for (const simulation of simulations) {
    for (const accessory of simulation.accessories ?? []) {
      counts.set(accessory, (counts.get(accessory) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function countSimulationWeekdays(simulations: SimulationRow[]) {
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const counts = labels.map((label) => ({ label, value: 0 }));

  for (const simulation of simulations) {
    const date = new Date(simulation.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const mondayFirstIndex = (date.getDay() + 6) % 7;
    counts[mondayFirstIndex].value += 1;
  }

  return counts;
}

function countSimulationHours(simulations: SimulationRow[]) {
  const counts = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    value: 0,
  }));

  for (const simulation of simulations) {
    const date = new Date(simulation.created_at);
    if (Number.isNaN(date.getTime())) continue;
    counts[date.getHours()].value += 1;
  }

  return counts;
}
