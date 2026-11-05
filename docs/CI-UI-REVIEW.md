# Revisão de UI — módulo C&I

Data: 2026-11-05. Revisão da implementação das oito etapas, com refinamentos nos componentes existentes. Referências: `UI-GUIDELINES.md` e `UI-REVIEW-CHECKLIST.md`.

## Tarefa principal

Identificar a instalação, selecionar o BESS, configurar consumo e tarifa, escolher a estratégia, incluir recursos opcionais e comparar o dimensionamento antes de gerar o memorial.

## Achados e correções

| Prioridade | Antes: evidência e consequência | Depois |
| --- | --- | --- |
| P1 | A aba Resultados desmontava ao sair. O cálculo e sua referência de parâmetros eram perdidos; editar outra aba eliminava a possibilidade de detectar resultado desatualizado. | Snapshot do cálculo mantido no workspace e associado ao projeto. Ao voltar, o resultado continua disponível e mudanças exigem recálculo. |
| P1 | O PDF podia ser gerado com resultado anterior e configurações atuais. | Exportação indisponível enquanto o resultado estiver desatualizado ou houver recálculo. Aviso explica como atualizar. |
| P1 | Badges de pendência consumiam o espaço dos rótulos das abas, chegando a ocultá-los. | No C&I, ícone, nome e pendência ficam em linhas próprias. A navegação mantém rolagem horizontal em áreas estreitas. O modo anterior continua disponível para os demais módulos. |
| P1 | BESS anunciava avanço para Curva de carga, mas abria Solar. Estratégia anunciava Resultados mesmo quando abria Falta de rede. | Textos correspondem à próxima etapa, respeitando o acesso ao Backup. |
| P1 | A capacidade útil no cartão BESS assumia SOC máximo de 100%, mesmo para produtos com outro limite. | Apresentação usa a diferença entre SOC máximo e mínimo, como o motor de cálculo. Exemplo: 100 kWh, SOC de 10–95% → 85 kWh úteis. |
| P2 | O contador ignorava Solar ativo e incluía Backup desativado; “Continuar” sempre retornava ao BESS. | Contagem das etapas aplicáveis, Solar incluído quando ativo, e continuação na primeira pendência. |
| P2 | Estado vazio dizia “Pronto” com dados ausentes, exibia duas ações primárias equivalentes e não permitia abrir diretamente uma pendência. | Título diferencia pendências de configuração preenchida, uma ação Calcular e atalhos para cada etapa. Projeto não salvo oferece retorno direto à Visão geral. |
| P2 | Falha no catálogo exigia sair da etapa. Troca de modo podia manter quantidade nula; mínimo e máximo podiam se inverter. | Tentativa de carregamento na própria etapa, inicialização explícita da quantidade e preservação de intervalo ordenado. |
| P2 | Linhas da tabela recebiam foco sem expor semântica de seleção. O motivo de invalidez de um cenário não aparecia ao inspecioná-lo. | Botões nativos para inspeção, estado pressionado, cabeçalhos e legenda acessíveis, além dos avisos do cenário inspecionado. |
| P2 | Inspecionar outro cenário alterava métricas financeiras, mas gráfico e PDF continuavam na configuração calculada sem explicar essa diferença. | Texto identifica a quantidade de módulos vinculada ao gráfico e ao memorial. Os dados de referência do gráfico usam as premissas do resultado calculado. |
| P2 | O calendário declarava diálogo modal sem conter o foco. Campos de cargas dependiam de placeholders e a remoção não tinha nome acessível. | Foco inicial no calendário, ciclo de Tab, Escape/Cancelar/Aplicar devolvendo foco, nomes acessíveis para cargas e remoção. |
| P3 | Curva de carga repetia um título principal e a geração era rotulada como semanal mesmo em outros períodos. | Título de seção consistente, geração identificada como período simulado e explicação de Payback/ROI/VPL. |

## Organização resultante

A Visão geral mantém instalação, configuração e resultado. Os cartões preservam os resumos e os recursos opcionais inativos. A ação de continuação aponta o próximo dado ausente.

Resultados mantém uma ação principal no cabeçalho, exportação secundária, feedback de cálculo/erro, comparação e avisos. O estado inicial oferece links às configurações; o estado calculado distingue inspeção financeira da configuração materializada no gráfico e PDF. As tabelas mantêm rolagem própria em telas estreitas.

## Verificação

- Testes de componentes do C&I e regressão do workspace residencial: 195 testes, incluindo permanência do cálculo entre abas, aviso após alteração, bloqueio de PDF, capacidade útil, retry do catálogo, intervalo de módulos e foco do calendário.
- TypeScript: `npm run typecheck`.
- Navegador Chromium em 1366 × 768, 1440 × 900, 1920 × 1080 e 390 × 844: oito etapas sem overflow horizontal do documento. Comparação de seis cenários, seleção por Enter, retorno entre abas, parâmetros alterados, PDF bloqueado e Escape do calendário verificados nos quatro tamanhos.
- Revisão visual realizada em harness local com os componentes e CSS reais, catálogo e resposta de cálculo simulados. Capturas e scripts em `/tmp/ci-ui-review`. Isso verifica a interface e as interações locais; não substitui um teste autenticado contra o backend.
- ESLint dos arquivos alterados: sem erros; avisos existentes em imports não utilizados e efeitos. O lint global ainda apresenta erros em arquivos não alterados, incluindo `LoadCurveChart.tsx` e um teste do repositório de cálculos.

## Limites

O snapshot é mantido durante a navegação no workspace atual. Recarregar a página ou sair desse workspace não restaura esse snapshot local. A verificação de presença de configuração é compartilhada entre resumos e navegação; a validação completa dos dados e a viabilidade continuam sob responsabilidade do cálculo no servidor. Não foram alterados algoritmos de dimensionamento, tarifas de referência, permissões ou contratos de persistência.
