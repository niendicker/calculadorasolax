'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InverterCatalogOption } from '../../../types';
import { InverterSupportSummary } from '../InverterSupportSummary';
import { PhotoUploadField } from '../PhotoUploadField';

export function ExternalAtsPanel({
  inverterCatalog,
  availableInverterModels,
  selectedInverterModel,
  atsBackupAcknowledged,
  onAtsBackupAcknowledgedChange,
  atsPhotoUrl,
  onAtsPhotoUrlChange,
  onUploadPhoto,
}: {
  inverterCatalog: InverterCatalogOption[];
  availableInverterModels: Set<string> | null;
  selectedInverterModel: string | null;
  atsBackupAcknowledged: boolean;
  onAtsBackupAcknowledgedChange: (atsBackupAcknowledged: boolean) => void;
  atsPhotoUrl: string | null;
  onAtsPhotoUrlChange: (atsPhotoUrl: string | null) => void;
  onUploadPhoto: (file: File, slot: 'ats' | 'microgrid' | 'generator') => Promise<string>;
}) {
  return (
    <div className="space-y-3">
      <InverterSupportSummary
        flag="external_ats"
        featureLabel="Backup Total"
        inverterCatalog={inverterCatalog}
        availableInverterModels={availableInverterModels}
        selectedInverterModel={selectedInverterModel}
      />
      <label
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
          atsBackupAcknowledged
            ? 'border-border bg-background'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={atsBackupAcknowledged}
          onChange={(event) => onAtsBackupAcknowledgedChange(event.target.checked)}
        />
        <span className="flex items-start gap-1.5">
          {!atsBackupAcknowledged && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {atsBackupAcknowledged
              ? 'Confirmado: um QTA é usado para backup total.'
              : 'Um QTA deve ser usado para backup total.'}
          </span>
        </span>
      </label>
      <PhotoUploadField
        label="Foto do disjuntor geral"
        photoUrl={atsPhotoUrl}
        slot="ats"
        onUploadPhoto={onUploadPhoto}
        onChange={onAtsPhotoUrlChange}
      />
    </div>
  );
}
