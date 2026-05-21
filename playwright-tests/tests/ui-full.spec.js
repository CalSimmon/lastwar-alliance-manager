// @ts-check
/**
 * Full UI sweep — every page, all safe buttons, visual + JS-error checks.
 * Takes before/after screenshots into screenshots/ui-full/.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SS_DIR = path.join(__dirname, '..', 'screenshots', 'ui-full');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────

/** Attach console/pageerror collectors; returns the errors array. */
function watchErrors(page) {
  const errors = [];
  const IGNORE = ['favicon', '401', 'ERR_BLOCKED', 'Failed to load resource', '403 (Forbidden)'];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!IGNORE.some(s => t.includes(s))) errors.push('[console] ' + t);
  });
  page.on('pageerror', e => errors.push('[pgerr] ' + e.message));
  return errors;
}

/** Dismiss any visible modal/overlay with Escape, then wait a moment. */
async function dismissModals(page) {
  const overlay = page.locator(
    '.modal-overlay:visible, .modal:visible, [role="dialog"]:visible'
  ).first();
  if (await overlay.count() > 0) {
    // Try cancel / close button first
    const cancelBtn = overlay.locator(
      'button:has-text("Cancel"), button:has-text("Close"), .close-btn, .modal-close'
    ).first();
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click({ timeout: 2000 }).catch(() => {});
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }
}

/**
 * Snapshot visible safe button identifiers, then click each UNIQUE one (deduped by text).
 * Skips table-row action buttons to avoid clicking 30 identical "Edit" buttons.
 * Re-queries by selector each time to avoid stale handles.
 */
async function clickSafeButtons(page, baseUrl) {
  const SKIP_TEXT = /^(delete|remove|archive|log.?out|discard|purge|yes[,\s]|confirm\s*delete|reset pass)/i;
  // Also skip buttons that trigger heavy API mutations or state changes
  const SKIP_IDS  = /logout|confirm-reset|confirm-csv|delete-user|submit-btn|theme-toggle|nav-toggle|mobile-menu|auto-schedule|draw-conductor|draw-vip|generate-message|generate-daily|generate-conductor/i;

  // Collect identifiers BEFORE interacting — deduplicate by text/id key;
  // skip buttons inside <tr> (row-level repeat actions like per-member Edit).
  const btnDefs = await page.evaluate(() => {
    const skipText = /^(delete|remove|archive|log.?out|discard|purge|yes[,\s]|confirm\s*delete|reset pass)/i;
    const skipId   = /logout|confirm-reset|confirm-csv|delete-user|submit-btn|theme-toggle|nav-toggle|mobile-menu|auto-schedule|draw-conductor|draw-vip|generate-message|generate-daily|generate-conductor/i;
    const seen = new Set();
    return Array.from(document.querySelectorAll('button')).map(b => {
      const text = (b.textContent ?? '').trim().slice(0, 50);
      const id   = b.id;
      const box  = b.getBoundingClientRect();
      if (box.width < 3 || box.height < 3) return null;
      if (skipText.test(text)) return null;
      if (skipId.test(id)) return null;
      if (b.type === 'submit') return null;  // don't auto-submit forms
      if (b.closest('tr')) return null;  // skip per-row table action buttons
      if (b.className.includes('nav-link') || b.className.includes('theme-toggle')) return null;
      const key = id || text;
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return { id, text };
    }).filter(Boolean);
  });

  const clicked = [];
  for (const def of btnDefs) {
    let loc;
    if (def.id) {
      loc = page.locator(`#${def.id}`);
    } else if (def.text) {
      loc = page.locator('button').filter({ hasText: def.text }).first();
    } else {
      continue;
    }

    if (await loc.count() === 0) continue;
    const box = await loc.boundingBox().catch(() => null);
    if (!box || box.height < 3 || box.width < 3) continue;

    const prevUrl = page.url();
    await loc.click({ timeout: 3000, force: false }).catch(() => {});
    await page.waitForTimeout(350);

    // If we navigated away, go back
    if (page.url() !== prevUrl && page.url() !== baseUrl) {
      await page.goto(baseUrl);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    // Close any modal that appeared
    await dismissModals(page);

    clicked.push(def.text || def.id);
  }
  return clicked;
}

/** Check for layout / CSS visual regressions. */
async function checkLayout(page, name) {
  const issues = [];

  // 1. No horizontal overflow
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 10
  );
  if (overflow) issues.push(`Horizontal overflow`);

  // 2. Main content area has reasonable height
  const mainH = await page.evaluate(() => {
    const el = document.querySelector('main, .content-area, .main-content, .container');
    return el ? el.getBoundingClientRect().height : 0;
  });
  if (mainH > 0 && mainH < 50) issues.push(`Main content collapsed (${mainH}px)`);

  // 3. Every visible canvas has reasonable dimensions
  const canvases = page.locator('canvas:visible');
  const cCount = await canvases.count();
  for (let i = 0; i < cCount; i++) {
    const box = await canvases.nth(i).boundingBox();
    if (box && box.height < 30) {
      const id = await canvases.nth(i).getAttribute('id') ?? `canvas[${i}]`;
      issues.push(`Chart "${id}" too short: ${Math.round(box.height)}px`);
    }
  }

  // 4. No button with effectively zero size
  const btns = page.locator('button:visible');
  const bCount = await btns.count();
  for (let i = 0; i < bCount; i++) {
    const box = await btns.nth(i).boundingBox();
    if (box && (box.height < 5 || box.width < 5)) {
      const txt = (await btns.nth(i).textContent() ?? '').trim().slice(0, 30);
      issues.push(`Button "${txt}" has near-zero dimensions (${Math.round(box.width)}×${Math.round(box.height)})`);
    }
  }

  return issues;
}

