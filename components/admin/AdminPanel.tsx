'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { listGeneratedSolutions, persistAdminEntity, recordAdminActivity, removeAdminEntities, removeAdminEntity } from '@/lib/data/admin-repository';
import { uploadPublicAsset } from '@/lib/data/storage-repository';
import { AdminNav } from './AdminNav';
import { ActivityLogsPanel, MetricsPanel, UsersPanel } from './DashboardPanels';
import { AccessoriesEditor } from './editors/AccessoriesEditor';
import { BatteriesEditor } from './editors/BatteriesEditor';
import { InvertersEditor } from './editors/InvertersEditor';
import { LoadCatalogEditor } from './editors/LoadCatalogEditor';
import { PresetsEditor } from './editors/PresetsEditor';
import { RulesEditor, type RulesJumpTarget } from './editors/RulesEditor';
import { SolutionsEditor } from './editors/SolutionsEditor';
import { SuppliersEditor } from './editors/SuppliersEditor';
import { buildRuleGeneratedSolutions, getLogTarget, sanitizePathPart } from './helpers';
import {
  buildAccessoryPayload,
  buildBatteryPayload,
  buildEssRulePayload,
  buildInverterPayload,
  buildLoadCatalogPayload,
  buildPresetPayload,
  buildRulePayload,
  buildSolutionPayload,
} from './save-payloads';
import { AdminLoadingSkeleton } from './shared-ui';
import {
  emptyAccessory,
  emptyBattery,
  emptyEssRule,
  emptyInverter,
  emptyLoadCatalogItem,
  emptyPreset,
  emptyRule,
  emptySolution,
  type AccessoryRow,
  type AccessoryRuleRow,
  type AdminLogAction,
  type AdminLogEntity,
  type BatteryRow,
  type EssCompatibilityRuleRow,
  type GeneratedSolutionPayload,
  type InverterRow,
  type LoadCatalogRow,
  type PresetRow,
  type SolutionRow,
  type TabKey,
} from './types';
import { TABLE_TO_RESOURCE, useAdminData, type ResourceKey } from './hooks/useAdminData';

