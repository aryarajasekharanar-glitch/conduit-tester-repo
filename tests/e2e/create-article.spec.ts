import { test, expect } from '@playwright/test';

/**
 * E2E test against the real Conduit frontend (react-redux-realworld-example-app),
 * driving the actual Register and Editor components by their real DOM structure
 * (read from src/components/Register.js and src/components/Editor.js -- there are
 * no data-testid hooks in this app, so selectors are placeholder/text based,
 * matching what's actually in the rendered markup).
 *
 * Flow: register a new user -> create an article -> verify it renders with the
 * correct title on the resulting article page. This exercises real Redux actions
 * and a real network round-trip to the backend, not a mock.
 */

test.describe('Create article flow', () => {
  test('a registered user can publish an article and see it on the article page', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const username = `e2euser_${uniqueSuffix}`;
    const email = `e2euser_${uniqueSuffix}@example.com`;
    const articleTitle = `E2E Test Article ${uniqueSuffix}`;

    await page.goto('/register');
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByText(username)).toBeVisible({ timeout: 10_000 });

    await page.goto('/editor');
    await page.getByPlaceholder('Article Title').fill(articleTitle);
    await page.getByPlaceholder("What's this article about?").fill('A short description');
    await page.getByPlaceholder('Write your article (in markdown)').fill('The article body');
    await page.getByRole('button', { name: 'Publish Article' }).click();

    await expect(page).toHaveURL(/\/article\//, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: articleTitle })).toBeVisible();
  });
});