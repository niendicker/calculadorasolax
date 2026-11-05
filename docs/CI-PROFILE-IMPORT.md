# C&I — importação de consumo e geração

A importação está disponível nas etapas **Curva de carga** e **Solar FV**. Um CSV pode conter consumo, geração ou ambas as séries. Quando as duas são selecionadas, uma única ação **Importar dados** preenche a curva de carga e habilita Solar FV com a geração importada.

## Limites e formato

- Período máximo: 7 × 24 horas, contando a duração do último intervalo. O arquivo não é truncado.
- Intervalos aceitos: 15, 30 e 60 minutos. Medições menores que 15 minutos, duplicadas ou com lacunas são rejeitadas.
- Limites correspondentes: 672, 336 ou 168 amostras por série.
- Separadores: vírgula, ponto e vírgula ou tabulação; campos entre aspas e BOM UTF-8 são aceitos.
- Datas: ISO com offset, ISO local ou `DD/MM/AAAA HH:mm`, inclusive ano com dois dígitos. Datas locais usam o fuso escolhido na importação.
- Unidades: kW, W, MW, kWh, Wh e MWh. Energia por intervalo é convertida em potência média; 25 kWh em 15 minutos equivalem a 100 kW.
- O usuário confirma as colunas, as unidades, o intervalo, o fuso e se o timestamp representa o início ou o fim do intervalo. Horários de fim são deslocados para o início antes de armazenar.

Exemplo:

```csv
timestamp,consumptionKw,generationKw
2026-01-01T12:00:00-03:00,100,50
2026-01-01T12:15:00-03:00,110,60
2026-01-01T12:30:00-03:00,105,55
```

O consumo deve representar a carga total da instalação; a geração deve representar a produção FV disponível em AC antes do BESS. A geração não é previamente subtraída do consumo: essa composição é feita pelo motor de despacho.

O importador reconhece cabeçalhos comuns e permite mapear nomes diferentes. Para dados do PVsyst, `E_User` e `E_Avail`/`EOutInv` são candidatos reconhecidos. `E_Grid` não é automaticamente tratado como geração total, pois pode representar somente o excedente injetado. Cabeçalhos de metadados e uma linha de unidades podem preceder as medições. Totais mensais/anuais não pertencem à série temporal e devem ser excluídos da exportação.

## Comportamento do projeto

- As séries permanecem separadas, com timestamps e unidades normalizadas em kW.
- Importar uma única série preserva a outra. Quando ambas estiverem ativas, a geração precisa cobrir todos os horários do consumo com a mesma resolução.
- Uma importação inválida não altera as configurações existentes.
- O Solar FV importado usa os valores do arquivo diretamente, sem inferir capacidade DC instalada ou reescalar a geração por kWp. A ação **Usar geração estimada** permite retornar ao modelo anterior.
- Os limites e a compatibilidade temporal também são verificados no servidor. Resultados de uma Edge Function antiga são conferidos contra a série importada; quando divergirem, o motor local atualizado calcula os resultados.
- O memorial identifica a origem importada, o período, a resolução, a quantidade de amostras e a energia FV.

A importação de períodos parciais não altera a premissa econômica semanal existente do módulo. Para estudos anuais sob essa premissa, utilize uma semana completa e representativa.

## Editor diário

O editor C&I dispõe de 96 pontos por dia, de 00:00 a 23:45, com perfis independentes para dias úteis e fins de semana. O valor de cada quarto de hora é editável pelo ponto, teclado ou campo numérico. Modelos e projetos antigos com 24 âncoras continuam compatíveis, preservando sua interpolação ao migrar para 96 pontos.

- Arrastar um ponto altera a potência. A suavização é padrão: apenas o ponto e seus
  dois vizinhos imediatos (15 minutos antes/depois) podem mudar, com efeito
  reduzido nos vizinhos e preservação dos demais pontos.
- Arrastar o fundo navega pelo gráfico ampliado sem alterar o perfil.
- A roda do mouse e os botões ampliam/reduzem o período visível.
- **Ver dia inteiro** ou duplo clique restaura o período completo.
- Limpar/desfazer preserva os 96 valores. Salvar um modelo e reabrir o projeto preserva os pontos de 15 minutos.

Com Solar FV habilitado, o editor também exibe a geração no mesmo eixo de potência.
Selecione Consumo ou Geração FV pela legenda ou pelos pontos: a outra série fica
com opacidade reduzida. A seleção FV permite arrastar os pontos com suavização local, editar numericamente e
limpar/desfazer a geração, com padrões independentes para dias úteis e finais de
semana. A edição cria um perfil FV personalizado salvo no projeto e usado no
cálculo, preservando o consumo. A prévia semanal sobrepõe consumo e geração e
atualiza durante a edição. Selecionar um período na prévia mostra também pico,
mínima, média e energia FV; comparar dois períodos inclui as diferenças FV em
valor absoluto e percentual. Intervalos sem cobertura FV completa são indicados
como indisponíveis, sem serem tratados como geração zero. Quando a resolução semanal é 30/60 minutos, a
potência FV é a média dos quartos de hora correspondentes. Zoom e navegação são comuns
às duas séries. A geração estimada usa o mesmo modelo do motor de cálculo.
Para geração importada, o perfil é a média por quarto de hora dos dias úteis ou
finais de semana no fuso selecionado; intervalos de 30/60 minutos mantêm sua
potência média em cada quarto de hora. Horários sem dados permanecem sem pontos,
e ausência de dados para um tipo de dia é indicada explicitamente.

## Verificação

474 testes passaram, abrangendo importação, conversão de unidades, limites, alinhamento, uso da geração no despacho, compatibilidade com serviço remoto antigo, persistência e regressões do workspace. `npm run typecheck` passou.

O fluxo real dos componentes foi exercitado no Chromium em 1366 × 768, 1440 × 900, 1920 × 1080 e 390 × 844: arraste de ponto, edição de 10:15, zoom, navegação pelo fundo, desfazer, importação conjunta e rejeição de arquivos fora dos limites. Catálogo e gravação foram simulados no harness; não foi feita escrita em banco ou publicação. Scripts e capturas estão em `/tmp/ci-ui-review`.

Os testes usam CSVs sintéticos com layouts representativos. A compatibilidade com cada versão e idioma dos exportadores deve ser conferida com arquivos reais, usando o mapeamento de colunas e unidades.
