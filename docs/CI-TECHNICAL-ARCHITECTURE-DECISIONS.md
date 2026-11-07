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

Estado: a busca automática local em `ci-automatic-calculation-repository.ts`
ainda enumera em memória. Essa implementação é transitória e não representa a
persistência de soluções geradas aqui definida.

## 3. Um modelo de solução para gabinetes e PCS + baterias

Gabinetes e conjuntos montados usam o mesmo contrato de capacidades e limites
no motor: carga/descarga CA, tensão/corrente/potência CC, capacidade, SOC,
eficiências, paralelismo e aplicações documentadas. A diferença fica na geração
da solução e em sua composição comercial, não em dois motores de simulação.

Representar agrupamentos com topologia, componentes, quantidades, limites e
regras de expansão. Um gabinete é uma unidade comercial com agrupamento interno
fixo; uma montagem é um agrupamento gerado das associações permitidas. Não
inventar limites internos desconhecidos nem inferir compatibilidade por nome.

Estado: a unificação do contrato e a geração persistida são trabalhos de
arquitetura pendentes; os adaptadores integrado/modular existentes ainda existem.

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

1. Documentar estas decisões antes de implementar a página unificada.
2. Integrar seleção de intervalos e métodos ao contrato e cálculo de backup.
3. Mover ajustes FV/gerador/backup para modais na página de curvas e ajustar
   navegação, atalhos, permissões, cancelamento, teclado e foco.
4. Verificar integração, sincronização ao editar a curva, métodos de energia,
   lacunas, compatibilidade com projetos antigos e quatro larguras de tela.
5. Em seguida, substituir a enumeração transitória por geração persistida e
   consolidar o contrato único de soluções agrupadas dos itens 2 e 3.

Não confundir conclusão da integração de curvas com conclusão dos itens 2 e 3.

Verificação da integração: testes de métodos, energia e autonomia, atualização
da curva, lacunas e duplicatas; teste do gesto Shift + arraste com aplicação ao
backup; autorização de gerador sem backup; cancelamento, Escape, contenção e
restauração de foco no modal. Prévia isolada com dados sintéticos revisada em
390×844, 1366×768, 1440×900 e 1920×1080, incluindo modais e seleção real no
gráfico. Essa prévia não substitui teste autenticado em produção.
