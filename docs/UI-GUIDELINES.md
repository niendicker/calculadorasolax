# Diretrizes de UI

Este documento descreve os princípios da interface atual e deve ser consultado antes de alterar componentes de UI.

## Estrutura

- Preserve os padrões de navegação existentes e os fluxos já implementados.
- Reutilize componentes, tokens, classes Tailwind e ícones existentes.
- Evite redesenhos quando um refinamento localizado resolver o problema.
- Mantenha consistência entre as abas e não preencha espaço vazio artificialmente.

## Hierarquia

- O título da página identifica o contexto principal; títulos de seção organizam o conteúdo abaixo dele.
- O conteúdo principal deve receber mais peso visual que metadados e informações secundárias.
- Mantenha uma CTA primária claramente identificável, seguida por CTAs secundárias.
- Ações destrutivas devem ser visualmente distintas, exigir confirmação quando aplicável e não competir com a CTA primária.
- Status e badges devem ser compreensíveis sem depender apenas de cor.

## Componentes existentes

Use os primitives disponíveis em `components/ui` sempre que forem adequados:

- `Button`, `Card`, `Badge`, `Input`, `Select`, `Separator`, `Skeleton` e `Tooltip`.
- `ConfirmDeleteButton` para exclusões com confirmação.
- Diálogos, modais e drawers devem seguir os padrões locais já usados nas telas; atualmente não há primitives locais dedicados de `Dropdown`, `Dialog`, `Sheet/Drawer` ou `Table`.
- Empty, loading e error states devem preservar os componentes e mensagens já existentes na área alterada.

## Responsividade

As revisões visuais desktop usam estes viewports:

- 1366 × 768
- 1440 × 900
- 1920 × 1080
- 390 × 844 para mobile, quando a tela oferecer suporte mobile

Essas dimensões são referências de revisão e não implicam a criação de novos breakpoints CSS.

## Princípio central

> Refine existing interfaces instead of redesigning them unless a redesign is explicitly requested.

