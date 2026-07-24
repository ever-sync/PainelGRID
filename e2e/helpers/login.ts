import type { Page } from '@playwright/test';

const DEMO_PASSWORD = 'Leadflow@2026';

export type QuickRole = 'Gestor' | 'Cliente' | 'Vendedor' | 'Recepção';

const rolePath: Record<QuickRole, RegExp> = {
  Gestor: /\/gestor\/dashboard/,
  Cliente: /\/cliente\/dashboard/,
  Vendedor: /\/vendedor\/dashboard/,
  Recepção: /\/recepcao\/checkin/,
};

/** Login via botões "Acesso rápido (demo)" na página /login. */
export async function loginAsQuickRole(page: Page, role: QuickRole) {
  await page.goto('/login');
  await page.getByRole('button', { name: role }).click();
  await page.waitForURL(rolePath[role], { timeout: 30_000 });
}

/** Login explícito com e-mail e senha demo. */
export async function loginWithCredentials(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByPlaceholder('Digite seu endereço de e-mail').fill(email);
  await page.getByPlaceholder('Digite sua senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
