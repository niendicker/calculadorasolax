import { expect, test } from '@playwright/test';

const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

test.describe('Projetos — baseline visual', () => {
  test.skip(!email || !password, 'Configure TEST_USER_EMAIL e TEST_USER_PASSWORD para executar os testes visuais.');

  test.beforeEach(async ({ page }) => {
    await page.goto('/pt/login?redirect=%2Fpt');
    await page.getByLabel('Email').fill(email!);
    await page.locator('input#password').fill(password!);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/pt(?:\?.*)?$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Projetos', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.addStyleTag({
      content: '* { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }',
    });
  });

  test('renderiza a página de Projetos', async ({ page }) => {
    await expect(page).toHaveScreenshot('projects-page.png', {
      animations: 'disabled',
      mask: [page.getByText(/Atualizado em/)],
    });
  });

  test('renderiza o painel do projeto selecionado quando há projetos salvos', async ({ page }) => {
    const cards = page.locator('div[role="button"][aria-pressed]');
    test.skip((await cards.count()) === 0, 'A conta visual não possui projetos salvos para o cenário selecionado.');

    await cards.first().click();
    await expect(page.getByRole('button', { name: 'Fechar resumo do projeto' })).toBeVisible();
    await expect(page).toHaveScreenshot('projects-selected.png', {
      animations: 'disabled',
      mask: [page.getByText(/Atualizado em/)],
    });
  });
});
