'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EnergyTariffResult } from '@/lib/tariff/aneel-service';
import { tariffSubgroups } from '@/lib/tariff/subgroups';

interface AutomaticTariffPanelProps {
  distributor: string;
  setDistributor: (value: string) => void;
  distributors: string[];
  loadingDistributors: boolean;

  subgroup: string;
  setSubgroup: (value: string) => void;

  tariffMode: string;
  setTariffMode: (value: string) => void;

  referenceDate: string;

  tariffs: EnergyTariffResult | null;
  loading: boolean;
  error: string | null;
  onFetchTariffs: () => Promise<void>;
}

const TARIFF_MODES = ['Tarifa Branca', 'Convencional', 'Azul', 'Verde'];

export function AutomaticTariffPanel({
  distributor,
  setDistributor,
  distributors,
  loadingDistributors,
  subgroup,
  setSubgroup,
  tariffMode,
  setTariffMode,
  referenceDate,
  tariffs,
  loading,
  error,
  onFetchTariffs,
}: AutomaticTariffPanelProps) {
  const [showDistributorList, setShowDistributorList] = useState(false);
  const filteredDistributors = distributor.length > 0
    ? distributors.filter((d) => d.toLowerCase().includes(distributor.toLowerCase()))
    : [];

  const isReadyToFetch = distributor && subgroup && tariffMode && referenceDate;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Preencha os dados abaixo e clique em &quot;Buscar tarifas&quot; para carregar os valores homologados pela ANEEL.
      </p>

      <div className="rounded-lg border bg-muted/20 p-3 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="aneelDistributor">Distribuidora <span aria-label="obrigatório">*</span></Label>
            <div className="relative">
              <Input
                id="aneelDistributor"
                type="text"
                placeholder={loadingDistributors ? 'Carregando...' : 'Digite o nome'}
                value={distributor}
                onChange={(e) => {
                  setDistributor(e.target.value);
                  setShowDistributorList(true);
                }}
                onFocus={() => distributor.length > 0 && setShowDistributorList(true)}
                disabled={loadingDistributors}
              />
              {showDistributorList && filteredDistributors.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded border bg-background shadow-lg">
                  {filteredDistributors.slice(0, 10).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-muted text-sm"
                      onClick={() => {
                        setDistributor(d);
                        setShowDistributorList(false);
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {loadingDistributors && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Carregando distribuidoras...
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aneelSubgroup">Subgrupo tarifário <span aria-label="obrigatório">*</span></Label>
            <select
              id="aneelSubgroup"
              value={subgroup}
              onChange={(e) => setSubgroup(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione um subgrupo</option>
              {tariffSubgroups.map((sg) => (
                <option key={sg.value} value={sg.value}>
                  {sg.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Consulte sua fatura de energia</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="aneelTariffMode">Modalidade tarifária <span aria-label="obrigatório">*</span></Label>
            <select
              id="aneelTariffMode"
              value={tariffMode}
              onChange={(e) => setTariffMode(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione uma modalidade</option>
              {TARIFF_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Conforme contrato com a distribuidora</p>
          </div>

          <div className="space-y-1.5">
            <Label>Última atualização disponível</Label>
            <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">
              {referenceDate ? (
                <p className="font-medium">
                  {new Date(referenceDate + 'T00:00:00Z').toLocaleDateString('pt-BR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              ) : (
                <p className="text-muted-foreground">Carregando...</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Dados homologados pela ANEEL</p>
          </div>
        </div>
      </div>

      <Button
        onClick={onFetchTariffs}
        disabled={!isReadyToFetch || loading}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Buscando tarifas...
          </>
        ) : (
          'Buscar tarifas da ANEEL'
        )}
      </Button>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {tariffs && (
        <div className="rounded-lg border bg-emerald-500/5 p-3 space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Tarifas carregadas com sucesso
          </p>
          <div className="grid gap-2 text-xs text-muted-foreground">
            <p>
              <strong>Distribuidora:</strong> {tariffs.distributor}
            </p>
            <p>
              <strong>Subgrupo:</strong> {tariffs.subgroup}
            </p>
            <p>
              <strong>Modalidade:</strong> {tariffs.tariffMode}
            </p>
            {tariffs.validFrom && (
              <p>
                <strong>Válido de:</strong> {new Date(tariffs.validFrom).toLocaleDateString('pt-BR')}
              </p>
            )}
            {tariffs.validUntil && (
              <p>
                <strong>até:</strong> {new Date(tariffs.validUntil).toLocaleDateString('pt-BR')}
              </p>
            )}
            {tariffs.fetchedAt && (
              <p>
                <strong>Consultado em:</strong> {new Date(tariffs.fetchedAt).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic mt-2">
            Valores homologados pela ANEEL, sem inclusão automática de impostos, bandeiras tarifárias, CIP ou condições específicas da fatura.
          </p>
        </div>
      )}
    </div>
  );
}
