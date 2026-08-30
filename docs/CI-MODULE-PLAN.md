# Planejamento do módulo C&I — BESS

**Data:** 2026-08-29 (revisado em 2026-08-30)  
**Status:** todas as pendências da seção 17 fechadas em 2026-08-30 — implementação da Fase 1 iniciada  
**Escopo inicial:** instalações Commercial & Industrial (C&I), análise e viabilidade de BESS  
**Fonte de referência:** protótipo em `.env.import.local/frontend.txt` e `.env.import.local/backend c&i.txt`

**Revisão de 2026-08-30** — fechou três pontos que a versão anterior deixava
implícitos ou em aberto, após confirmação em código real (não apenas leitura
do protótipo): (1) `IndustrialOptions` é uma preparação legada não conectada
a nenhum fluxo de produto e será removida com suas referências de store,
persistência e testes na Fase 1 (seção 2.2); os namespaces de tradução serão
revisados separadamente, não removidos automaticamente; (2) `dispatch[]`/
`cashFlow[]` completos só são persistidos no cenário selecionado, não em todo
candidato da grade (seção 4.5), com materialização explícita quando o usuário
trocar a seleção; (3) a extração do `ProjectWorkspaceShell` de um arquivo de
~2000 linhas/~840 linhas de teste passa a ser sub-etapa isolada e com critério
de aceite próprio dentro da Fase 6, com risco correspondente registrado na
seção 14. Também documentada a assimetria intencional de nomenclatura entre
colunas residenciais e C&I em `projects` (seção 6.1), a rota canônica de
cálculo, o catálogo C&I administrado no servidor como requisito do MVP e um
plano B para a Fase 0 caso os arquivos Apps Script ausentes não sejam
recuperados.

**Revisão adicional de 2026-08-30** — após o pivô de parâmetros BESS manuais
para catálogo administrado (`ci_bess_products`), fechados três pontos que
essa mudança deixava em aberto: a seção 2.1 agora cita explicitamente que
`ci_bess_products` espelha o padrão já existente de
`inverters`/`batteries`/`approved_solutions` + `components/admin/editors/`,
em vez de introduzir um modelo novo; a tela de administração do catálogo
(`CiBessProductsEditor.tsx`) ganhou dono explícito na Fase 7, com critério de
aceite próprio, porque nenhuma simulação C&I roda sem pelo menos um produto
ativo cadastrado; e a pendência sobre onde mora preço/markup (seção 17) agora
cita o precedente exato que o residencial já resolveu (`user_stock_items`
sobre o catálogo admin de inversores/baterias).

**Fechamento de pendências em 2026-08-30** — todos os itens da seção 17
foram decididos (tabela na própria seção 17): payback simples+descontado,
ROI anual, taxa de desconto 12%/horizonte 10 anos como defaults editáveis,
curva do MVP limitada a 672 pontos (semana representativa, 15 min × 7 dias,
substituindo o "dia típico" das seções 4.2/5.4), PDF como estudo técnico de
viabilidade, reabertura de estudo sempre mostrando o snapshot congelado
(recalcular gera nova execução), Plano B da Fase 0 ativado (arquivos Apps
Script não recuperados) e cadastro de produtos C&I adiado para a tela de
admin, sem bloquear a Fase 1. A implementação segue para a Fase 1.

## 1. Resumo executivo

O projeto atual possui uma base adequada para receber C&I: autenticação pelo
Supabase, projetos persistidos com RLS, clientes, autosave, Workspace,
relatórios e uma fronteira clara entre componentes, store, repositories, APIs e
Edge Functions.

O C&I ainda não está implementado. Existe apenas um tipo preliminar
`IndustrialOptions`, persistência local do wizard e textos de seleção de
instalação. O banco, o cálculo, a interface e os relatórios continuam
residenciais.

O protótipo importado é uma referência funcional útil, mas não é uma aplicação
pronta para ser copiada para produção. O backend contém autenticação própria,
Google Sheets e um roteador `doPost`, mas chama funções de cálculo que não estão
presentes no arquivo analisado. O frontend é uma aplicação independente, com
estado em DOM, URL fixa de Google Apps Script, bibliotecas carregadas por CDN e
diversos cálculos de fallback no navegador.

### Decisões recomendadas para o planejamento

1. O MVP usará produtos BESS cadastrados e ativados pelo administrador,
   consultados pelo frontend e resolvidos pelo backend. O usuário avaliará
   quantidades inteiras do produto selecionado; valores técnicos e custos não
   serão aceitos do frontend como fonte de verdade.
2. O C&I compartilhará o ciclo de projetos, clientes, autenticação, RLS,
   autosave, orçamento, compartilhamento e identidade visual do sistema.
3. O C&I terá tipos, resultado e motor próprios. Não será convertido
   artificialmente para `ResidentialOptions` ou para o `Solution` residencial.
4. O motor energético será puro e determinístico; a API fará validação e
   autorização; React ficará responsável por entrada e apresentação.
5. Todas as premissas temporais, tarifárias e financeiras serão explícitas no
   input ou no snapshot do estudo.
6. O resultado de um estudo emitido será imutável e terá a versão do motor que
   o produziu.

Estas decisões devem ser confirmadas pelo produto antes da Fase 1. Onde o
documento disser “recomendado”, trata-se de uma proposta e não de um requisito
já existente.

## 2. Diagnóstico da arquitetura atual

### 2.1 O que pode ser reutilizado

| Área | Estado atual | Reuso proposto |
|---|---|---|
| Autenticação | Supabase Auth e sessão server-side | Usar integralmente; não portar `Usuarios` do Google Script |
| Projetos | `projects`, `clients`, RLS e repositories | Ampliar de forma aditiva com discriminador C&I |
| Workspace | `ProjectWorkspace` com header, status, autosave e navegação | Extrair um shell compartilhado e trocar apenas as seções específicas |
| Estado | Zustand dividido em slices | Criar slice C&I próprio; não ampliar indiscriminadamente o slice residencial |
| Autosave | `useAutosave` com debounce | Reutilizar com snapshot C&I |
| UI | `Card`, `Button`, `Input`, `Select`, `PageSummary`, modais | Reutilizar padrões e tokens existentes |
| Clientes | `clients` e `ClientsTab` | Reutilizar sem duplicação |
| Catálogo administrado | `inverters`/`batteries`/`approved_solutions` (leitura pública de ativos, escrita só de admin) e a UI em `components/admin/*` | Espelhar o mesmo modelo para `ci_bess_products` — não inventar um novo padrão de catálogo |
| Orçamento | estoque, serviços, margens e fornecedores | Integrar ao resultado C&I por linhas de equipamento/serviço próprias |
| Relatórios | React PDF, branding e downloads | Reutilizar layout e criar seções C&I |
| Segurança | RLS, rate limit, validações e API routes | Reutilizar integralmente |
| Observabilidade | métricas de simulação e request context | Criar evento/métrica específica para C&I |