export function AdminPanel() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<TabKey>('metrics');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    loading,
    inverters,
    batteries,
    accessories,
    loadCatalogItems,
    presets,
    rules,
    essRules,
    solutions,
    users,
    simulations,
    supplierQuoteRequests,
    activityLogs,
    simulationsHasMore,
    loadingMoreSimulations,
    activityLogsHasMore,
    loadingMoreActivityLogs,
    ensureTabData,
    loadResource,
    loadMoreSimulations,
    loadMoreActivityLogs,
  } = useAdminData({ supabase, setError });

  const [inverterForm, setInverterForm] = useState<Partial<InverterRow>>(emptyInverter);
  const [batteryForm, setBatteryForm] = useState<Partial<BatteryRow>>(emptyBattery);
  const [accessoryForm, setAccessoryForm] = useState<Partial<AccessoryRow>>(emptyAccessory);
  const [loadCatalogForm, setLoadCatalogForm] = useState<Partial<LoadCatalogRow>>(emptyLoadCatalogItem);
  const [presetForm, setPresetForm] = useState<Partial<PresetRow>>(emptyPreset);
  const [ruleForm, setRuleForm] = useState<Partial<AccessoryRuleRow>>(emptyRule);
  const [essRuleForm, setEssRuleForm] = useState<Partial<EssCompatibilityRuleRow>>(emptyEssRule);
  const [rulesJumpTarget, setRulesJumpTarget] = useState<RulesJumpTarget>(null);
  const [solutionForm, setSolutionForm] = useState<Partial<SolutionRow>>(emptySolution);
  const [solutionAccessories, setSolutionAccessories] = useState<{ model: string | null; quantity: number }[]>([]);
  const [solutionComments, setSolutionComments] = useState<string[]>([]);
  const [solutionQuery, setSolutionQuery] = useState('');

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [status]);

  const filteredSolutions = solutions.filter((solution) => {
    const text = `${solution.solution_code} ${solution.inverter_model} ${solution.battery_model} ${solution.grid_topology}`.toLowerCase();
    return text.includes(solutionQuery.toLowerCase());
  });

  function setSuccess(message: string) {
    setStatus(message);
    setError(null);
  }

  function setFailure(message: string) {
    setError(message);
    setStatus(null);
  }

  async function recordActivityLog({
    entityType,
    action,
    targetId,
    targetLabel,
    summary,
    beforeData,
    afterData,
  }: {
    entityType: AdminLogEntity;
    action: AdminLogAction;
    targetId?: string | null;
    targetLabel: string;
    summary: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) {
    try {
      await recordAdminActivity(supabase, { entityType, action, targetId, targetLabel, summary, beforeData, afterData });
    } catch (error) {
      setFailure(`Registro salvo, mas o log falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }

  /** Every save* handler below (inverter, battery, accessory, load-catalog
   * item, preset, rule, ESS rule, solution) is the same skeleton around a
   * different payload: flip `saving`, insert-or-update by `id`, log the
   * activity, reset the form, and refresh the resource. Centralizing it here
   * means a change to that skeleton (e.g. new activity-log field) happens
   * once instead of being copy-pasted across 8 near-identical functions. */
  async function saveEntity<Payload extends Record<string, unknown>>({
    id,
    table,
    resourceKey,
    entityType,
    label,
    beforeData,
    buildPayload,
    targetLabel,
    summary,
    successMessage,
    resetForm,
    afterPersist,
    invalidPayloadMessage = 'Dados inválidos.',
  }: {
    id: string | null | undefined;
    table: string;
    resourceKey: ResourceKey;
    entityType: AdminLogEntity;
    /** Lowercase noun used in the "Salvando .../Atualizando ..." status message. */
    label: string;
    beforeData: unknown;
    buildPayload: () => Payload;
    targetLabel: (payload: Payload) => string;
    summary: (payload: Payload, action: AdminLogAction) => string;
    successMessage: string;
    resetForm: () => void;
    afterPersist?: () => void;
    /** Message shown when buildPayload throws (only saveSolution's JSON-ish
     * payload construction can realistically fail). */
    invalidPayloadMessage?: string;
  }) {
    setSaving(true);
    setStatus(id ? `Atualizando ${label}...` : `Salvando ${label}...`);
    setError(null);
    const action: AdminLogAction = id ? 'update' : 'create';

    try {
      const payload = buildPayload();
      // Supabase's update/insert reject excess properties when the value is
      // typed through a generic like Payload instead of a concrete object
      // literal — widen just for this call; buildPayload's actual return
      // type is still what targetLabel/summary below see.
      const row = payload as Record<string, unknown>;
      try { await persistAdminEntity(supabase, table, id, row); }
      catch (error) { return setFailure(error instanceof Error ? error.message : 'Não foi possível salvar o registro.'); }

      afterPersist?.();
      await recordActivityLog({
        entityType,
        action,
        targetId: id ?? null,
        targetLabel: targetLabel(payload),
        summary: summary(payload, action),
        beforeData,
        afterData: payload,
      });
      resetForm();
      setSuccess(successMessage);
      await loadResource(resourceKey);
    } catch (buildError) {
      setFailure(buildError instanceof Error ? buildError.message : invalidPayloadMessage);
    } finally {
      setSaving(false);
    }
  }

  async function uploadProductAsset(
    table: 'inverters' | 'batteries' | 'accessories',
    model: string | undefined,
    kind: 'image' | 'documents',
    file: File
  ) {
    const extension = file.name.split('.').pop();
    const path = `${table}/${sanitizePathPart(model || 'produto')}/${kind}/${crypto.randomUUID()}${
      extension ? `.${extension}` : ''
    }`;

    return uploadPublicAsset(supabase, 'product-assets', path, file);
  }

  function editSolution(solution: SolutionRow) {
    setSolutionForm(solution);
    setSolutionAccessories(solution.accessories ?? []);
    setSolutionComments(solution.comments ?? []);
  }

  function resetSolution() {
    setSolutionForm(emptySolution);
    setSolutionAccessories([]);
    setSolutionComments([]);
  }

  function saveInverter(afterPersist?: () => void) {
    return saveEntity({
      id: inverterForm.id,
      table: 'inverters',
      resourceKey: 'inverters',
      entityType: 'inverter',
      label: 'inversor',
      beforeData: inverterForm.id ? inverters.find((row) => row.id === inverterForm.id) : null,
      buildPayload: () => buildInverterPayload(inverterForm),
      targetLabel: (payload) => payload.model || 'Inversor sem modelo',
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} o inversor ${payload.model || 'sem modelo'}.`,
      successMessage: 'Inversor salvo.',
      resetForm: () => setInverterForm(emptyInverter),
      afterPersist,
    });
  }

  function saveBattery(afterPersist?: () => void) {
    return saveEntity({
      id: batteryForm.id,
      table: 'batteries',
      resourceKey: 'batteries',
      entityType: 'battery',
      label: 'bateria',
      beforeData: batteryForm.id ? batteries.find((row) => row.id === batteryForm.id) : null,
      buildPayload: () => buildBatteryPayload(batteryForm),
      targetLabel: (payload) => payload.model || 'Bateria sem modelo',
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} a bateria ${payload.model || 'sem modelo'}.`,
      successMessage: 'Bateria salva.',
      resetForm: () => setBatteryForm(emptyBattery),
      afterPersist,
    });
  }

  function saveAccessory(afterPersist?: () => void) {
    return saveEntity({
      id: accessoryForm.id,
      table: 'accessories',
      resourceKey: 'accessories',
      entityType: 'accessory',
      label: 'acessório',
      beforeData: accessoryForm.id ? accessories.find((row) => row.id === accessoryForm.id) : null,
      buildPayload: () => buildAccessoryPayload(accessoryForm),
      targetLabel: (payload) => payload.model || 'Acessório sem modelo',
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} o acessório ${payload.model || 'sem modelo'}.`,
      successMessage: 'Acessório salvo.',
      resetForm: () => setAccessoryForm(emptyAccessory),
      afterPersist,
    });
  }

  function saveLoadCatalogItem(afterPersist?: () => void) {
    return saveEntity({
      id: loadCatalogForm.id,
      table: 'load_catalog',
      resourceKey: 'loadCatalog',
      entityType: 'load_catalog_item',
      label: 'carga',
      beforeData: loadCatalogForm.id ? loadCatalogItems.find((row) => row.id === loadCatalogForm.id) : null,
      buildPayload: () => buildLoadCatalogPayload(loadCatalogForm),
      targetLabel: (payload) => payload.name_pt || 'Carga sem nome',
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} a carga ${payload.name_pt || 'sem nome'}.`,
      successMessage: 'Carga salva.',
      resetForm: () => setLoadCatalogForm(emptyLoadCatalogItem),
      afterPersist,
    });
  }

  function savePreset(afterPersist?: () => void) {
    return saveEntity({
      id: presetForm.id,
      table: 'load_presets',
      resourceKey: 'presets',
      entityType: 'load_preset',
      label: 'predefinição',
      beforeData: presetForm.id ? presets.find((row) => row.id === presetForm.id) : null,
      buildPayload: () => buildPresetPayload(presetForm, presets.length),
      targetLabel: (payload) => payload.name,
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} a predefinição ${payload.name}.`,
      successMessage: 'Predefinição salva.',
      resetForm: () => setPresetForm(emptyPreset),
      afterPersist,
    });
  }

  function saveRule(afterPersist?: () => void) {
    return saveEntity({
      id: ruleForm.id,
      table: 'accessory_rules',
      resourceKey: 'rules',
      entityType: 'rule',
      label: 'regra',
      beforeData: ruleForm.id ? rules.find((row) => row.id === ruleForm.id) : null,
      buildPayload: () => buildRulePayload(ruleForm),
      targetLabel: (payload) => payload.name || 'Regra sem nome',
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} a regra ${payload.name || 'sem nome'}.`,
      successMessage: 'Regra salva.',
      resetForm: () => setRuleForm(emptyRule),
      afterPersist,
    });
  }

  function saveEssRule(afterPersist?: () => void) {
    return saveEntity({
      id: essRuleForm.id,
      table: 'ess_compatibility_rules',
      resourceKey: 'essRules',
      entityType: 'rule',
      label: 'regra ESS',
      beforeData: essRuleForm.id ? essRules.find((row) => row.id === essRuleForm.id) : null,
      buildPayload: () => buildEssRulePayload(essRuleForm, batteries),
      targetLabel: (payload) => `${payload.inverter_model || '-'} + ${payload.battery_model || '-'}`,
      summary: (payload, action) =>
        `${action === 'create' ? 'Criou' : 'Atualizou'} regra ESS para ${payload.inverter_model || '-'} com ${payload.battery_model || '-'}.`,
      successMessage: 'Regra ESS salva.',
      resetForm: () => setEssRuleForm(emptyEssRule),
      afterPersist,
    });
  }

  function saveSolution(afterPersist?: () => void) {
    return saveEntity({
      id: solutionForm.id,
      table: 'approved_solutions',
      resourceKey: 'solutions',
      entityType: 'solution',
      label: 'combinação',
      beforeData: solutionForm.id ? solutions.find((row) => row.id === solutionForm.id) : null,
      buildPayload: () => buildSolutionPayload(solutionForm, solutionAccessories, solutionComments),
      targetLabel: (payload) => payload.solution_code || 'Combinação sem código',
      summary: (payload, action) => `${action === 'create' ? 'Criou' : 'Atualizou'} a combinação ${payload.solution_code || 'sem código'}.`,
      successMessage: 'Combinação salva.',
      resetForm: resetSolution,
      afterPersist,
      invalidPayloadMessage: 'JSON inválido.',
    });
  }

  async function applyGeneratedSolutions(generatedSolutions: GeneratedSolutionPayload[], afterApply?: () => void, cleanupStale = false) {
    if (generatedSolutions.length === 0) {
      setFailure('Nenhuma combinação para gerar.');
      return;
    }

    setSaving(true);
    setStatus(`Aprovando ${generatedSolutions.length} combinação${generatedSolutions.length > 1 ? 'ões' : ''}...`);
    setError(null);

    const { error: upsertError } = await supabase
      .from('approved_solutions')
      .upsert(generatedSolutions.map((solution) => ({ ...solution, raw_solution: solution.raw_solution as never })), { onConflict: 'solution_code' });

    if (upsertError) {
      setSaving(false);
      return setFailure(upsertError.message);
    }

    if (cleanupStale) {
      const newCodes = new Set(generatedSolutions.map((s) => s.solution_code));
      // Only clean up stale rows for the inverter+battery pairs actually present in this
      // batch, so combinations for batteries/inverters left out of the current generation
      // (e.g. by the filter chips) are never touched.
      const touchedPairs = new Set(
        generatedSolutions.map((s) => `${s.inverter_model}::${s.battery_model}`)
      );
      const existingGenerated = await listGeneratedSolutions(supabase);
      const staleIds = (existingGenerated ?? [])
        .filter(
          (s) =>
            touchedPairs.has(`${s.inverter_model}::${s.battery_model}`) &&
            !newCodes.has(s.solution_code)
        )
        .map((s) => s.id);
      if (staleIds.length > 0) {
        await removeAdminEntities(supabase, 'approved_solutions', staleIds);
      }
    }

    setSaving(false);
    afterApply?.();

    await recordActivityLog({
      entityType: 'solution',
      action: 'update',
      targetId: null,
      targetLabel: 'Combinações geradas por regras',
      summary: `Gerou/atualizou ${generatedSolutions.length} combinações a partir das regras.`,
      beforeData: null,
      afterData: {
        count: generatedSolutions.length,
        source_file: 'generated-rules',
      },
    });

    setSuccess(`${generatedSolutions.length} combinação${generatedSolutions.length > 1 ? 'ões' : ''} gerada${generatedSolutions.length > 1 ? 's' : ''}/atualizada${generatedSolutions.length > 1 ? 's' : ''}.`);
    await loadResource('solutions');
  }

  async function removeRow(table: string, id: string, soft = false) {
    setSaving(true);
    setRemovingIds((current) => new Set(current).add(id));
    setStatus(soft ? 'Inativando registro...' : 'Removendo registro...');
    setError(null);
    const logTarget = getLogTarget(table, id, {
      inverters,
      batteries,
      accessories,
      loadCatalogItems,
      presets,
      solutions,
      essRules,
      rules,
    });
    setSaving(false);

    try {
      await removeAdminEntity(supabase, table, id, soft);
    } catch (error) {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      return setFailure(error instanceof Error ? error.message : 'Não foi possível remover o registro.');
    }
    await recordActivityLog({
      entityType: logTarget.entityType,
      action: soft ? 'deactivate' : 'delete',
      targetId: id,
      targetLabel: logTarget.label,
      summary: `${soft ? 'Inativou' : 'Removeu'} ${logTarget.label}.`,
      beforeData: logTarget.beforeData,
      afterData:
        soft && logTarget.beforeData && typeof logTarget.beforeData === 'object'
          ? { ...logTarget.beforeData, active: false }
          : null,
    });
    setSuccess(`${soft ? 'Registro inativado' : 'Registro removido'} com sucesso.`);
    const resourceKey = TABLE_TO_RESOURCE[table];
    if (resourceKey) await loadResource(resourceKey);
    setRemovingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function removeManySolutions(ids: string[]) {
    if (ids.length === 0) return;
    setSaving(true);
    setRemovingIds((current) => new Set([...current, ...ids]));
    setStatus(`Removendo ${ids.length} combinações...`);
    setError(null);
    setSaving(false);

    try {
      await removeAdminEntities(supabase, 'approved_solutions', ids);
    } catch (error) {
      setRemovingIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      return setFailure(error instanceof Error ? error.message : 'Não foi possível remover as combinações.');
    }
    await recordActivityLog({
      entityType: 'solution',
      action: 'delete',
      targetId: null,
      targetLabel: `${ids.length} combinações`,
      summary: `Removeu ${ids.length} combinações filtradas em massa.`,
      beforeData: { ids },
      afterData: null,
    });
    setSuccess(`${ids.length} combinações removidas com sucesso.`);
    await loadResource('solutions');
    setRemovingIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function refreshAllSolutions() {
    setSaving(true);
    setStatus('Recalculando todas as combinações...');
    setError(null);

    const regenerated = buildRuleGeneratedSolutions({
      inverters,
      batteries,
      accessoryRules: rules,
      essRules,
      filterInverterModels: null,
      filterBatteryModels: null,
    });

    if (regenerated.length === 0) {
      setSaving(false);
      return setFailure(
        'Nenhuma combinação gerada a partir das regras. Verifique se existem regras ESS ativas antes de atualizar.'
      );
    }

    const previousIds = solutions.map((s) => s.id);
    const refreshResponse = await fetch('/api/admin/solutions/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedSolutions: regenerated, previousIds }),
    });
    const refreshResult = (await refreshResponse.json().catch(() => null)) as { error?: string } | null;
    if (!refreshResponse.ok) {
      setSaving(false);
      return setFailure(refreshResult?.error ?? 'Não foi possível atualizar as combinações.');
    }

    setSaving(false);
    await recordActivityLog({
      entityType: 'solution',
      action: 'update',
      targetId: null,
      targetLabel: 'Todas as combinações',
      summary: `Excluiu ${previousIds.length} combinação${previousIds.length !== 1 ? 'ões' : ''} aprovada${previousIds.length !== 1 ? 's' : ''} e gerou/aprovou ${regenerated.length} nova${regenerated.length !== 1 ? 's' : ''} a partir das regras.`,
      beforeData: { removedCount: previousIds.length },
      afterData: { generatedCount: regenerated.length },
    });
    setSuccess(`${regenerated.length} combinação${regenerated.length !== 1 ? 'ões' : ''} regenerada${regenerated.length !== 1 ? 's' : ''} e aprovada${regenerated.length !== 1 ? 's' : ''}.`);
    await loadResource('solutions');
  }

  async function sendPasswordReset(email: string) {
    if (!email) return;
    setSaving(true);
    setStatus('Enviando email de redefinição...');
    setError(null);
    const origin = window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/pt/reset-password`,
    });
    setSaving(false);

    if (resetError) return setFailure(resetError.message);
    setSuccess(`Email de redefinição enviado para ${email}.`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/pt/login');
    router.refresh();
  }

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    void ensureTabData(tab);
  }

  function viewAccessoryRules(accessoryId: string, accessoryModel: string) {
    setRulesJumpTarget({ scope: 'accessory', accessoryId, accessoryModel });
    selectTab('rules');
  }

  function viewInverterEssRules(inverterModel: string) {
    setRulesJumpTarget({ scope: 'ess', inverterModel });
    selectTab('rules');
  }

  function refreshActiveTab() {
    void ensureTabData(activeTab, true);
  }

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="mx-auto grid h-full w-full grid-rows-[auto_minmax(0,1fr)] gap-4 px-4 py-5">
        <header className="z-20 flex flex-col gap-3 border-b bg-background px-1 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Administração de soluções</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre produtos, combinações aprovadas e regras automáticas de acessórios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshActiveTab} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="hidden min-h-0 gap-2 overflow-y-auto rounded-lg border bg-card p-2 lg:flex lg:flex-col">
            <div className="flex flex-1 flex-col gap-2">
              <AdminNav activeTab={activeTab} onSelectTab={selectTab} />
            </div>
            <Separator />
            <Button variant="outline" className="justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </nav>

          <section className="min-h-0 min-w-0 space-y-4 overflow-y-auto pr-1">
            {(status || error) && (
              <div
                role={error ? 'alert' : 'status'}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  error ? 'border-destructive/40 text-destructive' : 'border-emerald-300 text-emerald-700'
                }`}
              >
                {error ?? status}
              </div>
            )}

            {loading ? (
              <AdminLoadingSkeleton />
            ) : (
              <>
                {activeTab === 'metrics' && (
                  <MetricsPanel
                    simulations={simulations}
                    supplierQuoteRequests={supplierQuoteRequests}
                    users={users}
                    hasMoreSimulations={simulationsHasMore}
                    loadingMoreSimulations={loadingMoreSimulations}
                    onLoadMoreSimulations={loadMoreSimulations}
                  />
                )}

                {activeTab === 'users' && (
                  <UsersPanel users={users} onResetPassword={sendPasswordReset} saving={saving} />
                )}

                {activeTab === 'solutions' && (
                  <SolutionsEditor
                    solutions={filteredSolutions}
                    query={solutionQuery}
                    setQuery={setSolutionQuery}
                    form={solutionForm}
                    setForm={setSolutionForm}
                    accessories={solutionAccessories}
                    setAccessories={setSolutionAccessories}
                    comments={solutionComments}
                    setComments={setSolutionComments}
                    inverters={inverters}
                    batteries={batteries}
                    accessoryRules={rules}
                    essRules={essRules}
                    onEdit={editSolution}
                    onNew={resetSolution}
                    onSave={saveSolution}
                    onApplyGenerated={applyGeneratedSolutions}
                    onRefreshAll={refreshAllSolutions}
                    onRemove={(id) => removeRow('approved_solutions', id, true)}
                    onDelete={(id) => removeRow('approved_solutions', id)}
                    onDeleteMany={removeManySolutions}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'inverters' && (
                  <InvertersEditor
                    rows={inverters}
                    form={inverterForm}
                    setForm={setInverterForm}
                    onSave={saveInverter}
                    onRemove={(id) => removeRow('inverters', id)}
                    removingIds={removingIds}
                    uploadAsset={uploadProductAsset}
                    saving={saving}
                    essRows={essRules}
                    onViewEssRules={viewInverterEssRules}
                  />
                )}

                {activeTab === 'batteries' && (
                  <BatteriesEditor
                    rows={batteries}
                    form={batteryForm}
                    setForm={setBatteryForm}
                    onSave={saveBattery}
                    onRemove={(id) => removeRow('batteries', id)}
                    removingIds={removingIds}
                    uploadAsset={uploadProductAsset}
                    saving={saving}
                  />
                )}

                {activeTab === 'accessories' && (
                  <AccessoriesEditor
                    rows={accessories}
                    form={accessoryForm}
                    setForm={setAccessoryForm}
                    onSave={saveAccessory}
                    onRemove={(id) => removeRow('accessories', id)}
                    removingIds={removingIds}
                    uploadAsset={uploadProductAsset}
                    rules={rules}
                    saving={saving}
                    onViewRules={viewAccessoryRules}
                  />
                )}

                {activeTab === 'rules' && (
                  <RulesEditor
                    accessories={accessories}
                    inverters={inverters}
                    batteries={batteries}
                    rules={rules}
                    ruleForm={ruleForm}
                    setRuleForm={setRuleForm}
                    onSaveRule={saveRule}
                    onRemoveRule={(id) => removeRow('accessory_rules', id)}
                    essRows={essRules}
                    essForm={essRuleForm}
                    setEssForm={setEssRuleForm}
                    onSaveEss={saveEssRule}
                    onRemoveEss={(id) => removeRow('ess_compatibility_rules', id)}
                    removingIds={removingIds}
                    saving={saving}
                    jumpTarget={rulesJumpTarget}
                  />
                )}

                {activeTab === 'loads' && (
                  <LoadCatalogEditor
                    rows={loadCatalogItems}
                    form={loadCatalogForm}
                    setForm={setLoadCatalogForm}
                    onSave={saveLoadCatalogItem}
                    onRemove={(id) => removeRow('load_catalog', id)}
                    onDeactivate={(id) => removeRow('load_catalog', id, true)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'presets' && (
                  <PresetsEditor
                    rows={presets}
                    loadCatalogItems={loadCatalogItems}
                    form={presetForm}
                    setForm={setPresetForm}
                    onSave={savePreset}
                    onRemove={(id) => removeRow('load_presets', id)}
                    removingIds={removingIds}
                    saving={saving}
                  />
                )}

                {activeTab === 'logs' && (
                  <ActivityLogsPanel
                    logs={activityLogs}
                    hasMore={activityLogsHasMore}
                    loadingMore={loadingMoreActivityLogs}
                    onLoadMore={loadMoreActivityLogs}
                  />
                )}
                {activeTab === 'suppliers' && <SuppliersEditor />}
              </>
            )}
          </section>
        </div>
      </div>

      <Button
        type="button"
        size="icon-lg"
        className="fixed bottom-4 left-4 z-30 shadow-lg lg:hidden"
        aria-label="Abrir menu"
        onClick={() => setMobileMenuOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu administrativo">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r bg-card px-4 py-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold leading-tight">Administração</p>
                <p className="text-xs text-muted-foreground">SolaX Calculator</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <nav className="mt-8 flex flex-col gap-2">
              <AdminNav activeTab={activeTab} onSelectTab={selectTab} />
            </nav>

            <div className="mt-auto grid gap-2">
              <Button variant="outline" onClick={refreshActiveTab} disabled={loading}>
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
              <Button variant="outline" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
