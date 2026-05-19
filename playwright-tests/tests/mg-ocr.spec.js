// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE = 'http://localhost:8080';
const SCREENSHOTS_DIR = 'C:\\Users\\verve\\Downloads';

test.describe('Marshal Guard OCR', () => {
  test.use({ storageState: path.join(__dirname, '..', 'auth.json') });

  test('uploads screenshots and extracts participants via OCR', async ({ page }) => {
    await page.goto(`${BASE}/marshal-guard.html`);
    await page.waitForLoadState('networkidle');

    // Click "Add Event" button
    const addBtn = page.locator('#add-event-btn');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Switch to upload tab in modal
    const uploadTab = page.locator('[data-modal-tab="upload"]');
    await uploadTab.click();

    // Upload screenshots via file input
    const fileInput = page.locator('#mg-image-input');
    const screenshots = [
      path.join(SCREENSHOTS_DIR, 'WhatsApp Image 2026-05-14 at 08.20.06.jpeg'),
      path.join(SCREENSHOTS_DIR, 'WhatsApp Image 2026-05-14 at 08.20.06 (1).jpeg'),
      path.join(SCREENSHOTS_DIR, 'WhatsApp Image 2026-05-14 at 08.20.06 (2).jpeg'),
      path.join(SCREENSHOTS_DIR, 'WhatsApp Image 2026-05-14 at 08.20.06 (3).jpeg'),
    ];
    await fileInput.setInputFiles(screenshots);

    // Verify files are shown in preview
    await expect(page.locator('#mg-files-count')).toContainText('4 files selected');

    // Click process button and wait for OCR response
    const processBtn = page.locator('#mg-process-btn');
    await expect(processBtn).toBeVisible();

    // Listen for the API response
    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes('/api/marshal-guard/process-screenshots') && resp.status() === 200
    );

    await processBtn.click();

    // Wait for OCR (may take a while with Tesseract)
    const response = await responsePromise;
    const data = await response.json();

    console.log('OCR Response:', JSON.stringify(data, null, 2));
    console.log(`Participants found: ${data.participants ? data.participants.length : 0}`);

    if (data.participants && data.participants.length > 0) {
      console.log('--- Participants ---');
      for (const p of data.participants) {
        console.log(`  #${p.rank_in_event}: ${p.name_snapshot} [${p.alliance_tag || ''}] = ${p.damage} ${p.member_id ? '✅' + p.member_name : '❌'}`);
      }
    }

    // We expect at least some participants to be extracted
    expect(data.participants).not.toBeNull();
    expect(data.participants.length).toBeGreaterThan(3);

    // Verify OCR preview modal appears
    await expect(page.locator('#ocr-preview-modal')).toBeVisible({ timeout: 30000 });
  });

  test('API direct: single screenshot OCR', async ({ request }) => {
    const fs = require('fs');
    const imgPath = path.join(SCREENSHOTS_DIR, 'WhatsApp Image 2026-05-14 at 08.20.06.jpeg');
    
    const response = await request.post(`${BASE}/api/marshal-guard/process-screenshots`, {
      multipart: {
        'images[]': {
          name: 'mg1.jpeg',
          mimeType: 'image/jpeg',
          buffer: fs.readFileSync(imgPath),
        },
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    console.log('Direct API OCR Response:', JSON.stringify(data, null, 2));
    console.log(`Participants found: ${data.participants ? data.participants.length : 0}`);

    if (data.participants) {
      for (const p of data.participants) {
        console.log(`  #${p.rank_in_event}: "${p.name_snapshot}" [${p.alliance_tag || ''}] dmg=${p.damage}`);
      }
    }

    expect(data.participants).not.toBeNull();
    expect(data.participants.length).toBeGreaterThan(0);
  });
});
