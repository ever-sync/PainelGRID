import { expect, test } from '@playwright/test';
import { loginAsQuickRole } from '../helpers/login';

test.describe('Cliente', () => {
  test('dashboard cliente carrega', async ({ page }) => {
    await loginAsQuickRole(page, 'Cliente');
    await expect(page).toHaveURL(/\/cliente\/dashboard/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('página de leads abre', async ({ page }) => {
    await loginAsQuickRole(page, 'Cliente');
    await page.goto('/cliente/leads');
    await expect(page.getByText(/lead|contato|lista/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
