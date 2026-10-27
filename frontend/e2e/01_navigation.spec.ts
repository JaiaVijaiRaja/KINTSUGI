import { test, expect } from '@playwright/test';

test.describe('Test Journey A: Application Navigation & Route Integrity', () => {
  test('A-01: Main page loads and redirects to overview or displays overview', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*overview/);
    await expect(page.locator('h1')).toContainText('System Dashboard');
  });

  test('A-02: All 8 core production routes render expected headings', async ({ page }) => {
    const pages = [
      { path: '/overview', heading: 'System Dashboard', label: 'Dashboard' },
      { path: '/datasets', heading: 'Dataset Management', label: 'Dataset Management' },
      { path: '/pipeline', heading: 'Pipeline Configuration', label: 'Pipeline Configuration' },
      { path: '/anomalies', heading: 'Anomaly Explorer', label: 'Anomaly Explorer' },
      { path: '/reconstruction', heading: 'Reconstruction Studio', label: 'Reconstruction Studio' },
      { path: '/audit', heading: 'Audit Trail & Explainability Engine', label: 'Audit Trail' },
      { path: '/evaluation', heading: 'Evaluation Center', label: 'Evaluation Center' },
      { path: '/demos', heading: 'Live Demonstrations', label: 'Live Demonstrations' },
      { path: '/settings', heading: 'Settings & System Information', label: 'Settings & System Info' },
    ];

    for (const p of pages) {
      await page.goto(p.path);
      await expect(page).toHaveURL(new RegExp(`.*${p.path}`));
      await expect(page.locator('h1')).toContainText(p.heading);
      // Verify sidebar navigation highlights active button with aria-current="page"
      const activeButton = page.locator('aside button[aria-current="page"]');
      await expect(activeButton).toContainText(p.label);
    }
  });

  test('A-03: Unknown routes display 404 Not Found with recovery navigation', async ({ page }) => {
    await page.goto('/unknown-nonexistent-path-test');
    await expect(page.locator('h1')).toContainText('Page Not Located');
    await expect(page.getByText('Route Not Found')).toBeVisible();

    // Click Return to Dashboard
    const returnBtn = page.getByRole('button', { name: 'Return to Dashboard' });
    await expect(returnBtn).toBeVisible();
    await returnBtn.click();
    await expect(page).toHaveURL(/.*overview/);
    await expect(page.locator('h1')).toContainText('System Dashboard');
  });
});
