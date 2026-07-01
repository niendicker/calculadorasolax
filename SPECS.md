# Especificações do Projeto

## Visão geral

A Calculadora SolaX é um web app para dimensionamento de sistemas híbridos solar + bateria. A interface principal funciona como uma single-page web app responsiva para desktop, tablet e celular.

O app permite ao usuário cadastrar projetos, configurar topologia, modelo de bateria, rede e cargas, calcular uma solução recomendada e visualizar inversor, baterias, potência FV, acessórios e materiais técnicos. Administradores mantêm catálogo de produtos, usuários, combinações aprovadas, regras automáticas, indicadores e logs de alteração.

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
- Edição de nome, telefone, empresa, endereço e logomarca no perfil
- Cadastro e reutilização de projetos
- Salvamento da configuração por projeto: bateria, rede, cargas e solução
- Simulação residencial na página principal
- Visualização da solução recomendada
- Exportação de relatório em PDF/impressão com cargas, produtos, comentários e materiais técnicos

### Administrador

Além das funções de usuário comum:

- Cadastro de inversores
- Cadastro de baterias
- Cadastro de acessórios
- Upload de imagem e documentos técnicos por produto
- Edição e geração de combinações aprovadas
- Agrupamento de combinações por inversor e bateria
- Criação de regras automáticas de acessórios
- Definição de acessórios obrigatórios/opcionais por limiar
- Criação de regras ESS para compatibilidade entre inversor e bateria
- Lista de usuários cadastrados e envio de reset de senha
- Indicadores da aplicação
- Logs de alterações em produtos, combinações e regras

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
| `company_name` | Nome da empresa |
| `company_address` | Endereço da empresa |
| `company_logo_url` | Logomarca usada no relatório |
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
- `image_url`
- `documents`

### `inverters` e `batteries`

Catálogos de produtos usados nas recomendações.

Campos de inversor:

- `model`
- `standard_power_kva`
- `peak_power_kva`
- `phases`: `1`, `2` ou `3`
- `topology`: `HV` ou `LV`
- `grid_types`: array com acrônimos internos `1P_220V`, `2P_220V`, `3P_220V`, `3P_380V`
- `battery_ports`: `1` ou `2`
- `flags`: array de chaves estruturadas, atualmente `microgrid`, `super_backup`, `dual_voltage`, `external_ats`

Campos de bateria:

- `model`
- `capacity_kwh`
- `topology`: `HV` ou `LV`
- `standard_power_kw`
- `peak_power_kw`
- `min_soc_percent`

Campos de mídia:

- `image_url`: imagem do produto
- `documents`: lista JSON de documentos `{ name, url }`

Na seleção de bateria do usuário, apenas modelos cadastrados em `batteries` são exibidos. A interface usa tabs `HV` e `LV` e cards com imagem, capacidade, energia útil, potência e anexos.

### `accessory_rules`

Regras automáticas de inclusão de acessórios.

Campos principais:

- `accessory_id`
- `name`
- `inclusion`: `required` ou `optional`
- `trigger_metric`: `per_solution`, `inverter_quantity`, `battery_quantity`, `battery_ports_used`
- `min_quantity`
- filtros opcionais: `inverter_models`, `battery_model`, `grid_topology`, `battery_topology`
- `quantity_per_match`
- `comment`
- `active`

`per_solution` adiciona a quantidade fixa definida em `quantity_per_match` uma vez por solução. `inverter_models` permite selecionar múltiplos inversores na mesma regra; array vazio significa qualquer inversor.

### `ess_compatibility_rules`

Regras de compatibilidade entre inversores e baterias, usadas para validar o cálculo e gerar combinações.

Campos principais:

- `inverter_model`
- `battery_model`
- `battery_topology`
- `max_parallel_inverters`: 1 a 10
- `min_battery_qty`: 1 a 7
- `max_battery_qty`: 2 a 15
- `comment`
- `active`

As redes não são escolhidas na regra ESS; são derivadas de `inverters.grid_types`.

### `admin_activity_logs`

Log de alterações administrativas.

Campos principais:

- `actor_id`
- `actor_email`
- `entity_type`: `inverter`, `battery`, `accessory`, `solution`, `rule`
- `action`: `create`, `update`, `delete`, `deactivate`
- `target_id`
- `target_label`
- `summary`
- `before_data`
- `after_data`
- `created_at`

## Cálculo residencial

Entrada:

- topologia: `HighVoltage` ou `LowVoltage`
- modelo exato da bateria cadastrada
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
3. Filtra pelo modelo exato da bateria quando selecionado
4. Filtra `approved_solutions.active = true`
5. Exige `rated_power_w >= peakW`
6. Usa `capacity_kwh` e `min_soc_percent` do modelo de bateria para calcular energia útil quando disponível
7. Exige energia útil suficiente para pelo menos `targetEnergyWh * 0.8`
8. Aplica regras ESS de compatibilidade e limites de paralelo/baterias
9. Ordena por menor potência, menor energia e menor quantidade de baterias
10. Aplica regras automáticas de acessórios

## Geração de combinações por regras

O painel admin pode gerar combinações em `approved_solutions` a partir de:

- cadastros de inversores
- cadastros de baterias
- regras ESS ativas
- regras de acessórios ativas

O gerador cria um preview antes de aplicar. Ao aplicar, faz `upsert` em `approved_solutions` com:

- `source_file = generated-rules`
- `solution_code` determinístico por inversor, bateria, rede e quantidades
- potência e energia calculadas a partir dos campos do catálogo
- acessórios e comentários derivados das regras
- `raw_solution` com os metadados da geração

As abas de agrupamento de combinações mostram apenas modelos presentes no cadastro atual de produtos.

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
| `components/ui/confirm-delete-button.tsx` | Confirmação por popover para ações destrutivas |
| `components/ui/skeleton.tsx` | Skeletons de carregamento |
| `supabase/functions/calculate-residential/index.ts` | Motor de recomendação |
| `supabase/migrations/*.sql` | Schema, seeds e policies |
| `solutions/*.json` | Fonte das combinações aprovadas |
| `proxy.ts` | Middleware/Proxy de locale |

## Tema e UX

- Web app responsivo para PC, tablet e celular
- Tema moderno alinhado às cores SolaX usadas no app
- Login full-screen com layout adaptável
- Menu lateral fixo no desktop
- Menu mobile oculto por padrão, aberto por botão flutuante
- Barra de título fixa; somente o conteúdo das páginas rola
- Interface administrativa em cards, com edição em modal
- Confirmações destrutivas em popover com delay de 300ms para abrir/fechar
- Skeletons de carregamento em áreas administrativas e de usuário
- Feedback visual para salvar, remover, inativar, calcular e resetar senha

## Comandos úteis

```bash
npm run dev
npm run build
npx supabase db push --linked --yes
npx supabase functions deploy calculate-residential --project-ref xeddlhrmquwzuesvznrd
```
