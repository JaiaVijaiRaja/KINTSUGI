import { test, expect } from '@playwright/test';

test.describe('Test Journey C: Pipeline Configuration & Validation', () => {
  test('C-01: Selects dataset, defines sensor roles, validates and saves pipeline', async ({ page }) => {
    await page.goto('/pipeline');

    // Verify dataset dropdown is loaded and select first available dataset
    const datasetSelect = page.locator('select').first();
    await expect(datasetSelect).toBeVisible();

    const options = await datasetSelect.locator('option').all();
    expect(options.length).toBeGreaterThan(0);

    // Fill configuration name
    const configNameInput = page.locator('input[placeholder*="Turbine"]');
    await configNameInput.fill('E2E Automated Gas Turbine Pipeline');

    // Click Auto-Assign Recommended Roles if available to set valid roles
    const autoAssignBtn = page.getByRole('button', { name: /Auto-Assign Recommended Roles|Auto-Assign/i });
    if (await autoAssignBtn.isVisible()) {
      await autoAssignBtn.click();
    }

    // Click Validate Configuration
    const validateBtn = page.getByRole('button', { name: 'Validate' });
    await expect(validateBtn).toBeVisible();
    await validateBtn.click();

    // Verify Validation Results panel appears
    await expect(page.locator('text=Configuration Valid').first()).toBeVisible({ timeout: 10000 });

    // Click Save Configuration
    const saveBtn = page.getByRole('button', { name: 'Save Configuration' });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify save success message
    await expect(page.locator('text=Configuration Saved')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Proceed to Anomaly Detection')).toBeVisible();

    // Open Saved Configs drawer and confirm saved pipeline appears
    const savedConfigsBtn = page.getByRole('button', { name: /Saved Configs/i });
    await savedConfigsBtn.click();
    await expect(page.getByText('E2E Automated Gas Turbine Pipeline').first()).toBeVisible();
  });
});
