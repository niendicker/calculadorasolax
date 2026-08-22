# Auditoria de dívida técnica

**Data da auditoria:** 2026-08-21  
**Escopo:** repositório completo da Calculadora SolaX  
**Tipo:** diagnóstico read-only; nenhum código foi alterado durante a auditoria

## Status de implementação

Após a auditoria, as seguintes etapas foram implementadas em commits separados:

- `db:check`: verificação somente leitura do estado local/remoto das migrations
  e do dry-run antes de qualquer aplicação.

- `814ea36f`: RLS de `app_simulations` exige usuário autenticado e `user_id`
  igual à sessão. A migration `0088_harden_simulation_metrics_insert.sql` foi
  aplicada no ambiente self-hosted; o estado de outros ambientes deve ser
  confirmado com `npm run db:check`.
- `4580d983`: validação runtime de métricas e metadados do cálculo.
- `dc931d07`: update atômico de quote shares, validação SSRF e limite efetivo
  de respostas externas.
- `36533072`: contratos de cálculo e métricas centralizados.
- `aa280ef2`: matemática de potência/energia compartilhada entre browser e
  Edge Function.
- `8e1aa8e3`: primeiro passo da refatoração estrutural, isolando o controlador
  do modo demo do shell principal.
- `63980a43`: autoridade server-side para sessões demo.
- `93dce6bf`: tipos gerados do schema Supabase aplicados aos clients e
  repositories principais.
- `938f5885`: rate limit nos endpoints sensíveis.
- `06b78ea0`, `f60f6de4`, `e439b703`, `94033cf5` e `321e8cc6`: decomposição
  incremental do `SinglePageApp`, cobrindo dimensionamento, PDFs, WhatsApp,
  downloads e navegação.
- `c24a81b7`: política de persistência do wizard isolada do store.
- `2bf302b1`, `bdab57f1` e `19bfa7b2`: contratos de métricas, proteção SSRF
  adicional e concorrência de quote shares cobertos por testes.
- `3d44e415`: testes pgTAP para policies de ownership/RLS.
- `d35e8c75` e `9916be8d`: cliente HTTP externo compartilhado e contexto de
  request ID para integrações de fornecedores.

A refatoração estrutural principal foi concluída de forma incremental. O JSX
restante do `SinglePageApp` é composição visual do shell e das abas; as regras
de negócio e integrações críticas estão em hooks e módulos próprios.

Permanecem como melhorias futuras: execução do pgTAP no CI/produção, testes de
integração ponta a ponta, centralização do envio de emails, validação completa
contra DNS rebinding, medição de bundle e redução do catálogo carregado no
primeiro acesso.

## Resumo executivo

O projeto está funcional e possui boas proteções recentes: RLS, validação na
Edge Function, testes da lógica de cálculo, tratamento de erros e separação
inicial do estado em slices.

As principais dívidas técnicas não são apenas questões de estilo. Os riscos
mais relevantes são:

- histórico de migrations de segurança que já ficou divergente em produção;
- estado global muito amplo e acoplado;
- duplicação entre frontend e Edge Function;
- tipos manuais e casts sobre dados do banco e JSONB;
- endpoints que confiam excessivamente no payload do cliente;
- componentes centrais grandes demais;
- documentação parcialmente desatualizada.

As classificações usadas neste documento são:

- 🔴 Crítico: segurança, perda de dados ou falha grave;
- 🟠 Alto: grande risco de bug ou manutenção;
- 🟡 Médio: dívida relevante, mas sem impacto imediato grave;
- 🟢 Baixo: melhoria de qualidade ou manutenção.

Esforço: S (< 1 hora), M (algumas horas), L (aproximadamente 1 dia) e XL
(refatoração maior).

## Top 10 dívidas técnicas

### 1. Migrations de segurança não aplicadas consistentemente

