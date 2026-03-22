/**
 * e2e/birds.spec.ts — Bird browser user flows
 */
import { test, expect } from '@playwright/test';

test.describe('Birds page', () => {
  test('loads the birds page', async ({ page }) => {
    await page.goto('/birds');
    await expect(page).toHaveTitle(/Birds/i);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('lists bird cards', async ({ page }) => {
    await page.goto('/birds');
    await expect(page.locator('.bird-card, [class*="card"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('bird detail page loads', async ({ page }) => {
    // Use a slug that exists in seed data
    await page.goto('/birds/northern-cardinal');
    await expect(page).toHaveTitle(/Northern Cardinal/i);
    await expect(page.locator('h1')).toContainText('Northern Cardinal');
  });

  test('bird detail page has scientific name', async ({ page }) => {
    await page.goto('/birds/northern-cardinal');
    // Scientific name is italicised in the page
    await expect(page.locator('.scientific-name, em, i').first()).toBeVisible();
  });

  test('bird detail page links back to birds list', async ({ page }) => {
    await page.goto('/birds/northern-cardinal');
    const breadcrumbOrBack = page.locator('a[href="/birds"]');
    await expect(breadcrumbOrBack.first()).toBeVisible();
  });

  test('unknown bird slug shows 404', async ({ page }) => {
    const res = await page.goto('/birds/this-bird-does-not-exist');
    expect(res?.status()).toBe(404);
  });
});
