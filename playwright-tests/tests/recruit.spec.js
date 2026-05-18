// @ts-check
// Recruit page smoke tests — modals, add applicant, filter, status change
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const screenshotsDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

test.describe('Recruit page', () => {
    test('loads and shows applicant list', async ({ page }) => {
        await page.goto('/recruit.html');
        await expect(page).not.toHaveURL(/login\.html/);
        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-00-loaded.png') });

        // heading visible
        await expect(page.locator('h3', { hasText: 'Applicants' })).toBeVisible();

        // status filter dropdown visible
        const filter = page.locator('#status-filter');
        await expect(filter).toBeVisible();
        await expect(filter).toHaveValue('pending');
    });

    test('status filter dropdown works', async ({ page }) => {
        await page.goto('/recruit.html');
        const filter = page.locator('#status-filter');

        // Switch to "all" and back
        await filter.selectOption('all');
        await expect(filter).toHaveValue('all');

        await filter.selectOption('pending');
        await expect(filter).toHaveValue('pending');
    });

    test('Add Applicant button opens modal', async ({ page }) => {
        await page.goto('/recruit.html');
        // The button is officer-only (hidden by default, shown after auth)
        const addBtn = page.locator('#add-applicant-btn');
        await expect(addBtn).toBeVisible({ timeout: 6000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-01-before-modal.png') });

        await addBtn.click();

        const modal = page.locator('#applicant-modal');
        await expect(modal).toBeVisible({ timeout: 5000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-02-modal-open.png') });
    });

    test('modal form fields are interactable', async ({ page }) => {
        await page.goto('/recruit.html');
        await page.locator('#add-applicant-btn').click();
        await expect(page.locator('#applicant-modal')).toBeVisible({ timeout: 5000 });

        // Fill in name
        await page.fill('#modal-name', 'TestApplicant');
        await expect(page.locator('#modal-name')).toHaveValue('TestApplicant');

        // Fill in power
        await page.fill('#modal-power', '3000000');
        await expect(page.locator('#modal-power')).toHaveValue('3000000');

        // Status select works
        const statusSelect = page.locator('#modal-status');
        await expect(statusSelect).toBeVisible();
        await statusSelect.selectOption('on_trial');
        // Trial date group should appear
        await expect(page.locator('#modal-trial-group')).toBeVisible();

        await statusSelect.selectOption('rejected');
        // Rejection group should appear (officer is admin)
        await expect(page.locator('#modal-rejection-group')).toBeVisible();

        await statusSelect.selectOption('pending');
        await expect(page.locator('#modal-trial-group')).not.toBeVisible();
        await expect(page.locator('#modal-rejection-group')).not.toBeVisible();

        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-03-modal-filled.png') });
    });

    test('cancel button closes modal', async ({ page }) => {
        await page.goto('/recruit.html');
        await page.locator('#add-applicant-btn').click();
        await expect(page.locator('#applicant-modal')).toBeVisible({ timeout: 5000 });

        await page.locator('#modal-cancel-btn').click();
        await expect(page.locator('#applicant-modal')).not.toBeVisible();
    });

    test('overlay click closes modal', async ({ page }) => {
        await page.goto('/recruit.html');
        await page.locator('#add-applicant-btn').click();
        await expect(page.locator('#applicant-modal')).toBeVisible({ timeout: 5000 });

        // Click the overlay (outside modal-content box)
        await page.locator('#applicant-modal').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#applicant-modal')).not.toBeVisible();
    });

    test('can add a new applicant', async ({ page }) => {
        await page.goto('/recruit.html');
        await page.locator('#add-applicant-btn').click();
        await expect(page.locator('#applicant-modal')).toBeVisible({ timeout: 5000 });

        const name = `E2E_${Date.now()}`;
        await page.fill('#modal-name', name);
        await page.fill('#modal-power', '8000000');
        await page.fill('#modal-rank', 'R3');
        await page.locator('#modal-save-btn').click();

        // Modal closes and toast appears
        await expect(page.locator('#applicant-modal')).not.toBeVisible({ timeout: 8000 });

        // Applicant appears in the list (switch to all to be sure)
        await page.locator('#status-filter').selectOption('all');
        await expect(page.locator('#applicant-list')).toContainText(name, { timeout: 8000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-04-applicant-added.png') });
    });

    test('change status modal works', async ({ page }) => {
        // First add an applicant to work with
        await page.goto('/recruit.html');
        await page.locator('#add-applicant-btn').click();
        await expect(page.locator('#applicant-modal')).toBeVisible({ timeout: 5000 });

        const name = `E2E_Status_${Date.now()}`;
        await page.fill('#modal-name', name);
        await page.locator('#modal-save-btn').click();
        await expect(page.locator('#applicant-modal')).not.toBeVisible({ timeout: 8000 });

        // The newly added applicant should be visible in pending filter
        await expect(page.locator('#applicant-list')).toContainText(name, { timeout: 8000 });

        // Click "Change status" for this applicant
        const row = page.locator('#applicant-list').locator('.recommendation-item', { hasText: name }).first();
        await row.locator('.secondary-btn').click();

        const statusModal = page.locator('#status-modal');
        await expect(statusModal).toBeVisible({ timeout: 5000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-05-status-modal.png') });

        // Change to on_trial
        await page.locator('#status-select').selectOption('on_trial');
        await expect(page.locator('#status-trial-group')).toBeVisible();

        await page.locator('#status-confirm-btn').click();
        await expect(statusModal).not.toBeVisible({ timeout: 8000 });

        // Switch filter to see on_trial
        await page.locator('#status-filter').selectOption('on_trial');
        await expect(page.locator('#applicant-list')).toContainText(name, { timeout: 8000 });
        await page.screenshot({ path: path.join(screenshotsDir, 'recruit-06-status-changed.png') });
    });
});
