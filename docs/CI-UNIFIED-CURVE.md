# Curva e intervalos em um único painel

Um painel principal substitui o editor diário seguido da prévia semanal.
Os modos Dia e Período são visualizações da mesma curva do projeto.

- Dia manual mantém o editor, suavização, desfazer/refazer, perfis de dias
  úteis/fins de semana e edição de FV. Shift + arraste seleciona um intervalo
  sem modificar os pontos. Uma data de referência explicita a posição desse
  perfil na curva real usada para o backup.
- Período mostra todos os pontos reais e mantém a comparação A/B e as opções
  de usar perfil, média, máximo ou patamar manual para o backup.
- CSV é exibido com seus horários e resolução originais, tanto por dia como
  no período. Só uma ação explícita de criar/editar um perfil típico substitui
  o consumo importado. Navegar ou selecionar um intervalo não altera a curva.
- A seleção usa os timestamps reais e a resolução da curva. O fuso do projeto
  define os dias e rótulos, inclusive quando difere do fuso do navegador.
- Exportar CSV usa a curva inteira, independentemente da visualização.
- Ctrl + scroll aplica zoom; scroll sem Ctrl continua rolando a página.

Somente uma visualização do gráfico é apresentada por vez. A configuração de
backup salva mantém seus timestamps ao trocar o modo; uma nova seleção só a
substitui quando o usuário aplica explicitamente o intervalo ao backup.

Validar edição e seleção como gestos distintos, dados CSV preservados, troca
de dia/período, fuso, backup autorizado/não autorizado, exportação completa e
rolagem normal. Testes de navegador usam dados sintéticos locais.

A edição de FV continua disponível junto de consumo importado: no modo Dia,
Editar perfil FV abre somente a série de geração e mantém as leituras originais
de consumo. Os perfis de geração por tipo de dia são alinhados aos timestamps
originais ao atualizar a curva FV.

## Verificação dos fluxos

Ambiente de navegador: Chromium local, componentes reais e dados sintéticos,
sem gravação em banco ou validação de autenticação em produção.

| Cenário | Método | Resultado |
| --- | --- | --- |
| Um gráfico visível ao alternar Dia/Período | Chromium local | Passou |
| Shift sobre um ponto seleciona sem editar consumo/FV | Chromium + testes de componente | Passou |
| Referência em Manaus com navegador em Brasília, intervalo de 30 min | Chromium + testes de integração do painel | Passou |
| Intervalos de 60 min e mudança de dia/fim de semana pelo fuso do projeto | Testes dos conversores | Passou |
| Seleção e backup preservados ao alternar a visualização | Chromium + testes do painel | Passou |
| CSV preservado ao navegar e editar somente FV | Chromium + testes do painel | Passou |
| Exportação por Dia contém todos os pontos do período | Teste do painel com leitura do CSV | Passou |
| Ações de backup disponíveis conforme a permissão recebida pelo painel | Chromium + testes do painel | Passou |
| Scroll normal e zoom com Ctrl | Chromium nos dois modos + testes dos três gráficos | Passou |
| Seleção por horários no celular e ausência de overflow | Chromium 390 × 844 | Passou |
| Layout desktop | Chromium 1366 × 768, 1440 × 900 e 1920 × 1080 | Passou |

Os screenshots foram revisados manualmente em uma prévia isolada; não foi
executada comparação com baselines visuais da aplicação publicada. A persistência
remota e as permissões do servidor permanecem fora do escopo desta alteração.

A edição manual seguida de Desfazer também foi exercitada após alternar para
Período e voltar para Dia: o perfil foi restaurado e Refazer continuou disponível.

Comandos para repetir as checagens:

```sh
npm run typecheck
npm run lint
npm run test:coverage -- --maxWorkers=4 --testTimeout=15000
npm run build -- --webpack
```

Resultado desta implementação: 2.783 testes em 165 arquivos passaram; cobertura
de linhas de 90,17%. Typecheck e build passaram. Lint passou com oito avisos
preexistentes. Nenhuma migration ou alteração de dados em produção.
