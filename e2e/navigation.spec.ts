/**
 * e2e/navigation.spec.ts — Global navigation and static page flows
 */
import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navigates from home to plants', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/plants"]').first().click();
    await expect(page).toHaveURL(/\/plants/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('navigates from home to birds', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/birds"]').first().click();
    await expect(page).toHaveURL(/\/birds/);
  });

  test('navigates from home to garden', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/garden"]').first().click();
    await expect(page).toHaveURL(/\/garden/);
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await expect(page).toHaveTitle(/About/i);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('404 page for unknown route', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-xyz');
    expect(res?.status()).toBe(404);
  });

  test('sitemap.xml is reachable', async ({ page }) => {
    const res = await page.goto('/sitemap.xml');
    expect(res?.status()).toBe(200);
    const body = await page.content();
    expect(body).toContain('<urlset');
  });
});

test.describe('Add to garden flow', () => {
  test('plant detail page has Add to Garden button', async ({ page }) => {
    await page.goto('/plants/eastern-redbud');
    await expect(page.locator('[data-plant-slug="eastern-redbud"]')).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Add to Garden stores plant in localStorage', async ({ page }) => {
    await page.goto('/plants/eastern-redbud');

    const addBtn = page.locator('[data-plant-slug="eastern-redbud"]').first();
    await addBtn.click();

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('bird-garden-plants');
      return raw ? JSON.parse(raw) : [];
    });
    const slugs = stored.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('eastern-redbud');
  });
});
