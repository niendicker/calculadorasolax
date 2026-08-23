# Fluxo de UI Review e testes visuais

O fluxo recomendado é:

```text
Implementação
↓
Testes
↓
Screenshots
↓
UI Review
↓
Classificação P0/P1/P2/P3
↓
Correções aprovadas
↓
Novos screenshots
↓
Visual regression
↓
PR
```

Visual regression detecta que uma imagem mudou. UI Review avalia se a mudança é desejável, consistente e acessível. Um teste de screenshot não substitui a revisão de UX.

Os testes visuais usam uma conta dedicada configurada por `TEST_USER_EMAIL` e `TEST_USER_PASSWORD`. Não use contas reais de usuários nem dados de produção como fixture. Em desenvolvimento, essas variáveis podem ser carregadas de `.env.test.local`; no CI, devem ser secrets dedicados.

Comandos:

```bash
npm run test:visual
npm run test:visual:update
npm run test:visual:report
```

`test:visual` nunca atualiza snapshots. Execute `test:visual:update` intencionalmente depois de revisar a alteração. Os baselines ficam em `tests/visual/__screenshots__` e devem ser versionados; relatório, traces e screenshots de falha ficam em `playwright-report/` e `test-results/`, que são temporários.

A configuração do baseline cobre a página real de Projetos nos viewports 1366 × 768, 1440 × 900, 1920 × 1080 e 390 × 844. O cenário de seleção é executado quando a conta dedicada possui pelo menos um projeto salvo. Gere os primeiros arquivos de baseline com `npm run test:visual:update` somente depois de confirmar que a conta de teste e seus dados estão estáveis.
