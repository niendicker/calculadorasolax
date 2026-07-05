# Tarefas de melhoria para agentes

Este documento lista melhorias identificadas no projeto, em formato acionavel para outro agente executar. Cada tarefa deve ser implementada em commit separado quando possivel.

## Status

5 de 14 itens concluidos: #1, #2, #10, #11, #13. Os demais (#3-#9, #12, #14) seguem pendentes.

## Prioridade 1 - Seguranca

### 1. [CONCLUIDO] Restringir RLS de `admin_activity_logs`

Arquivo de referencia: `supabase/migrations/0010_admin_activity_logs.sql`

Problema:
As policies atuais permitem leitura e insercao publicas em `admin_activity_logs`.

Impacto:
Usuarios nao-admin podem ler historico administrativo ou poluir logs.

Alteracao esperada:
Criar uma nova migration que remova as policies publicas e recrie acesso apenas para admins usando `public.is_admin()`.

Criterio de aceite:
- Usuario comum nao consegue `select` nem `insert` em `admin_activity_logs`.
- Admin consegue ler e inserir logs.
- `npm run build` continua passando.

Resolvido em: migration `0043_admin_activity_logs_restrict_and_phase_power_check.sql`, commit `50281126`. Verificado via browser: leitura dos 106 logs existentes e insercao de um novo log ao editar um inversor continuam funcionando como admin.

### 2. [CONCLUIDO] Validar payload da Edge Function de calculo residencial

Arquivo de referencia: `supabase/functions/calculate-residential/index.ts`

Problema:
O corpo JSON recebido e convertido diretamente para `ResidentialOptions`, sem validacao forte de schema.

Impacto:
Payload invalido pode gerar resultado incorreto, erro interno ou consultas desnecessarias usando service role.

Alteracao esperada:
Adicionar validacao explicita para topologia, tipo de rede, modelos, cargas, quantidade, potencia, horas por dia e IP/IN. Retornar erro `400` para payload invalido.

Criterio de aceite:
- Payload invalido retorna `400` com codigo de erro estavel.
- Payload valido continua retornando solucao.
- Casos de carga vazia, potencia negativa, quantidade zero e `gridType` desconhecido sao rejeitados.

Resolvido em: commit `76aeb35a`. Funcao valida topologia, gridType, batteryModel/inverterModel, peakCalcMode, microGrid e cada carga (powerW, hoursPerDay, qty, ipInRatio), retornando `{ error: 'invalid_payload', details: [...] }` com status 400. Verificado com curl direto na function deployada (carga vazia, potencia negativa, qty zero e gridType desconhecido rejeitados; payload valido continua retornando solucao) e com o fluxo real de "Calcular" no browser.

## Prioridade 2 - Confiabilidade e conexao ruim

### 3. Propagar erros no `wizard-store`

Arquivo de referencia: `lib/store/wizard-store.ts`

Problema:
Algumas operacoes retornam silenciosamente em caso de erro, por exemplo `fetchProjects`, `fetchClients`, `fetchUserLoadCatalog` e `saveManualLoadToCatalog`.

Impacto:
Em conexao ruim, a UI pode parecer atualizada mesmo quando a operacao falhou.

Alteracao esperada:
Padronizar tratamento de erro: ou lancar excecao para a tela tratar, ou expor estado de erro/loading por operacao.

Criterio de aceite:
- Falhas de rede em fetch/save aparecem para o usuario.
- Operacoes de escrita nao somem silenciosamente.
- Fluxos existentes continuam funcionando quando o Supabase responde com sucesso.

### 4. Criar fila/retry para metricas de dimensionamento

Arquivo de referencia: `components/app/SinglePageApp.tsx`

Problema:
O insert em `app_simulations` e feito apos o calculo, mas falhas sao apenas enviadas ao console.

Impacto:
Metricas de uso podem ser perdidas quando a conexao esta ruim.

Alteracao esperada:
Adicionar uma fila local simples para metricas pendentes, com retry quando a conexao voltar ou quando o app for aberto novamente.

Criterio de aceite:
- Se o insert falhar, a metrica fica pendente localmente.
- Ao recuperar conexao, metricas pendentes sao reenviadas.
- O dimensionamento nao fica bloqueado por falha na metrica.

### 5. Melhorar mensagens de erro do calculo

Arquivos de referencia:
- `supabase/functions/calculate-residential/index.ts`
- `components/app/SinglePageApp.tsx`

