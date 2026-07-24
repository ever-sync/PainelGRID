import { expect, test } from '@playwright/test';
import { loginAsQuickRole } from '../helpers/login';

test.describe('Vendedor', () => {
  test('dashboard vendedor carrega', async ({ page }) => {
    await loginAsQuickRole(page, 'Vendedor');
    await expect(page).toHaveURL(/\/vendedor\/dashboard/);
  });

  test('página de leads abre', async ({ page }) => {
    await loginAsQuickRole(page, 'Vendedor');
    await page.goto('/vendedor/leads');
    await expect(page.getByText(/lead|contato/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('cursos listam conteúdo publicado', async ({ page }) => {
    await loginAsQuickRole(page, 'Vendedor');
    await page.goto('/vendedor/cursos');
    await expect(page.getByText('Curso Demo')).toBeVisible({ timeout: 20_000 });
  });
});
