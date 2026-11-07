# PCS + baterias no C&I

As decisões posteriores sobre geração persistida, agrupamentos e a página de
curvas estão em [Decisões de arquitetura e fluxo C&I](CI-TECHNICAL-ARCHITECTURE-DECISIONS.md).
A busca em memória descrita abaixo é uma implementação transitória.

O C&I permite escolher entre BESS integrado e uma composição modular. O caminho
integrado permanece disponível; projetos existentes não precisam ser convertidos.

## Busca técnica em todos os aprovados

Em Configuração BESS → **Busca automática**, informe potência mínima de descarga AC
e energia útil mínima (capacidade nominal descontada da faixa de SOC, antes das
perdas de conversão). Zero não acrescenta um mínimo naquele campo. As metas de
backup, partida, autonomia, transferência configurada e demanda continuam valendo.

A busca compara todos os BESS integrados ativos e todas as compatibilidades
modulares ativas, aprovadas e com fichas consistentes. Enumera PCS, série e strings
em paralelo dentro das faixas documentadas. Um resultado que não atinge o alvo de
demanda de Peak Shaving/Híbrido é tecnicamente inválido. Configurações manuais
permanecem disponíveis para fixar um produto ou uma combinação.

O resultado `ci-auto-v1` separa `technicalSelection` de `recommendation`: a primeira
identifica a solução técnica com menor potência e, no desempate, menor capacidade
nominal; a segunda contém a classificação financeira entre cenários tecnicamente
válidos e com preços completos. VPL negativo ou ausência de payback não elimina a
solução técnica. Sem atendimento técnico, nenhuma composição é apresentada como
solução, embora uma referência inválida permaneça disponível para diagnóstico.

Na busca automática, preço ausente é diferente de zero cadastrado. O candidato
recebe `pricingComplete: false` e `missingPrices`; os números financeiros internos
desse candidato não são indicadores utilizáveis. A interface oculta esses valores,
o ranking financeiro o exclui e o memorial financeiro fica indisponível para a
composição selecionada até completar os preços. A seleção manual continua exigindo
os preços antes do cálculo. O memorial de uma solução com preços completos exclui
as outras linhas que ainda têm preços pendentes.

A busca tem limite explícito de 4.096 candidatos no catálogo; não recomenda uma
amostra truncada quando as faixas ultrapassam esse limite. As composições recusadas
por inconsistência nas fichas são identificadas no diagnóstico. O limite de 256
combinações por estudo manual continua valendo.

Aplicar `0101_ci_integrated_parallel_limit.sql` antes desta versão. O cadastro de
BESS integrado passa a ter máximo de unidades em paralelo, de 1 a 256, com padrão
conservador de uma unidade nos registros existentes. Informe um valor maior somente
com respaldo documental. A busca e o cálculo manual respeitam esse máximo.

As regras modulares também são conferidas contra `max_battery_qty` do PCS,
`max_association_qty` da bateria e a soma dos limites de corrente por porta do PCS.
Como o modelo usa barramento DC agregado, essa conferência de corrente é uma
condição necessária e não valida a distribuição entre portas independentes.
Uma ficha conflitante impede o uso da regra até sua correção; os limites não são
ampliados silenciosamente pelo motor.

## Cadastro e uso

1. Em Administração → BESS C&I, cadastre as especificações adicionais nas abas
   Inversores / PCS e Baterias C&I. Use Cadastro de produtos para as fichas
   próprias C&I e Limites contínuos C&I para os dados adicionais. Os catálogos
   são independentes do residencial; veja [a decisão de catálogos e acessórios](CI-CATALOG-ACCESSORIES.md).
2. Na aba Compatibilidades, associe PCS e bateria, defina as faixas aprovadas de
   unidades em série, strings em paralelo por PCS e quantidade de PCS. Informe
   suporte a backup e controlador obrigatório, quando aplicável.
3. Para aprovar uma regra ativa, preencha documento, revisão, comunicação/BMS e
   versões de firmware. A aprovação é uma decisão do administrador baseada na
   documentação do fabricante; coincidência de tensão não aprova equipamentos.
4. Cadastre no Portfólio os preços do PCS, da bateria e do controlador exigido.
   Preço ausente impede o cálculo; preço zero explicitamente cadastrado é aceito.
5. No projeto C&I, selecione PCS + baterias e uma compatibilidade aprovada. Use
   quantidades fixas ou dimensione PCS, série e paralelo independentemente, dentro
   das faixas aprovadas. O limite é de 256 combinações por estudo.