Referências principais:

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- [`components/app/SinglePageApp.tsx`](../components/app/SinglePageApp.tsx)
- [`components/app/project-workspace/ProjectWorkspace.tsx`](../components/app/project-workspace/ProjectWorkspace.tsx)
- [`lib/store/wizard-store.ts`](../lib/store/wizard-store.ts)
- [`lib/store/slices/residential-slice.ts`](../lib/store/slices/residential-slice.ts)
- [`lib/data/projects-repository.ts`](../lib/data/projects-repository.ts)
- [`components/app/hooks/useAutosave.ts`](../components/app/hooks/useAutosave.ts)

### 2.2 O que existe apenas como preparação

O tipo legado [`IndustrialOptions`](../lib/types/index.ts) possui somente:

```text
gridPowerKw
pvPowerKwp
backupPowerKw
backupHours
demandCharge
```

Ele é mantido no Zustand e no localStorage, mas não é utilizado pela UI C&I,
não é salvo nos projetos do Supabase e não alimenta nenhum cálculo.

Os textos de instalação industrial/comercial também existem nas mensagens
(`home.industrial`, `home.industrial_desc` e todo o namespace `industrial.*`
em `messages/pt.json`), mas nenhum componente atual referencia esses textos.
Eles são traduções sem uso atual, mas podem ser reaproveitados na futura
seleção de tipo de instalação; portanto, a decisão de removê-los não deve ser
tomada automaticamente junto com o estado legado.

**Decisão fechada:** `IndustrialOptions` (tipo, campo na slice residencial,
chave em `wizard-persistence.ts` e referências em testes/helpers) será
removido na Fase 1, não deixado como está. Não há UI funcionando para
aproveitá-lo, e manter esse tipo por perto convida alguém a confundi-lo com o
novo `CommercialIndustrialOptions` (seção 4.1). Os namespaces de tradução
serão mantidos provisoriamente e, na Fase 6, reutilizados se os rótulos forem
adequados ou removidos apenas se forem substituídos por chaves melhores.

### 2.3 O que não existe atualmente

- motor C&I no browser, API ou Edge Function;
- contrato tipado para curva de carga;
- editor de curva de carga no app principal;
- cálculo de Peak Shaving, Load Shifting ou Híbrido no app atual;
- modelo persistido de tarifas C&I e premissas financeiras;
- comparação de cenários por quantidade de módulos;
- ranking e recomendação C&I;
- relatório ou memorial C&I;
- biblioteca de gráficos declarada nas dependências do projeto.

O editor de curva, gráficos e relatórios do `frontend.txt` são parte do
protótipo importado, não componentes existentes do app principal.

### 2.4 Limitações do protótipo importado

O arquivo [`backend c&i.txt`](../.env.import.local/backend%20c%26i.txt):

- possui autenticação baseada em planilha e senha própria;
- persiste em `Projetos`, `Carga` e `Resultados`;
- valida ownership por email recebido no payload;
- define `doPost` para ações C&I;
- referencia funções de cálculo que não estão no arquivo.

O `frontend.txt`:

- chama diretamente uma URL fixa do Google Apps Script;
- usa `Chart.js`, `jsPDF`, `SheetJS` e `html2canvas` via CDN;
- mantém estado global em variáveis e elementos DOM;
- calcula alguns valores financeiros também no cliente;
- tenta aceitar múltiplos formatos de resposta do backend;
- faz parsing de CSV por `split(',')`, sem suportar CSV complexo.

Antes da implementação, devem ser localizados os demais arquivos Apps Script e
as funções ausentes. O comportamento final do protótipo só poderá ser tratado
como referência depois da reconstrução de seus contratos e fórmulas.

## 3. Escopo funcional proposto

### 3.1 MVP

O MVP deve permitir:

- criar um projeto C&I vinculado a um cliente;
- consultar o catálogo C&I e selecionar um produto BESS ativo;
- visualizar as especificações técnicas, comerciais e documentais do produto;
- importar ou editar uma curva horária;
- informar premissas de tarifa, demanda e período de ponta;
- executar Peak Shaving, Load Shifting e Híbrido;
- avaliar uma quantidade fixa ou uma faixa de quantidades inteiras;
- simular operação ponto a ponto com SOC;
- calcular CAPEX, economia, payback, ROI e NPV;
- comparar cenários e escolher manualmente uma alternativa;
- mostrar a recomendação explicada;
- salvar configuração e último resultado;
- gerar resumo e memorial em PDF.

### 3.2 Fora do MVP

- combinação automática de múltiplos produtos BESS diferentes;
- BESS + Solar e BESS + Gerador no motor principal;
- curva anual de alta resolução com milhões de pontos;
- otimização matemática avançada;
- previsão de carga;
- despacho baseado em previsão meteorológica;
- tarifa por feriados e calendário regulatório completo;
- degradação eletroquímica detalhada e reposição de baterias;
- múltiplos BESS independentes no mesmo projeto.

Solar e gerador devem ser previstos nas interfaces de extensão, mas não devem
aumentar a complexidade do primeiro motor.

## 4. Contratos de domínio

Os nomes abaixo são propostas de domínio. Devem ser refinados durante a Fase 1.

### 4.1 Projeto e configuração

```text
CommercialIndustrialOptions
  loadCurve
  tariff
  bessProductId
  moduleCount
  strategy
  sizing
  financialAssumptions
```

`installation_type` deve ser o discriminador persistido em `projects`, e não
uma inferência baseada na presença de campos. O contrato de opções C&I não
deve duplicar esse valor. Quando uma API receber ambos por conveniência, deve
validar que são consistentes e tratar `projects.installation_type` como a
fonte de verdade.

### 4.2 Curva de carga

Cada ponto deve possuir, no mínimo:

```text
timestamp: ISO 8601
powerKw: number
```

Metadados obrigatórios ou derivados de validação:

```text
resolutionMinutes: 15 | 30 | 60
timezone: string
profileBasis: representative_day | representative_period | annual_series
periodStart: string
periodEnd: string
source: manual | csv | xlsx
```

**Decisão fechada — limite do MVP:** máximo de **672 pontos** por curva,
correspondendo a uma semana representativa em resolução de 15 minutos
(4 × 24 × 7). `profileBasis` do MVP é `representative_period` (uma semana),
não `representative_day` — distingue perfil de dia útil e fim de semana, que
costuma divergir em carga C&I. `annual_series` fica fora do MVP. As três
resoluções (15/30/60 min) são de fato aceitas no MVP, não só previstas no
contrato; o limite de 672 pontos vale para qualquer uma delas (ex.: 60 min ×
7 dias = 168 pontos, dentro do limite).

