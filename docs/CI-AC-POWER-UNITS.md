# Unidades CA no projeto C&I

O projeto persiste `acPowerFactor` (0 < FP ≤ 1). Projetos anteriores e novos formulários começam com FP 1; alterar o FP não reinterpreta as curvas ativas já salvas. O gerador e a STS mantêm seus fatores próprios.

- Interface do projeto e memorial: potência CA em kVA, convertida por S = P / FP.
- Entradas em kVA: convertidas para potência ativa por P = S × FP antes de salvar.
- Motor, contratos e catálogo técnico: mantêm os limites ativos e campos `*Kw` existentes. Os valores CA exibidos são equivalentes ao FP declarado, sem criar limites de potência reativa que o catálogo não documenta.
- Potências CC, baterias e módulos FV: permanecem em kW ou kWp. Energia permanece em kWh; nunca se integra kVA como se fosse kW.
- Demanda: o contrato é apresentado em kVA; a tarifa equivalente em R$/kVA-mês é a tarifa em R$/kW-mês multiplicada pelo FP. O custo permanece invariável.
- CSV: exporta `powerKva`; importação reconhece VA, kVA e MVA e exige FP para convertê-los. Arquivos ativos (W/kW/MW) e de energia (Wh/kWh/MWh) continuam aceitos e não são multiplicados pelo FP.
- Resultados: registram o FP em `assumptions.acPowerFactor`, para que tela e PDF usem o FP do estudo mesmo se o formulário mudar depois.

Referência de unidades e necessidade do FP: [Schneider Electric — conversão de kW para kVA](https://www.se.com/us/en/faqs/FA101600/).

A migração é de apresentação e entrada de dados. Não altera o despacho ativo, as perdas CC/CA nem a avaliação de reativos do equipamento.