- **Severidade:** 🔴 Crítico
- **Esforço:** L
- **Arquivos:** `supabase/migrations/0076_security_fixes.sql`,
  `supabase/migrations/0083_reapply_missing_security_fixes.sql` e
  `supabase/migrations/0005_profile_roles_password_auth.sql`.

O migration `0083` documenta que as correções de escalada de privilégio e IDOR
não haviam sido aplicadas em produção. Migrations antigas também criavam
policies de escrita pública, posteriormente removidas por migrations seguintes.

O risco atual é a divergência entre ambientes: uma instalação parcial ou um
deploy incorreto pode reintroduzir uma vulnerabilidade já corrigida no código.

**Recomendação:** validar migrations aplicadas contra o schema real, criar um
check automatizado de drift, testar RLS em CI e documentar o processo de
promoção de migrations. Migrations de reapply devem ser exceção, não o
mecanismo principal de sincronização.

### 2. `isDemo` era controlado pelo cliente — resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** M
- **Arquivo:** `app/api/calculations/residential/route.ts:7-13,58`.

O risco original era a rota confiar no campo `isDemo` enviado pelo cliente, o
que permitiria adulterar métricas e contornar a regra de registro.

**Status:** resolvido em `63980a43`, com sessão demo assinada pelo servidor e
cookie HttpOnly.

### 3. Endpoint de métricas aceitava payload sem validação estrutural — resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** M
- **Arquivo:** `app/api/metrics/simulations/route.ts:6-19`.

O corpo é convertido com cast para `PendingSimulationPayload`, sem validar tipos,
tamanhos, limites ou campos obrigatórios.

Isso pode gerar métricas inconsistentes, payloads grandes e dados adulterados.

**Status:** resolvido em `4580d983`; o payload é validado e limitado antes do
repository.

### 4. Resposta pública de cotação não era atômica — resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** M
- **Arquivo:** `app/api/quote-shares/[token]/respond/route.ts:41-60`.

O endpoint consulta o status da cotação e depois executa o update em uma chamada
separada. Duas requisições simultâneas podem passar pela verificação e uma
resposta pode sobrescrever a outra.

O endpoint também não possui limitação de tentativas.

**Status:** resolvido em `dc931d07` e `19bfa7b2`, com update condicional,
verificação de linha afetada e rate limit por token/IP.

### 5. Integrações externas tinham proteção incompleta contra SSRF e respostas grandes — parcialmente resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** M
- **Arquivos:** `lib/procurement/generic-json.ts:42-51`,
  `app/api/admin/suppliers/[supplierId]/sync/route.ts` e
  `app/api/purchase-orders/[orderId]/submit-to-partner/route.ts`.

`buildSupplierUrl` exige HTTPS e bloqueia alguns endereços privados, mas não
cobre todos os ranges IPv4 e IPv6, IPv4-mapped IPv6 e possíveis variações de
DNS rebinding. O sync também depende de `content-length` para limitar a
resposta; respostas chunked podem escapar dessa proteção.

**Status:** cliente HTTP, timeout, limites de bytes e proteção contra IPv4
mapeado privado foram centralizados em `d35e8c75` e `bdab57f1`. Continua
pendente a validação do IP resolvido para cenários de DNS rebinding.

**Recomendação remanescente:** centralizar o cliente HTTP externo, validar todos os ranges
privados, validar o IP resolvido e impor limite real de bytes lidos. As respostas
do parceiro também devem possuir limite de tamanho.

### 6. Regra de cálculo duplicada entre frontend e Edge Function — resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** L
- **Arquivos:** `lib/store/wizard-calculations.ts:15-52`,
  `supabase/functions/calculate-residential/logic.ts:503-539` e
  `supabase/functions/calculate-residential/mirrors.test.ts`.

As funções `totalPeakW`, `totalNominalW` e `totalDailyKwh` existem em duas
implementações. Os testes de espelho reduzem o risco, mas ainda é necessário
alterar dois locais manualmente.

**Status:** resolvido em `aa280ef2`, com matemática compartilhada entre browser
e Edge Function e testes de espelho mantidos como proteção de regressão.