Regras recomendadas:

- armazenamento interno sempre em kW e timestamp ISO;
- resolução informada e validada, sem inferência silenciosa;
- sem timestamps duplicados;
- sem potência negativa no MVP;
- pontos ordenados cronologicamente;
- lacunas detectadas e reportadas;
- limite explícito de pontos por request;
- anualização definida pela configuração, nunca por um fator oculto.

### 4.3 Produto BESS e quantidade

```text
bessProductId
moduleCount
```

No MVP, `bessProductId` referencia um produto ativo cadastrado pelo
administrador e `moduleCount` deve ser inteiro positivo. A potência, capacidade,
eficiência, limites de SOC e garantia são resolvidos no servidor a partir do
produto. O frontend pode exibir esses dados, mas não deve enviá-los como
fonte de verdade para o cálculo.

**Decisão fechada — onde mora custo/markup:** `ci_bess_products` guarda só
especificação técnica, **sem** `base_cost`/`markup_percent`/
`integration_cost_per_kw` (ver tabela de pendências fechadas). Preço segue o
padrão já existente de `user_stock_items` (seção 2.1): estender o `check` de
`product_type` em `user_stock_items` (hoje `'inverter' | 'battery' |
'accessory'`, `supabase/migrations/0044_user_stock_items.sql`) com um novo
valor `'ci_bess'`, e cada usuário define seu próprio `unit_value` por produto
— exatamente como já acontece para inversor/bateria residencial, sem campo de
markup separado. Custo de integração/infraestrutura, quando não for parte do
preço unitário do usuário, entra como uma linha de `user_services` no
orçamento do projeto (mesmo mecanismo já reutilizado pela seção 2.1), não como
coluna nova em nenhuma tabela.

#### Catálogo C&I administrado

O catálogo C&I deve ser uma fonte server-side, com leitura restrita a usuários
autenticados para produtos ativos e escrita exclusiva de administradores. A
estrutura inicial deve suportar, no mínimo:

```text
id
model
manufacturer
description
active
module_power_kw
module_capacity_kwh
efficiency_percent
soc_min_percent
soc_max_percent
warranty_years
image_url
documents
created_at
updated_at
```

Os nomes finais podem seguir o catálogo existente quando os conceitos forem
compatíveis. Não se deve alterar silenciosamente os campos residenciais para
acomodar atributos específicos do C&I.

O frontend consulta produtos por repository/API, exibe somente registros
ativos e envia apenas `bessProductId` e as escolhas do estudo. A rota de
cálculo deve buscar novamente o produto, validar seu estado e congelar no
snapshot as especificações utilizadas.

Uma solução C&I completa composta por vários produtos, inversor, bateria e
acessórios pode ser adicionada posteriormente como `ci_solution_templates`.
No MVP, a solução é formada pelo produto BESS selecionado e pela quantidade de
módulos analisada.

No MVP, `moduleCount` deve ser inteiro positivo. A potência e a capacidade
totais são derivadas, não precisam ser armazenadas separadamente no input.

Como o protótipo possui uma única eficiência, o motor deve explicitar no
resultado como ela foi usada. A recomendação para o MVP é convertê-la em
eficiência de carga e descarga pela raiz quadrada da eficiência de ciclo. No
futuro, esses dois campos podem ser informados separadamente.

### 4.4 Tarifa e demanda

O contrato deve declarar as unidades:

```text
energyRatePeak: BRL/MWh
energyRateOffPeak: BRL/MWh
demandRate: BRL/kW-month
contractedDemandKw: kW
peakStart: HH:mm
peakEnd: HH:mm
tariffModality: verde | azul
market: cativo | livre
icmsPercent: percent
pisCofinsPercent: percent
```

O significado de cobrança Verde, Azul, ACL, impostos e demanda deve ser
validado com a regra de negócio antes de congelar o motor. O resultado deve
registrar as tarifas já normalizadas e as tarifas de entrada usadas.

**Correção fechada na Fase 4:** `annualEnergyInflationPercent` estava
duplicado aqui e em `FinancialAssumptions` (seção 11) — mesmo conceito,
dois lugares. Ficou só em `FinancialAssumptions`, que é onde a projeção de
fluxo de caixa multi-ano de fato o usa; a tarifa em si (custo de um único
ano, a partir da semana representativa) não precisa dele.

### 4.5 Resultado do motor

O resultado deve conter, no mínimo:

```text
engineVersion
inputFingerprint
baseline
scenarios[]
recommendation
assumptions
warnings[]
```

Cada cenário candidato da grade de comparação deve conter:

```text
scenarioId
moduleCount
strategy
technicalValidity
technicalWarnings[]
totalPowerKw
totalCapacityKwh
usefulCapacityKwh
capex
annualSavings
energySavings
demandSavings
paybackYears
roiPercent
npv
marginalGain
```

**Decisão fechada sobre `dispatch[]` e `cashFlow[]`:** só o cenário
selecionado/recomendado carrega o traço ponto a ponto completo (`dispatch[]`)
e o fluxo de caixa detalhado (`cashFlow[]`) no snapshot persistido. Os demais
cenários da grade ficam só com os agregados acima — suficiente para a tabela
de comparação e o ranking. Sem essa distinção, uma grade de 10 quantidades ×
4 estratégias persistiria 40 traços completos por execução, a maioria nunca
vista pelo usuário.

Recalcular `dispatch[]` sob demanda (em vez de persistir) foi cogitado e
descartado: o motor evolui por versão (`engineVersion`), então recalcular
com o motor atual reconstruiria um estudo antigo com regras novas — quebra
exatamente a garantia de imutabilidade da seção 1. Persistir o traço do
cenário escolhido é o que torna o snapshot de fato auditável.

O `dispatch[]` é dado derivado da curva + parâmetros do cenário, então seria
recalculável em tese — mas por causa do parágrafo acima ele é mantido no
resultado/snapshot (nunca na configuração editável), não recalculado a partir
dela.

Quando o usuário selecionar manualmente um candidato que ainda não possui
`dispatch[]`/`cashFlow[]`, o sistema deve materializar esse candidato usando a
mesma `engineVersion` da execução original, quando essa versão estiver
disponível. A materialização deve gerar um novo snapshot selecionado, sem
alterar a execução original. Se a versão antiga não estiver disponível, o
sistema deve informar que o cenário precisa ser recalculado com uma nova
versão, em vez de apresentar silenciosamente um resultado incompatível.

## 5. Arquitetura do motor

### 5.1 Camadas

```text
Entrada validada
  -> normalização de curva e unidades
  -> simulação energética
  -> cálculo tarifário
  -> cálculo financeiro
  -> comparação/ranking
  -> resultado versionado
```

