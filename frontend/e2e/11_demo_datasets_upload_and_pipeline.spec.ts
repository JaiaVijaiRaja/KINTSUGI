import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Test Journey K: Demo 1 & Demo 2 Industrial Datasets Upload & Pipeline Verification', () => {
  const demo1Path = path.resolve(process.cwd(), '../demo_data/demo_1_industrial_recoverable_faults.csv');
  const demo2Path = path.resolve(process.cwd(), '../demo_data/demo_2_industrial_ambiguous_faults.csv');

  test('K-01: Uploads Demo 1 recoverable faults CSV and verifies schema, rows, and sensors', async ({ page }) => {
    await page.goto('/datasets');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(demo1Path);

    // 1. Verify Ingestion Succeeded with genuine filename and row/col counts
    const successBanner = page.locator('text=Ingestion Succeeded');
    await expect(successBanner).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('demo_1_industrial_recoverable_faults.csv').first()).toBeVisible();
    await expect(page.getByText('240 rows').first()).toBeVisible();
    await expect(page.getByText('5 columns').first()).toBeVisible();

    // 2. Verify Schema Audit shows genuine industrial channel names
    await expect(page.getByText('Column Schema & Quality Audit')).toBeVisible();
    await expect(page.locator('text=TURBINE_TEMP_A').first()).toBeVisible();
    await expect(page.locator('text=PRESSURE_PSI_B').first()).toBeVisible();
    await expect(page.locator('text=VIBRATION_MM_S').first()).toBeVisible();
    await expect(page.locator('text=FLOW_RATE_L_MIN').first()).toBeVisible();

    // 3. Verify Preview Table
    await expect(page.getByText('Actual Dataset Row Preview')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('K-02: Uploads Demo 2 ambiguous faults CSV and verifies schema, rows, and sensors', async ({ page }) => {
    await page.goto('/datasets');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(demo2Path);

    // 1. Verify Ingestion Succeeded with genuine filename and row/col counts
    const successBanner = page.locator('text=Ingestion Succeeded');
    await expect(successBanner).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('demo_2_industrial_ambiguous_faults.csv').first()).toBeVisible();
    await expect(page.getByText('240 rows').first()).toBeVisible();
    await expect(page.getByText('5 columns').first()).toBeVisible();

    // 2. Verify Schema Audit
    await expect(page.getByText('Column Schema & Quality Audit')).toBeVisible();
    await expect(page.locator('text=TURBINE_TEMP_A').first()).toBeVisible();
    await expect(page.locator('text=FLOW_RATE_L_MIN').first()).toBeVisible();
  });

  test('K-03: Full pipeline execution and reconstruction export for Demo 1', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Pipeline Configuration
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    // Select Demo 1 in dataset selector
    const datasetSelect = page.locator('select').first();
    await expect(datasetSelect).toBeVisible({ timeout: 10000 });
    const options = await datasetSelect.locator('option').allInnerTexts();
    const demo1Option = options.find((opt) => opt.includes('demo_1_industrial_recoverable_faults.csv'));
    if (demo1Option) {
      await datasetSelect.selectOption({ label: demo1Option });
    }

    // Set configuration name
    const configNameInput = page.locator('input[placeholder*="Turbine"]');
    if (await configNameInput.isVisible()) {
      await configNameInput.fill('Demo 1 Industrial Verification Pipeline');
    }

    // Auto-assign sensor roles if button present
    const autoAssignBtn = page.getByRole('button', { name: /Auto-Assign Recommended Roles|Auto-Assign/i });
    if (await autoAssignBtn.isVisible()) {
      await autoAssignBtn.click();
    }

    // Validate configuration
    const validateBtn = page.getByRole('button', { name: 'Validate' });
    await expect(validateBtn).toBeVisible({ timeout: 10000 });
    await validateBtn.click();
    await expect(page.locator('text=Configuration Valid').first()).toBeVisible({ timeout: 10000 });

    // Save configuration
    const saveBtn = page.getByRole('button', { name: 'Save Configuration' });
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click();
    await expect(page.locator('text=Configuration Saved').first()).toBeVisible({ timeout: 10000 });

    // 2. Anomaly Detection
    await page.goto('/anomalies');
    await page.waitForLoadState('networkidle');

    const runDetectionBtn = page.getByRole('button', { name: /Run Real Detection/i });
    await expect(runDetectionBtn).toBeVisible({ timeout: 10000 });
    await runDetectionBtn.click();

    // Wait for real ML models to complete
    await expect(page.getByText('Total Anomalies', { exact: true })).toBeVisible({ timeout: 35000 });

    // 3. Reconstruction Studio
    await page.goto('/reconstruction');
    await page.waitForLoadState('networkidle');

    const startReconBtn = page.getByRole('button', { name: /Start Reconstruction Run/i });
    await expect(startReconBtn).toBeVisible({ timeout: 15000 });
    await expect(startReconBtn).toBeEnabled({ timeout: 15000 });
    await startReconBtn.click();

    // Verify reconstruction results displayed
    await expect(page.getByText('Total Evaluated', { exact: true })).toBeVisible({ timeout: 35000 });

    // Verify Export Repaired CSV button is enabled
    const exportBtn = page.getByRole('button', { name: /Export Repaired CSV/i });
    await expect(exportBtn).toBeVisible({ timeout: 15000 });
    await expect(exportBtn).toBeEnabled();
  });
});
