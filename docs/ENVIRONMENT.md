# Variáveis de ambiente

## Cliente e servidor

| Variável | Onde | Obrigatória | Uso |
|---|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente/servidor | sim | URL pública do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente/servidor | sim | Chave pública limitada por RLS |
| `SUPABASE_INTERNAL_URL` | servidor | não | URL interna para reduzir dependência de proxy externo |
| `SUPABASE_SERVICE_ROLE_KEY` | somente servidor | conforme rota | Operações administrativas que não podem usar RLS |

## Email

| Variável | Uso |
|---|---|
| `RESEND_API_KEY` | Envio de confirmação, recuperação e emails de fornecedores |
| `RESEND_FROM_EMAIL` | Remetente verificado |
| `FEEDBACK_TO_EMAIL` | Destinatário interno dos feedbacks enviados pela aplicação |
| `RESEND_CONFIRM_TEMPLATE_ID` | Template de confirmação, quando configurado |
| `RESEND_RECOVERY_TEMPLATE_ID` | Template de recuperação, quando configurado |

## Tarifas

| Variável | Uso |
|---|---|
| `ANEEL_TARIFF_RESOURCE_ID` | Identificador do recurso público da ANEEL |

## Regras

- `.env.local` não deve ser commitado.
- Para ambientes self-hosted, use `.env.selfhosted.example` como referência
  para o app, `.env.tunnel.local.example` para migrations via túnel e
  `supabase-migration.env.example` para migração inicial Cloud -> self-hosted.
- Variáveis `NEXT_PUBLIC_*` podem chegar ao navegador; nunca coloque secrets nelas.
- Service role, tokens de APIs externas e credenciais SMTP ficam somente no ambiente server-side.
- Produção deve usar um gerenciador de secrets e rotação documentada.
- Após alterar secrets, validar signup, recovery, cálculo, emails e integrações afetadas.