O motor não deve importar React, Zustand, Supabase ou APIs externas.

**Sobre versionamento (`engineVersion`) e a materialização da seção 4.5:** o
MVP tem uma única versão do motor (`ci-v1`), então não é necessário construir
agora um despacho por versão (registro `engineVersion -> módulo do motor`)
nem manter código de versões antigas vivo. O ramo "informar que o cenário
precisa ser recalculado" é o único que roda na prática até o dia em que o
motor for de fato versionado pela primeira vez — não antecipar essa
complexidade agora, na linha do que as seções 3.2 e 15 já recomendam.

Estrutura provável:

```text
lib/commercial-industrial/
  types.ts
  validation.ts
  normalize.ts
  load-curve.ts
  tariff.ts
  dispatch.ts
  financial.ts
  scenarios.ts
  ranking.ts
  index.ts
```

A mesma lógica pura deve ser reutilizável na Edge Function por cópia controlada
ou por um módulo compatível com Deno, sem duplicar fórmulas entre frontend e
backend.

### 5.2 Simulação energética

Para cada intervalo:

1. ler a carga e o período tarifário;
2. aplicar a regra da estratégia;
3. limitar potência de carga/descarga;
4. limitar energia disponível entre SOC mínimo e máximo;
5. aplicar eficiência;
6. impedir carga e descarga simultâneas;
7. calcular importação da rede;
8. atualizar SOC;
9. registrar a operação no dispatch.

Regras do MVP:

- sem exportação para a rede;
- bateria começa com SOC explicitamente definido, preferencialmente o SOC
  máximo;
- a ordem de decisão do híbrido deve ser documentada;
- Peak Shaving deve ter um alvo explícito, derivado da demanda contratada ou
  configurado pelo usuário;
- Load Shifting deve permitir carga fora da ponta e descarga na ponta;
- toda violação física deve gerar warning ou invalidar o cenário;
- `kW × intervalo_horas = kWh` deve ser aplicado de forma consistente.

### 5.3 Estratégia híbrida

O híbrido não deve chamar dois motores independentes. Deve usar um único
dispatch com prioridades documentadas. A proposta inicial é:

1. reservar energia mínima para atender ponta;
2. usar potência disponível para reduzir a demanda instantânea;
3. carregar fora da ponta quando houver espaço energético;
4. respeitar SOC, potência e energia em cada passo.

Essa prioridade precisa ser validada com exemplos controlados antes da UI.

### 5.4 Anualização

A configuração deve informar se a curva representa:

- um dia típico;
- um período representativo;
- uma série anual.

Para o MVP, o perfil suportado é uma **semana representativa** (até 672
pontos, seção 4.2), já com dia útil e fim de semana distinguidos ponto a
ponto na própria curva. `representative_day` e `annual_series` ficam
previstos no contrato mas fora do MVP.

**Correção fechada na Fase 4:** a fórmula de anualização original desta
seção (dia típico × dias úteis/mês) foi escrita para uma curva de um único
dia — não reconciliada quando a curva do MVP virou semana representativa
(seção 17). Como a semana já mistura dia útil e fim de semana na proporção
real, a extrapolação correta é **semana × (365,25/7)** para energia — o
campo `businessDaysPerMonth` não tem mais papel e foi removido de
`FinancialAssumptions` (`lib/commercial-industrial/types.ts`). `monthsPerYear`
continua necessário, mas só para a demanda (R$/kW-mês × meses/ano), que é
faturada mensalmente independente do formato da curva. O relatório deve
mostrar essa premissa (365,25/7 aplicado à energia).

Não deve existir lógica implícita como `8760 / quantidade_de_pontos` sem informar
ao usuário o que está sendo assumido.

## 6. Modelo de dados e persistência

### 6.1 Evolução de `projects`

A proposta é aditiva para não quebrar projetos residenciais:

```text
projects.installation_type text not null default 'residential'
projects.calculation_options jsonb not null default '{}'
projects.calculation_result jsonb
projects.calculation_version text
```

Os campos residenciais atuais devem continuar funcionando durante a transição.
Não é recomendado renomear ou reaproveitar `residential_options` para C&I.

O repository deve selecionar explicitamente os campos novos e manter a
compatibilidade com registros antigos.

O catálogo de produtos deve ser persistido em uma tabela própria, por exemplo
`ci_bess_products`, em vez de depender de valores enviados pela tela. Usuários
autenticados terão somente leitura dos produtos `active = true`; operações de
criação, edição, ativação e desativação serão exclusivas de administradores.
O cadastro deve suportar os campos técnicos, financeiros e documentais da
seção 4.3.

**Débito técnico assumido conscientemente:** a mesma tabela passa a ter dois
pares de colunas para o mesmo papel conceitual — `residential_options`/
`solution` para residencial, `calculation_options`/`calculation_result` para
C&I. É a escolha certa para não tocar em residencial, mas fica registrado
aqui para não ser confundido com inconsistência acidental, e para que
ninguém tente "unificar" os nomes sem entender por que divergem.

`calculation_result` não é o histórico completo: é uma projeção/cache do
último resultado selecionado para abertura rápida do projeto. A fonte de
verdade histórica é `project_calculation_runs`, que contém snapshots
imutáveis. O campo `calculation_version` deve corresponder ao resultado dessa
projeção.

### 6.2 Histórico de estudos

Para estudos recalculáveis e relatórios já emitidos, criar uma tabela própria,
por exemplo `project_calculation_runs`, com:

```text
id
project_id
user_id
installation_type
engine_version
input_fingerprint
input_snapshot jsonb
result_snapshot jsonb
selected_scenario_id
status
error_message
created_at
```

Essa tabela deve ser append-only para o usuário. Alterar a configuração atual
do projeto não deve alterar snapshots anteriores.

**Decisão fechada — reabertura de estudo:** abrir um projeto C&I salvo sempre
mostra o snapshot congelado (`calculation_result`/`project_calculation_runs`
correspondente), nunca recalcula automaticamente. Recalcular é uma ação
explícita do usuário (botão "Recalcular") que cria uma **nova** linha em
`project_calculation_runs` — nunca sobrescreve ou apaga a execução anterior.
Coerente com a decisão 6 da seção 1 (resultado imutável).

### 6.3 Curva de carga

Para o MVP, a curva normalizada pode ficar dentro de
`calculation_options.loadCurve`, desde que exista um limite de pontos e o
payload permaneça pequeno.

Se o produto precisar de séries anuais ou alta resolução, migrar para:

- arquivo original no Supabase Storage;
- metadados e versão em tabela;
- pontos normalizados em tabela ou arquivo interno compactado.

Não armazenar simultaneamente toda a curva original, todos os resultados
intermediários e todos os gráficos renderizados sem necessidade.

