# Seleção de modelos e atendimento técnico C&I

## Decisão

Configurações BESS pede a tensão CA entre fases (220 V ou 380 V), o tipo de
produto e seus modelos. Gabinete integrado é um modelo; montagem é um modelo
de PCS/inversor e uma bateria com compatibilidade aprovada. Quantidades,
portas, séries e paralelos são determinados pelo motor entre soluções já
geradas. Aprovações diferentes para os mesmos modelos permanecem elegíveis.

A interface lista modelos presentes na geração atual. Modelos incompatíveis
com a tensão escolhida ficam desabilitados, com indicação da tensão. Uma
tensão ausente no cadastro não é inferida do nome, da tensão CC ou da tensão
fase-neutro. PCS usa os tipos de rede cadastrados (trifásica 220/380 V);
gabinetes passam a declarar suas tensões CA entre fases no cadastro.

O motor confirma potência, energia, aplicações, despacho, reserva de backup,
transferência e acessórios. Ordena por quantidade de PCS/gabinetes, energia
nominal e identificador estável. Seleciona a primeira solução que atende a
tudo e só então calcula seus indicadores financeiros. Payback, ROI e VPL
continuam como indicadores; não são critérios de escolha nem de ranking.

Sem atendimento integral, retorna `selected: null`, cenários vazios e motivos
comprovados. Limites globais de potência/energia só são apontados quando
nenhuma configuração alcança o requisito. Falhas de combinação são descritas
como conjuntas; a falha de uma configuração não é atribuída a todas. A tela
não mostra alternativa insuficiente, projeção financeira ou memorial.

## Compatibilidade e ativação

Configurações históricas continuam legíveis; seus filtros legados são
preservados no cálculo. Ao escolher modelos na nova tela, as quantidades
deixam de ser fixadas pelo usuário. Ranking legado não altera a seleção.

A migration 0105 adiciona tensões CA dos gabinetes e invalida a geração atual
para incluir essa informação no contrato persistido. Preencher as tensões
documentadas dos gabinetes, conferir os tipos de rede dos PCS e gerar as
soluções novamente. A migration 0104 permanece necessária para impedir
invalidação por salvamento sem alteração de dados.

Ordem de ativação: aplicar 0104 e 0105, disponibilizar a aplicação atualizada,
conferir as tensões nos cadastros e gerar novamente as soluções. A geração
deve mostrar estado atual antes de calcular um projeto. A transferência
configurada para backup precisa usar a mesma tensão do projeto; o motor não
converte automaticamente uma STS de outra tensão.

## Verificação

- Suíte completa: 2.761 testes em 162 arquivos, com cobertura acima dos limites.
  Três regressões adicionais verificaram hidratação de projetos antigos,
  preservação dos novos modelos/tensão e ausência de ranking por padrão.
- Tipos, lint e build de produção com Webpack passaram. Lint mantém oito
  avisos anteriores, sem erros.
- Deno verificou o motor e a Edge Function; seus nove testes passaram.
- PostgreSQL descartável verificou 0104/0105, publicação, invalidação,
  persistência da tensão, histórico e leitura/permissões dos usuários.
- Prévia isolada com dados sintéticos em 390×844, 1366×768, 1440×900 e
  1920×1080: modelos incompatíveis desabilitados, resultado único, falha sem
  projeção financeira/PDF e ausência de overflow horizontal.

Não houve alteração no banco nem no catálogo de produção por este trabalho.
