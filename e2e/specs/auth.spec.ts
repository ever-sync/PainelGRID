import { expect, test } from '@playwright/test';
import { loginAsQuickRole, loginWithCredentials } from '../helpers/login';

test.describe('Auth', () => {
  test('login demo gestor redireciona para dashboard', async ({ page }) => {
    await loginAsQuickRole(page, 'Gestor');
    await expect(page).toHaveURL(/\/gestor\/dashboard/);
    await expect(page.getByText(/Bom dia|dashboard|PainelGRID/i).first()).toBeVisible();
  });

  test('credenciais inválidas mostram erro', async ({ page }) => {
    await page.goto('/login');
    await loginWithCredentials(page, 'gestor@leadflow.com', 'senha_errada_xyz');
    await expect(page.getByText(/inválid|não foi possível|Credenciais/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