### 6.4 RLS e ownership

- `projects` continua restrito ao usuário proprietário;
- `project_calculation_runs` deve validar ownership por `projects`;
- nenhum endpoint deve confiar em `user_id`, email ou `project_id` enviado pelo
  cliente sem consultar a sessão;
- snapshots públicos, caso sejam compartilhados, devem usar o mecanismo de
  cotação existente e uma cópia própria do resultado.

## 7. Fluxo frontend, backend e banco

```text
Usuário configura C&I
  -> Zustand guarda edição local
  -> autosave grava calculation_options
  -> usuário solicita simulação
  -> API autentica e valida
  -> Edge Function executa motor versionado
  -> API grava métrica e snapshot
  -> frontend recebe resultado
  -> usuário compara e escolhe cenário
  -> projeto guarda cenário escolhido
  -> relatório usa o snapshot selecionado
```

Rotas prováveis:

```text
POST /api/projects/:projectId/calculations
GET  /api/projects/:projectId/calculations
```

Para o MVP, `POST /api/projects/:projectId/calculations` é a rota canônica:
ela valida o ownership do projeto, recebe ou carrega a configuração C&I,
executa o motor e registra a execução. Não deve existir uma segunda rota
paralela com contrato equivalente. Uma rota genérica independente só deve ser
criada posteriormente se houver um caso real de simulação sem projeto.

Para a primeira versão, a simulação pode continuar síncrona. O desenho deve
permitir execução assíncrona posteriormente caso uma série anual fique pesada.

## 8. Interface e integração com o Workspace

### 8.1 Estrutura recomendada

Não duplicar o `ProjectWorkspace` inteiro. Separar:

```text
ProjectWorkspaceShell
  ├─ ResidentialWorkspaceContent
  └─ CommercialIndustrialWorkspaceContent
```

O shell compartilharia:

- nome e cliente;
- status;
- autosave;
- ações de projeto;
- histórico;
- orçamento;
- fornecedores;
- relatório;
- retorno para a lista de projetos.

**Risco a tratar como sub-etapa própria, não como parte da construção da UI
C&I:** `ProjectWorkspace.tsx` hoje tem ~2000 linhas e ~840 linhas de teste,
com a lógica de abas, orçamento e cada seção residencial entrelaçadas no
mesmo arquivo — não pré-separadas. Extrair um shell genuinamente
compartilhado é um refactor de risco real para o fluxo residencial em
produção. Ver critério de aceite adicional na Fase 6 e o risco correspondente
na seção 14.

O conteúdo C&I teria seções:

1. Visão geral
2. Configuração BESS
3. Curva de carga
4. Tarifas e demanda
5. Estratégia
6. Dimensionamento
7. Resultados e comparação
8. Memorial

### 8.2 Componentes prováveis

```text
components/app/project-workspace/
  ProjectWorkspaceShell.tsx
  CommercialIndustrialWorkspace.tsx
  ci/
    CiConfigurationPanel.tsx
    CiLoadCurvePanel.tsx
    CiTariffPanel.tsx
    CiStrategyPanel.tsx
    CiSizingPanel.tsx
    CiResultsPanel.tsx
    CiComparisonTable.tsx
    CiInsightsPanel.tsx
    CiMemorial.tsx
    CiCharts.tsx
```

Esses nomes são indicativos. A decisão final deve respeitar o tamanho real dos
componentes após a Fase 1.

### 8.3 Gráficos

Não há uma biblioteca de gráficos declarada nas dependências atuais. O
`frontend.txt` usa CDN, que não deve ser levado diretamente para o app.

Para o MVP, avaliar primeiro gráficos SVG pequenos e controlados pelo próprio
React para:

- carga original e carga após BESS;
- SOC;
- carga/descarga;
- comparação de CAPEX e economia.

Adicionar uma biblioteca somente se SVG próprio não atender à interação,
acessibilidade ou manutenção esperada.

## 9. Relatório e memorial

**Decisão fechada:** o PDF C&I é um **estudo técnico de viabilidade**, não
uma cotação comercial — o produto vendido é a análise (payback, ROI, NPV,
memorial), não só o preço do equipamento. Isso reforça, não substitui, o
formato de seções abaixo (já desenhado nessa linha).

Reutilizar branding, perfil da empresa, cliente e infraestrutura do relatório
existente em [`components/app/project-quote-pdf.tsx`](../components/app/project-quote-pdf.tsx).

O relatório C&I deve receber um snapshot já calculado e não recalcular valores
durante a renderização. Seções:

- resumo executivo;
- dados do projeto;
- premissas temporais, tarifárias e financeiras;
- BESS recomendado;
- estratégia;
- curva original e curva após BESS;
- SOC e operação;
- comparação de módulos;
- CAPEX, economia, payback, ROI e NPV;
- fluxo de caixa;
- insights;
- limitações e warnings;
- memorial resumido.

O PDF deve informar `engineVersion`, data do estudo e fingerprint da entrada.

## 10. Serviços, hooks e fronteiras

### Domínio

- `lib/commercial-industrial/*`: tipos, validação, normalização e cálculo puro;
- `lib/ci-report/*`: transformação de snapshot em dados de relatório;
- `lib/ci-comparison/*`: ranking e ganho marginal, se não permanecerem no
  domínio principal.

### Persistência

- ampliar `lib/data/projects-repository.ts` ou criar funções C&I claramente
  separadas;
- repository de leitura de `ci_bess_products` para o frontend;
- repository/rotas administrativas para cadastrar, editar, ativar e desativar
  produtos C&I;
- repository para `project_calculation_runs`;
- repository de Storage apenas se a curva original for persistida como arquivo;
- nunca consultar Supabase diretamente dos componentes.

### Estado e hooks

- `lib/store/slices/commercial-industrial-slice.ts`;
- estado de `bessProductId` e catálogo ativo carregado do servidor;
- `useCommercialIndustrialCalculation`;
- `useCommercialIndustrialProject`;
- reutilização de `useAutosave`;
- hook separado para importação/normalização da curva, sem misturar parser com
  renderização.

### Backend

- `app/api/projects/[projectId]/calculations/route.ts` — rota canônica única
  (ver seção 7; não criar `app/api/calculations/commercial-industrial/` em
  paralelo);
- `lib/data/commercial-industrial-calculation-repository.ts`;
- rota/repository administrativo para `ci_bess_products`, com autorização de
  admin;
- `supabase/functions/calculate-commercial-industrial/`;
- atualização de `docs/API.md` após a rota existir.

### Admin

- `components/admin/editors/CiBessProductsEditor.tsx`, seguindo o mesmo
  padrão de `InvertersEditor.tsx`/`BatteriesEditor.tsx` (CRUD + ativar/
  desativar); registrar no `AdminPanel.tsx`/`AdminNav.tsx` como as demais
  seções de catálogo;
