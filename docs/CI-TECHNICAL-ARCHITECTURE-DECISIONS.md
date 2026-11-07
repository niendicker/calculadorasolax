# Decisões de arquitetura e fluxo C&I

Decisões consolidadas com o usuário em 06/11/2026. Este documento define a
direção acordada; os estados abaixo distinguem decisão de implementação.

## 1. Atendimento técnico antes do financeiro

Curva de consumo, geração habilitada e estratégia determinam os requisitos de
potência de carga/descarga, energia e reserva de backup. O usuário define objetivos;
o motor deriva as necessidades e confirma o atendimento simulando a solução no
mesmo eixo de tempo. Potência e energia precisam ser verificadas em conjunto,
incluindo oportunidades de recarga, SOC, perdas e limites CC/CA.

Ausência de payback ou VPL negativo não elimina uma solução técnica. Preços
ausentes são pendências financeiras, nunca aprovação financeira com preço zero.
O resultado diferencia solução técnica, recomendação econômica e referência que
não atende aos requisitos. Partida de cargas não é inferida de amostras médias.

## 2. Gerar soluções no cadastro e consultar no projeto

Adotar o conceito do residencial: gerar e persistir combinações tecnicamente
válidas a partir das fichas e compatibilidades documentadas. O projeto consulta
essas soluções por requisitos e aplicações, depois confirma o atendimento com
sua curva e estratégia. Não regenerar o catálogo em cada cálculo de projeto.

As combinações têm identidade estável, revisão, composição, limites resultantes
e referências de aprovação. Mudanças nas fichas ou revogações invalidam as
combinações afetadas para novos estudos, sem alterar resultados históricos.
Publicação de uma geração deve ser consistente: uma consulta não pode misturar
parte de uma geração antiga com parte de uma nova. Consulta paginada, sem
truncamento silencioso de alternativas.

Estado: implementado em `ci-generated-solutions-repository.ts` e na migration
0102. A geração administrativa persiste o catálogo; projetos consultam a geração
atual e simulam os candidatos com `ci-persisted-calculation-repository.ts`.

## 3. Um modelo de solução para gabinetes e PCS + baterias

Gabinetes e conjuntos montados usam o mesmo contrato de capacidades e limites
no motor: carga/descarga CA, tensão/corrente/potência CC, capacidade, SOC,
eficiências, paralelismo e aplicações documentadas. A diferença fica na geração
da solução e em sua composição comercial, não em dois motores de simulação.

Representar agrupamentos com topologia, componentes, quantidades, limites e
regras de expansão. Um gabinete é uma unidade comercial com agrupamento interno
fixo; uma montagem é um agrupamento gerado das associações permitidas. Não
inventar limites internos desconhecidos nem inferir compatibilidade por nome.

Estado: implementado com o contrato `ci-grouped-v1`. Configurações antigas
continuam legíveis e são traduzidas em filtros sobre o mesmo catálogo.

## 4. Curvas e aplicações na mesma página

Concentrar consumo, geração FV, backup e gerador na página **Curvas e aplicações**,
usando o mesmo período, resolução e contexto do projeto. Reutilizar a edição e a
importação existentes; a curva de geração permanece distinta da de consumo.

O gráfico e os resumos ficam visíveis. Ações próximas ao gráfico abrem ajustes
de **FV**, **Gerador** e **Backup** em modais, reutilizando os formulários atuais.
Não empilhar todos os formulários permanentemente nem criar novos gestos de
seleção. Remover FV e Falta de rede como etapas separadas da navegação; atalhos
da visão geral e dos resultados direcionam à página unificada e ao modal correto.
Importação de consumo e FV permanece centralizada na página de curvas; o modal
FV contém ajustes e não uma segunda importação capaz de substituir o consumo
fora do editor principal.

Manter todos os parâmetros de gerador, inclusive suporte de ponta sem backup.
Preservar a autorização `ci_backup` para habilitar/alterar backup e gerador,
conforme os limites de acesso atuais. O servidor continua validando permissões.
Abrir ou fechar um modal não pode habilitar uma aplicação nem apagar ajustes.
O botão Salvar aplica o rascunho; Cancelar/Escape preservam o estado anterior.

