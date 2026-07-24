import { expect, test } from '@playwright/test';

/**
 * URL completa do convite (inclui query `v=`) impressa pelo seed:
 * `[seed] Convite demo (preview publico): ...`
 * Exporte: E2E_CONVITE_URL="http://localhost:5173/convite?v=...."
 */
const conviteUrl = process.env.E2E_CONVITE_URL?.trim();

test.describe('Convite público', () => {
  test('preview convite com JWT do seed', async ({ page }) => {
    test.skip(!conviteUrl, 'Defina E2E_CONVITE_URL (copie a linha completa do npm run db:seed).');

    await page.goto(conviteUrl!);
    await expect(page.getByText(/Evento Demo|Empresa Demo|Lead/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
