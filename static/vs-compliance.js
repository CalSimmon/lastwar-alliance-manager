const API_BASE = '/api';

let complianceData = null;
let activeWeekIdx = 0;   // 0 = most recent week

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// ── Auth ──────────────────────────────────────────────────────────────────────

async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/check-auth`);
        if (!res.ok) { window.location.href = '/login.html'; return false; }
        const data = await res.json();
        document.getElementById('username-display').textContent = `👤 ${data.username}`;
        if (data.is_admin) {
            const adminLink = document.getElementById('admin-dropdown-link');
            if (adminLink) adminLink.style.display = 'block';
        }
        return data;
    } catch {
        window.location.href = '/login.html';
        return false;
    }
}

function setupEventListeners() {
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('dropdown-logout-btn');
    if (usernameDisplay) usernameDisplay.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('user-dropdown-menu')?.classList.toggle('show');
    });
    if (logoutBtn) logoutBtn.addEventListener('click', async e => {
        e.preventDefault();
        await fetch(`${API_BASE}/logout`, { method: 'POST' });
        window.location.href = '/login.html';
    });
    document.addEventListener('click', e => {
        const dd = document.getElementById('user-dropdown-menu');
        const btn = document.getElementById('username-display');
        if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) dd.classList.remove('show');
    });
}

// ── Data load ──────────────────────────────────────────────────────────────────

async function loadCompliance() {
    try {
        const res = await fetch(`${API_BASE}/vs-compliance?weeks=4`);
        if (!res.ok) throw new Error('Failed to load compliance data');
        complianceData = await res.json();
        render();
    } catch (e) {
        document.getElementById('compliance-grid').innerHTML =
            '<p class="error-message">Failed to load compliance data.</p>';
    }
}

// ── Render ─────────────────────────────────────────────────────────────────────

function render() {
    if (!complianceData) return;
    const { targets, weeks } = complianceData;

    // Target banner
    document.getElementById('daily-target-val').textContent =
        targets.daily > 0 ? targets.daily.toLocaleString() : 'Not set';
    document.getElementById('weekly-target-val').textContent =
        targets.weekly > 0 ? targets.weekly.toLocaleString() : 'Not set';

    // Week tabs
    const tabsEl = document.getElementById('week-tabs');
    tabsEl.innerHTML = weeks.map((w, i) => `
        <button class="vc-tab ${i === activeWeekIdx ? 'active' : ''}" data-idx="${i}">
            ${i === 0 ? '📅 ' : ''}${w.week_label}
        </button>`).join('');
    tabsEl.querySelectorAll('.vc-tab').forEach(btn =>
        btn.addEventListener('click', () => {
            activeWeekIdx = parseInt(btn.dataset.idx);
            render();
        })
    );

    renderWeek(weeks[activeWeekIdx], targets);
}

function renderWeek(week, targets) {
    const members = week.members || [];
    const weeklyTarget = targets.weekly;
    const dailyTarget  = targets.daily;

    // Classify members
    let ok = 0, partial = 0, miss = 0, none = 0;
    members.forEach(m => {
        if (!m.has_data)             { none++; return; }
        if (weeklyTarget > 0) {
            if (m.weekly_met)        ok++;
            else                     miss++;
        } else {
            partial++;
        }
    });

    document.getElementById('count-ok').textContent      = ok;
    document.getElementById('count-partial').textContent  = partial;
    document.getElementById('count-miss').textContent     = miss;
    document.getElementById('count-none').textContent     = none;

    // Is this the current week? (first week in the array = most recent)
    const isCurrentWeek = activeWeekIdx === 0;
    const today = new Date();
    const todayDay = today.getDay(); // 0=Sun,1=Mon,...6=Sat
    // Which day index (0=Mon…5=Sat) is "today" in the current week
    const todayDayIdx = todayDay === 0 ? -1 : todayDay - 1; // -1 if Sunday (beyond Sat)

    const grid = document.getElementById('compliance-grid');
    if (!members.length) {
        grid.innerHTML = '<p class="empty-state">No members found.</p>';
        return;
    }

    // Sort: misses first, then partials, then ok, then no-data; within each group by name
    const sorted = [...members].sort((a, b) => {
        const rank = m => {
            if (!m.has_data) return 3;
            if (weeklyTarget > 0 && !m.weekly_met) return 0;
            if (weeklyTarget > 0 && m.weekly_met) return 2;
            return 1;
        };
        const rd = rank(a) - rank(b);
        return rd !== 0 ? rd : a.name.localeCompare(b.name);
    });

    grid.innerHTML = sorted.map(m => memberCard(m, targets, isCurrentWeek, todayDayIdx)).join('');
}

function memberCard(m, targets, isCurrentWeek, todayDayIdx) {
    const weeklyTarget = targets.weekly;
    const dailyTarget  = targets.daily;

    // Status class
    let statusCls = 'vc-card-none';
    let statusBadge = '<span class="vc-badge vc-badge-none">No data</span>';
    if (m.has_data) {
        const pct = weeklyTarget > 0 ? Math.min(m.weekly_total / weeklyTarget * 100, 100) : null;
        if (weeklyTarget > 0 && m.weekly_met) {
            statusCls = 'vc-card-ok';
            statusBadge = `<span class="vc-badge vc-badge-ok">✓ ${m.weekly_total.toLocaleString()}</span>`;
        } else if (weeklyTarget > 0) {
            statusCls = 'vc-card-miss';
            statusBadge = `<span class="vc-badge vc-badge-miss">${m.weekly_total.toLocaleString()} / ${weeklyTarget.toLocaleString()}</span>`;
        } else {
            statusCls = 'vc-card-warn';
            statusBadge = `<span class="vc-badge vc-badge-warn">${m.weekly_total.toLocaleString()}</span>`;
        }
    }

    // Weekly progress bar
    let progressBar = '';
    if (m.has_data && weeklyTarget > 0) {
        const pct = Math.min(m.weekly_total / weeklyTarget * 100, 100).toFixed(1);
        const barCls = m.weekly_met ? 'vc-bar-fill-ok' : 'vc-bar-fill-miss';
        progressBar = `
            <div class="vc-progress-wrap">
                <div class="vc-progress-bar">
                    <div class="vc-bar-fill ${barCls}" style="width:${pct}%"></div>
                </div>
                <span class="vc-progress-pct">${Math.round(pct)}%</span>
            </div>`;
    }

    // Daily dots
    const dots = DAY_KEYS.map((key, i) => {
        const val = m[key] || 0;
        const isFuture = isCurrentWeek && i > todayDayIdx;
        let dotCls, title;
        if (isFuture) {
            dotCls = 'vc-dot-future';
            title = `${DAYS[i]}: upcoming`;
        } else if (!m.has_data || val === 0) {
            dotCls = 'vc-dot-miss';
            title = `${DAYS[i]}: no data`;
        } else if (dailyTarget > 0 && val >= dailyTarget) {
            dotCls = 'vc-dot-ok';
            title = `${DAYS[i]}: ${val.toLocaleString()} ✓`;
        } else if (dailyTarget > 0) {
            dotCls = 'vc-dot-warn';
            title = `${DAYS[i]}: ${val.toLocaleString()} (target: ${dailyTarget.toLocaleString()})`;
        } else {
            dotCls = val > 0 ? 'vc-dot-ok' : 'vc-dot-miss';
            title = `${DAYS[i]}: ${val.toLocaleString()}`;
        }
        return `<span class="vc-dot ${dotCls}" title="${title}"></span>`;
    }).join('');

    const rankBadge = `<span class="rank-badge rank-badge-${m.rank.toLowerCase()}">${m.rank}</span>`;

    return `
        <div class="vc-member-card ${statusCls}">
            <div class="vc-card-header">
                <span class="vc-member-name">${escapeHtml(m.name)}${m.nickname ? '<span class="member-nickname"> aka ' + escapeHtml(m.nickname) + '</span>' : ''}</span>
                ${rankBadge}
                ${statusBadge}
            </div>
            <div class="vc-days-row">
                ${DAYS.map((d, i) => `<span class="vc-day-label">${d}</span>`).join('')}
            </div>
            <div class="vc-dots-row">${dots}</div>
            ${progressBar}
        </div>`;
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth();
    if (!auth) return;
    setupEventListeners();
    await loadCompliance();
});
