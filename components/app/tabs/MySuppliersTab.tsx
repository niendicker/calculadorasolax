'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, ShieldCheck, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '../shell/slots';

type Supplier = {
  id: string;
  name: string;
  description: string | null;
  order_mode: string;
  is_default_for_all: boolean;
};

const orderModeLabels: Record<string, string> = { quote: 'Cotação', direct: 'Pedido direto', both: 'Cotação e pedido direto' };

export function MySuppliersTab() {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [maxSuppliers, setMaxSuppliers] = useState(2);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }

    const [supplierResult, settingsResult, preferenceResult] = await Promise.all([
      supabase.from('suppliers').select('id, name, description, order_mode, is_default_for_all').eq('active', true).eq('ordering_enabled', true).order('name'),
      supabase.from('app_settings').select('max_user_suppliers').eq('id', true).single(),
      supabase.from('user_supplier_preferences').select('supplier_id').eq('user_id', uid),
    ]);
    const error = supplierResult.error ?? settingsResult.error ?? preferenceResult.error;
    if (error) setMessage(error.message);
    setSuppliers((supplierResult.data ?? []) as Supplier[]);
    setMaxSuppliers(settingsResult.data?.max_user_suppliers ?? 2);
    setSelectedIds((preferenceResult.data ?? []).map((row) => row.supplier_id as string));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // Initial remote-resource synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const defaultSuppliers = suppliers.filter((supplier) => supplier.is_default_for_all);
  const selectableSuppliers = suppliers.filter((supplier) => !supplier.is_default_for_all);
  const atLimit = selectedIds.length >= maxSuppliers;

  async function toggleSupplier(supplier: Supplier) {
    if (!userId || pendingId) return;
    const selected = selectedIds.includes(supplier.id);
    if (!selected && atLimit) return setMessage(`Limite de ${maxSuppliers} fornecedores atingido. Remova um para adicionar outro.`);

    setPendingId(supplier.id);
    setMessage(null);
    const { error } = selected
      ? await supabase.from('user_supplier_preferences').delete().eq('user_id', userId).eq('supplier_id', supplier.id)
      : await supabase.from('user_supplier_preferences').insert({ user_id: userId, supplier_id: supplier.id });
    if (error) setMessage(error.message);
    else setSelectedIds((current) => (selected ? current.filter((id) => id !== supplier.id) : [...current, supplier.id]));
    setPendingId(null);
  }

  return (
    <div className="space-y-4 py-5">
      <PageHeader>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Meus fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            Escolha até {maxSuppliers} fornecedor{maxSuppliers === 1 ? '' : 'es'} preferido{maxSuppliers === 1 ? '' : 's'} para compor preço e disponibilidade dos seus produtos.
          </p>
        </div>
      </PageHeader>
      {message && <div role="status" className="rounded-lg border px-3 py-2 text-sm">{message}</div>}

      {!userId && !loading && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Entre na sua conta para escolher fornecedores.</CardContent></Card>
      )}

      {userId && defaultSuppliers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Fornecedores padrão</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Aplicados automaticamente a todas as contas — não contam na sua cota de {maxSuppliers}.</p>
            {defaultSuppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span><Truck className="mr-2 inline h-3.5 w-3.5 text-muted-foreground" />{supplier.name}</span>
                <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Padrão</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {userId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Seus fornecedores preferidos ({selectedIds.length}/{maxSuppliers})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {selectableSuppliers.length === 0 && !loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum fornecedor disponível para seleção no momento.</p>
            ) : selectableSuppliers.map((supplier) => {
              const selected = selectedIds.includes(supplier.id);
              const disabled = pendingId === supplier.id || (!selected && atLimit);
              return (
                <label
                  key={supplier.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${disabled && !selected ? 'opacity-50' : ''} ${selected ? 'border-primary bg-primary/5' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleSupplier(supplier)}
                    />
                    <span>
                      <span className="font-medium">{supplier.name}</span>
                      {supplier.description && <span className="ml-2 text-xs text-muted-foreground">{supplier.description}</span>}
                    </span>
                  </span>
                  <Badge variant="outline">{orderModeLabels[supplier.order_mode] ?? supplier.order_mode}</Badge>
                </label>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
