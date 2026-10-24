import { test, expect } from '@playwright/test';

test.describe('Test Journey E: Reconstruction and Abstention Workflow', () => {
  test('E-01: Executes reconstruction, displays candidate repairs, verifies status breakdown and evidence inspection', async ({ page }) => {
    await page.goto('/reconstruction');

    // 1. Verify Reconstruction Studio renders
    await expect(page.getByRole('heading', { name: /Reconstruction Studio/i })).toBeVisible({ timeout: 10000 });

    // 2. Verify immutable source guarantee banner
    await expect(page.getByText('100% Immutable Source')).toBeVisible();
    await expect(page.getByText('Mandatory Abstention')).toBeVisible();

    // 3. Ensure pipeline and completed detection run are available in dropdowns
    const pipelineSelect = page.locator('select').first();
    await expect(pipelineSelect).toBeVisible();

    const detectionRunSelect = page.locator('select').nth(1);
    await expect(detectionRunSelect).toBeVisible();

    // 4. Click "Start Reconstruction Run" button
    const startBtn = page.getByRole('button', { name: /Start Reconstruction Run/i });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    // 5. Verify KPI Summary Cards appear
    await expect(page.getByText('Total Evaluated', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Estimates', { exact: true })).toBeVisible();
    await expect(page.getByText('Unresolved', { exact: true })).toBeVisible();
    await expect(page.getByText('Avg Confidence', { exact: true })).toBeVisible();

    // 6. Verify Table renders columns distinguishing Original vs Proposed values
    await expect(page.locator('th:has-text("Raw Original")')).toBeVisible();
    await expect(page.locator('th:has-text("Proposed")')).toBeVisible();
    await expect(page.locator('th:has-text("Final Value")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();

    // 7. Verify at least one row rendered in results table
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first()).toBeVisible();
    const rowCount = await tableRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // 8. Open Inspection Modal on first record
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.getByRole('button', { name: /Inspect/i }).click();

    // 9. Verify Inspector Modal displays evidence breakdown and original vs proposed comparison
    await expect(page.getByRole('heading', { name: /Evidence Inspector/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Evidence Factor Decomposition')).toBeVisible();
    await expect(page.getByText('Raw Original (Immutable)')).toBeVisible();

    // Close the modal
    const closeBtn = page.locator('div.fixed button:has(svg.lucide-x)').first();
    await closeBtn.click();
    await expect(page.getByRole('heading', { name: /Evidence Inspector/i })).not.toBeVisible();
  });
});
