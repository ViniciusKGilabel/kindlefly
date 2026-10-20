import { defineConfig } from '@playwright/test';

// Pré-requisito: `pnpm wxt build` (gera output/chrome-mv3). O Chromium do
// Playwright precisa estar instalado (`pnpm exec playwright install chromium`).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
});
