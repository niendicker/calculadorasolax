# Decisão: STS no backup C&I

Data: 2026-11-06. Fonte: SolaX NEXUS ZERO Datasheet-En-V1.1,
2025-12-26, referência 650.00114.00, páginas 1 e 2. Arquivo recebido em
`.local/SolaX NEXUS ZERO Datasheet-En-V1.1 20251226 (1).pdf`.

## Critérios acordados

- Não assumir sobrecarga, nem da STS nem do PCS/BESS. O pico informado deve
  caber na capacidade nominal contínua; não há multiplicador transitório.
- O máximo de PCS por STS é configurável em regras de compatibilidade aprovadas,
  por tensão entre fases e frequência. A mesma associação pode ter regras distintas
  em 380/400 V e 50/60 Hz; não transportar uma aprovação de uma rede para outra.
  Não inferir quantidades pelo nome ZERO-125/250/500/750/1250. No modular, o
  limite efetivo também respeita o paralelismo do PCS e a composição PCS+bateria.
- Uma STS por barramento; não somar gabinetes em paralelo. O vínculo pode apontar
  para um PCS modular ou um BESS integrado; nesse último caso o limite é a
  quantidade de unidades integradas, conforme aprovação específica do administrador.
- Declarar o barramento: instalação completa ou somente backup. Na instalação,
  verificar também o fluxo líquido simulado; no barramento dedicado, a curva geral
  não deve incluir cargas externas na seleção da STS. Exigir a máxima passagem
  positiva declarada desse barramento, incluindo BESS e FV efetivamente conectados.
  Confrontar também o limite conservador das cargas nominais acrescidas do
  carregamento conhecido do BESS, ou de sua descarga, o que for maior. Não
  compensar corrente por FV/gerador cuja localização no barramento é desconhecida.
- Usar a corrente nominal, não a corrente do disjuntor. Primeira implementação:
  rede trifásica com neutro e PE, 380 ou 400 V entre fases, 50 ou 60 Hz.
- Fator de potência de projeto explícito (menor esperado no barramento), tensão,
  frequência e máxima potência de passagem prevista devem ser informados. Não
  presumir FP=1. Converter kW para A por P×1000/(√3×V×FP).
- No detalhamento de cargas, a soma nominal simultânea não é reduzida pelo fator
  de utilização energética. Comparar também o pico informado e aplicar a margem
  uma única vez. Para passagem pela rede, usar o maior valor entre a declaração
  de projeto e, quando o barramento abrange a instalação, o módulo do fluxo líquido simulado (cargas+carga BESS−descarga
  BESS−FV−gerador), com margem. A curva amostrada não comprova extremos instantâneos;
  a declaração de passagem deve cobrir os extremos de importação e exportação.
- Seleção automática escolhe a menor corrente nominal elegível; manual recebe
  as mesmas validações. Capacidade, aprovação e quantidade são verificações
  independentes. Preço não torna uma STS tecnicamente elegível.
- Ausência de modelo compatível invalida o cenário. Preço ausente da STS escolhida
  impede o estudo; preço zero explicitamente cadastrado é permitido.
- Preço vem do Portfólio do usuário, quantidade um, incluído no CAPEX, fluxo de
  caixa, resultado e memorial. Snapshot conserva ficha, vínculo, revisão e preço.
  O mesmo acessório não pode ser cobrado como controlador e como STS.
- O Nexus declara EMS 1000 PRO integrado. Não presumir que substitui todo
  controlador: o cadastro define o controlador obrigatório; duplicidade do mesmo
  item é bloqueada, e a compatibilidade deve documentar funções distintas.

## Limites e apresentação

0 ms é uma condição de ensaio: rede em circuito aberto e potência nominal total
PCS superior à potência total das cargas de backup. Não prometer transferência
sem interrupção nem certificar compatibilidade a partir deste datasheet.

Sem STS externa configurada, o resultado de backup cobre potência e energia do
BESS; transferência permanece não avaliada. Projetos legados conservam essa
condição. Desabilitar backup ignora seleção de STS e não acrescenta custo.

O cadastro compartilha o ID do acessório, mas fichas e compatibilidades são C&I.
Não cria registros em `approved_solutions` nem regras residenciais. Nenhum vínculo
real de fabricante será aprovado ou terá quantidade máxima inventada na migração.

As correntes do Nexus são cadastráveis com base na ficha (A @380 / @400 V):
ZERO-125 189,4/181,2; ZERO-250 378,8/362,3; ZERO-500 757,6/724,6;
ZERO-750 1136/1087; ZERO-1250 1893,9/1811,6. Não usar o disjuntor como limite.
Curto-circuito, coordenação de proteção, desequilíbrio, aterramento e integração
EMS/PCS precisam de verificação de projeto; este seletor não os certifica.

