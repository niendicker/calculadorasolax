/** Bump this value whenever the published Terms or Privacy Policy changes. */
export const CURRENT_LEGAL_DOCUMENT_VERSION = '2026-08-19';

export function hasAcceptedCurrentLegalDocuments(
  profile: { terms_accepted_at?: string | null; terms_accepted_version?: string | null } | null | undefined
) {
  return Boolean(profile?.terms_accepted_at && profile.terms_accepted_version === CURRENT_LEGAL_DOCUMENT_VERSION);
}
