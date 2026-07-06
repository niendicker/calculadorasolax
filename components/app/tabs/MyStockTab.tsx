'use client';

import { Battery, Boxes, Zap } from 'lucide-react';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import type { StockProductType, UserStockItem } from '@/lib/types';
import { CatalogEmptyState } from '../shared-ui';

const sectionDefinitions: { type: StockProductType; label: string; icon: React.ReactNode }[] = [
  { type: 'inverter', label: 'Inversores', icon: <Zap className="h-4 w-4 text-muted-foreground" /> },
  { type: 'battery', label: 'Baterias', icon: <Battery className="h-4 w-4 text-muted-foreground" /> },
  { type: 'accessory', label: 'Acessórios', icon: <Boxes className="h-4 w-4 text-muted-foreground" /> },
];

export function MyStockTab({
  userStockItems,
  onUpdateValue,
  onRemove,
}: {
  userStockItems: UserStockItem[];
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Produtos que você adicionou do Catálogo, com o preço que você define para seus orçamentos.
        </p>
      </div>

      {userStockItems.length === 0 ? (
        <CatalogEmptyState label="Nenhum item no seu estoque ainda. Adicione produtos a partir do Catálogo." />
      ) : (
        <div className="space-y-4">
          {sectionDefinitions.map((section) => {
            const items = userStockItems.filter((item) => item.productType === section.type);
            if (items.length === 0) return null;
            return (
              <div key={section.type} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {section.icon}
                  {section.label}
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <StockItemRow key={item.id} item={item} onUpdateValue={onUpdateValue} onRemove={onRemove} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockItemRow({
  item,
  onUpdateValue,
  onRemove,
}: {
  item: UserStockItem;
  onUpdateValue: (id: string, unitValue: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <p className="min-w-0 truncate text-sm font-medium">{item.productModel}</p>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">R$</span>
        <input
          key={item.id}
          type="number"
          min={0}
          step={0.01}
          defaultValue={item.unitValue}
          aria-label={`Meu preço para ${item.productModel}`}
          onBlur={(event) => {
            const parsed = Number(event.target.value);
            const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
            if (nextValue !== item.unitValue) onUpdateValue(item.id, nextValue);
          }}
          className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <ConfirmDeleteButton
          ariaLabel={`Remover ${item.productModel} do meu estoque`}
          title="Remover do estoque?"
          description="Esse item sai do seu estoque pessoal. Você pode adicioná-lo novamente pelo Catálogo quando quiser."
          confirmLabel="Remover"
          onConfirm={() => onRemove(item.id)}
        />
      </div>
    </div>
  );
}
