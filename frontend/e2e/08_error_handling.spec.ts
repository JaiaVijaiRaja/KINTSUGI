import { test, expect } from '@playwright/test';

test.describe('Test Journey H: Robust Error Handling & Backend Fault Simulation', () => {
  test('H-01: Simulates backend-unavailable on /api/health and verifies UI renders Disconnected/Offline state', async ({ page }) => {
    // Intercept /api/health to simulate backend failure
    await page.route('**/api/health', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Service Unavailable: Database connection failed' }),
      });
    });

    await page.goto('/settings');

    // Trigger diagnostics refresh
    const refreshBtn = page.getByRole('button', { name: /Refresh Diagnostics/i });
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
    await refreshBtn.click();

    // Verify UI displays Offline badge and Disconnected status in both banner and diagnostics card
    await expect(page.getByRole('banner').getByText('Disconnected')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#main-content').getByText('Disconnected')).toBeVisible();
    await expect(page.getByText('Offline', { exact: true })).toBeVisible();

    // Verify it does NOT display a false positive "Healthy" status
    await expect(page.getByText('Healthy', { exact: true })).not.toBeVisible();
  });

  test('H-02: Simulates backend error on dataset upload and verifies rejection without false success banner', async ({ page }) => {
    // Intercept dataset upload endpoint with 500 Internal Server Error
    await page.route('**/api/datasets/upload', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Simulated backend storage allocation error' }),
      });
    });

    await page.goto('/datasets');

    // Attempt to upload valid CSV to the failing endpoint via input[type="file"]
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test_telemetry.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('timestamp,vibration,temperature\n2026-01-01T00:00:00,1.2,45.0\n'),
    });

    // Verify UI presents clear error state
    await expect(page.getByText('Ingestion Rejected')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Simulated backend storage allocation error')).toBeVisible();

    // Verify UI NEVER displays false success message
    await expect(page.getByText('Ingestion Succeeded')).not.toBeVisible();
  });
});