## Modelo de cálculo

A topologia implementada usa um único modelo de PCS e um único modelo de bateria,
com bancos idênticos em cada PCS. Cada unidade comercial pode ser módulo, rack ou
gabinete. A quantidade total de baterias é `PCS × série × paralelo por PCS`.
Portas DC independentes e misturas de modelos não são representadas.

A janela completa do banco deve caber na janela DC do PCS:
`Vmin bateria × série >= Vmin PCS` e `Vmax bateria × série <= Vmax PCS`.
Potências contínuas de carga e descarga são calculadas separadamente. A potência
DC fica limitada tanto pela soma das potências das baterias quanto por
`Vmin banco × min(corrente PCS, corrente bateria × paralelo)`. A conversão AC
considera a eficiência correspondente do PCS; a eficiência de ciclo da bateria
é dividida igualmente entre as duas etapas. Capacidade e faixa de SOC vêm das
fichas dos equipamentos.

O cálculo também verifica os limites nominais conhecidos da ficha C&I.
Para backup, não presume capacidade transitória de sobrecarga: a potência contínua
disponível deve atender ao pico de partida informado. A rede AC da instalação,
proteções, cabeamento, coordenação e ensaios de hardware não são dimensionados
por esta funcionalidade.

O investimento soma quantidades e preços de cada componente, incluindo o
controlador exigido. A comparação, o resultado e o memorial identificam a
composição e a associação série/paralelo. O histórico guarda as especificações,
a regra, a revisão e os preços usados; novos cálculos consultam o catálogo atual
e revalidam a composição. Desativar uma regra impede novas seleções sem apagar
o histórico.

## Banco e disponibilização

A migração `supabase/migrations/0097_ci_modular_compatibility.sql` cria
`ci_pcs_specs`, `ci_battery_specs` e `ci_compatibility_rules`, com chaves para os
catálogos existentes, validação de aprovação e políticas RLS. Administradores
gerenciam os registros; usuários autenticados leem os registros ativos e regras
aprovadas com os respectivos equipamentos e controlador ativos.

A migração deve ser aplicada pelo fluxo normal de migrações do ambiente antes
de disponibilizar o cadastro modular. Não há carga inicial de compatibilidades:
os exemplos de teste são sintéticos. A implementação foi validada com PostgreSQL
local em banco descartável; essa verificação não aplica a migração ao banco da
aplicação nem ao de produção.

O cálculo modular roda no servidor da aplicação pela rota de cálculo existente;
não depende de uma nova versão da Edge Function integrada.

## Verificação

Os testes cobrem associação elétrica, limites de corrente e potência, eficiências,
faixas e aprovação, preço por componente, controlador, backup, persistência do
snapshot, integração da rota, cadastro, seleção e geração real de PDF. A migração
também foi executada em PostgreSQL com verificações de permissões e aprovação.
O fluxo visual foi exercitado em 390, 1366, 1440 e 1920 pixels, usando catálogo e
autenticação simulados e o motor real de cálculo. Nenhuma compatibilidade real
de fabricante foi certificada ou presumida por esses testes.

## STS no backup

A decisão de seleção e os limites de escopo estão em [CI-STS-DECISION.md](CI-STS-DECISION.md).
Em Administração → BESS C&I → STS / Transferência, vincule o acessório à ficha
STS e aprove as associações com PCS ou BESS integrado, tensão, frequência e
quantidade máxima por gabinete. O preenchimento a partir do datasheet Nexus
apenas preenche a ficha: não aprova associações nem inventa quantidade de PCS.

Na etapa Backup, escolha seleção automática ou manual, informe o FP e a máxima
passagem e declare se o gabinete atende à instalação ou ao barramento dedicado.
O motor verifica os limites sem sobrecarga, adiciona uma STS ao investimento e
preserva a ficha/regra/preço no resultado e no histórico. Sem modelo elegível,
o cenário é inválido; sem preço do modelo escolhido, o estudo é interrompido.

A migração aditiva `0098_ci_backup_sts.sql` é necessária antes de usar esse
cadastro. Ela não cria acessórios nem aprova combinações reais. As versões
`ci-v5` e `ci-modular-v4` identificam o cálculo com limites contínuos e rejeição
de candidatos tecnicamente inválidos. Cálculos de backup integrados rodam no
servidor da aplicação; respostas antigas da Edge Function são recalculadas
localmente, evitando reintroduzir capacidade de sobrecarga presumida.
