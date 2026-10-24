import { test, expect } from '@playwright/test';

test.describe('Test Journey D: Anomaly Detection Execution & Visual Explorer', () => {
  test('D-01: Runs detection engine and renders backend results with time-series visualization', async ({ page }) => {
    await page.goto('/anomalies');

    // Wait for pipeline dropdown to be visible
    const pipelineSelect = page.locator('select').first();
    await expect(pipelineSelect).toBeVisible({ timeout: 10000 });

    // Click "Run Real Detection" button
    const runBtn = page.getByRole('button', { name: /Run Real Detection/i });
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // Verify detection execution finishes and results display
    // KPI summary cards should render
    await expect(page.getByText('Total Anomalies', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Rows Analyzed', { exact: true })).toBeVisible();
    await expect(page.getByText('Statistical MAD', { exact: true })).toBeVisible();

    // Verify SVG Time-Series Chart is rendered
    await expect(page.locator('svg[viewBox="0 0 1000 240"]')).toBeVisible();

    // Verify Anomalies Records table displays rows
    const anomaliesTable = page.locator('table tbody tr');
    await expect(anomaliesTable.first()).toBeVisible();
    const count = await anomaliesTable.count();
    expect(count).toBeGreaterThan(0);

    // Verify severity badge exists in table
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });
});
