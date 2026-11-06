# PCS + baterias no C&I

O C&I permite escolher entre BESS integrado e uma composição modular. O caminho
integrado permanece disponível; projetos existentes não precisam ser convertidos.

## Cadastro e uso

1. Em Administração → BESS C&I, cadastre as especificações adicionais nas abas
   Inversores / PCS e Baterias C&I. Selecione modelos do catálogo compartilhado
   com o residencial. Os IDs, nomes, tensões e eficiências continuam vinculados
   às fichas originais.
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

O cálculo também verifica os limites nominais conhecidos da ficha compartilhada.
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
`ci-v3` e `ci-modular-v2` identificam o cálculo com limites contínuos e rejeição
de candidatos tecnicamente inválidos. Cálculos de backup integrados rodam no
servidor da aplicação; respostas antigas da Edge Function são recalculadas
localmente, evitando reintroduzir capacidade de sobrecarga presumida.
