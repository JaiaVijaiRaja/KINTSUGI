import { test, expect } from '@playwright/test';

test.describe('Test Journey G: Evaluation Center & Benchmarking Engine', () => {
  test('G-01: Configures Mode A synthetic benchmark, executes run, and verifies precision/recall/RMSE and confusion matrix', async ({ page }) => {
    // Evaluation benchmark can take a few seconds to inject faults and evaluate
    test.setTimeout(60000);

    await page.goto('/evaluation');

    // 1. Verify Page Header renders
    await expect(page.getByRole('heading', { name: /Evaluation Center & Benchmarking Engine/i })).toBeVisible({ timeout: 10000 });

    // 2. Open Benchmark Studio tab
    const benchmarkStudioTab = page.getByRole('button', { name: /Benchmark Studio/i });
    await expect(benchmarkStudioTab).toBeVisible();
    await benchmarkStudioTab.click();

    // 3. Verify Mode A is selected by default
    await expect(page.getByText('Mode A: Controlled Fault-Injection Benchmark')).toBeVisible();

    // 4. Trigger evaluation run
    const startBtn = page.getByRole('button', { name: /Start Evaluation/i });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    // 5. Verify run completes and Overview tab displays metrics
    await expect(page.getByText('Detection Accuracy', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Reconstruction Error', { exact: true })).toBeVisible();
    await expect(page.getByText('Evidence Confidence', { exact: true })).toBeVisible();

    // Check key quantitative metrics
    await expect(page.getByText('Harmonic F1-Score')).toBeVisible();
    await expect(page.getByText('Precision:', { exact: true })).toBeVisible();
    await expect(page.getByText('Recall (TPR):', { exact: true })).toBeVisible();
    await expect(page.getByText('Root Mean Squared (RMSE)')).toBeVisible();

    // 6. Switch to Visual Analytics tab to check Confusion Matrix
    const visualsTab = page.getByRole('button', { name: /Visual Analytics/i });
    await visualsTab.click();

    await expect(page.getByText('Observation-Level Confusion Matrix')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('True Positives (TP)')).toBeVisible();
    await expect(page.getByText('True Negatives (TN)')).toBeVisible();
    await expect(page.getByText('False Positives (FP)')).toBeVisible();
    await expect(page.getByText('False Negatives (FN)')).toBeVisible();

    // 7. Check Methodology tab for anti-fabrication standards
    const methodologyTab = page.getByRole('button', { name: /Methodology & Math/i });
    await methodologyTab.click();
    await expect(page.getByText('Zero Fabricated Metrics & Strict Ground-Truth Preservation')).toBeVisible();
  });
});
