import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Test Journey B: Dataset Ingestion & Quality Profiling', () => {
  const demoCsvPath = path.resolve(process.cwd(), '../demo/turbine_telemetry_demo.csv');

  test('B-01: Rejects non-CSV or malformed file with explicit error notification', async ({ page }) => {
    await page.goto('/datasets');

    // Create a virtual non-csv file and set it on the file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'unsupported_document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake pdf binary content'),
    });

    // Verify rejection banner is displayed
    const rejectionBanner = page.locator('text=Ingestion Rejected');
    await expect(rejectionBanner).toBeVisible();
    await expect(page.locator('text=Only .csv files are permitted')).toBeVisible();
  });

  test('B-02: Successfully uploads telemetry CSV and auto-inspects schema & quality', async ({ page }) => {
    await page.goto('/datasets');

    // Set valid demo CSV file on input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(demoCsvPath);

    // Verify success banner appears
    const successBanner = page.locator('text=Ingestion Succeeded');
    await expect(successBanner).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Successfully ingested')).toBeVisible();

    // Verify Column Schema & Quality Audit panel displays expected values
    await expect(page.getByText('Column Schema & Quality Audit')).toBeVisible();
    await expect(page.locator('text=temperature_bearing_c').first()).toBeVisible();
    await expect(page.locator('text=vibration_drive_end_g').first()).toBeVisible();
    await expect(page.locator('text=pressure_feed_bar').first()).toBeVisible();

    // Verify Tabular Preview renders actual rows
    await expect(page.getByText('Actual Dataset Row Preview')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });
});
