import { expect, test } from '@playwright/test';
import { loginAsQuickRole } from '../helpers/login';

test.describe('Gestor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQuickRole(page, 'Gestor');
  });

  test('lista de clientes contém Empresa Demo (seed)', async ({ page }) => {
    await page.goto('/gestor/clientes');
    await expect(page.getByText('Empresa Demo').first()).toBeVisible({ timeout: 20_000 });
  });

  test('CRM carrega após seed', async ({ page }) => {
    await page.goto('/gestor/crm');
    await expect(page.getByText(/Kanban|Pipeline|contatos|CRM/i).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test('cursos listam Curso Demo', async ({ page }) => {
    await page.goto('/gestor/cursos');
    await expect(page.getByText('Curso Demo').first()).toBeVisible({ timeout: 20_000 });
  });
});
