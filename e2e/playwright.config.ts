import { defineConfig, devices } from '@playwright/test';

/**
 * UI E2E — desktop Vite (porta 5173 por padrão).
 * Defina E2E_BASE_URL para staging/preview (ex.: https://app.vercel.app).
 */
const baseURL = process.env.E2E_BASE_URL?.trim() || 'http://localhost:5173';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
