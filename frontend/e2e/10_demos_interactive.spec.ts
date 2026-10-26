import { test, expect } from '@playwright/test';

test.describe('Test Journey J: Live Demonstrations (Demo 1 & Demo 2)', () => {
  test('J-01: Demo 1 Turbine Telemetry — Pipeline Execution, Observation Ledger & Statuses', async ({ page }) => {
    await page.goto('/demos');

    // 1. Verify page renders with title and badge
    await expect(page.locator('h1')).toContainText('Live Demonstrations');
    await expect(page.getByText('Demo 1: Self-Healing Telemetry')).toBeVisible();

    // 2. Click "Preview Dataset"
    const previewBtn = page.getByRole('button', { name: /Preview Dataset/i });
    await expect(previewBtn).toBeVisible();
    await previewBtn.click();

    // 3. Confirm preview table renders
    await expect(page.getByText('Prepared Dataset Preview', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Validation: Passed')).toBeVisible();

    // 4. Click "Execute Real Pipeline"
    const runBtn = page.getByRole('button', { name: /Execute Real Pipeline|Run Real Pipeline/i });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 5. Verify KPI Summary Cards appear upon completion
    await expect(page.getByText('Total Processed', { exact: true })).toBeVisible({ timeout: 35000 });
    await expect(page.getByText('Corrected (Accepted)', { exact: true })).toBeVisible();
    await expect(page.getByText('Unresolved (Abstained)', { exact: true })).toBeVisible();

    // 6. Verify Results Ledger Table
    await expect(page.getByText('Observation Results Ledger', { exact: false })).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // 7. Verify Status Filter buttons
    const correctedBtn = page.getByRole('button', { name: 'CORRECTED', exact: true });
    await expect(correctedBtn).toBeVisible();
    await correctedBtn.click();

    // 8. Verify Export Buttons are present
    const exportCsvBtn = page.getByRole('button', { name: /Export Repaired CSV/i });
    await expect(exportCsvBtn).toBeVisible();
    const exportAuditBtn = page.getByRole('button', { name: /Export Audit Trail/i });
    await expect(exportAuditBtn).toBeVisible();
  });

  test('J-02: Demo 2 Trust, Abstention, Benchmark & Error Recovery', async ({ page }) => {
    await page.goto('/demos');

    // 1. Switch to Demo 2 tab
    const demo2Tab = page.getByText('Demo 2: Trust, Abstention & Evaluation');
    await expect(demo2Tab).toBeVisible();
    await demo2Tab.click();

    // 2. Verify Demo 2 scenario title
    await expect(page.getByText('Demo 2 — Trust, Abstention, Evaluation & Error Recovery')).toBeVisible();

    // 3. Run Pipeline for Demo 2
    const runBtn = page.getByRole('button', { name: /Execute Real Pipeline|Run Real Pipeline/i });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 4. Verify completion and check abstention metrics
    await expect(page.getByText('Unresolved (Abstained)', { exact: true })).toBeVisible({ timeout: 35000 });

    // 5. Run Ground Truth Benchmark (Mode A)
    const benchmarkBtn = page.getByRole('button', { name: /Run Benchmark/i });
    await expect(benchmarkBtn).toBeVisible();
    await benchmarkBtn.click();

    // Verify benchmark metrics display
    await expect(page.getByText('Detection F1 Score', { exact: true })).toBeVisible({ timeout: 25000 });
    await expect(page.getByText('Repair MAE', { exact: true })).toBeVisible();

    // 6. Safe Error Recovery Sandbox Tests
    const testNonCsvBtn = page.getByRole('button', { name: /Test Non-CSV Upload/i });
    await expect(testNonCsvBtn).toBeVisible();
    await testNonCsvBtn.click();

    // Verify clear user-facing error message appears without tracebacks
    await expect(page.getByText('Simulated Error Response (Safe Recovery Verified)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Traceback Exposed: false')).toBeVisible();

    // Test Empty File
    const testEmptyBtn = page.getByRole('button', { name: /Test Empty File/i });
    await expect(testEmptyBtn).toBeVisible();
    await testEmptyBtn.click();
    await expect(page.getByText('Traceback Exposed: false')).toBeVisible();
  });
});
