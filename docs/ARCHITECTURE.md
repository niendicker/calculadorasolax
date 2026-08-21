# Arquitetura

## Visão geral

O projeto é uma aplicação Next.js 16 com App Router. A interface principal é uma SPA responsiva, enquanto páginas, route handlers e a Edge Function concentram responsabilidades de servidor.

```text
Browser
  ├─ SinglePageApp / páginas de autenticação
  ├─ Zustand (estado do wizard e projetos em edição)
  ├─ repositories browser (lib/data)
  └─ APIs internas (/api/*)
          ├─ Supabase server client + RLS
          ├─ service client somente quando necessário
          └─ serviços externos (Resend, ANEEL, APIs de parceiros)

Supabase
  ├─ Auth
  ├─ Postgres + RLS + migrations
  ├─ Storage
  └─ Edge Function calculate-residential
```

## Fronteiras de código

- `app/[locale]`: páginas, metadata e redirecionamentos server-side.
- `components/app`: interface principal, tabs e hooks de interação.
- `components/admin`: painel administrativo e editores.
- `lib/store`: estado de tela e regras puras do wizard.
- `lib/data`: fronteira de persistência. Consultas a tabelas, Storage e registros de domínio devem ficar aqui.
- `app/api`: autenticação server-side, validação de requests e orquestração de serviços externos.
- `supabase/migrations`: schema, funções, policies, triggers e índices versionados.
- `supabase/functions`: motor de recomendação executado em Deno.

## Regra de acesso a dados

Componentes não devem conhecer nomes de tabelas nem montar consultas Supabase diretamente. Para novos fluxos:

1. definir uma função de domínio em `lib/data`;
2. usar o cliente browser somente em fluxos realmente client-side;
3. usar o cliente server nas APIs;
4. usar service role apenas quando RLS não puder atender ao caso e justificar isso no código;
5. adicionar teste do repository ou da rota.

As regras de negócio puras devem permanecer independentes do Supabase para poderem ser testadas com Vitest e reutilizadas pela Edge Function quando necessário.

## Fluxo de cálculo

1. O usuário altera `residentialOptions` no Zustand.
2. `useCalculation` chama `POST /api/calculations/residential`.
3. A API autentica o usuário e invoca `calculate-residential`.
4. A função consulta combinações aprovadas e regras de compatibilidade.
5. A API registra a métrica; falhas de métrica entram na fila local para reenvio.
6. A solução retorna para a interface e pode ser persistida no projeto.

## Modo demonstrativo

O modo demonstrativo é uma camada de pré-preenchimento do wizard residencial,
não um fluxo de cálculo separado. As definições dos exemplos ficam em
`lib/demo/demo-simulations.ts`; presets de cargas, baterias e combinações
aprovadas são obtidos dos catálogos já carregados.

O Zustand mantém `isDemo`, `demoId` e um snapshot temporário do estado anterior.
Ao selecionar um exemplo, os dados técnicos são substituídos, os resultados são
limpos e a aplicação abre a aba Dimensionamento. O cálculo só ocorre quando o
usuário aciona o botão normal de calcular.

Durante o demo:

- autosave e salvamento de projeto ficam desabilitados;
- `currentProjectId` não é usado para persistência;
- a API recebe `isDemo` e não registra a execução em `app_simulations`;
- o estado demo não é persistido no localStorage;
- sair restaura o snapshot e retorna à aba Projetos;
- converter o demo limpa a identificação, remove o vínculo com o projeto
  anterior e reativa o fluxo normal de salvamento.

Os exemplos atuais são backup residencial, FV + backup e tarifa branca +
backup. A estrutura permite adicionar novos exemplos sem duplicar componentes,
validações ou regras de dimensionamento.

## Fluxo de projetos

Projetos, clientes e eventos usam repositories em `lib/data`. O estado em Zustand representa a edição atual; o banco é a fonte persistente. O projeto não deve voltar a depender de localStorage como armazenamento principal.

## Fluxo público de cotações

Uma cotação pública usa token não autenticado e snapshot próprio. O token não deve expor a edição atual do projeto nem permitir alterar outro projeto. Respostas públicas devem validar token, status e vínculo interno antes de gravar eventos.

## Migração futura

Para trocar Supabase ou mover o backend, preserve as interfaces de `lib/data` e os contratos HTTP de `app/api`. A substituição deve ocorrer atrás dessas fronteiras, evitando mudanças simultâneas na UI e no modelo de persistência.
