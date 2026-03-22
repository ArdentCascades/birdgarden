/**
 * e2e/home.spec.ts — Home page user flows
 */
import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('loads and shows the hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Bird Garden/i);
    // Hero headline should be present
    await expect(page.locator('h1')).toBeVisible();
  });

  test('has navigation links', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="/plants"]')).toBeVisible();
    await expect(page.locator('a[href="/birds"]')).toBeVisible();
    await expect(page.locator('a[href="/garden"]')).toBeVisible();
  });

  test('region selector is present', async ({ page }) => {
    await page.goto('/');
    // Wait for the Preact island to hydrate
    await expect(page.locator('.region-selector, [aria-busy="true"]')).toBeVisible({ timeout: 10_000 });
  });

  test('region selector loads continent options', async ({ page }) => {
    await page.goto('/');
    // Wait for loading to finish
    await expect(page.locator('#region-continent')).toBeVisible({ timeout: 10_000 });
    const options = page.locator('#region-continent option');
    await expect(options).toHaveCountGreaterThan(1);
  });

  test('selecting continent shows country dropdown', async ({ page }) => {
    await page.goto('/');
    await page.locator('#region-continent').waitFor({ timeout: 10_000 });

    // Pick the first non-empty continent
    const continentSelect = page.locator('#region-continent');
    const firstOption = continentSelect.locator('option').nth(1);
    const continentValue = await firstOption.getAttribute('value');
    await continentSelect.selectOption(continentValue!);

    await expect(page.locator('#region-country')).toBeVisible();
  });

  test('Browse Native Plants button is disabled with no selection', async ({ page }) => {
    await page.goto('/');
    await page.locator('#region-continent').waitFor({ timeout: 10_000 });
    const browseBtn = page.locator('button:has-text("Browse Native Plants")');
    await expect(browseBtn).toBeDisabled();
  });
});
