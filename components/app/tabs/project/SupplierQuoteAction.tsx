'use client';

import { useState } from 'react';
import { AlertTriangle, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SavedProject } from '@/lib/types';
import { totalDailyKwh, totalPeakW } from '@/lib/store/wizard-store';
import type { BatteryCatalogOption, InlineProfile } from '../../types';
import type { ShareableProject } from '../../helpers';
import { SupplierQuoteRequestModal } from './SupplierQuoteRequestModal';

function shareableProjectFromSavedProject(project: SavedProject): ShareableProject {
  const { residentialOptions } = project;
  return {
    name: project.name,
    address: project.address,
    topology: residentialOptions.topology,
    gridType: residentialOptions.gridType,
    loadsCount: residentialOptions.loads.length,
    peakW: totalPeakW(residentialOptions.loads, residentialOptions.peakCalcMode ?? 'sum'),
    dailyKwh: totalDailyKwh(residentialOptions.loads, residentialOptions.operationHours),
    solution: project.solution,
    desiredFeatures: residentialOptions.desiredFeatures,
    microgrid: residentialOptions.microgrid,
    generator: residentialOptions.generator,
    pv: residentialOptions.pv,
    whiteTariff: residentialOptions.whiteTariff,
  };
}

export function SupplierQuoteAction({
  project,
  profile,
  batteryCatalog,
  onManageSuppliers,
  onOpenProfile,
  onSent,
  className,
  buttonLabel = 'Solicitar cotação ao fornecedor',
  buttonVariant = 'default',
  buttonIcon = 'mail',
}: {
  project: SavedProject;
  profile: InlineProfile | null;
  batteryCatalog: BatteryCatalogOption[];
  onManageSuppliers: () => void;
  onOpenProfile: () => void;
  onSent?: () => void;
  className?: string;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  buttonIcon?: 'mail' | 'send';
}) {
  const [supplierQuoteModalOpen, setSupplierQuoteModalOpen] = useState(false);
  const [profileRequirementsOpen, setProfileRequirementsOpen] = useState(false);
  const hasCompleteCompanyAddress = Boolean(
    profile &&
      ['postalCode', 'street', 'number', 'district', 'city', 'state'].every((field) =>
        profile.companyAddress[field as keyof typeof profile.companyAddress]?.trim()
      )
  );
  const profileRequirementsMissing = !profile || !profile.companyDocument.trim() || !hasCompleteCompanyAddress;

  return (
    <>
      <Button
        variant={buttonVariant}
        className={className}
        disabled={!project.solution}
        title={!project.solution ? 'Calcule uma solução para este projeto antes de solicitar cotação.' : undefined}
        onClick={() => {
          if (profileRequirementsMissing) setProfileRequirementsOpen(true);
          else setSupplierQuoteModalOpen(true);
        }}
      >
        {buttonIcon === 'send' ? <Send className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        {buttonLabel}
      </Button>

      {profileRequirementsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-profile-requirements-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setProfileRequirementsOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <h2 id="supplier-profile-requirements-title" className="font-semibold">Complete os dados da empresa</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Para solicitar uma cotação ao fornecedor, é necessário cadastrar o CNPJ e o endereço completo da empresa.
                  Esses dados serão enviados ao fornecedor junto com a solicitação.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setProfileRequirementsOpen(false)}>Fechar</Button>
              <Button
                type="button"
                onClick={() => {
                  setProfileRequirementsOpen(false);
                  onOpenProfile();
                }}
              >
                Ir para Perfil
              </Button>
            </div>
          </div>
        </div>
      )}

      {profile && (
        <SupplierQuoteRequestModal
          open={supplierQuoteModalOpen}
          onClose={() => setSupplierQuoteModalOpen(false)}
          projectId={project.id}
          project={shareableProjectFromSavedProject(project)}
          profile={profile}
          batteryCatalog={batteryCatalog}
          onSent={onSent ?? (() => {})}
          onManageSuppliers={onManageSuppliers}
        />
      )}
    </>
  );
}