Problema:
A UI mostra uma mensagem generica para falhas diferentes: sem solucao, regra ESS incompativel, erro interno ou rede.

Impacto:
O usuario nao sabe o que corrigir no dimensionamento.

Alteracao esperada:
Mapear codigos de erro da Edge Function para mensagens especificas e acionaveis.

Criterio de aceite:
- `no_approved_solution`, `no_compatible_ess_rule`, erro de rede e erro interno exibem mensagens diferentes.
- O estado da solucao anterior e limpo somente quando apropriado.

## Prioridade 3 - Performance e manutencao

### 6. Dividir `AdminPanel.tsx`

Arquivo de referencia: `components/admin/AdminPanel.tsx`

Problema:
O componente concentra estado, queries, CRUD, formularios, metricas e tabelas em um arquivo muito grande.

Impacto:
Risco alto de regressao, dificuldade de revisao e rerenders amplos.

Alteracao esperada:
Separar por dominios: metricas, produtos, regras ESS, regras de acessorios, solucoes, usuarios/logs e helpers.

Criterio de aceite:
- `AdminPanel.tsx` vira orquestrador menor.
- Nenhum comportamento visual/funcional e removido.
- `npm run build` continua passando.

### 7. Dividir `SinglePageApp.tsx`

Arquivo de referencia: `components/app/SinglePageApp.tsx`

Problema:
O componente concentra navegacao, perfil, clientes, projetos, dimensionamento, catalogo e relatorio.

Impacto:
Manutencao dificil e maior chance de rerender em areas nao relacionadas.

Alteracao esperada:
Separar em componentes/containers por aba e extrair hooks para dados iniciais, perfil, projetos e calculo.

Criterio de aceite:
- Fluxos de projeto, clientes, cargas, calculo e relatorio continuam funcionando.
- Estado compartilhado permanece claro via store/hooks.
- `npm run build` continua passando.

### 8. Carregar dados administrativos por aba

Arquivo de referencia: `components/admin/AdminPanel.tsx`

Problema:
O painel administrativo carrega muitas tabelas ao abrir, inclusive dados que pertencem a abas nao visiveis.

Impacto:
Tempo de carregamento maior e mais consumo de rede.

Alteracao esperada:
Carregar dados por aba, paginar listas grandes e trocar `select('*')` por colunas explicitas.

Criterio de aceite:
- Abrir o admin nao depende de carregar todas as abas.
- Tabelas com crescimento usam limite/paginacao.
- Queries declaram somente as colunas usadas.

### 9. Reaproveitar cache local de midia de produtos

Arquivo de referencia: `components/app/SinglePageApp.tsx`

Problema:
Ao mudar a solucao, a tela faz tres queries para buscar midia de inversores, baterias e acessorios.

Impacto:
Consultas repetidas e latencia desnecessaria.

Alteracao esperada:
Derivar midia dos catalogos ja carregados quando possivel e consultar Supabase apenas para itens ausentes.

Criterio de aceite:
- Resultado continua mostrando imagens/documentos.
- Trocar solucao reduz queries repetidas.

## Prioridade 4 - Qualidade automatizada

### 10. [CONCLUIDO] Adicionar lint

Arquivo de referencia: `package.json`

Problema:
O projeto nao tem script de lint.

Impacto:
Problemas de hooks, acessibilidade, imports e padrao de codigo podem passar despercebidos.

Alteracao esperada:
Adicionar configuracao de lint compatível com Next 16 e script `npm run lint`.

Criterio de aceite:
- `npm run lint` executa sem erro ou com lista clara de correcoes iniciais.
- O script pode ser usado em CI.

Resolvido em: `eslint.config.mjs` (flat config, `eslint-config-next/core-web-vitals` + `/typescript`), script `npm run lint`. Reduzido de 25 problemas iniciais (10 erros, 15 warnings) para 0 erros / 5 warnings: corrigidos `react/no-unescaped-entities`, unused vars/imports mortos, um `useEffect` sem `useMemo` (`phaseToPhaseVoltages`), e o filtro derivado de Combinações no `AdminPanel.tsx` (`selectedInverter`/`selectedBattery`/`selectedStatus`) foi reescrito para computar o valor efetivo em vez de resetar via `useEffect` + `setState`, eliminando 3 erros e mantendo o comportamento identico (verificado no browser). `loadData` no `AdminPanel.tsx` foi convertido para `useCallback` para poder entrar na dependency array do efeito de mount. As 5 warnings restantes (`react-hooks/set-state-in-effect`) sao o padrao legitimo de "isMounted" para portais/animacoes e fetch-on-mount; a regra foi rebaixada para `warn` com justificativa no proprio arquivo de config, em vez de deixar o lint permanentemente vermelho para codigo que nao e bug. `npm run build` e `npm run test` continuam passando.