**Recomendação histórica:** compartilhar um módulo compatível com browser e Deno, ou
gerar a implementação da Edge Function. Manter os testes de espelho enquanto a
duplicação existir.

### 7. `SinglePageApp` concentrava responsabilidades demais — resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** XL
- **Arquivo:** `components/app/SinglePageApp.tsx`.

O componente possuía aproximadamente 1.343 linhas e coordenava autenticação,
carregamento, navegação, Zustand, autosave, cálculo, modo demo, PDF, uploads,
clientes, projetos, perfil e fornecedores.

Isso aumenta o custo de manutenção e torna alterações transversais mais
propensas a regressões.

**Status:** resolvido incrementalmente; os hooks de cálculo, dimensionamento,
demo, navegação, PDFs, compartilhamento e ações de projeto foram extraídos.

**Recomendação histórica:** extrair gradualmente os domínios de projetos, cálculo,
perfil/uploads, navegação e modo demo. Não é necessário reescrever o componente.

### 8. Tipos do banco não eram a fonte única de verdade — resolvido

- **Severidade:** 🟠 Alto
- **Esforço:** L
- **Arquivos:** `lib/types/index.ts`, `components/app/types.ts`,
  `components/admin/types.ts`, `lib/store/row-mappers.ts` e
  `components/app/hooks/useInitialData.ts:168-224`.

Havia tipos manuais e casts de documentos, flags, topologias e payloads JSONB.

O compilador pode continuar passando mesmo quando o schema e a aplicação
divergem.

**Status:** resolvido em `93dce6bf`; os tipos do schema foram gerados e
aplicados aos clients e repositories principais. JSONB ainda exige validação
runtime em alguns limites de domínio.

**Recomendação remanescente:** usar tipos das tabelas nos repositories
e validar JSONB em runtime. Mappers devem fazer conversão de banco para domínio,
não mascarar dados inválidos.

### 9. Uso recorrente de `select('*')` — resolvido

- **Severidade:** 🟡 Médio
- **Esforço:** M
- **Arquivos:** `lib/data/projects-repository.ts:46`,
  `lib/data/clients-repository.ts:19`, `lib/data/load-catalog-repository.ts:13`,
  `lib/data/catalog-repository.ts:9,63`, `lib/data/admin-supplier-repository.ts:7-9`
  e `lib/data/project-events-repository.ts`.

As consultas ficam acopladas a todas as colunas do schema, transferem dados
desnecessários e podem expor novas colunas sem intenção.

**Status:** não há ocorrências de `select('*')` nos repositories atuais; as
consultas declaram colunas por caso de uso.

### 10. Persistência global e estado de edição possuem alto acoplamento

- **Severidade:** 🟡 Médio
- **Esforço:** L
- **Arquivos:** `lib/store/wizard-store.ts:22-37,118-158` e
  `lib/store/slices/projects-slice.ts`.

O store mistura estado de sessão, draft, projetos salvos, catálogos, margens,
modo demo e persistência local. O `partialize` e o `merge` já possuem regras
especiais para controlar reidratação e impedir persistência do demo.

**Recomendação:** separar estado de sessão, draft, cache de catálogo e dados
persistidos do usuário.

## Problemas por categoria

### Código duplicado

- Cálculos duplicados entre frontend e Edge Function.
- Mappers de banco distribuídos em vários pontos.
- Consultas de perfil e projeto repetidas em repositories, páginas e hooks.
- Envio de email ao Resend repetido em vários endpoints.
- Diálogos e confirmações implementados em componentes diferentes.
- Cache e consultas da ANEEL distribuídos entre serviço e rotas.

### Código excessivamente complexo

Os principais hotspots são `SinglePageApp.tsx`, `SizingTab.tsx`, `MyStockTab.tsx`,
`AdminPanel.tsx` e `wizard-store.ts`. A compatibilidade com formatos legados
também aumenta a complexidade de tipos e mappers, embora seja necessária até
confirmar que não existem registros antigos em produção.

