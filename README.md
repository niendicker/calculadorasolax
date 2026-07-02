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
| `0011_ess_compatibility_rules.sql` | Regras ESS de compatibilidade entre inversores e baterias |
| `0012_product_power_specs.sql` | Potências padrão/pico e SOC mínimo no catálogo |
| `0013_normalize_inverter_grid_types.sql` | Padronização dos acrônimos de rede dos inversores |
| `0014_standardize_ess_grid_topology.sql` | Padronização histórica das redes em regras ESS |
| `0015_ess_rule_limits.sql` | Limites de paralelo e baterias nas regras ESS |
| `0016_constrain_ess_rule_limit_ranges.sql` | Ranges suportados para limites ESS |
| `0017_ess_min_battery_qty.sql` | Quantidade mínima de baterias por regra ESS |
| `0018_accessory_rule_solution_metric_grid_patterns.sql` | Regras de acessórios por solução e redes padronizadas |
| `0019_accessory_rule_multiple_inverters.sql` | Múltiplos inversores por regra de acessório |
| `0020_inverter_flags.sql` | Funcionalidades estruturadas dos inversores |
| `0021_clear_ess_rule_grid_filters.sql` | Rede ESS derivada do cadastro do inversor |
| `0022_constrain_inverter_battery_ports.sql` | Portas de bateria limitadas a 1 ou 2 |
| `0023_inverter_phases_options.sql` | Fases do inversor limitadas a 1, 2 ou 3 |
| `0024_ess_rule_battery_configs.sql` | Múltiplas baterias por regra ESS com limites por modelo |
| `0025_inverter_battery_electrical_limits.sql` | Limites elétricos da bateria no cadastro de inversores |
| `0026_battery_flags_association.sql` | Flags e associação máxima por porta no cadastro de baterias |
| `0027_allow_single_battery_ess_max.sql` | Permite máximo ESS de 1 bateria por porta |
| `0028_battery_electrical_specs.sql` | Especificações elétricas no cadastro de baterias |
| `0029_battery_soc_options.sql` | SOC mínimo de baterias limitado a 5% ou 10% |

Aplicar migrações ao projeto linkado:

```bash
npx supabase db push --linked --yes
```

## Catálogo e geração de soluções

Os arquivos em `solutions/` foram a fonte inicial de importação das combinações aprovadas. O fluxo atual permite gerar combinações a partir dos cadastros e regras administrativas, materializando o resultado em `approved_solutions`.

Cada solução descreve:

- inversor
- quantidade de inversores
- topologia/rede
- bateria
- quantidade de baterias
- potência e energia disponível
- acessórios
- comentários técnicos

A tabela `approved_solutions` é usada pela Edge Function para recomendar somente combinações aprovadas/geradas. Combinações geradas pelo admin usam `source_file = generated-rules` e `solution_code` determinístico.

O gerador de combinações usa:

- regras ESS ativas para compatibilidade inversor + bateria
- redes cadastradas no inversor
- mínimo/máximo de baterias da regra ESS
- máximo paralelo da regra ESS
- potência padrão/pico do inversor
- potência padrão da bateria
- SOC mínimo da bateria para calcular energia útil
- regras de acessórios aplicáveis

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
- regras ESS de compatibilidade entre inversores e baterias
- logs de alterações

Regras automáticas podem incluir acessórios obrigatórios ou opcionais com base em:

- cada solução gerada/recomendada
- quantidade de inversores
- quantidade de baterias
- portas de bateria usadas

Regras de acessórios aceitam filtros por bateria, rede, topologia e um ou mais inversores. Sem inversor selecionado, a regra vale para qualquer inversor.

Regras ESS definem:

- inversor e bateria compatíveis
- topologia da bateria
- máximo de inversores em paralelo
- mínimo e máximo de baterias

A rede da regra ESS é derivada das redes cadastradas no inversor, evitando duplicação de configuração.

Produtos administrativos suportam imagem e documentos para clientes, como datasheets e manuais. Inversores possuem funcionalidades estruturadas em array para capacidades como Microrrede, Super-Backup, Dual Voltage e ATS Externo. A UI administrativa usa cards responsivos, formulários em janelas modais, confirmações por popover para ações destrutivas, skeletons de carregamento e feedbacks para salvar/remover.

Na aba de combinações, os registros podem ser agrupados por inversor e por modelo de bateria usando controles segmentados. Os agrupamentos mostram somente produtos cadastrados. A ação "Gerar por regras" exibe preview antes de aplicar as combinações em `approved_solutions`.

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
- energia útil da bateria calculada com SOC mínimo quando o modelo está cadastrado
- regras ESS de compatibilidade e limites
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
