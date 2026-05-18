// @ts-check
// VS Points OCR test — uploads the real NvSP ranking screenshot and verifies
// that the OCR pipeline correctly extracts the 6 player records.
//
// The API endpoint returns:
//   { day, week_date, success_count, updated_members, not_found_members? }
//
// "updated_members" = players matched to the DB and saved
// "not_found_members" = players extracted by OCR but not found in the DB
//
// We check the UNION of both lists so the test is independent of DB state.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_PATH = path.join('C:\\', 'Users', 'verve', 'Downloads', 'Screenshot 2026-05-14 121351.png');
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

// The 6 expected player names as extracted by the OCR pipeline.
// Some may be fuzzy-matched to different DB names; we allow partial match.
const EXPECTED_NAMES = ['Reddy sri', 'rahuld', 'Patrick', 'Bandita2291', 'COL Geo222', 'CAIOVLF'];
const EXPECTED_DAY = 'wednesday'; // screenshot is May 14, 2026 (Thursday) but the tab shown may differ

test.describe('VS Points OCR - screenshot upload', () => {
  test('extracts 6 players and detects the day from NvSP ranking screenshot', async ({ page }) => {
    if (!fs.existsSync(SCREENSHOT_PATH)) {
      test.skip(true, `Screenshot not found at ${SCREENSHOT_PATH}`);
    }

    // Navigate to vs.html first to ensure the auth session is active
    await page.goto('/vs.html');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    expect(page.url(), 'Expected to stay on vs.html (not redirected to login)').not.toContain('login.html');

    // POST the screenshot to the OCR endpoint.
    // page.request shares cookies with the browser context → authenticated.
    const imageBuffer = fs.readFileSync(SCREENSHOT_PATH);
    const response = await page.request.post('/api/vs-points/process-screenshot', {
      multipart: {
        image: {
          name: 'screenshot.png',
          mimeType: 'image/png',
          buffer: imageBuffer,
        },
      },
    });

    const body = await response.text();
    expect(response.status(), `API error ${response.status()}: ${body}`).toBe(200);

    const data = JSON.parse(body);

    // ── Day detection ───────────────────────────────────────────────────────
    expect(data.day, 'Day was not detected from the screenshot').toBeTruthy();
    console.log(`Detected day: ${data.day}`);

    // ── Player extraction ───────────────────────────────────────────────────
    // Combine DB-matched members + OCR-found-but-unmatched members
    const updated = data.updated_members || [];
    const notFound = data.not_found_members || [];
    const allExtracted = [...updated, ...notFound];

    console.log(`Extracted ${allExtracted.length} players: ${allExtracted.join(', ')}`);
    if (notFound.length > 0) {
      console.log(`  Not in DB: ${notFound.join(', ')}`);
    }

    // Must have found at least 5 of the 6 expected players
    expect(
      allExtracted.length,
      `Expected ≥5 extracted players, got ${allExtracted.length}: [${allExtracted.join(', ')}]`
    ).toBeGreaterThanOrEqual(5);

    // Each expected name must appear in the extracted list (case-insensitive,
    // allowing for DB fuzzy-match aliases).
    const lowerExtracted = allExtracted.map(n => n.toLowerCase());
    for (const name of EXPECTED_NAMES) {
      const found = lowerExtracted.some(
        n => n.includes(name.toLowerCase()) || name.toLowerCase().includes(n)
      );
      expect(found, `Expected "${name}" in extracted list [${allExtracted.join(', ')}]`).toBeTruthy();
    }

    // Save a screenshot of the page for visual inspection
    await page.screenshot({ path: path.join(screenshotsDir, '20-vs-ocr-result.png') });
  });
});