- **nenhuma simulação C&I roda sem pelo menos um produto ativo cadastrado**
  — esta tela é caminho crítico do MVP, não trabalho posterior (ver Fase 7).

## 11. Premissas financeiras

O contrato deve tornar configuráveis, no mínimo:

```text
discountRatePercent
analysisHorizonYears
annualEnergyInflationPercent
monthsPerYear
```

(`businessDaysPerMonth` removido — ver correção na seção 5.4: era para um
modelo de dia típico, não para a semana representativa que o MVP usa.)

**Decisão fechada — valores iniciais do formulário (editáveis por projeto,
nunca hardcoded no motor):** `discountRatePercent` = 12% a.a.,
`analysisHorizonYears` = 10 anos (mesma ordem de grandeza da garantia típica
do BESS, seção 4.3). São defaults de UI, não limites — o motor aceita
qualquer valor validado pela seção de segurança (positivo, finito, dentro de
uma faixa sã a definir na validação da Fase 1, ex. 0-100% e 1-30 anos, para
barrar entrada absurda sem impedir um caso de negócio incomum).

**Definições fechadas:**

- CAPEX: fórmula e ordem de aplicação do markup — a definir na Fase 0/1 junto
  com o schema de `ci_bess_products` e a decisão de que markup mora no
  perfil comercial do usuário (`user_stock_items`), não no catálogo admin;
- economia de energia: diferença entre custo base e custo com BESS;
- economia de demanda: diferença entre demandas cobradas;
- **payback: os dois** — simples (anos até a economia acumulada, sem
  desconto, cobrir o CAPEX) e descontado (mesmo cálculo trazendo o fluxo a
  valor presente por `discountRatePercent`). O resultado do motor retorna
  ambos, não um só;
- **ROI: anual = economia anual / CAPEX** — taxa de retorno simples ano a
  ano, comparável diretamente com `discountRatePercent`;
- NPV/VPL: fluxo de caixa anual, taxa = `discountRatePercent`, ano zero =
  investimento (CAPEX) sem economia;
- ganho marginal: diferença entre um cenário e o cenário imediatamente
  anterior;
- garantia: indicador de retorno dentro da garantia, não substituto do
  horizonte financeiro.

O motor deve retornar as fórmulas ou componentes intermediários relevantes no
resultado para que o memorial explique o número final.

## 12. Estratégia de testes

### 12.1 Motor puro

Testar valores numéricos para:

- carga constante;
- pico único;
- Peak Shaving com redução conhecida;
- Load Shifting com spread conhecido;
- estratégia híbrida;
- SOC mínimo atingido;
- SOC máximo atingido;
- bateria inicialmente cheia;
- bateria inicialmente vazia;
- potência insuficiente;
- energia insuficiente;
- módulos adicionais sem benefício;
- tarifa ponta igual à fora ponta;
- curva sem período de ponta;
- resolução de 15, 30 e 60 minutos;
- curva com lacuna, duplicidade e timestamp inválido;
- tarifa ou custo negativo/inválido;
- NPV manualmente verificável;
- ranking e ganho marginal.

### 12.2 Fixtures de compatibilidade

Criar casos de entrada e saída conhecidos do protótipo, depois comparar:

- baseline;
- demanda máxima;
- energia importada;
- economia;
- CAPEX;
- payback;
- cenário recomendado.

Diferenças devem ser classificadas como erro, arredondamento ou regra
intencionalmente alterada.

### 12.3 API e banco

- request inválido;
- usuário não autenticado;
- projeto de outro usuário;
- tentativa de acessar cálculo por ID de terceiro;
- rate limit;
- timeout/erro da função;
- persistência do snapshot;
- RLS em `projects` e `project_calculation_runs`;
- usuário comum só lê produtos C&I ativos;
- usuário comum não cria, edita, ativa ou desativa produtos C&I;
- admin consegue administrar o catálogo sem expor dados de outros usuários.

### 12.4 UI e relatório

- criação de projeto C&I;
- autosave e recuperação;
- importação e edição da curva;
- execução e seleção de cenário;
- alteração de premissa invalidando resultado anterior;
- indicação de resultado desatualizado;
- PDF com snapshot consistente;
- responsividade nos padrões já documentados.

## 13. Fases de implementação

### Fase 0 — fechamento do levantamento

**Objetivo:** eliminar incertezas do protótipo e validar decisões de produto.

**Arquivos/módulos:** arquivos `.env.import.local`, `docs/ARCHITECTURE.md`,
`docs/SPECS.md`, `docs/API.md`.

**Novas estruturas:** inventário de funções, planilhas, payloads, respostas e
fixtures do Google Script.

**Dependências:** acesso aos demais arquivos Apps Script e exemplos reais de
entrada/saída.

**Plano B se os arquivos Apps Script ausentes não forem recuperados:** a
Fase 0 não fica bloqueada indefinidamente esperando um arquivo que pode não
existir mais. Nesse caso, as fórmulas já documentadas explicitamente nas
seções 5 e 11 deste plano passam a ser a fonte de verdade, e a Fase 0 se
encerra com essa decisão registrada explicitamente (não silenciosamente).

**Critérios de aceite:**

- funções ausentes identificadas, recuperadas ou formalmente substituídas
  pelas fórmulas das seções 5/11 (plano B acima);
- unidades e fórmulas do protótipo mapeadas;
- estrutura do catálogo C&I confirmada, incluindo campos técnicos,
  financeiros, documentos, status ativo/inativo e responsabilidades do admin;
- perfil temporal da curva definido;
- fórmulas financeiras aprovadas;
- tabela de fórmulas aprovada, contendo definição, unidade, origem da premissa,
  arredondamento e casos-limite para tarifas, demanda, CAPEX, economia,
  payback, ROI e NPV.

### Fase 1 — domínio e modelos

**Objetivo:** criar contratos puros e o discriminador C&I sem alterar o fluxo
residencial.

**Arquivos/módulos prováveis:** `lib/types/index.ts`, novo
`lib/commercial-industrial/`, `lib/store/slices/` e testes unitários.

**Novas estruturas:** tipos de configuração, curva, tarifa, estratégia,
cenário, dispatch, fluxo de caixa, resultado versionado e contrato do catálogo
de produtos C&I.

**Dependências:** decisões da Fase 0.

**Critérios de aceite:**

- contratos têm unidades e limites documentados;
- configuração inválida é rejeitada;
- tipos C&I não dependem de tipos residenciais;
- testes de normalização passam;
- nenhum arquivo de UI residencial precisa conhecer detalhes do motor C&I;
- `IndustrialOptions`, o campo correspondente na slice residencial, sua
  chave em `wizard-persistence.ts` e suas referências em testes/helpers foram
  removidos;
