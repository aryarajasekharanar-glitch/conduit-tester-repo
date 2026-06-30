import { defineConfig } from '@playwright/test';

/**
 * Two separate test "levels" live in this repo:
 *  - tests/api  -> hits the backend REST API directly (no browser)
 *  - tests/e2e  -> drives the real frontend in a browser
 *
 * Both assume the app is already running locally:
 *   backend: http://localhost:3000/api
 *   frontend: http://localhost:4100
 *
 * In CI these are started as services before the test job runs (see
 * .github/workflows/test.yml).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:4100',
    trace: 'retain-on-failure',
  },
});