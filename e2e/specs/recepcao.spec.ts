import { expect, test } from '@playwright/test';
import { loginAsQuickRole } from '../helpers/login';

test.describe('Recepção', () => {
  test('check-in carrega e mostra evento demo', async ({ page }) => {
    await loginAsQuickRole(page, 'Recepção');
    await expect(page).toHaveURL(/\/recepcao\/checkin/);
    await expect(page.getByText(/Evento Demo|check-in|Check/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
