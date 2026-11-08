# Portas de bateria independentes no C&I

Decisão: a ligação de baterias é definida pelas portas CC do PCS. Cada porta
tem sua janela de tensão, correntes e potências admissíveis; bancos ligados a
portas diferentes não são strings em paralelo no mesmo barramento.

- Preservar a potência CA total do PCS. Duas portas não transformam um PCS de
  60 kW em 120 kW.
- Separar portas utilizadas por PCS, módulos em série por string e strings em
  paralelo por porta. Paralelo dentro de uma porta exige aprovação explícita;
  duas portas não significam duas strings em paralelo numa única porta.
- Conferir tensão e associação de módulos em cada porta. Não comparar todos
  os módulos das várias portas com o antigo campo genérico de quantidade de
  baterias do inversor. O limite da bateria continua valendo para cada banco.
- Limitar a potência CC de cada porta pelo banco, pela corrente na tensão
  mínima e pelo limite de potência documentado, quando informado. Somar as
  contribuições somente após essa limitação e aplicar o teto CA total do PCS.
- Derivar energia, quantidades e composição comercial somando os bancos de
  todas as portas e de todos os PCS. Acessórios por string contam strings
  reais; acessórios por PCS continuam contando equipamentos.
- Guardar a topologia e os limites por porta no contrato gerado. Gabinetes
  continuam sendo módulos com envelope CC/CA documentado; a consulta e o
  simulador recebem um contrato físico comum.
- Preservar resultados e gerações históricos. Uma geração do modelo anterior
  não pode ser usada silenciosamente pelo novo motor; exigir nova geração.

## Migração dos cadastros

Os campos antigos de strings por PCS não distinguiam portas e paralelo
elétrico. Migrar essa quantidade para portas utilizadas somente quando couber
na quantidade física de portas cadastrada; o paralelo por porta passa a uma
string. Casos ambíguos ficam em rascunho para revisão administrativa, sem
ampliar aprovação automaticamente. Todas as compatibilidades aprovadas antigas
voltam a rascunho; as faixas originais ficam preservadas para conferência. Explicitar que as correntes C&I se aplicam
a cada porta e que as potências CA continuam totais do equipamento.

O cadastro descreve portas com o mesmo perfil elétrico por modelo, mas cada
porta pode receber um banco diferente de módulos. A geração enumera os bancos
permitidos por porta e remove somente permutações equivalentes entre portas
com o mesmo perfil. O contrato guarda limites e energia de cada banco. O
simulador mantém SOC e fluxos independentes, respeitando também o teto CA de
cada PCS, sem emprestar capacidade ou energia de uma porta para outra.
O backup verifica o perfil crítico com esses mesmos bancos e deriva uma
reserva que cada banco deve preservar; energia total sozinha não comprova
atendimento. O modelo não usa uma otimização global antecipada do fluxo entre
portas: verifica o despacho por partilha ponderada e limites individuais.
Não inferir limites diferentes nem transformar um limite total em limite por
porta sem uma fonte correspondente no cadastro. A referência aprovada e os
limites físicos continuam sendo condições para gerar soluções.

## Verificação necessária

- HR140/AELIO sintético: 14 módulos em cada uma de duas portas não são um
  banco de 28 módulos; a tensão de cada string cabe na sua própria porta.
- Uma ou duas portas, quantidade acima das portas físicas, associação acima
  do limite por porta, janela de tensão e limite de corrente por porta.
- Potência limitada primeiro por porta e depois pelo teto CA do PCS.
- Quantidades, energia, preços e acessórios contados em todas as portas.
- Persistência, invalidação, histórico, migração, permissões e apresentação
  administrativa sem mudanças nos cálculos residenciais.

A migration 0103 adiciona correntes e limites adicionais de potência por porta,
separa as faixas de portas e strings por porta e invalida a geração atual.
Novas gerações usam `ci-grouped-v2`; versões v1 continuam legíveis no histórico,
mas não podem ser publicadas novamente nem usadas para novos cálculos.
Após aplicar a migration, revisar as fichas, reaprová-las e gerar novamente.

## Conferência com os valores cadastrados HR140/AELIO

Simulação isolada dos valores consultados no cadastro administrativo, sem
escrever no banco de produção. Com a faixa de 1–10 PCS e 1–2 portas, a nova
geração encontra 440 configurações: 44 arranjos por PCS, incluindo bancos
assimétricos e sem repetir a mera troca entre portas iguais.

| Bancos de um PCS | Módulos totais | Energia nominal | Descarga CA disponível |
| --- | ---: | ---: | ---: |
| Uma porta com 14 módulos | 14 | 200,2 kWh | 43,456 kW |
| Portas com 7 e 14 módulos | 21 | 300,3 kWh | 60 kW |
| Portas com 14 e 14 módulos | 28 | 400,4 kWh | 60 kW |

A potência usa a tensão mínima de cada banco, seu limite de corrente e a
eficiência do conversor; a soma continua limitada aos 60 kW CA do PCS.
As unidades PCS de cada solução repetem o arranjo escolhido; a assimetria
está entre as portas de cada unidade. O mínimo de agrupamentos para backup
é verificado pelos bancos, e não apenas pelo total nominal de energia.

## Evidências locais

- Suíte completa com cobertura: 2.744 testes em 158 arquivos; statements
  86,74%, branches 80,45%, funções 86,38% e linhas 89,71%.
- Regressão adicional do payload C&I verifica quatro portas sem alterar o
  limite residencial de duas; testes focados de cadastro e bancos passaram.
- Typecheck, lint (apenas avisos preexistentes), Deno e build com Webpack
  passaram. A Edge Function legada manteve seus nove testes aprovados.
- PostgreSQL descartável verificou migração, rascunhos, histórico, limites por
  porta, publicação v2, filtros de bancos assimétricos, RLS e suporte C&I a
  quatro portas, mantendo a restrição residencial original.
- Prévia isolada, com mocks de catálogo: seleção 7S+14S e campos administrativos
  revisados em 390×844, 1366×768, 1440×900 e 1920×1080, sem overflow horizontal.
  Não foi feito teste autenticado após migração em produção.

As alterações e a migration estão locais; o cadastro de produção não foi
alterado. Para ativar: migration 0103 após 0102, revisão dos perfis por porta,
reaprovação explícita das compatibilidades e nova geração administrativa.

## Salvamentos sem alterações no catálogo

Uma geração publicada pode continuar com suas soluções armazenadas e estar
indisponível para novos cálculos quando um cadastro é alterado. O estado
`is_current`, além da quantidade gerada, determina sua disponibilidade.

A migration `0104_ci_catalog_noop_invalidation.sql` corrige a invalidação ao
salvar a mesma ficha sem alterar seus dados: `updated_at` deixa de participar
da revisão da fonte e da comparação entre a linha antiga e a nova. Todos os
demais campos continuam invalidando a geração quando mudam; inserções e
exclusões também. O mesmo critério vale durante a publicação dos lotes.

Aplicar 0104 não reativa gerações já invalidadas, pois pode ter havido uma
alteração real. Após a migração, gerar as soluções novamente em Administração
→ C&I → Soluções geradas. Confirmar “Geração publicada e atual”, salvar uma
ficha sem mudanças e conferir que a geração segue disponível no projeto.
Alterar um limite de fato deve invalidá-la e exigir nova geração.

Regressão: `bash scripts/check-ci-catalog-migration.sh` verifica revisão
estável, publicação durante salvamento sem mudanças, leitura pelo usuário,
invalidação por mudanças reais, inserções/exclusões e preservação do histórico.