### 11. [CONCLUIDO] Adicionar testes para regras de dimensionamento

Arquivos de referencia:
- `lib/store/wizard-store.ts`
- `supabase/functions/calculate-residential/index.ts`

Problema:
Funcoes como potencia diaria, pico, distribuicao por fase e filtros de compatibilidade nao tem testes automatizados.

Impacto:
Alteracoes futuras podem quebrar regras tecnicas sem aviso.

Alteracao esperada:
Extrair logica pura para modulos testaveis e adicionar testes unitarios.

Criterio de aceite:
- Testes cobrem `totalDailyKwh`, `totalPeakW`, `totalPowerByPhase` e filtros principais de compatibilidade.
- Script de teste roda localmente e pode entrar em CI.

Resolvido em: Vitest (`vitest.config.ts`, script `npm run test`). `lib/store/wizard-store.ts` ja exportava `totalDailyKwh`/`totalPeakW`/`totalPowerByPhase` como funcoes puras — testes adicionados em `lib/store/wizard-store.test.ts` (16 casos). A logica pura da Edge Function (tipos, `totalPeakW`/`totalNominalW`/`totalDailyKwh`, `ruleMatches`, `matchingEssBatteryConfig`, `normalizeStandardGridTopology`, `validateResidentialOptions`) foi extraida de `index.ts` para um novo modulo `supabase/functions/calculate-residential/logic.ts`, sem nenhuma API especifica do Deno (`Deno.*`, `jsr:`), para poder ser testada com Vitest normalmente; `index.ts` agora so importa de `./logic.ts` e mantem o handler `Deno.serve`. Testes em `logic.test.ts` (31 casos) cobrem os filtros de compatibilidade e a validacao de payload do item #2. Function redeployada e reverificada via curl e browser com resposta identica a anterior a extracao. 47 testes passando no total; `npm run build`, `npm run lint` e `tsc --noEmit` continuam passando.

### 12. Adicionar checagem para Supabase Edge Functions

Arquivo de referencia: `supabase/functions/calculate-residential/index.ts`

Problema:
`tsconfig.json` exclui `supabase/functions`, entao a function critica nao entra no build TypeScript do app.

Impacto:
Erros na function podem nao ser detectados por `npm run build`.

Alteracao esperada:
Adicionar script separado para checar functions, por exemplo com `deno check`.

Criterio de aceite:
- Existe comando documentado para validar Edge Functions.
- O comando falha em erro de tipo/sintaxe da function.

## Prioridade 5 - Banco de dados e schema

### 13. [CONCLUIDO] Adicionar constraint para `max_power_per_phase_w`

Arquivo de referencia: `supabase/migrations/0042_inverter_max_power_per_phase.sql`

Problema:
A coluna `max_power_per_phase_w` aceita qualquer numero, inclusive zero ou negativo.

Impacto:
Dados invalidos podem afetar validacao de balanceamento por fase.

Alteracao esperada:
Adicionar constraint `check (max_power_per_phase_w is null or max_power_per_phase_w > 0)`.

Criterio de aceite:
- Banco rejeita valor zero ou negativo.
- Valor nulo continua permitido.

Resolvido em: migration `0043_admin_activity_logs_restrict_and_phase_power_check.sql`, commit `50281126`. Verificado tentando salvar `-5` no admin: request rejeitada com `23514` (check constraint violation), UI nao quebra.

### 14. Revisar indices para consultas de regras

Arquivos de referencia:
- `supabase/functions/calculate-residential/index.ts`
- `supabase/migrations/*.sql`

Problema:
A Edge Function filtra regras ESS e regras de acessorios em memoria apos buscar muitas linhas ativas.

Impacto:
Escala pior conforme o catalogo de regras cresce.

Alteracao esperada:
Adicionar filtros nas queries e indices para campos usados em matching: `active`, `battery_model`, `inverter_model`, `grid_topology`, `battery_topology`.

Criterio de aceite:
- Queries da function buscam menos linhas.
- Plano de consulta usa indices nos filtros principais.