Estado: implementado na branch local. A navegação mantém Visão geral,
Configuração BESS, Curvas e aplicações, Tarifa, Estratégia e Resultados. Os
atalhos anteriores de FV e backup abrem a página unificada e o respectivo modal.

## 5. Backup a partir da seleção de intervalos existente

Reutilizar as seleções A/B do gráfico de consumo. Cada período selecionado
oferece **Usar para backup**, com prévia antes da aplicação:

- **Perfil selecionado** (padrão): energia integrada e pico do trecho.
- **Potência média**: energia da média durante o intervalo, preservando o pico
  conhecido como requisito de potência.
- **Potência máxima**: carga constante no máximo do trecho durante o intervalo.
- **Potência manual**: patamar informado pelo usuário durante o intervalo;
  representa declaração explícita da carga protegida.

Mostrar intervalo, duração, potência contínua, pico conhecido e energia exigida.
O fim inclui a duração da última amostra, não apenas seu instante inicial.
Salvar limites temporais e método, e recalcular contra a curva atual, evitando
uma cópia estática que fique obsoleta ao editar ou importar dados.

Seleção sem cobertura completa, com lacunas, timestamps inválidos ou consumo
inválido deve ser sinalizada e impedir cálculo silencioso com dados parciais.
Curva FV não define carga de backup: a ação só aparece no consumo. O gráfico
não identifica quais circuitos serão desligados; o método manual declara essa
redução. Margem, potência total na partida, reserva e STS ficam no modal. O pico informado é um requisito total (máximo entre esse valor e o pico observado), não uma parcela a somar.

Projetos antigos com potência/autonomia diretas ou lista de cargas continuam
legíveis e editáveis no modal. A nova seleção não apaga gerador ou transferência.

Estado: implementado na branch local. O método Perfil selecionado calcula a
autonomia amostra a amostra e não extrapola além do intervalo observado. Média,
máximo e manual usam seus patamares constantes. Converter a seleção em valores
diretos preserva potência, duração e pico conhecido. O gráfico de geração não
oferece ações para definir a carga de backup.

## Implementação e verificação

### Geração persistida e contrato agrupado — implementação local

- Um snapshot consistente das fontes aprovadas identifica a revisão do catálogo.
  A geração é preparada em lotes privados e somente publicada quando completa,
  com a mesma revisão de origem. Troca atômica da geração atual; histórico não
  é apagado. Alterações de catálogo invalidam a geração para novas consultas.
- O contrato `ci-grouped-v1` descreve componentes e quantidades, barramentos CC,
  limites de corrente/tensão/potência por barramento, limites CA agregados,
  armazenamento/SOC/eficiências, aplicações e referência documental. Gabinete
  e montagem diferem apenas na construção desse contrato.
- Gabinetes precisam de limites CC e de carga CA documentados. Integração com
  FV, gerador e backup deve ser explicitamente declarada; capacidades ausentes
  não são presumidas. O diagnóstico informa quais fichas impedem a geração.
- Projeto consulta a geração publicada com paginação estável. Os filtros usam
  requisitos derivados da curva/estratégia e das aplicações; depois o mesmo
  simulador confirma atendimento para todos os agrupamentos. Nenhum cálculo
  de projeto regenera o catálogo ou aceita um resultado parcial de paginação.
- A necessidade de energia considera janelas sem oportunidade de recarga e a
  reserva de backup. A pré-seleção usa limites inferiores seguros; perdas e
  recarga efetiva são verificadas na simulação. Load shifting verifica a
  cobertura da carga na ponta; híbrido combina essa meta com o alvo de demanda.
- Resultados guardam geração, revisão e contrato selecionado. Preços seguem
  próprios do usuário e não integram o catálogo gerado. Configurações antigas
  específicas são traduzidas em filtros da mesma consulta, sem um segundo
  caminho físico de cálculo.

1. Documentar estas decisões antes de implementar a página unificada.
2. Integrar seleção de intervalos e métodos ao contrato e cálculo de backup.
3. Mover ajustes FV/gerador/backup para modais na página de curvas e ajustar
   navegação, atalhos, permissões, cancelamento, teclado e foco.
4. Verificar integração, sincronização ao editar a curva, métodos de energia,
   lacunas, compatibilidade com projetos antigos e quatro larguras de tela.
