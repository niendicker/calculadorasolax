# Operação, deploy e migração

## Pré-requisitos

- Node.js compatível com o CI (atualmente Node 22).
- npm e dependências instaladas com `npm ci`.
- Supabase CLI para migrations e Edge Functions.
- Deno para `npm run check:functions` e `npm run test:functions`.
- Acesso ao ambiente de hospedagem e ao projeto Supabase.

## Validação local

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run check:functions
npm run test:functions
```

Se o ambiente de teste não tiver uma base local configurada, valide as migrations no ambiente de staging antes do deploy.

## Deploy da aplicação

1. confirmar branch, commit e variáveis de ambiente;
2. executar validações locais;
3. publicar a aplicação na hospedagem configurada;
4. verificar a página inicial, login, cálculo, perfil, admin e uma rota pública;
5. conferir logs server-side e erros de rede;
6. registrar commit, data e resultado do smoke test.

## Deploy do Supabase

Antes de aplicar qualquer migration, execute a checagem somente leitura:

```bash
npm run db:check
```

O comando lista as migrations locais/remotas e executa `supabase db push
--dry-run`. Ele exige `DB_URL` exportada ou um `.env.tunnel.local` local e
nunca altera o banco. Em um ambiente self-hosted, o `scripts/db-push-tunnel.sh`
continua sendo o fluxo de aplicação. Nesse ambiente, use o modo somente leitura
do próprio túnel:

```bash
./scripts/db-push-tunnel.sh --check-only
```

Ele abre o túnel, executa a mesma verificação e o fecha sem aplicar nada.

Depois de aplicar migrations no ambiente alvo, regenere os tipos a partir do
mesmo banco:

```bash
npm run db:types
```

O comando grava `lib/database.types.ts`. Em ambiente self-hosted, execute-o
com o túnel aberto ou use uma `DB_URL` que alcance o Postgres remoto. Não crie
tipos manuais para substituir esse arquivo: mudanças de schema devem ser
refletidas pela geração oficial.

Aplicar migrations somente após revisar o diff e confirmar o ambiente alvo:

```bash
npx supabase migration list
npx supabase db push --linked --yes
npx supabase functions deploy calculate-residential --project-ref SEU_PROJECT_REF
```

Depois validar:

- trigger de criação de `profiles`;
- `terms_accepted_at` e `terms_accepted_version` no cadastro; usuários sem a versão vigente devem ser direcionados ao aceite;
- RLS de usuários e administradores;
- policies de Storage;
- RPC `delete_own_account`;
- cálculo válido e cálculo inválido;
- links públicos de cotação;
- emails e integrações de fornecedor.

## Atualização dos documentos legais

Quando os Termos ou a Política forem alterados:

1. atualizar os textos em `app/[locale]/termos/page.tsx` e `app/[locale]/privacidade/page.tsx`;
2. alterar `CURRENT_LEGAL_DOCUMENT_VERSION` em `lib/legal-documents.ts`;
3. criar uma migration que preserve o histórico e mantenha `terms_accepted_version` nulo para os usuários que devem revisar a nova versão;
4. aplicar a migration no banco antes do deploy da aplicação;
5. publicar a aplicação;
6. testar um usuário antigo, um novo cadastro e o fluxo de aceite;
7. registrar a versão publicada e a data da alteração.

A migration `0086_terms_accepted_version.sql` implementa a primeira versão desse mecanismo. A versão atualmente publicada é `2026-08-19`.

## Migração para servidor próprio

O script `scripts/migrate-supabase-cloud-to-selfhosted-v5.sh` exige um arquivo de ambiente fora do Git com as credenciais de origem e destino. O procedimento recomendado é:

1. criar backup e registrar o estado atual;
2. validar conectividade e compatibilidade do destino;
3. executar migração de banco em ambiente de teste;
4. conferir contagens, chaves, policies, triggers e funções;
5. migrar Storage e confirmar buckets, objetos e URLs;
6. publicar Edge Functions e configurar seus secrets separadamente;
7. apontar `SUPABASE_INTERNAL_URL`/URL pública e demais variáveis;
8. executar smoke tests;
9. manter o ambiente anterior disponível até a confirmação;
10. registrar rollback e janela de corte.

Nunca passe secrets diretamente na linha de comando se isso fizer com que apareçam no histórico do shell ou em logs de CI.

## Rollback

Antes de migrations destrutivas ou troca de endpoint:

- guardar backup verificável;
- manter a versão anterior da aplicação;
- registrar migrations aplicadas;
- não apagar o ambiente anterior imediatamente;
- testar restauração antes da janela de corte.

## Observabilidade mínima

Monitorar:

- erros 4xx/5xx das APIs;
- falhas de cálculo;
- falhas de email;
- fila de métricas pendentes;
- sincronizações de fornecedores;
- latência de consultas e Edge Function;
- falhas de Storage;
- uso e restauração de backups.