- os namespaces de tradução foram avaliados para reutilização ou substituição,
  sem remoção automática das chaves ainda potencialmente úteis.

### Fase 2 — entrada e curva de carga

**Objetivo:** importar, validar, normalizar, exibir e editar curva horária.

**Arquivos/módulos prováveis:** `components/app/project-workspace/ci/`, novo
hook de curva, `lib/commercial-industrial/load-curve.ts`, dependências somente
se justificadas.

**Novas estruturas:** parser CSV, metadados de resolução, warnings e resumo
de pico/mínimo/média/energia — implementados em
`lib/commercial-industrial/load-curve.ts`
(`parseLoadCurveCsv`/`summarizeLoadCurve`).

**Decisão fechada — XLSX adiado:** o MVP aceita só CSV. Qualquer planilha
exporta para CSV em um clique, e adicionar uma biblioteca de ~1MB (`xlsx`/
SheetJS — não existe hoje nenhuma lib de planilha nas dependências do
projeto) antes de uma necessidade concreta contraria a seção 14/15. XLSX
fica como extensão futura, sem mudar o contrato (`LoadCurveSource` já
inclui `'xlsx'`).

**Dependências:** contratos da Fase 1, catálogo ativo carregado do servidor.

**Critérios de aceite:**

- CSV válido é normalizado para o contrato `LoadCurve` (XLSX adiado, ver
  decisão acima);
- 15/30/60 minutos são aceitos de fato (não só validados) até o limite de
  672 pontos (seção 4.2); acima do limite, rejeitado com mensagem clara;
- lacunas e duplicidades aparecem ao usuário;
- o gráfico representa exatamente os pontos normalizados;
- nenhuma regra de cálculo financeiro fica no componente;
- o frontend não usa valores técnicos ou custos enviados manualmente quando há
  um `bessProductId` selecionado.

### Fase 3 — motor energético

**Objetivo:** simular operação ponto a ponto para uma quantidade e estratégia.

**Arquivos/módulos prováveis:** `dispatch.ts`, `tariff.ts`, testes de fixtures,
Edge Function posterior.

**Novas estruturas:** estado de SOC, dispatch, baseline, warnings e métricas
energéticas.

**Dependências:** curva normalizada e regras de despacho aprovadas.

**Critérios de aceite:**

- todos os cenários controlados da seção de testes passam numericamente;
- SOC nunca viola limites;
- carga/descarga nunca excede potência ou energia disponíveis;
- baseline e cenário usam a mesma curva e premissas;
- resultado permite reconstruir cada intervalo.

### Fase 4 — cálculo econômico

**Objetivo:** calcular tarifas, CAPEX, economia, fluxo de caixa, payback, ROI e
NPV a partir do dispatch.

**Arquivos/módulos prováveis:** `financial.ts`, `tariff.ts`, testes numéricos,
tipos de premissas.

**Novas estruturas:** `FinancialAssumptions`, fluxo de caixa anual, componentes
de economia e memorial financeiro.

**Dependências:** motor energético estável; fórmulas aprovadas.

**Critérios de aceite:**

- taxa de desconto e horizonte vêm do input;
- cada indicador tem fórmula testada;
- tarifa ponta igual à fora ponta produz economia de energia zero;
- valores financeiros são reproduzíveis manualmente;
- o resultado registra todas as premissas utilizadas.

### Fase 5 — comparação e ranking

**Objetivo:** executar cenários com módulos inteiros, comparar e recomendar.

**Arquivos/módulos prováveis:** `scenarios.ts`, `ranking.ts`, tipos de
recomendação e testes.

**Novas estruturas:** faixa de quantidades, critérios de ranking, ganho
marginal, justificativa e cenário selecionado.

**Dependências:** motor energético e financeiro.

**Critérios de aceite:**

- modo quantidade fixa avalia exatamente a quantidade pedida;
- modo automático avalia somente quantidades permitidas;
- ranking funciona por payback, ROI e NPV;
- seleção manual não altera o resultado calculado;
- a justificativa aponta métricas e premissas reais;
- cenário sem benefício marginal é identificado.

### Fase 6 — UI de configuração e resultados

**Objetivo:** integrar C&I ao projeto e ao Workspace existente.

**Arquivos/módulos prováveis:** `SinglePageApp.tsx`, `ProjectWorkspace.tsx`,
novo shell, slice C&I, hooks e componentes C&I.

**Novas estruturas:** seleção de tipo de instalação, painéis, estados de
loading/erro/stale, tabela de comparação e gráficos.

**Dependências:** domínio, curva, cálculo e padrões UI existentes.

**Sub-etapa obrigatória e isolada, antes de construir qualquer UI C&I:**
extrair `ProjectWorkspaceShell` de `ProjectWorkspace.tsx` como um commit
próprio, de refactor puro, sem mudança de comportamento. Rodar a suíte de
testes existente (`ProjectWorkspace.test.tsx`, ~840 linhas) antes e depois
da extração — a suíte deve passar inalterada nos dois momentos, sem editar
seus asserts para "fazer passar". Só depois disso começa a construção dos
painéis C&I sobre o shell extraído. Ver risco correspondente na seção 14.

**Critérios de aceite:**

- shell extraído em commit isolado, suíte residencial passando sem alteração
  de asserts antes/depois;
- usuário escolhe C&I ao criar projeto;
- projeto residencial continua funcionando sem mudança de fluxo;
- configuração C&I é salva e recuperada;
- alterações marcam o resultado como desatualizado;
- UI não acessa Supabase diretamente;
- layout segue `UI-GUIDELINES.md` e `UI-REVIEW-CHECKLIST.md`.

### Fase 7 — API, persistência, memorial e relatório

**Objetivo:** fechar o fluxo server-side, histórico e entrega documental.

**Arquivos/módulos prováveis:** migrations, repositories, route handler, Edge
Function, `docs/API.md`, PDF, testes de RLS e
`components/admin/editors/CiBessProductsEditor.tsx`.

**Novas estruturas:** campos C&I em `projects`, `project_calculation_runs`,
tabela `ci_bess_products`, tela de administração do catálogo (seção 10 —
"Admin"), snapshot versionado, rota de cálculo e seções do relatório.

**Dependências:** resultado estável e definição de snapshot.

**Critérios de aceite:**

- API autentica e autoriza pelo usuário da sessão;
- cálculo não depende do Google Script;
- snapshots antigos não mudam após editar o projeto;
- RLS impede acesso por ID de outro usuário;
- PDF usa exatamente o snapshot selecionado;
- rota está documentada em `docs/API.md`;
- admin consegue cadastrar, editar, ativar e desativar produtos C&I pela UI,
  e existe pelo menos um produto ativo antes do módulo ser considerado
  demonstrável.

