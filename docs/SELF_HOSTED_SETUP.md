# Setup Self-Hosted Supabase

Este repositório já contém o fluxo de banco, migração, Storage e Edge Functions
para um Supabase self-hosted. O que faltava era um pacote operacional mínimo
para configurar o ambiente de forma consistente sem depender de memória ou de
segredos colados manualmente em comandos.

## O que precisa existir

Você precisa de quatro blocos separados:

1. stack self-hosted do Supabase já rodando no servidor de destino;
2. `.env.local` da aplicação apontando para esse Supabase;
3. `.env.tunnel.local` para aplicar migrations no Postgres remoto via SSH;
4. `supabase-migration.env` apenas se você for migrar de Supabase Cloud para
   self-hosted com o script de migração completa.

## Arquivos versionados de referência

- `.env.selfhosted.example`: variáveis da aplicação Next.js para ambiente
  self-hosted;
- `.env.tunnel.local.example`: variáveis usadas pelo túnel SSH e pelo fluxo de
  `supabase db push`;
- `supabase-migration.env.example`: variáveis exigidas por
  `scripts/migrate-supabase-cloud-to-selfhosted-v5.sh`.

Para gerar os arquivos locais ignorados pelo Git:

```bash
bash scripts/bootstrap-self-hosted-env.sh
```

O script cria:

- `.env.tunnel.local`
- `supabase-migration.env`

Ele não sobrescreve arquivos existentes.

## `.env.local` da aplicação

Preencha `.env.local` usando `.env.selfhosted.example` como base.

Campos críticos:

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública do gateway self-hosted;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave anônima do projeto self-hosted;
- `SUPABASE_SERVICE_ROLE_KEY`: chave server-side usada pelas rotas de signup,
  recovery e fluxos administrativos;
- `SUPABASE_INTERNAL_URL`: use somente quando a aplicação roda na mesma rede
  privada do stack Supabase; caso contrário, pode ficar ausente;
- `RESEND_*`: obrigatório para cadastro e recuperação de senha neste projeto.

Depois de alterar `.env.local`, reinicie `npm run dev`.

## Banco remoto via túnel SSH

Preencha `.env.tunnel.local`:

- `DB_URL`: deve apontar para `localhost` na porta do túnel;
- `SSH_HOST`: alias ou host SSH do servidor;
- `DB_CONTAINER` ou `TUNNEL_REMOTE`: opcionais, só use se a descoberta
  automática do container falhar.

Validação somente leitura:

```bash
bash scripts/db-push-tunnel.sh --check-only
```

Aplicar migrations:

```bash
bash scripts/db-push-tunnel.sh
```

Gerar tipos a partir do banco self-hosted:

```bash
bash scripts/db-push-tunnel.sh --types-only
```

## Migração inicial Cloud -> self-hosted

Se o banco de destino ainda não foi preenchido, use:

```bash
bash scripts/migrate-supabase-cloud-to-selfhosted-v5.sh --env supabase-migration.env --all
```

Esse fluxo cobre:

- roles;
- schema;
- dados;
- Auth compatível;
- buckets e objetos do Storage;
- Edge Functions;
- reescrita de URLs antigas de Storage no banco.

Ele não cobre automaticamente:

- secrets customizados das Edge Functions;
- SMTP, OAuth e demais settings do Auth;
- integrações externas fora do escopo do banco e do Storage.

## Ordem recomendada

1. Provisionar a stack self-hosted no servidor.
2. Preencher `.env.local`.
3. Preencher `.env.tunnel.local`.
4. Rodar `bash scripts/db-push-tunnel.sh --check-only`.
5. Se for uma migração de ambiente existente, preencher
   `supabase-migration.env` e executar o script de migração.
6. Rodar `bash scripts/db-push-tunnel.sh` para garantir que todas as
   migrations do repositório estejam aplicadas.
7. Rodar `bash scripts/db-push-tunnel.sh --types-only`.
8. Reiniciar a aplicação e executar smoke tests.

## Smoke test mínimo

Validar:

- login com usuário existente;
- cadastro com email de confirmação;
- recuperação de senha;
- criação automática de `profiles`;
- redirecionamento para aceite de termos quando necessário;
- upload/leitura de logomarca do perfil;
- cálculo válido e inválido;
- rota admin com usuário `role = 'admin'`;
- links públicos de cotação;
- emails de fornecedor e recuperação.

## Problemas comuns

`failed to inspect container health`

- Isso é acesso ao Docker, não migration. Corrija permissões do daemon Docker
  na máquina onde você roda `supabase start`/`supabase status`.

`login falha no ambiente local recém-subido`

- O usuário local não existe;
- o usuário não confirmou email;
- o app não foi reiniciado após editar `.env.local`;
- a aplicação ainda está apontando para o projeto antigo.

`db push` falha no self-hosted`

- `DB_URL` em `.env.tunnel.local` não aponta para o Postgres correto;
- o túnel SSH não chega no container `supabase-db-*`;
- o destino não está vazio durante migração inicial completa;
- há drift entre o schema remoto e as migrations do repositório.