## Entrega e verificação

Migração aditiva, a aplicar antes de disponibilizar o cadastro. Testes devem
cobrir limites nominais, falta de FP/preço, revogação/inatividade, limite PCS,
seleção por cenário, sobrecarga recusada, custo e snapshot, UI e regressão legada.
As evidências efetivamente executadas serão registradas ao concluir a implementação.

## Uso e evidências da implementação

- `ci_sts_specs` referencia o catálogo de acessórios; `ci_sts_compatibility_rules`
  referencia um PCS ou um BESS integrado. A aprovação exige fonte, revisão,
  comunicação/EMS e firmware. Tensão, frequência e máximo de PCS são explícitos.
- Cadastro em Administração → BESS C&I → STS / Transferência; seleção na etapa
  Backup. Resultados e memorial mostram a STS e seu custo. `stsContext` no
  resultado/input snapshot preserva o catálogo e preços usados no estudo.
- Limites de backup sem sobrecarga e ranking sem candidatos tecnicamente
  inválidos são identificados por `ci-v3` / `ci-modular-v2`. O servidor não aceita
  respostas antigas da Edge Function como se fossem dessa nova versão.
- `bash scripts/check-ci-sts-migration.sh`: PostgreSQL 16 descartável, sem portas
  publicadas e sem rede externa, com esquema-base e `is_admin` de teste. Migrações
  0097/0098 e comportamento de RLS/aprovação/limite PCS exercitados. Não substitui
  a validação de migrações no ambiente de implantação.
- Chromium em 1366×768, 1440×900, 1920×1080 e 390×844: formulários de cadastro e
  backup, limites de PCS, seleção/custo e troca de barramento verificados sem
  overflow ou erros de página. Harness usa componentes/CSS e motor reais,
  catálogo/autenticação simulados e gráficos históricos omitidos. Evidências em
  `/tmp/ci-sts-preview`; não equivale a um teste autenticado no ambiente remoto.
- Deno: verificação de tipos e nove testes do handler C&I passaram. PDF real com
  ficha/regra/custo STS foi gerado em teste. Lint do código-fonte passou, com sete
  avisos existentes; relatórios gerados por Playwright foram excluídos da análise.
  TypeScript e build de produção com Webpack passaram; o Turbopack deste ambiente
  não permite a abertura de porta usada pelo processamento de CSS.

A migração não foi aplicada pelo agente durante a implementação. Após o usuário
informar sua aplicação, a conferência somente leitura em 2026-11-06 confirmou
0098 no histórico local/remoto e nenhuma migração pendente no banco configurado
pelo túnel self-hosted. Isso confirma o histórico de migrações, não uma nova
execução dos testes de integração no ambiente remoto. Não foram
certificadas combinações de fabricante, coordenação de proteção ou transferência
sem interrupção. A revisão elétrica do seletor foi verificada por testes dos
limites nominais; a integração física/EMS permanece dependente da documentação
que fundamenta cada aprovação administrativa. Revisão visual verificada no
harness descrito acima; ERC e ensaios de hardware não se aplicam a esta entrega.

Validação final desta entrega: 146 arquivos / 2.661 testes passaram com
`npm run test:coverage -- --maxWorkers=2 --testTimeout=15000`. Cobertura:
88,00% instruções, 81,48% branches, 87,85% funções e 90,21% linhas, acima dos
limites existentes. A concorrência foi reduzida após uma rodada sob carga
exceder a espera de um teste residencial; os 56 testes desse arquivo também
passaram isoladamente. Nenhuma asserção residencial foi alterada nesta entrega.
Build verificado com `npm run build -- --webpack`; Deno e validação de migração
conforme os comandos acima. Não houve aplicação de migração ou publicação remota.

## Revisão pré-merge da PR 14

A revisão de `ee9e4a3c..1c46ab33` reproduziu uma condição de corrida no seletor:
se a busca da composição PCS falhava antes da resposta STS, a resposta posterior
apagava o erro e mostrava ausência de compatibilidades, sem botão para repetir.
As consultas agora publicam catálogo e PCS juntos e vinculam o estado ao alvo
atual; trocar equipamento ou repetir a consulta não reutiliza a lista anterior.
O teste de regressão falhou no código anterior e passou após a correção, cobrindo
também a nova tentativa. Os dez testes dos painéis STS/Backup, lint dos arquivos
alterados e TypeScript passaram após esse ajuste. O CI valida novamente o commit
final antes do merge. Nenhuma mudança adicional na migração foi necessária.
