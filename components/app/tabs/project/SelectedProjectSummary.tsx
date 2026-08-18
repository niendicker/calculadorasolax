'use client';

import { useState } from 'react';
import {
  BatteryCharging,
  Calculator,
  ChevronRight,
  Copy,
  Gauge,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Separator } from '@/components/ui/separator';
import { formatAddress, isAddressEmpty } from '@/lib/address';
import { createClient } from '@/lib/supabase/client';
import type { Client, MarginSettings, ProjectStatus, SavedProject, UserServiceItem, UserStockItem } from '@/lib/types';
import { totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import {
  batteryQuantityBreakdown,
  buildQuoteShareSnapshot,
  buildWhatsAppShareUrl,
  calculateSystemCost,
  formatCurrencyBRL,
  normalizeAccessoryLine,
  solutionMetrics,
} from '../../helpers';
import { Metric, WhatsAppIcon } from '../../shared-ui';
import type { AccessoryCatalogOption, BatteryCatalogOption, InlineProfile, InverterCatalogOption } from '../../types';
import { ProjectEventsTimeline } from './ProjectEventsTimeline';
import { ProjectStatusSelect } from './ProjectStatusSelect';
import { SupplierQuoteRequestModal } from './SupplierQuoteRequestModal';

/** A product's category label, its nickname/model (with quantity, if any),
 * and — only when a nickname is set — the bare model code as a small
 * caption underneath, so a long nickname + model pair doesn't get crammed
 * onto one line next to the category label. */
function ProductNameLine({
  category,
  model,
  nickname,
  suffix,
}: {
  category: string;
  model: string;
  nickname?: string | null;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{category}</p>
      <p className="font-medium text-foreground">
        {nickname || model}
        {suffix}
      </p>
      {nickname && <p className="text-[0.7rem] text-muted-foreground">{model}</p>}
    </div>
  );
}

/** Rich, read-only summary of a saved project — either one selected from the
 * list ("Abrir"'s own live editor is a separate flow) or the one currently
 * being edited in place, so the sidebar shows the exact same actions and
 * data regardless of how the user got there. Rendered in the shell's
 * summary panel in place of the "Configuração salva junto" summary, which
 * is now only shown for a brand-new, not-yet-saved draft. */
export function SelectedProjectSummary({
  project,
  client,
  profile,
  batteryCatalog,
  inverterCatalog,
  accessoryCatalog,
  userStockItems,
  userServices,
  marginSettings,
  onClose,
  onOpenSizing,
  onUpdateStatus,
  onManageSuppliers,
  onRemove,
  onDuplicate,
}: {
  project: SavedProject;
  client: Client | undefined;
  profile: InlineProfile | null;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  accessoryCatalog: AccessoryCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  /** Omitted while editing this project in place (no "unselect" concept
   *  there — "Fechar" on the draft card itself is what exits editing,
   *  complete with its own discard confirmation when dirty). */
  onClose?: () => void;
  onOpenSizing: () => void;
  onUpdateStatus: (status: ProjectStatus) => void;
  /** Sends the seller to Fornecedores — used by the supplier quote-request modal
   *  when they haven't picked any suppliers there yet. */
  onManageSuppliers: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const metrics = project.solution ? solutionMetrics(project.solution, batteryCatalog) : null;
  const systemCost =
    project.solution || project.services.length > 0
      ? calculateSystemCost(project.solution, userStockItems, project.services, userServices, marginSettings, batteryCatalog)
      : null;
  const batteryParts = project.solution
    ? batteryQuantityBreakdown(
        project.solution.batteryModel,
        project.solution.batteryQty,
        batteryCatalog,
        (project.solution.inverterQty ?? 1) * (project.solution.batteryPortsUsed ?? 1)
      )
    : [];
  const [supplierQuoteModalOpen, setSupplierQuoteModalOpen] = useState(false);
  const [sharingQuote, setSharingQuote] = useState(false);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  const shareableProject = {
    name: project.name,
    address: project.address,
    topology: project.residentialOptions.topology,
    gridType: project.residentialOptions.gridType,
    loadsCount: project.residentialOptions.loads.length,
    peakW: totalPeakW(project.residentialOptions.loads, project.residentialOptions.peakCalcMode ?? 'sum'),
    dailyKwh: totalDailyKwh(project.residentialOptions.loads, project.residentialOptions.operationHours),
    solution: project.solution,
  };

  const canShareQuote = Boolean(project.solution && client?.phone && profile);
  const canRequestSupplierQuote = Boolean(project.solution && profile);

  // Generates the public quote-share link (same snapshot the old separate
  // "Compartilhar orçamento (link)" button used to build) and opens WhatsApp
  // with a short message containing it, in one action — the link itself is
  // now a strictly richer experience than the old formatted-text message
  // (buildClientQuoteText) ever was: same product/financial breakdown, plus
  // Aceitar/Recusar the text could never offer. Logs a project_events row so
  // this shows up in the Histórico below, and — like the old two actions
  // both did — only advances status out of 'draft', so re-sharing after the
  // client already responded doesn't quietly undo an accepted/rejected.
  async function handleShareQuote() {
    if (!profile || !client?.phone) return;
    const snapshot = buildQuoteShareSnapshot(project, {
      client,
      profile,
      userStockItems,
      marginSettings,
      userServices,
      batteryCatalog,
      inverterCatalog,
    });
    if (!snapshot) return;

    setSharingQuote(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('quote_shares')
        .insert({ project_id: project.id, user_id: profile.id, snapshot })
        .select('id')
        .single();
      if (error || !data) return;

      const link = `${window.location.origin}/cotacao/${data.id}`;
      const message = `Olá! Segue o orçamento da sua instalação solar:\n${link}\n\nAcesse para conferir os detalhes e responder.`;
      const whatsAppUrl = buildWhatsAppShareUrl(client.phone, message);
      if (whatsAppUrl) window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');

      const wasDraft = project.status === 'draft';
      await supabase.from('project_events').insert({
        project_id: project.id,
        actor_id: profile.id,
        event_type: 'quote_shared',
        from_status: wasDraft ? 'draft' : null,
        to_status: wasDraft ? 'sent' : null,
      });
      if (wasDraft) onUpdateStatus('sent');
      setEventsRefreshKey((key) => key + 1);
    } finally {
      setSharingQuote(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold">{project.name}</h2>
            <ProjectStatusSelect status={project.status} onChange={onUpdateStatus} />
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate">{client?.name || 'Cliente não informado'}</span>
          </p>
          {client?.phone && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.phone}</span>
            </p>
          )}
          {client?.email && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.email}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Duplicar projeto ${project.name}`}
            onClick={onDuplicate}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <ConfirmDeleteButton
            ariaLabel={`Remover projeto ${project.name}`}
            title="Remover projeto?"
            description="O projeto salvo e sua configuração serão removidos deste navegador."
            confirmLabel="Remover"
            onConfirm={onRemove}
          />
          {onClose && (
            <Button variant="ghost" size="icon-sm" aria-label="Fechar resumo do projeto" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!isAddressEmpty(project.address) && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0">{formatAddress(project.address)}</span>
        </p>
      )}

      {metrics && project.solution && (
        <>
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            <Metric
              icon={Gauge}
              label="Nominal"
              value={metrics.nominalW != null ? (metrics.nominalW / 1000).toFixed(2) : '-'}
              unit="kVA"
            />
            <Metric
              icon={Zap}
              label="Máxima"
              value={metrics.peakW != null ? (metrics.peakW / 1000).toFixed(2) : '-'}
              unit="kVA"
            />
            <Metric icon={BatteryCharging} label="Energia" value={metrics.energyKwh.toFixed(2)} unit="kWh" />
          </div>
          <div className="space-y-2.5 rounded-lg border bg-background p-2.5 text-xs text-muted-foreground">
            <div className="space-y-2.5">
              <ProductNameLine
                category="Inversor"
                model={project.solution.inverterModel}
                nickname={inverterCatalog.find((item) => item.model === project.solution?.inverterModel)?.nickname}
              />
              {batteryParts.map((part, index) => (
                <ProductNameLine
                  key={part.model}
                  category={index === 0 ? 'Bateria' : 'Bateria (expansão)'}
                  model={part.model}
                  nickname={batteryCatalog.find((item) => item.model === part.model)?.nickname}
                  suffix={` × ${part.qty}`}
                />
              ))}
              {project.solution.pvPowerKw ? (
                <p>
                  Fotovoltaico <span className="font-medium text-foreground">{project.solution.pvPowerKw.toFixed(2)} kWp</span>
                </p>
              ) : null}
            </div>

            {project.solution.accessories.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2.5">
                  <p className="font-medium text-foreground">Acessórios</p>
                  {project.solution.accessories.map((accessory) => {
                    const { model, qty, optional, bundled, appliesTo } = normalizeAccessoryLine(accessory);
                    const nickname = accessoryCatalog.find((item) => item.model === model)?.nickname;
                    return (
                      <div key={model} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-foreground">
                            {nickname || model}
                            {qty !== 1 ? ` × ${qty}` : ''}
                          </p>
                          {nickname && <p className="truncate text-[0.7rem]">{model}</p>}
                        </div>
                        <span className="shrink-0 text-[0.7rem]">
                          {bundled
                            ? appliesTo === 'inverter'
                              ? 'Incluso no inversor'
                              : appliesTo === 'battery'
                                ? 'Incluso na bateria'
                                : 'Incluso'
                            : optional
                              ? 'Opcional'
                              : 'Obrigatório'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!project.solution && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Este projeto ainda não tem uma solução calculada.
        </p>
      )}

      {((systemCost && systemCost.pricedItemsCount > 0) || project.services.length > 0) && (
        <>
          <Separator />
          <div className="space-y-2.5 rounded-lg border bg-background p-2.5">
            {systemCost && systemCost.pricedItemsCount > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Valor da solução</p>
                <p className="text-lg font-semibold">{formatCurrencyBRL(systemCost.totalCost)}</p>
                {!systemCost.isComplete && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Preço parcial: {systemCost.pricedItemsCount} de {systemCost.totalItemsCount} itens com valor no
                    estoque.
                  </p>
                )}
              </div>
            )}

            {project.services.length > 0 && (
              <>
                {systemCost && systemCost.pricedItemsCount > 0 && <Separator />}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Serviços</p>
                  {project.services.map((line) => {
                    const unitValue = userServices.find((service) => service.id === line.serviceId)?.unitValue;
                    return (
                      <div key={line.serviceId} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {line.name}
                          {line.qty !== 1 ? ` × ${line.qty}` : ''}
                        </span>
                        <span className="shrink-0">
                          {unitValue != null ? formatCurrencyBRL(unitValue * line.qty) : 'sem preço'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Separator />

      <Button size="lg" className="w-full shadow-sm transition-shadow hover:shadow-md" onClick={onOpenSizing}>
        <Calculator className="h-4 w-4" />
        Ir para Dimensionamento
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        size="lg"
        className="w-full bg-emerald-600 text-white shadow-sm transition-shadow hover:bg-emerald-700 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
        disabled={!canShareQuote || sharingQuote}
        title={
          !project.solution
            ? 'Calcule uma solução para este projeto antes de compartilhar.'
            : !client?.phone
              ? 'Cadastre o telefone do cliente para enviar a cotação por WhatsApp.'
              : undefined
        }
        onClick={() => void handleShareQuote()}
      >
        {sharingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-4 w-4" />}
        Compartilhar cotação
      </Button>

      <Button
        variant="outline"
        size="lg"
        className="w-full border-primary/25 text-primary hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        disabled={!canRequestSupplierQuote}
        title={!project.solution ? 'Calcule uma solução para este projeto antes de solicitar orçamento.' : undefined}
        onClick={() => setSupplierQuoteModalOpen(true)}
      >
        <Mail className="h-4 w-4" />
        Solicitar orçamento ao fornecedor
      </Button>
      {profile && (
        <SupplierQuoteRequestModal
          open={supplierQuoteModalOpen}
          onClose={() => setSupplierQuoteModalOpen(false)}
          projectId={project.id}
          project={shareableProject}
          profile={profile}
          batteryCatalog={batteryCatalog}
          onSent={() => setEventsRefreshKey((key) => key + 1)}
          onManageSuppliers={onManageSuppliers}
        />
      )}

      <Separator />
      <ProjectEventsTimeline projectId={project.id} refreshKey={`${project.updatedAt}:${eventsRefreshKey}`} />
      <p className="text-xs text-muted-foreground">
        Atualizado em{' '}
        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(project.updatedAt))}
      </p>
    </>
  );
}