### Fase 8 — validação e rollout

**Objetivo:** comparar com o protótipo, validar segurança e liberar o MVP.

**Arquivos/módulos prováveis:** suíte de testes, fixtures, documentação
operacional e feature flag, se necessária.

**Novas estruturas:** relatório de divergência, checklist de release e
telemetria de falhas.

**Dependências:** todas as fases anteriores e cenários reais.

**Critérios de aceite:**

- testes unitários, integração e E2E relevantes passam;
- divergências com o protótipo são explicadas;
- cenários inválidos geram mensagens compreensíveis;
- performance dentro do limite definido para o MVP;
- rollback não afeta projetos residenciais;
- documentação operacional está atualizada.

## 14. Riscos técnicos

| Risco | Impacto | Mitigação |
|---|---|---|
| Backend Apps Script incompleto | Portar regra errada | Recuperar funções e criar fixtures antes do motor |
| Curva parcial anualizada incorretamente | Economia e NPV incorretos | `profileBasis` e anualização explícitos |
| Mistura de kW/kWh/Wh/kVA | Resultados tecnicamente inválidos | Tipos, normalização e testes de unidade |
| Fórmulas escondidas no frontend | Divergência e baixa confiança | Cálculo financeiro exclusivamente server-side |
| Resultado dentro de `Solution` residencial | Acoplamento e dados artificiais | Resultado C&I próprio |
| Curvas grandes em JSONB | Payload e performance | Limite no MVP e Storage/tabela na evolução |
| Alteração do motor muda estudos antigos | Problema de auditoria | Snapshot append-only e `engineVersion` |
| Tarifa Brasileira tem regras específicas | Erro regulatório/comercial | Validar fórmulas e registrar premissas |
| Biblioteca de gráficos adicionada cedo | Bundle e manutenção | SVG ou decisão explícita após protótipo |
| Regras híbridas ambíguas | Recomendações inconsistentes | Ordem de despacho documentada e fixtures |
| Extração do `ProjectWorkspaceShell` de um arquivo de ~2000 linhas com ~840 linhas de teste | Regressão no fluxo residencial em produção | Refactor isolado em commit próprio, sem mudança de comportamento; suíte residencial passando sem alteração de asserts antes/depois (ver Fase 6) |
| Grade de cenários persistindo `dispatch[]` completo por candidato | Snapshot desproporcionalmente grande | Só o cenário selecionado carrega `dispatch[]`/`cashFlow[]`; candidatos ficam só com agregados (ver seção 4.5) |
| Seleção manual de candidato sem traço detalhado | Relatório incompleto ou resultado recalculado com regra diferente | Materializar o cenário com a mesma `engineVersion` ou informar necessidade de novo cálculo (ver seção 4.5) |

## 15. Simplificações recomendadas

Para manter o primeiro release sustentável:

- usar um único produto BESS selecionado do catálogo administrado;
- limitar o MVP a dados horários;
- começar com uma curva de dia típico ou período representativo;
- não incluir PV nem gerador no dispatch inicial;
- não permitir exportação para a rede;
- usar uma eficiência agregada com transformação documentada;
- deixar degradação detalhada para versão posterior;
- calcular uma configuração por cenário, sem múltiplos BESS;
- usar gráficos essenciais, não um dashboard completo;
- manter cálculo síncrono enquanto o limite de pontos permitir;
- armazenar a curva no JSONB apenas com limite explícito;
- criar histórico somente de execuções/snapshots relevantes.

## 16. MVP recomendado

O conjunto mínimo para disponibilizar o módulo é:

1. seleção de projeto C&I;
2. consulta e seleção de produto BESS ativo do catálogo administrado;
3. exibição de especificações e documentos do produto;
4. quantidade fixa e faixa automática de módulos inteiros;
5. importação CSV e edição de curva horária;
6. tarifa manual com ponta/fora ponta e demanda contratada;
7. Peak Shaving, Load Shifting e Híbrido;
8. simulação com SOC, potência, energia e dispatch;
9. CAPEX, economia de energia, economia de demanda, payback, ROI e NPV;
10. comparação por quantidade de módulos;
11. ranking por um critério selecionável;
12. seleção manual de cenário;
13. integração com projetos, autosave e RLS;
14. snapshot com versão do motor e especificações do produto utilizadas;
15. resumo, memorial e PDF;
16. testes numéricos, fixtures de compatibilidade e testes de autorização do
    catálogo.

Ficam para versões posteriores: combinação automática de múltiplos produtos,
templates de soluções completas, solar, gerador, curvas anuais de alta
resolução, degradação detalhada, otimização avançada, calendário regulatório
completo e análises preditivas.

## 17. Pendências resolvidas em 2026-08-30

Todas as pendências que bloqueavam o início da Fase 1 foram fechadas:

| Pendência | Decisão |
|---|---|
| Regras tarifárias oficiais | Aceitas como estão na seção 4.4 para o MVP |
| Onde mora markup/custo do BESS | Segue o padrão de `user_stock_items`: `ci_bess_products` só guarda especificação técnica; preço/markup é do perfil comercial de cada usuário (seção 4.3/6.1) |
| Definição de payback | Os dois — simples e descontado (seção 11) |
| Definição de ROI | Anual = economia anual / CAPEX (seção 11) |
| Taxa de desconto / horizonte | Defaults de formulário: 12% a.a. / 10 anos, editáveis por projeto (seção 11) |
| Anualização de curva parcial | Semana representativa, até 672 pontos (15 min × 7 dias) — seção 4.2/5.4 |
| Exportação para a rede | Não, no MVP (já decidido na seção 5.2, apenas ratificado) |
| Limite máximo de pontos por curva | 672 pontos (seção 4.2) |
| Tipo de PDF | Estudo técnico de viabilidade, não cotação comercial (seção 9) |
| Reabertura de estudo antigo | Sempre mostra o snapshot congelado; recalcular cria uma nova execução, nunca sobrescreve (seção 6.2) |
| Arquivos Apps Script ausentes | Não recuperados — Plano B ativado: as fórmulas das seções 5/11 deste documento são a fonte de verdade (seção 13, Fase 0) |
| Produtos C&I a cadastrar no MVP | Cadastro manual pela tela de admin (`CiBessProductsEditor.tsx`, seção 10) quando estiver pronta — não é seed de migration; não bloqueia a Fase 1 (domínio/tipos), só bloqueia a Fase 7 (nenhuma simulação roda sem produto ativo) |

A Fase 0 está formalmente encerrada (Plano B ativado). A implementação segue
para a Fase 1 sem nenhuma regra tarifária ou financeira pendente de congelar.