### Arquitetura inconsistente

Há três padrões de acesso ao Supabase:

1. repositories em `lib/data`;
2. consultas diretas em componentes;
3. consultas diretas em hooks, páginas e route handlers.

O padrão recomendado pelo próprio projeto em `docs/ARCHITECTURE.md` é manter a
fronteira de persistência em `lib/data`. Novos fluxos devem seguir esse padrão e
os fluxos existentes devem migrar apenas quando houver benefício real.

### TypeScript

Pontos positivos:

- poucos `any` explícitos;
- TypeScript passa;
- regras principais possuem testes.

Problemas:

- `createClient<any>` na Edge Function;
- casts frequentes de linhas Supabase;
- payloads de API convertidos por cast;
- tipos de domínio duplicados;
- JSONB sem validação runtime.

### Tratamento de erros

- `lib/supabase/server.ts:23-29` possui `catch {}` silencioso ao definir cookies
  (aceitável para streaming, mas ainda sem observabilidade).
- `lib/data/projects-repository.ts:66` ignora erro de inserção de evento.
- Logs são majoritariamente `console.error`, sem request ID ou contexto
  estruturado.
- Nem todos os endpoints possuem testes correspondentes.

### Segurança

Proteções existentes:

- service role restrito ao servidor;
- autenticação verificada em endpoints sensíveis;
- RLS para projetos, clientes e quote shares;
- proteção contra escalada de `profiles.role`;
- `user_id` das métricas substituído pelo usuário autenticado;
- validação do cálculo na Edge Function;
- exigência de HTTPS nas integrações.

Riscos remanescentes:

- drift de migrations;
- DNS rebinding ainda não validado após resolução;
- `locale` e redirecionamentos de autenticação sem whitelist explícita.

### Banco de dados

- JSONB em projetos facilita evolução, mas desloca validação para a aplicação.
- Migrations corretivas indicam risco de divergência entre ambientes.
- Índices importantes já existem para vários relacionamentos.
- Não foi identificado N+1 grave no cálculo.
- As consultas principais já usam colunas explícitas.
- Regras importantes estão distribuídas entre frontend, Edge Function e banco.

### React / Next.js

Existem 72 arquivos com `use client` e 43 ocorrências de `useEffect` em áreas
de aplicação. O uso de carregamento dinâmico para tabs secundárias é positivo,
mas o shell principal continua muito amplo e client-side.

`useInitialData` executa consultas em paralelo, porém carrega catálogos extensos
para toda sessão e mantém bastante estado local além do Zustand.

### Estado global

O Zustand é uma escolha coerente para o wizard, mas o store também funciona como
cache, sessão, persistência e controlador de navegação. A combinação entre
localStorage, banco, `savedProjects`, draft atual e snapshot demo é o principal
risco de estado stale e reidratação inesperada.

### Dependências

Não foram encontradas dependências claramente abandonadas ou duplicadas de alto
impacto. `@base-ui/react`, PDF, Supabase, Zustand, `next-intl` e Lucide possuem
uso claro.

`shadcn` aparece no `package.json`, mas não possui imports no código; deve ser
confirmado se é usado apenas como tooling. Não é recomendável removê-lo sem
confirmar o fluxo de geração de componentes.

### Performance

- Catálogos completos são carregados no início.
- A primeira sessão ainda carrega catálogos completos.
- O shell client-side envia bastante JavaScript ao navegador.
- A rota ANEEL pode carregar até 10.000 registros e filtrar em memória.
- Serializações do autosave e cálculo foram memoizadas, mas continuam sendo
  snapshots completos quando o estado realmente muda.
- O carregamento dinâmico das tabs já reduz o bundle inicial.

### Código morto e documentação

Também há caminhos de compatibilidade legada em `lib/types/index.ts`,
`components/admin/helpers.ts` e `lib/address.ts`. Não devem ser removidos sem
verificar os dados existentes no banco.

### Nomenclatura e legibilidade