/**
 * Check that chart heights stay stable (no growing loop).
 * Only flags charts that are ALREADY rendered (height > 20px) and then grow.
 * Ignores charts going from 0 → rendered (normal initial load).
 */
async function checkChartsStable(page, name) {
  const issues = [];
  const first = await page.evaluate(() =>
    Array.from(document.querySelectorAll('canvas')).map(c => ({ id: c.id, h: c.getBoundingClientRect().height }))
  );
  await page.waitForTimeout(1500);
  const second = await page.evaluate(() =>
    Array.from(document.querySelectorAll('canvas')).map(c => ({ id: c.id, h: c.getBoundingClientRect().height }))
  );
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    const growth = second[i].h - first[i].h;
    // Only flag if the chart was already rendered at the first snapshot (not just loading)
    if (first[i].h > 20 && growth > 5) {
      issues.push(`Chart "${first[i].id || i}" grew ${Math.round(growth)}px (growing loop)`);
    }
  }
  return issues;
}

// ── page definitions ──────────────────────────────────────────────────────────

const PAGES = [
  {
    name: 'Members', url: '/', slug: 'members',
    wait: '#members-list',
    interactions: async (page) => {
      // Open Add Member modal then close
      await page.click('#add-member-btn');
      await expect(page.locator('#member-modal')).toBeVisible({ timeout: 3000 });
      await page.click('#cancel-btn');
      await expect(page.locator('#member-modal')).toBeHidden({ timeout: 3000 });
      // Search
      await page.fill('#search-input', 'test');
      await page.waitForTimeout(300);
      await page.fill('#search-input', '');
      // Rank chips
      const chips = page.locator('.rank-chip, .filter-chip');
      if (await chips.count() > 0) await chips.first().click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'Train', url: '/train.html', slug: 'train',
    wait: '#week-display',
    interactions: async (page) => {
      // Week navigation
      await page.click('#prev-week');
      await page.waitForTimeout(200);
      await page.click('#today-week-btn');
      await page.waitForTimeout(200);
      await page.click('#next-week');
      await page.waitForTimeout(200);
      await page.click('#today-week-btn');
      // Switch view modes
      const listBtn = page.locator('#view-list-btn');
      if (await listBtn.count() > 0) { await listBtn.click(); await page.waitForTimeout(200); }
      const cardsBtn = page.locator('#view-cards-btn');
      if (await cardsBtn.count() > 0) { await cardsBtn.click(); await page.waitForTimeout(200); }
      // History filters
      await page.click('#show-all-history');
      await page.waitForTimeout(200);
      await page.click('#show-completed');
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'Awards', url: '/awards.html', slug: 'awards',
    wait: '.award-section, table, #awards-week-display',
    interactions: async (page) => {
      // Week nav
      const prev = page.locator('#prev-week');
      if (await prev.count() > 0) { await prev.click(); await page.waitForTimeout(200); }
      const today = page.locator('#today-week-btn');
      if (await today.count() > 0) { await today.click(); await page.waitForTimeout(200); }
    },
  },
  {
    name: 'Recommendations', url: '/recommendations.html', slug: 'recommendations',
    wait: 'main, .form-section',
    interactions: async (page) => {
      const listBtn = page.locator('#list-view-btn');
      if (await listBtn.count() > 0) await listBtn.click();
      await page.waitForTimeout(200);
      const groupBtn = page.locator('#grouped-view-btn');
      if (await groupBtn.count() > 0) await groupBtn.click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'Conduct', url: '/conduct.html', slug: 'conduct',
    wait: 'main, .form-section',
    interactions: async (page) => {
      const listBtn = page.locator('#list-view-btn');
      if (await listBtn.count() > 0) await listBtn.click();
      await page.waitForTimeout(200);
      const groupBtn = page.locator('#grouped-view-btn');
      if (await groupBtn.count() > 0) await groupBtn.click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'Rankings', url: '/rankings.html', slug: 'rankings',
    wait: '#rankings-tbody',
    interactions: async (page) => {
      await page.click('#refresh-btn');
      await page.waitForTimeout(500);
      // Search filter
      await page.fill('#filter-name', 'test');
      await page.waitForTimeout(300);
      await page.fill('#filter-name', '');
      // Sort dropdown
      const sortBy = page.locator('#sort-by');
      if (await sortBy.count() > 0) {
        await sortBy.selectOption({ index: 1 });
        await page.waitForTimeout(200);
        await sortBy.selectOption({ index: 0 });
      }
      // Rank chips
      const chips = page.locator('#rank-chips .rank-chip, #rank-chips .filter-chip').first();
      if (await chips.count() > 0) { await chips.click(); await page.waitForTimeout(200); }
      // Export CSV (just check no error)
      const exportBtn = page.locator('#export-csv-btn');
      if (await exportBtn.count() > 0) await exportBtn.click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'Storm', url: '/storm.html', slug: 'storm',
    wait: 'main, .container',
    interactions: async (page) => {
      await clickSafeButtons(page, 'http://localhost:8080/storm.html');
    },
  },
  {
    name: 'VS Points', url: '/vs.html', slug: 'vs',
    wait: 'main, table, .container',
    interactions: async (page) => {
      // Click the first safe button if any
      await clickSafeButtons(page, 'http://localhost:8080/vs.html');
    },
  },
  {
    name: 'VS Compliance', url: '/vs-compliance.html', slug: 'vs-compliance',
    wait: 'main, table, .container',
    interactions: async (page) => {
      // Search if present
      const search = page.locator('input[type="text"], input[type="search"]').first();
      if (await search.count() > 0) {
        await search.fill('test');
        await page.waitForTimeout(200);
        await search.fill('');
      }
    },
  },
  {
    name: 'Upload', url: '/upload.html', slug: 'upload',
    wait: 'select, form, main',
    interactions: async (page) => {
      // Switch upload type selector if present
      const sel = page.locator('select').first();
      if (await sel.count() > 0) {
        const opts = await sel.locator('option').count();
        for (let i = 0; i < Math.min(opts, 4); i++) {
          await sel.selectOption({ index: i });
          await page.waitForTimeout(200);
        }
      }
    },
  },
  {
    name: 'Settings', url: '/settings.html', slug: 'settings',
    wait: '.form-section, form',
    interactions: async (page) => {
      // Save rotation (safe — just persists current order)
      const saveRotBtn = page.locator('#save-rotation-btn');
      if (await saveRotBtn.count() > 0) {
        await saveRotBtn.click();
        await page.waitForTimeout(500);
        // Check status indicator appeared
        const status = page.locator('#rotation-save-status');
        if (await status.count() > 0) {
          const text = (await status.textContent() ?? '').trim();
          expect(text.length, 'Save rotation gave no feedback').toBeGreaterThan(0);
        }
      }
      // Add timezone button opens selector — close with Escape
      const addTzBtn = page.locator('#add-timezone-btn');
      if (await addTzBtn.count() > 0) {
        await addTzBtn.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    },
  },
  {
    name: 'Admin', url: '/admin.html', slug: 'admin',
    wait: '#users-list, #users-tab',
    interactions: async (page) => {
      // Switch tabs using the tab BUTTON elements (not the content divs)
      const loginsBtn = page.locator('button.tab-button:has-text("Login"), button.tab-btn:has-text("Login")');
      if (await loginsBtn.count() > 0) { await loginsBtn.click(); await page.waitForTimeout(300); }
      const usersBtn = page.locator('button.tab-button:has-text("User"), button.tab-btn:has-text("User")');
      if (await usersBtn.count() > 0) { await usersBtn.click(); await page.waitForTimeout(300); }
      // Search users
      const search = page.locator('#user-search');
      if (await search.count() > 0) {
        await search.fill('admin');
        await page.waitForTimeout(200);
        await search.fill('');
      }
    },
  },
  {
    name: 'Graveyard', url: '/graveyard.html', slug: 'graveyard',
    wait: 'main, table, .container',
    interactions: async (page) => {
      const search = page.locator('input[type="text"], input[type="search"]').first();
      if (await search.count() > 0) {
        await search.fill('test');
        await page.waitForTimeout(200);
        await search.fill('');
      }
    },
  },
  {
    name: 'Profile', url: '/profile.html', slug: 'profile',
    wait: '#pf-account-section',
    interactions: async (page) => {
      await expect(page.locator('#pf-account-section')).toBeVisible({ timeout: 8000 });
      const memberSection = page.locator('#pf-member-section');
      if (await memberSection.isVisible()) {
        // Radar + charts should be present
        await expect(page.locator('#pf-radar')).toBeVisible();
        await expect(page.locator('#pf-mg-chart')).toBeVisible();
        await expect(page.locator('#pf-vs-chart')).toBeVisible();
      }
    },
  },
  {
    name: 'Recruit', url: '/recruit.html', slug: 'recruit',
    wait: '#applicant-list',
    interactions: async (page) => {
      // Status filter
      const statusFilter = page.locator('#status-filter');
      if (await statusFilter.count() > 0) {
        const opts = await statusFilter.locator('option').count();
        for (let i = 0; i < opts; i++) {
          await statusFilter.selectOption({ index: i });
          await page.waitForTimeout(150);
        }
        await statusFilter.selectOption({ index: 0 });
      }
      // Open add applicant modal then cancel
      const addBtn = page.locator('#add-applicant-btn');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(300);
        const cancelBtn = page.locator('[id*="cancel"], button:has-text("Cancel")').first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
        await page.waitForTimeout(200);
      }
    },
  },
  {
    name: 'Participation', url: '/participation.html', slug: 'participation',
    wait: '#pt-summary-row',
    interactions: async (page) => {
      await expect(page.locator('#pt-total')).not.toHaveText('—', { timeout: 10000 });
      // Search
      await page.fill('#pt-search', 'test');
      await page.waitForTimeout(300);
      await page.fill('#pt-search', '');
      // Rank chips
      const chips = page.locator('#pt-rank-chips .rank-chip, #pt-rank-chips button');
      const chipCount = await chips.count();
      for (let i = 0; i < Math.min(chipCount, 5); i++) {
        await chips.nth(i).click();
        await page.waitForTimeout(150);
      }
    },
  },
  {
    name: 'Leadership', url: '/leadership.html', slug: 'leadership',
    wait: '#ld-summary-cards',
    interactions: async (page) => {
      await expect(page.locator('#ld-total-members')).not.toHaveText('—', { timeout: 10000 });
      // Wait for the full table to populate (renderFullTable must complete before event listeners are registered)
      await expect(page.locator('#ld-full-tbody tr').first()).toBeVisible({ timeout: 8000 });
      // Search leaderboard with a string that cannot match any real member
      await page.fill('#ld-search', 'zzz_NO_MATCH_xyz_999');
      await page.evaluate(() => document.getElementById('ld-search').dispatchEvent(new Event('input', { bubbles: true })));
      await page.waitForTimeout(400);
      await expect(page.locator('#ld-full-tbody tr')).toHaveCount(0, { timeout: 3000 });
      await page.fill('#ld-search', '');
      await page.waitForTimeout(300);
      await expect(page.locator('#ld-full-tbody tr').first()).toBeVisible({ timeout: 5000 });
      // Rank filter
      const rankSel = page.locator('#ld-rank-select');
      if (await rankSel.count() > 0) {
        await rankSel.selectOption('R5');
        await page.waitForTimeout(200);
        await rankSel.selectOption('');
        await page.waitForTimeout(200);
      }
    },
  },
  {
    name: 'Marshal Guard', url: '/marshal-guard.html', slug: 'marshal-guard',
    wait: '#event-list, #tab-events',
    interactions: async (page) => {
      // Tab switching — switch to stats first, interact, then switch to events
      const statsTab = page.locator('button.tab-btn[data-tab="stats"]');
      if (await statsTab.count() > 0) {
        await statsTab.click();
        await page.waitForTimeout(300);
        // Stats search is only visible while stats tab is active
        const statsSearch = page.locator('#stats-search');
        if (await statsSearch.isVisible()) {
          await statsSearch.fill('test');
          await page.waitForTimeout(200);
          await statsSearch.fill('');
        }
      }
      const eventsTab = page.locator('button.tab-btn[data-tab="events"]');
      if (await eventsTab.count() > 0) { await eventsTab.click(); await page.waitForTimeout(300); }
      // Open add event modal, cancel
      const addBtn = page.locator('#add-event-btn');
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    },
  },
];

// ── tests ─────────────────────────────────────────────────────────────────────

for (const pg of PAGES) {
  test.describe(`[UI] ${pg.name}`, () => {

    test('page loads, no JS errors, no layout issues', async ({ page }) => {
      const errors = watchErrors(page);

      await page.goto(pg.url);
      expect(page.url(), `${pg.name} redirected to login`).not.toContain('login.html');
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

      // Wait for key element if specified
      if (pg.wait) {
        await page.locator(pg.wait).first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
      }
      await page.waitForTimeout(1000); // let charts/data render

      // Screenshot: initial load
      await page.screenshot({
        path: path.join(SS_DIR, `${pg.slug}-load.png`),
        fullPage: true,
      });

      // Layout checks at initial state
      const layoutIssues = await checkLayout(page, pg.name);

      // Chart stability check (only if there are charts)
      const chartCount = await page.locator('canvas').count();
      const chartIssues = chartCount > 0 ? await checkChartsStable(page, pg.name) : [];

      // Nav must be visible
      await expect(page.locator('nav.nav-menu').first()).toBeVisible({ timeout: 5000 });

      // Run page-specific interactions
      if (pg.interactions) await pg.interactions(page);

      // Screenshot: after interactions
      await page.screenshot({
        path: path.join(SS_DIR, `${pg.slug}-after.png`),
        fullPage: true,
      });

      // Post-interaction layout check
      const postIssues = await checkLayout(page, pg.name);
      const allIssues = [...new Set([...layoutIssues, ...chartIssues, ...postIssues])];

      expect(errors, `JS errors on ${pg.name}:\n${errors.join('\n')}`).toHaveLength(0);
      expect(allIssues, `Visual issues on ${pg.name}:\n${allIssues.join('\n')}`).toHaveLength(0);
    });

    test('all safe buttons clickable without errors', async ({ page }) => {
      test.setTimeout(90000);
      const errors = watchErrors(page);

      await page.goto(pg.url);
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      if (pg.wait) {
        await page.locator(pg.wait).first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
      }
      await page.waitForTimeout(800);

      const clicked = await clickSafeButtons(page, `http://localhost:8080${pg.url}`);

      // Page should still be accessible (not stuck on login or blank)
      if (page.url().includes('login.html')) {
        // Navigated to login means session expired — refetch to confirm
        throw new Error(`${pg.name}: session lost after button clicks`);
      }

      // Screenshot after all button clicks
      await page.screenshot({
        path: path.join(SS_DIR, `${pg.slug}-buttons.png`),
        fullPage: true,
      });

      expect(errors, `JS errors after button clicks on ${pg.name}:\n${errors.join('\n')}`).toHaveLength(0);
    });

  });
}

// ── Cross-page CSS sanity ─────────────────────────────────────────────────────

test.describe('[CSS] Global checks', () => {

  test('stylesheet loads with 200', async ({ page }) => {
    let cssOk = false;
    page.on('response', r => {
      if (r.url().includes('styles.css') && r.status() === 200) cssOk = true;
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    expect(cssOk, 'styles.css did not return 200').toBeTruthy();
  });

  test('CSS custom properties all resolve', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const PROPS = [
      '--accent-primary', '--accent-secondary', '--card-bg',
      '--border-color', '--text-primary', '--container-bg',
    ];
    for (const prop of PROPS) {
      const val = await page.evaluate(
        p => getComputedStyle(document.documentElement).getPropertyValue(p).trim(),
        prop
      );
      expect(val, `CSS var ${prop} is empty`).not.toBe('');
    }
  });

  test('dark mode toggle applies theme class and resolves vars', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const themeBtn = page.locator('#theme-toggle, [id*="theme"], button:has-text("🌙"), button:has-text("☀️")').first();
    if (await themeBtn.count() === 0) {
      test.skip(); return;
    }

    const initClass = await page.evaluate(() => document.documentElement.className);
    await themeBtn.click();
    await page.waitForTimeout(300);
    const afterClass = await page.evaluate(() => document.documentElement.className);
    expect(initClass, 'Theme class did not change after toggle').not.toBe(afterClass);

    // Toggle back
    await themeBtn.click();
    await page.waitForTimeout(300);
  });

  test('mobile viewport (375px) — no horizontal overflow on key pages', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const mobilePages = ['/', '/rankings.html', '/participation.html', '/leadership.html', '/profile.html'];
    const overflowPages = [];
    for (const url of mobilePages) {
      await page.goto(url);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 10
      );
      if (overflow) overflowPages.push(url);
      await page.screenshot({
        path: path.join(SS_DIR, `mobile-${url.replace(/\//g, '').replace('.html', '') || 'index'}.png`),
        fullPage: false,
      });
    }
    expect(overflowPages, `Horizontal overflow on mobile: ${overflowPages.join(', ')}`).toHaveLength(0);
  });

  test('chart heights stay stable (no grow loop) on charted pages', async ({ page }) => {
    const chartedPages = [
      '/leadership.html', '/profile.html', '/rankings.html',
    ];
    const issues = [];
    for (const url of chartedPages) {
      await page.goto(url);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const pageIssues = await checkChartsStable(page, url);
      issues.push(...pageIssues);
    }
    expect(issues, `Chart grow loops:\n${issues.join('\n')}`).toHaveLength(0);
  });

});
