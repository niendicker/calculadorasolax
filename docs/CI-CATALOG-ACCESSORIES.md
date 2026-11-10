# Catálogos e acessórios próprios de C&I

Decisão de 06/11/2026: os produtos C&I não compartilham cadastro nem precificação
com os residenciais. Reutilizamos os componentes de edição existentes.

## Cadastro e origem dos dados

- `ci_inverters`, `ci_batteries` e `ci_accessories` são os cadastros completos
  independentes, com os mesmos campos de produto, imagens, documentos e garantia
  dos editores residenciais. `ci_bess_products` permanece como catálogo integrado.
- `ci_pcs_specs` e `ci_battery_specs` mantêm os limites contínuos adicionais.
  Nas abas PCS/Baterias C&I, primeiro cadastre o produto em **Cadastro de produtos**,
  depois sua ficha em **Limites contínuos C&I**.
- Compatibilidades, controlador obrigatório e STS referenciam exclusivamente C&I.
  Quantidade máxima de PCS continua configurável e documentada nas regras.
  Não se considera sobrecarga transitória.
- A STS tem cadastro próprio em `ci_sts_products` (mesmos campos de produto dos acessórios), com a ficha elétrica em `ci_sts_specs`. Em **Administração → BESS C&I → STS** o produto e a ficha são salvos juntos (`save_ci_sts`). Os nomes de coluna `accessory_id` das tabelas STS foram mantidos por compatibilidade com snapshots e gerações publicadas; hoje apontam para `ci_sts_products.id`.
- As categorias do Portfólio são `ci_pcs`, `ci_battery`, `ci_accessory`, `ci_sts` e `ci_bess`.
  Todas usam o preço próprio do usuário diretamente, sem markup residencial.
  Preço zero registrado é aceito; preço ausente para um item cobrado bloqueia o cálculo.

## Migrações e preservação

Aplicar `0099_ci_independent_catalogs.sql` e `0100_ci_accessory_rules.sql` antes
da versão da aplicação. Não é necessário publicar uma Edge Function nova: o
cálculo do projeto passa pela API Next.js, que resolve catálogos e preços no
servidor com a sessão do usuário e RLS.

A 0099 copia somente produtos já vinculados às fichas PCS/bateria, controladores
exigidos e STS. Preserva IDs, documentos e imagens e redireciona as chaves
estrangeiras e validações. Novos cadastros C&I nunca entram nas tabelas residenciais.
Os registros residenciais originais não são removidos nem desativados, pois podem
ser referenciados por soluções e projetos históricos. Uma limpeza desses registros
exige auditoria dos vínculos; os dois catálogos passam a evoluir independentemente.

Os preços anteriores dos modelos migrados são copiados para as categorias C&I,
por usuário, preservando zeros explícitos e registros originais. A cópia preserva
preços mesmo em contas no limite do Portfólio; a verificação de limite volta a
valer para novas inclusões. Nenhum cálculo usa preço residencial como fallback.
As tabelas são criadas com `LIKE` incluindo campos, defaults, checks e índices,
sem herança PostgreSQL e sem copiar políticas de escrita residenciais.

## Migração 0107 (STS como produto próprio)

Move as STS de `ci_accessories` para `ci_sts_products` preservando IDs, e copia os preços de `ci_accessory` para `ci_sts` (inclusive zeros). Regras de acessório continuam podendo exigir/excluir uma STS: a FK única virou validação nas duas tabelas. Falha se uma compatibilidade PCS + bateria usa uma STS como controlador. Validação: `bash scripts/check-ci-catalog-migration.sh`.

## Regras de acessórios

Em **Administração → BESS C&I → Acessórios**, cadastre o produto completo. Em
**Regras de acessórios**, defina acessório, alvos e referência/revisão documental.
As regras são exclusivas C&I; `accessory_rules` residencial permanece independente.

Os alvos opcionais são PCS, bateria, combinação documentada ou BESS integrado.
Quando preenchidos em conjunto, precisam corresponder ao mesmo candidato.
Condições adicionais: backup habilitado/desabilitado, gerador habilitado/desabilitado
ou indiferente, e tensão da rede. A tensão atualmente vem da configuração STS;
sem tensão informada uma regra específica de tensão não é aplicada.

Inclusão:

- **Obrigatório**: incluído automaticamente em toda composição correspondente.
- **Opcional**: incluído quando selecionado na configuração BESS do projeto e
  compatível com o candidato. Seleção fora da configuração invalida o candidato.
- **Incluso**: aparece na lista de materiais, com justificativa e custo adicional zero.
  Para um EMS incluso em determinada STS, declare a STS em **Exige também** e
  registre o documento que comprova essa inclusão; não é inferida por nome.

A base é sistema, quantidade de PCS, unidades comerciais de bateria, strings
(`PCS × strings por PCS`) ou módulos de BESS integrado. Os limites mínimo/máximo
restringem a contagem. A quantidade é `teto(contagem / divisor) × quantidade por faixa`.
Exemplo: um kit a cada cinco racks, com doze racks, gera três kits.

Sobreposição de regras para o mesmo produto usa a maior quantidade, reunindo as
justificativas, sem somar cobranças duplicadas. Uma inclusão documental aplicável
zera a cobrança desse produto, incluindo controladores já exigidos pela compatibilidade.
Dependências devem estar presentes por outra regra aplicável ou pelo seletor STS;
não são criadas silenciosamente. Dependência ausente ou exclusão presente invalida
o candidato e impede sua recomendação. Não há inferência de compatibilidade elétrica.

A STS continua sendo selecionada pela corrente, cargas de backup, passagem da rede,
tensão, frequência e limite documentado de PCS. Regras genéricas podem exigir sua
presença, mas não criar, multiplicar ou tornar gratuita uma STS. Seu preço e quantidade
continuam sob responsabilidade do seletor elétrico.

## Resultado e verificação

O motor avalia as regras por candidato antes de CAPEX, fluxo de caixa, payback,
ROI e VPL. Os resultados incluem lista de acessórios, quantidades, preços,
justificativas e IDs das regras. Contexto de regras/produtos/preços e seleção ficam
no snapshot de entrada e resultado e no fingerprint. O memorial apresenta a mesma
lista. Versões: `ci-v4` e `ci-modular-v3`.

A Edge Function legada permanece identificada como `ci-v3`, rejeita seleção explícita
de acessórios e composição modular, e não é usada pelo fluxo de cálculo do projeto.
Resultados antigos permanecem legíveis; recalcule para aplicar regras novas.

Validação de migração isolada: `bash scripts/check-ci-catalog-migration.sh`.
O script cria PostgreSQL descartável sem portas externas e verifica cópia de dados,
preservação de preços/mídia, chaves, aprovação e isolamento administrativo por RLS.
A suíte Vitest cobre faixas, quantidades, opcionais, itens inclusos, dependências,
exclusões, preços próprios e os reflexos financeiros em modular e integrado.
