export const RESEND_API_URL = 'https://api.resend.com/emails';
export const RESEND_TIMEOUT_MS = 20_000;

export interface ResendEmailPayload {
  from: string;
  to: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  template?: { id: string; variables: Record<string, string> };
  attachments?: { filename: string; content: string }[];
}

/** Single server-side boundary for all Resend sends. Callers remain
 * responsible for workflow-specific configuration and user-facing errors. */
export async function sendResendEmail(payload: ResendEmailPayload): Promise<unknown> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.');

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  const responsePayload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(responsePayload?.message || `Falha ao enviar email (HTTP ${response.status}).`);
  return responsePayload;
}
