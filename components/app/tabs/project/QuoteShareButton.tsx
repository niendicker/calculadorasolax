'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { recordProjectEvent } from '@/lib/data/project-events-repository';
import type { Client, MarginSettings, ProjectStatus, SavedProject, UserServiceItem, UserStockItem } from '@/lib/types';
import { buildQuoteShareSnapshot, buildWhatsAppShareUrl } from '../../helpers';
import { WhatsAppIcon } from '../../shared-ui';
import type { BatteryCatalogOption, InverterCatalogOption, InlineProfile } from '../../types';

export function QuoteShareButton({
  project,
  client,
  profile,
  batteryCatalog,
  inverterCatalog,
  userStockItems,
  userServices,
  marginSettings,
  onUpdateStatus,
  onShared,
  className,
  size = 'lg',
}: {
  project: SavedProject;
  client: Client | undefined;
  profile: InlineProfile | null;
  batteryCatalog: BatteryCatalogOption[];
  inverterCatalog: InverterCatalogOption[];
  userStockItems: UserStockItem[];
  userServices: UserServiceItem[];
  marginSettings: MarginSettings;
  onUpdateStatus: (status: ProjectStatus) => void;
  onShared?: () => void;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const [sharing, setSharing] = useState(false);
  const canShare = Boolean(project.solution && client?.phone && profile);

  async function shareQuote() {
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

    setSharing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('quote_shares')
        .insert({ project_id: project.id, user_id: profile.id, snapshot: snapshot as unknown as import('@/lib/database.types').Json })
        .select('id')
        .single();
      if (error || !data) return;

      const link = `${window.location.origin}/cotacao/${data.id}`;
      const message = `Olá! Segue o orçamento da sua instalação solar:\n${link}\n\nAcesse para conferir os detalhes e responder.`;
      const whatsAppUrl = buildWhatsAppShareUrl(client.phone, message);
      if (whatsAppUrl) window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');

      const wasDraft = project.status === 'draft';
      await recordProjectEvent(supabase, {
        project_id: project.id,
        actor_id: profile.id,
        event_type: 'quote_shared',
        from_status: wasDraft ? 'draft' : null,
        to_status: wasDraft ? 'sent' : null,
      });
      if (wasDraft) onUpdateStatus('sent');
      onShared?.();
    } finally {
      setSharing(false);
    }
  }

  return (
    <Button
      size={size}
      className={className ?? 'bg-emerald-600 text-white shadow-sm transition-shadow hover:bg-emerald-700 hover:shadow-md disabled:pointer-events-none disabled:opacity-50'}
      disabled={!canShare || sharing}
      title={!project.solution ? 'Calcule uma solução para este projeto antes de compartilhar.' : !client?.phone ? 'Cadastre o telefone do cliente para enviar a cotação por WhatsApp.' : undefined}
      onClick={() => void shareQuote()}
    >
      {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsAppIcon className="h-4 w-4" />}
      {sharing ? 'Gerando link...' : 'Compartilhar cotação'}
    </Button>
  );
}
