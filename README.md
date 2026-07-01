# Calculadora SolaX

Web app para dimensionamento de soluções híbridas SolaX solar + bateria.

O app usa um fluxo single-page responsivo para cálculo residencial, projetos salvos, autenticação com Supabase Auth, painel administrativo para catálogo e uma Edge Function para selecionar combinações aprovadas de produtos.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- next-intl
- Zustand
- Supabase Auth, Postgres, RLS e Edge Functions

## Desenvolvimento

Instale dependências:

```bash
npm install
```

Configure `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Rode o app:

```bash
npm run dev
```

Abra:

```text
http://localhost:3000/pt
```

Build:

```bash
npm run build
```

## Rotas principais

| Rota | Descrição |
|---|---|
| `/pt` | Web app principal de dimensionamento |
| `/pt/login` | Login, cadastro comum e recuperação de senha |
| `/pt/reset-password` | Definição de nova senha após recuperação |
| `/pt/profile` | Perfil do usuário logado |
| `/pt/admin` | Administração de catálogo, apenas `role = admin` |
| `/pt/wizard/residential/*` | Fluxo legado do wizard residencial |
| `/pt/wizard/industrial/*` | Fluxo legado do wizard industrial |
| `/pt/wizard/result` | Redirect compatível para o resultado residencial |

Idiomas suportados: `pt`, `en`, `zh`.

## Autenticação e perfis

Usuários comuns podem se cadastrar pelo app com:

- nome
- email
- telefone
- senha

O cadastro público sempre cria `profiles.role = 'user'`.

Administradores são criados manualmente no Supabase. Após o usuário existir, promova o perfil:

```sql
update profiles
set role = 'admin'
where email = 'email@do.admin';
```

O perfil do usuário abre dentro da página principal e permite editar:

- nome
- telefone
- empresa
- endereço da empresa
- logomarca

Esses dados são usados no relatório exportado. O papel (`user` ou `admin`) é somente leitura no app.

Usuários com `role = admin` entram diretamente em `/pt/admin`. Usuários comuns entram no fluxo principal sem opção administrativa.

## Projetos e relatório

A aba `Projeto` armazena dados do cliente e permite salvar/reutilizar configurações completas de dimensionamento:

- dados do cliente
- topologia de bateria
- modelo de bateria
- tipo de rede
- cargas cadastradas
- solução calculada

A aba `Dimensionamento` também possui ação para salvar o projeto atual. A lista de projetos salvos mostra badges com topologia, bateria, rede e quantidade de cargas.

O relatório pode ser exportado por impressão/PDF e inclui:

- dados do projeto e cliente
- marca da empresa do usuário
- lista de cargas
- inversor, bateria e acessórios recomendados
- comentários técnicos
- materiais técnicos anexados aos produtos

## Banco de dados

Migrações Supabase:

| Arquivo | Função |
|---|---|
| `0001_initial.sql` | Catálogo inicial de cargas, inversores e baterias |
| `0002_approved_solutions.sql` | Tabela `approved_solutions` com 605 combinações aprovadas importadas de `solutions/*.json` |
| `0003_admin_catalog_rules.sql` | Tabelas `accessories` e `accessory_rules` |
| `0004_profiles_auth.sql` | Tabela `profiles`, trigger de criação de perfil e policies iniciais |
| `0005_profile_roles_password_auth.sql` | Campo `role`, função `is_admin()` e policies de escrita admin |
| `0006_product_media.sql` | Imagens e documentos técnicos em inversores, baterias e acessórios |
| `0007_profile_company_branding.sql` | Empresa, endereço e logomarca do usuário |
| `0008_admin_users_metrics.sql` | Métricas de simulações e suporte a visão administrativa |
| `0009_normalize_inverter_models.sql` | Normalização dos nomes dos modelos de inversores |
| `0010_admin_activity_logs.sql` | Logs de alterações administrativas |

Aplicar migrações ao projeto linkado:

```bash
npx supabase db push --linked --yes
```

## Catálogo de soluções aprovadas

Os arquivos em `solutions/` são a fonte de importação das combinações aprovadas. Cada solução descreve:

- inversor
- quantidade de inversores
- topologia/rede
- bateria
- quantidade de baterias
- potência e energia disponível
- acessórios
- comentários técnicos

A tabela `approved_solutions` é usada pela Edge Function para recomendar somente combinações aprovadas.

## Painel admin

Disponível em:

```text
/pt/admin
```

Requer usuário autenticado com `profiles.role = 'admin'`.

Permite editar:

- indicadores da aplicação
- usuários cadastrados e envio de reset de senha
- combinações aprovadas
- inversores
- baterias
- acessórios
- regras automáticas de acessórios
- logs de alterações

Regras automáticas podem incluir acessórios obrigatórios ou opcionais com base em:

- quantidade de inversores
- quantidade de baterias
- portas de bateria usadas

Produtos administrativos suportam imagem e documentos para clientes, como datasheets e manuais. A UI administrativa usa cards responsivos, formulários em janelas modais, confirmações por popover para ações destrutivas, skeletons de carregamento e feedbacks para salvar/remover.

Na aba de combinações, os registros podem ser agrupados por inversor e por modelo de bateria usando controles segmentados.

## Edge Function

Função:

```text
supabase/functions/calculate-residential
```

Deploy:

```bash
npx supabase functions deploy calculate-residential --project-ref xeddlhrmquwzuesvznrd
```

A função recebe as opções residenciais e retorna a menor combinação aprovada compatível, considerando:

- topologia da bateria (`HV` / `LV`)
- modelo exato da bateria selecionada
- tipo de rede (`1p_220V`, `3p_220V`, `3p_380V`)
- pico de carga em W
- energia alvo para bateria
- acessórios definidos na combinação
- acessórios automáticos por regra

## UX

- Layout responsivo para desktop, tablet e celular.
- Menu lateral fixo no desktop.
- Em telas pequenas, o menu fica oculto e abre por botão flutuante.
- Barras de título e menu lateral permanecem fixos; somente o conteúdo da página rola.
- Skeletons são usados em carregamentos de admin, projetos, baterias e cálculo.
- Ações destrutivas exigem confirmação por popover com delay de 300ms para abrir/fechar.

## Observações de segurança

- `.env.local` é ignorado pelo Git.
- O painel admin depende de RLS e `profiles.role = 'admin'`.
- Usuários comuns não devem conseguir escrever nas tabelas administrativas.
- A `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no ambiente servidor/local de manutenção, nunca exposta no cliente.
