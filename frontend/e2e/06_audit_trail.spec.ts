import { test, expect } from '@playwright/test';

test.describe('Test Journey F: Audit Trail & Cryptographic Hash Chain', () => {
  test('F-01: Verifies audit ledger events and cryptographic SHA-256 hash chain integrity', async ({ page }) => {
    await page.goto('/audit');

    // 1. Verify Page renders
    await expect(page.getByRole('heading', { name: /Audit Trail & Explainability Engine/i })).toBeVisible({ timeout: 10000 });

    // 2. Verify Audit Ledger Table displays persisted events
    const eventTable = page.locator('table tbody tr');
    await expect(eventTable.first()).toBeVisible({ timeout: 10000 });
    const eventCount = await eventTable.count();
    expect(eventCount).toBeGreaterThan(0);

    // 3. Verify event row contains real operation details
    await expect(page.locator('th:has-text("Seq #")')).toBeVisible();
    await expect(page.locator('th:has-text("Event Type")')).toBeVisible();

    // 4. Click "Inspect Event" on first row to open detail modal
    const inspectBtn = page.getByTitle('Inspect Full Event').first();
    await inspectBtn.click();

    // Verify Event Detail Modal displays Event ID and Signal Transition
    await expect(page.getByText('Signal Transition')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Event ID', { exact: true })).toBeVisible();

    // Close detail modal
    const closeBtn = page.locator('div.fixed button').first();
    await closeBtn.click();
    await expect(page.getByText('Signal Transition')).not.toBeVisible();

    // 5. Test Cryptographic Hash Chain Verification
    const verifyChainBtn = page.getByRole('button', { name: /Verify Ledger Chain/i });
    await expect(verifyChainBtn).toBeVisible();
    await verifyChainBtn.click();

    // 6. Verify Hash Chain Verification displays intact banner and digests
    await expect(page.getByText('Ledger Hash Chain Verified Intact')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Events Verified')).toBeVisible();
    await expect(page.getByText('Genesis Digest')).toBeVisible();
    await expect(page.getByText('Latest Block Digest')).toBeVisible();
  });
});
