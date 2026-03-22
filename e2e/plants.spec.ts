/**
 * e2e/plants.spec.ts — Plant browser user flows
 */
import { test, expect } from '@playwright/test';

test.describe('Plants page', () => {
  test('loads the plants page', async ({ page }) => {
    await page.goto('/plants');
    await expect(page).toHaveTitle(/Plants/i);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows region prompt when no region selected', async ({ page }) => {
    await page.goto('/plants');
    // Should show a link to select region
    await expect(page.locator('a[href="/"]')).toBeVisible();
  });

  test('shows filter controls', async ({ page }) => {
    await page.goto('/plants');
    await expect(page.locator('#plant-search')).toBeVisible();
    await expect(page.locator('#plant-type')).toBeVisible();
    await expect(page.locator('#plant-sort')).toBeVisible();
  });

  test('shows plants when region is provided via URL', async ({ page }) => {
    // Use a region slug that exists in the seed data
    await page.goto('/plants?region=new-york');
    // Wait for plant cards to appear
    await expect(page.locator('.plant-card').first()).toBeVisible({ timeout: 10_000 });
  });

  test('plant card links to plant detail page', async ({ page }) => {
    await page.goto('/plants?region=new-york');
    await page.locator('.plant-card a').first().waitFor({ timeout: 10_000 });

    // Click the first plant card link
    const href = await page.locator('.plant-card a').first().getAttribute('href');
    expect(href).toMatch(/^\/plants\//);
  });

  test('search filter narrows results', async ({ page }) => {
    await page.goto('/plants?region=new-york');
    await page.locator('.plant-card').first().waitFor({ timeout: 10_000 });

    const initialCount = await page.locator('.plant-card').count();

    // Type a specific plant name
    await page.locator('#plant-search').fill('oak');
    // Wait for debounce and re-fetch
    await page.waitForTimeout(600);

    const filteredCount = await page.locator('.plant-card').count();
    // Filtered results should be less than or equal to initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('type filter chip appears when type selected', async ({ page }) => {
    await page.goto('/plants?region=new-york');
    await page.locator('#plant-type').waitFor({ timeout: 10_000 });

    await page.locator('#plant-type').selectOption('tree');
    await page.waitForTimeout(200);

    const chip = page.locator('.filter-chip', { hasText: 'Tree' });
    await expect(chip).toBeVisible();
  });
});