Há mistura de português na UI com nomes técnicos em inglês. Termos próximos como
`gridType`, `gridTopology`, `topology` e `inverterGridType` aparecem em contextos
distintos. Também existem strings hardcoded apesar da presença de `next-intl`.

### Regras de negócio

As regras principais estão na Edge Function, mas métricas derivadas, custos,
compatibilidade de produtos e normalização de dados aparecem em camadas
adicionais. O risco maior é a divergência entre regras de cálculo e regras de
exibição.

### Valores mágicos

Devem ser inventariados e, quando compartilhados, centralizados:

- cooldowns;
- timeouts HTTP;
- limites de payload;
- resource ID da ANEEL;
- status de projeto;
- nomes de eventos;
- roles;
- tipos de rede.

### Observabilidade

Há logs de autenticação, eventos de projeto e identificação de commit. Ainda
faltam request IDs, logs estruturados, correlação de chamadas externas e
visibilidade consistente de falhas de persistência.

### Testabilidade

A suite possui 80 arquivos e 1.929 testes passando na auditoria. A lógica de
cálculo tem boa cobertura, incluindo testes de espelho.

As lacunas principais são:

- ainda há route handlers sem testes diretos;
- o pgTAP de RLS/ownership foi criado, mas depende de Postgres local/CI;
- concorrência de quote share, limites de payload e SSRF já possuem testes;
- pouca cobertura de integração do fluxo cálculo → métrica → projeto salvo.

## Quick wins

1. Remover ou documentar o `catch {}` silencioso.
2. Adicionar whitelist de locale e redirecionamentos locais.
3. Centralizar envio de email.
4. Adicionar testes para endpoints ainda sem cobertura.

## Refatorações estruturais

1. Separar estado de sessão, draft, cache e persistência no Zustand.
2. Centralizar envio de emails.
3. Validar JSONB em runtime nos limites de domínio restantes.
4. Automatizar execução do pgTAP no CI.
5. Validar IP resolvido para cenários de DNS rebinding.

## O que não vale a pena refatorar agora

- Reescrever toda a aplicação para Server Components.
- Remover compatibilidade legada sem verificar os dados existentes.
- Trocar Zustand apenas por preferência arquitetural.
- Criar uma camada genérica para cada tabela.
- Otimizar pequenos `reduce` de cálculo.
- Substituir todos os componentes UI atuais.
- Extrair cada helper pequeno para um arquivo separado.
- Remover migrations históricas já aplicadas.
- Fazer micro-otimizações antes dos problemas de segurança e contratos.

## Plano de redução da dívida técnica

### Fase 1 — Segurança e bugs críticos

1. Validar migrations em produção.
2. Criar teste de drift do schema.
3. Corrigir update não atômico de quote shares.
4. Validar payloads de métricas e cálculo.
5. Reforçar SSRF e limites de respostas externas.
6. Revisar redirecionamentos de autenticação.

### Fase 2 — Quick wins e duplicações

1. Centralizar constantes.
2. Centralizar envio de email.
3. Criar testes para endpoints ainda sem cobertura.

### Fase 3 — Centralização das regras de negócio

1. Definir tipos de domínio compartilhados.
2. Criar fonte única para validações.
3. Reduzir duplicação entre cálculo frontend e Edge Function.
4. Formalizar mappers de banco.
5. Separar regra de negócio de helpers de UI.

### Fase 4 — Melhorias arquiteturais

1. Separar stores por domínio real.
2. Padronizar acesso a dados via repositories.
3. Isolar integrações externas e observabilidade.
4. Definir contratos claros entre browser, API e Edge Function.

### Fase 5 — Performance e manutenção

1. Reduzir catálogo carregado inicialmente.
2. Avaliar cache compartilhado da ANEEL.
3. Medir bundle client-side.
4. Reduzir serializações completas de estado.
5. Adicionar testes de integração para workflows críticos.
6. Monitorar tempo e taxa de erro das integrações externas.
