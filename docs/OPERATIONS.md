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

Aplicar migrations somente após revisar o diff e confirmar o ambiente alvo:

```bash
npx supabase migration list
npx supabase db push --linked --yes
npx supabase functions deploy calculate-residential --project-ref SEU_PROJECT_REF
```

Depois validar:

- trigger de criação de `profiles`;
- `terms_accepted_at` no cadastro;
- RLS de usuários e administradores;
- policies de Storage;
- RPC `delete_own_account`;
- cálculo válido e cálculo inválido;
- links públicos de cotação;
- emails e integrações de fornecedor.

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
