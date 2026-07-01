# Especificações do Projeto

## Visão geral

A Calculadora SolaX é um web app para dimensionamento de sistemas híbridos solar + bateria. A interface principal funciona como uma single-page web app responsiva para desktop, tablet e celular.

O app permite ao usuário configurar topologia, rede e cargas, calcular uma solução recomendada e visualizar inversor, baterias, potência FV e acessórios. Administradores mantêm o catálogo de produtos e as combinações aprovadas.

## Público-alvo

- Integradores
- Distribuidores
- Equipe técnica/comercial SolaX
- Administradores de catálogo

## Funcionalidades

### Usuário comum

- Cadastro com nome, email, telefone e senha
- Login com email e senha
- Recuperação de senha por email
- Edição de nome e telefone no perfil
- Simulação residencial na página principal
- Visualização da solução recomendada

### Administrador

Além das funções de usuário comum:

- Cadastro de inversores
- Cadastro de baterias
- Cadastro de acessórios
- Edição de combinações aprovadas
- Criação de regras automáticas de acessórios
- Definição de acessórios obrigatórios/opcionais por limiar

Administradores são promovidos manualmente no Supabase com `profiles.role = 'admin'`.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 App Router |
| UI | React 19 + Tailwind CSS 4 |
| Estado | Zustand |
| i18n | next-intl |
| Backend | Supabase |
| Auth | Supabase Auth |
| Banco | Supabase Postgres |
| Funções | Supabase Edge Functions |

## Modelo de autenticação

Tabela principal:

```text
profiles
```

Campos:

| Campo | Descrição |
|---|---|
| `id` | UUID do usuário em `auth.users` |
| `email` | Email |
| `full_name` | Nome |
| `phone` | Telefone |
| `role` | `user` ou `admin` |
| `created_at` | Criação |
| `updated_at` | Atualização |

Regras:

- Cadastro público cria `role = user`
- Admin é definido manualmente no banco
- `/admin` exige login e `role = admin`
- RLS usa `public.is_admin()` para escrita administrativa

## Modelo de dados administrativo

### `approved_solutions`

Combinações aprovadas para recomendação.

Campos principais:

- `source_file`
- `solution_code`
- `inverter_model`
- `inverter_quantity`
- `battery_ports_used`
- `nominal_voltage_v`
- `rated_power_w`
- `peak_power_w`
- `grid_topology`
- `battery_model`
- `battery_topology`
- `battery_quantity`
- `battery_power_w`
- `available_energy_wh`
- `accessories`
- `comments`
- `raw_solution`
- `active`

### `accessories`

Catálogo de acessórios.

Campos:

- `model`
- `description`
- `active`

### `accessory_rules`

Regras automáticas de inclusão de acessórios.

Campos principais:

- `accessory_id`
- `name`
- `inclusion`: `required` ou `optional`
- `trigger_metric`: `inverter_quantity`, `battery_quantity`, `battery_ports_used`
- `min_quantity`
- filtros opcionais: `inverter_model`, `battery_model`, `grid_topology`, `battery_topology`
- `quantity_per_match`
- `comment`
- `active`

## Cálculo residencial

Entrada:

- topologia: `HighVoltage` ou `LowVoltage`
- tipo de rede: `singlePhase_220`, `splitPhase_220`, `threePhase_220`, `threePhase_380`
- cargas: potência, horas/dia e quantidade
- microgrid: campo previsto no tipo, ainda não usado como critério principal

Derivados:

- pico total em W
- consumo diário em kWh
- energia alvo de bateria = consumo diário x 50%
- potência FV recomendada = consumo diário / 4

Seleção:

1. Mapeia rede para `grid_topology`
2. Mapeia topologia para `battery_topology`
3. Filtra `approved_solutions.active = true`
4. Exige `rated_power_w >= peakW`
5. Exige `available_energy_wh >= targetEnergyWh * 0.8`
6. Ordena por menor potência, menor energia e menor quantidade de baterias
7. Aplica regras automáticas de acessórios

## Rotas

| Rota | Função |
|---|---|
| `/[locale]` | Single-page app principal |
| `/[locale]/login` | Login, cadastro e recuperação |
| `/[locale]/reset-password` | Nova senha |
| `/[locale]/profile` | Perfil |
| `/[locale]/admin` | Painel admin |
| `/[locale]/auth/callback` | Callback de confirmação/recuperação |
| `/[locale]/wizard/residential/*` | Wizard residencial legado |
| `/[locale]/wizard/industrial/*` | Wizard industrial legado |

## Arquivos-chave

| Arquivo | Função |
|---|---|
| `components/app/SinglePageApp.tsx` | Interface principal single-page |
| `components/auth/AuthPanel.tsx` | Login, cadastro e recuperação |
| `components/auth/ProfilePanel.tsx` | Perfil |
| `components/auth/ResetPasswordPanel.tsx` | Nova senha |
| `components/admin/AdminPanel.tsx` | Painel administrativo |
| `supabase/functions/calculate-residential/index.ts` | Motor de recomendação |
| `supabase/migrations/*.sql` | Schema, seeds e policies |
| `solutions/*.json` | Fonte das combinações aprovadas |
| `proxy.ts` | Middleware/Proxy de locale |

## Tema e UX

- Web app responsivo para PC, tablet e celular
- Tema claro quente com contraste escuro e acento amarelo
- Login full-screen com layout lado a lado no desktop
- Navegação inferior no mobile
- Interface administrativa densa e operacional

## Comandos úteis

```bash
npm run dev
npm run build
npx supabase db push --linked --yes
npx supabase functions deploy calculate-residential --project-ref xeddlhrmquwzuesvznrd
```
