/**
 * e2e/garden.spec.ts — Garden builder user flows
 */
import { test, expect } from '@playwright/test';

test.describe('Garden page', () => {
  test('loads the garden page', async ({ page }) => {
    await page.goto('/garden');
    await expect(page).toHaveTitle(/Garden/i);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('shows empty state with no plants', async ({ page }) => {
    // Clear localStorage to ensure empty state
    await page.goto('/garden');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('[data-testid="garden-empty"]')).toBeVisible({ timeout: 10_000 });
  });

  test('empty state has link to plant browser', async ({ page }) => {
    await page.goto('/garden');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('[data-testid="garden-empty"] a[href="/plants"]')).toBeVisible({ timeout: 10_000 });
  });

  test('shared garden URL loads plants from params', async ({ page }) => {
    // Simulate a shared garden link
    await page.goto('/garden?plants=red-maple:Red%20Maple&region=new-york');
    await expect(page.locator('[data-testid="garden-builder"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Red Maple')).toBeVisible();
  });

  test('garden with region shows bird coverage chart', async ({ page }) => {
    await page.goto('/garden?plants=red-maple:Red%20Maple&region=new-york');
    await expect(
      page.locator('[aria-label*="month bird coverage"]'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('remove button removes plant', async ({ page }) => {
    await page.goto('/garden?plants=red-maple:Red%20Maple,black-cherry:Black%20Cherry&region=new-york');
    await page.locator('[data-testid="garden-builder"]').waitFor({ timeout: 10_000 });

    const removeBtn = page.locator('[aria-label^="Remove Red Maple"]');
    await removeBtn.click();

    await expect(page.locator('text=Red Maple')).toHaveCount(0);
  });

  test('share button copies link (clipboard mock)', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/garden?plants=red-maple:Red%20Maple&region=new-york');
    await page.locator('[data-testid="garden-builder"]').waitFor({ timeout: 10_000 });

    const shareBtn = page.locator('[aria-label="Copy shareable link to this garden"]');
    await shareBtn.click();

    // Feedback message should appear
    await expect(page.locator('text=Link copied!')).toBeVisible();
  });
});