5. Substituir a enumeração transitória por geração persistida e consolidar o
   contrato único dos itens 2 e 3 — implementado nesta etapa.

A ativação da geração persistida exige a migration e a publicação administrativa
abaixo, independentemente da integração das curvas já disponível.

Verificação da integração: testes de métodos, energia e autonomia, atualização
da curva, lacunas e duplicatas; teste do gesto Shift + arraste com aplicação ao
backup; autorização de gerador sem backup; cancelamento, Escape, contenção e
restauração de foco no modal. Prévia isolada com dados sintéticos revisada em
390×844, 1366×768, 1440×900 e 1920×1080, incluindo modais e seleção real no
gráfico. Essa prévia não substitui teste autenticado em produção.


### Ativação da geração persistida

1. Aplicar a migration 0102 após a 0101, antes de publicar a aplicação nova.
   As alterações são aditivas; o histórico de estudos não é reescrito.
2. Em Administração → BESS C&I, completar as fichas de gabinete com carga CA,
   limites CC, eficiências direcionais do conversor e referência; revisar as aprovações de backup, FV e gerador.
   Campos desconhecidos continuam vazios. Não há aprovação automática por nome.
3. Em Catálogo modular → Soluções geradas, acionar **Gerar soluções**. Revisar
   os diagnósticos das fichas excluídas e confirmar a contagem publicada.
4. Consultar e calcular um projeto automático e um projeto com solução fixada.
   Verificar potência/energia, aplicações, composição e preços próprios.
5. Editar uma ficha: novos cálculos devem exigir nova geração. Os resultados
   salvos continuam disponíveis com seu contrato e geração de origem.

Uma falha em qualquer lote ou mudança nas fontes impede a publicação. O limite
de geração é explícito (20.000); excedê-lo causa erro, sem publicar truncamentos.
Repetir a geração após corrigir as fichas é o caminho de recuperação. O retorno
à versão anterior da aplicação pode manter as tabelas e colunas aditivas, sem
apagar gerações ou resultados históricos. A migration não foi aplicada em
produção por esta implementação.

O gabinete separa a eficiência de conversão CA/CC da eficiência total de ciclo.
A geração exige os dois sentidos do conversor documentados; não infere esses
limites a partir da eficiência total. As perdas residuais de armazenamento do
ciclo são distribuídas simetricamente, como nas montagens, e as eficiências
resultantes são guardadas no contrato. Dados inconsistentes impedem a geração
da ficha, com diagnóstico.

### Evidências locais desta etapa

- `npm run test:coverage -- --maxWorkers=4 --testTimeout=15000`: 2.729 testes
  em 157 arquivos; cobertura 86,65% de statements, 80,50% de branches, 86,18%
  de funções e 89,63% de linhas.
- `npm run typecheck`, lint e build com `npm run build -- --webpack` passaram.
  O build padrão com Turbopack foi bloqueado pela restrição de abertura de porta
  deste ambiente; não foi tratado como falha de compilação do código.
- `bash scripts/check-ci-catalog-migration.sh`: PostgreSQL descartável verificou
  publicação completa, RLS, bloqueio de escrita direta, invalidação, revisão
  obsoleta, preservação histórica e rejeição de contrato sem versão.
- Consulta de 1.001 soluções paginadas, publicação em múltiplos lotes, rejeição
  de mudança de geração, cobertura parcial da ponta, preços pendentes e limites
  direcionais do conversor têm regressão automatizada.
- Prévia isolada com dados sintéticos: seleção fixa, geração administrativa e
  ausência de overflow em 390×844, 1366×768, 1440×900 e 1920×1080. Não substitui
  o teste autenticado após aplicar a migration no ambiente de destino.

### Revisão antes do merge

A reserva híbrida com metas por intervalo usa a carga residual após o FV, com
a mesma curva de geração usada no despacho. Assim, o consumo bruto futuro não
retém energia desnecessária e não impede um atendimento viável antes da ponta.
Os mínimos de potência e energia também descontam o apoio que a política do
gerador efetivamente permite: somente na ponta, nos modos habilitados e sem
atribuir ao gerador redução de importação abaixo da demanda contratada.
Regressões exercitam os dois casos pelo motor completo, além de verificar que
gerador exclusivo de falta de rede ou fora da ponta não reduz os requisitos.
