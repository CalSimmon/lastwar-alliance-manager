// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const SCREENSHOTS_DIR = 'C:\\Users\\verve\\Downloads';

// Group screenshots by timestamp prefix
const groups = {
  '08.20.06': [
    'WhatsApp Image 2026-05-14 at 08.20.06.jpeg',
    'WhatsApp Image 2026-05-14 at 08.20.06 (1).jpeg',
    'WhatsApp Image 2026-05-14 at 08.20.06 (2).jpeg',
    'WhatsApp Image 2026-05-14 at 08.20.06 (3).jpeg',
  ],
  '08.21.15': [
    'WhatsApp Image 2026-05-14 at 08.21.15.jpeg',
    'WhatsApp Image 2026-05-14 at 08.21.15 (1).jpeg',
    'WhatsApp Image 2026-05-14 at 08.21.15 (2).jpeg',
    'WhatsApp Image 2026-05-14 at 08.21.15 (3).jpeg',
  ],
  '08.22.00': [
    'WhatsApp Image 2026-05-14 at 08.22.00.jpeg',
    'WhatsApp Image 2026-05-14 at 08.22.00 (1).jpeg',
  ],
  '08.22.01': [
    'WhatsApp Image 2026-05-14 at 08.22.01.jpeg',
    'WhatsApp Image 2026-05-14 at 08.22.01 (1).jpeg',
  ],
};

test.use({ storageState: path.join(__dirname, '..', 'auth.json') });

for (const [groupName, files] of Object.entries(groups)) {
  test(`MG OCR group ${groupName} (${files.length} screenshots)`, async ({ request }) => {
    console.log(`\n=== Group ${groupName} (${files.length} screenshots) ===`);

    // Test each screenshot individually to see per-image results
    const allNames = new Set();
    let eventDate = '';

    for (const fileName of files) {
      const imgPath = path.join(SCREENSHOTS_DIR, fileName);
      expect(fs.existsSync(imgPath), `File exists: ${fileName}`).toBeTruthy();

      const response = await request.post(`${BASE}/api/marshal-guard/process-screenshots`, {
        multipart: {
          'images[]': {
            name: fileName,
            mimeType: 'image/jpeg',
            buffer: fs.readFileSync(imgPath),
          },
        },
      });
      expect(response.status()).toBe(200);
      const data = await response.json();

      const count = data.participants ? data.participants.length : 0;
      console.log(`  📷 ${fileName.replace('WhatsApp Image 2026-05-14 at ', '')}: ${count} participants, date=${data.event_date || 'N/A'}`);

      if (data.event_date) eventDate = data.event_date;

      if (data.participants) {
        for (const p of data.participants) {
          const dmgStr = p.damage > 0 ? formatDamage(p.damage) : 'N/A';
          console.log(`     #${String(p.rank_in_event).padStart(2)}: ${p.name_snapshot.padEnd(22)} [${(p.alliance_tag || '??').padEnd(4)}] dmg=${dmgStr}`);
          allNames.add(p.name_snapshot);
        }
      }
    }

    console.log(`\n  📊 Total unique names across group: ${allNames.size}`);
    console.log(`  📅 Event date: ${eventDate}`);
    console.log(`  👤 Names: ${[...allNames].join(', ')}`);

    // Basic assertions
    expect(eventDate).toBeTruthy();
    expect(allNames.size).toBeGreaterThanOrEqual(3);
  });
}

function formatDamage(d) {
  if (d >= 1e9) return (d / 1e9).toFixed(2) + 'G';
  if (d >= 1e6) return (d / 1e6).toFixed(2) + 'M';
  if (d >= 1e3) return (d / 1e3).toFixed(2) + 'K';
  return String(d);
}
