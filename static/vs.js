// VS Points page

const DAY_KEYS  = ['monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_THEMES = [
    { emoji: '📡', name: 'Radar Training'    },
    { emoji: '🏗️', name: 'Base Construction' },
    { emoji: '🔬', name: 'Research'           },
    { emoji: '🦸', name: 'Hero Upgrades'      },
    { emoji: '⚔️', name: 'Troop Training'    },
    { emoji: '💥', name: 'Enemy Buster'       },
];

let currentWeekDate = null;
let allMembers      = [];
let vsData          = {};      // { memberId: { monday, tuesday, ... } }
let settings        = { vs_points_daily_target: 0, vs_points_weekly_target: 0 };
let canEdit         = false;   // true for R4/R5/Admin
let sortBy          = 'total';

// ── Dates ─────────────────────────────────────────────────────────────────────

function getMostRecentMonday(d = new Date()) {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const m = new Date(d);
    m.setDate(d.getDate() - diff);
    m.setHours(0, 0, 0, 0);
    return m;
}

function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDisplay(d) {
    const saturday = new Date(d);
    saturday.setDate(d.getDate() + 5);
    return `${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${saturday.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/settings`);
        if (res.ok) settings = await res.json();
    } catch {}
}

async function loadMembers() {
    try {
        const res = await fetch(`${API_BASE}/members`);
        allMembers = (await res.json()).sort((a,b) => a.name.localeCompare(b.name));
    } catch {}
}

async function loadVSPoints() {
    const week = fmtDate(currentWeekDate);
    try {
        const res = await fetch(`${API_BASE}/vs-points?week=${week}`);
        const rows = res.ok ? await res.json() : [];
        vsData = {};
        (rows || []).forEach(r => { vsData[r.member_id] = r; });
    } catch {}
    render();
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
    document.getElementById('week-label').textContent = fmtDisplay(currentWeekDate);
    renderDayStrip();
    renderSummaryBar();
    renderTable();
}

function renderDayStrip() {
    const dailyTarget = settings.vs_points_daily_target || 0;

    // Compute alliance total per day
    const dayTotals   = DAY_KEYS.map(k => Object.values(vsData).reduce((s, r) => s + (r[k] || 0), 0));
    const dayParticip = DAY_KEYS.map(k => Object.values(vsData).filter(r => (r[k] || 0) > 0).length);
    const memberCount = allMembers.length || 1;

    // Is this the current week? If so, grey out future days
    const today = new Date();
    const todayMonday = getMostRecentMonday(today);
    const isCurrentWeek = fmtDate(currentWeekDate) === fmtDate(todayMonday);
    const todayDayIdx = (() => {
        const d = today.getDay();
        return d === 0 ? 6 : d - 1; // Mon=0 … Sun=6
    })();

    document.getElementById('day-strip').innerHTML = DAY_KEYS.map((key, i) => {
        const isFuture = isCurrentWeek && i > todayDayIdx;
        const total    = dayTotals[i];
        const partPct  = Math.round(dayParticip[i] / memberCount * 100);
        const metTarget = dailyTarget > 0 && total >= dailyTarget * memberCount;
        let statusCls = isFuture ? 'vs2-day-future'
                      : total === 0 ? 'vs2-day-empty'
                      : metTarget ? 'vs2-day-ok'
                      : 'vs2-day-partial';

        return `
            <div class="vs2-day-card ${statusCls}">
                <div class="vs2-day-theme">${DAY_THEMES[i].emoji} ${DAY_THEMES[i].name}</div>
                <div class="vs2-day-label">${DAY_LABELS[i]}</div>
                <div class="vs2-day-total">${isFuture ? '—' : fmtK(total)}</div>
                <div class="vs2-day-part">${isFuture ? '' : `${dayParticip[i]}/${memberCount} members`}</div>
            </div>`;
    }).join('');
}

function renderSummaryBar() {
    const weeklyTarget = settings.vs_points_weekly_target || 0;
    const membersWithData = Object.values(vsData).filter(r =>
        DAY_KEYS.some(k => (r[k] || 0) > 0)
    ).length;
    const allianceTotal = Object.values(vsData).reduce((s, r) =>
        s + DAY_KEYS.reduce((ds, k) => ds + (r[k] || 0), 0), 0);
    const partPct = allMembers.length > 0 ? Math.round(membersWithData / allMembers.length * 100) : 0;

    let targetHtml = '';
    if (weeklyTarget > 0) {
        const membersOnTarget = Object.entries(vsData).filter(([, r]) => {
            const tot = DAY_KEYS.reduce((s,k) => s + (r[k]||0), 0);
            return tot >= weeklyTarget;
        }).length;
        targetHtml = `<span class="vs2-sb-item">Weekly target met: <strong>${membersOnTarget}/${allMembers.length}</strong></span>`;
    }

    document.getElementById('summary-bar').innerHTML = `
        <span class="vs2-sb-item">Alliance total: <strong>${allianceTotal.toLocaleString()}</strong></span>
        <span class="vs2-sb-sep">·</span>
        <span class="vs2-sb-item">Participation: <strong>${partPct}%</strong> (${membersWithData}/${allMembers.length})</span>
        ${weeklyTarget > 0 ? '<span class="vs2-sb-sep">·</span>' + targetHtml : ''}
        ${canEdit ? '<span class="vs2-sb-edit-hint">Click any day cell to edit</span>' : ''}`;
}

function renderTable() {
    const search  = document.getElementById('vs2-search').value.toLowerCase().trim();
    const dailyT  = settings.vs_points_daily_target || 0;
    const weeklyT = settings.vs_points_weekly_target || 0;

    // Build header
    document.getElementById('vs2-thead').innerHTML = `
        <tr>
            <th class="rk-col-pos">#</th>
            <th class="rk-col-name">Member</th>
            ${DAY_KEYS.map((k,i) => `<th class="vs2-col-day" title="${DAY_THEMES[i].name}">${DAY_THEMES[i].emoji} ${DAY_LABELS[i]}</th>`).join('')}
            <th class="vs2-col-total">Total</th>
        </tr>`;

    // Filter
    let members = allMembers.filter(m => !search || m.name.toLowerCase().includes(search) || (m.nickname && m.nickname.toLowerCase().includes(search)));

    // Sort
    members = [...members].sort((a, b) => {
        const ra = vsData[a.id], rb = vsData[b.id];
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'total') {
            const ta = ra ? DAY_KEYS.reduce((s,k) => s+(ra[k]||0),0) : 0;
            const tb = rb ? DAY_KEYS.reduce((s,k) => s+(rb[k]||0),0) : 0;
            return tb - ta;
        }
        return (rb?.[sortBy]||0) - (ra?.[sortBy]||0);
    });

    const tbody = document.getElementById('vs2-tbody');
    if (!members.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No members found.</td></tr>';
        return;
    }

    tbody.innerHTML = members.map((m, i) => {
        const r = vsData[m.id];
        const weekTotal = r ? DAY_KEYS.reduce((s,k) => s+(r[k]||0), 0) : 0;
        const weekMet   = weeklyT > 0 && weekTotal >= weeklyT;
        const totalCls  = !r || weekTotal === 0 ? 'vs2-zero'
                        : weeklyT > 0 && weekMet ? 'vs2-cell-ok'
                        : weeklyT > 0 ? 'vs2-cell-miss' : '';

        const cells = DAY_KEYS.map(key => {
            const val = r ? (r[key] || 0) : 0;
            const cls = val === 0 ? 'vs2-zero'
                      : dailyT > 0 && val >= dailyT ? 'vs2-cell-ok'
                      : dailyT > 0 ? 'vs2-cell-miss' : '';

            if (canEdit) {
                return `<td class="vs2-col-day vs2-editable ${cls}"
                            data-member-id="${m.id}" data-day="${key}" data-val="${val}"
                            onclick="startEdit(this)">${val === 0 ? '—' : val.toLocaleString()}</td>`;
            }
            return `<td class="vs2-col-day ${cls}">${val === 0 ? '—' : val.toLocaleString()}</td>`;
        }).join('');

        return `
            <tr class="${!r ? 'vs2-row-nodata' : ''}">
                <td class="rk-col-pos">${i + 1}</td>
                <td class="rk-col-name">
                    <span class="rk-member-name">${escapeHtml(m.name)}${m.nickname ? '<span class="member-nickname"> aka ' + escapeHtml(m.nickname) + '</span>' : ''}</span>
                    <span class="rank-badge rank-badge-${m.rank.toLowerCase()}">${m.rank}</span>
                </td>
                ${cells}
                <td class="vs2-col-total ${totalCls}">${weekTotal === 0 ? '—' : weekTotal.toLocaleString()}</td>
            </tr>`;
    }).join('');
}

// ── Inline edit ───────────────────────────────────────────────────────────────

function startEdit(cell) {
    if (cell.querySelector('input')) return; // already editing
    const memberId = parseInt(cell.dataset.memberId);
    const day      = cell.dataset.day;
    const current  = parseInt(cell.dataset.val) || 0;

    cell.innerHTML = `
        <div class="vs2-edit-wrap">
            <input type="number" class="vs2-edit-input" value="${current}" min="0" autofocus>
            <button class="vs2-edit-ok" title="Save">✓</button>
            <button class="vs2-edit-cancel" title="Cancel">✗</button>
        </div>`;

    const input = cell.querySelector('input');
    input.select();

    const save = async () => {
        const val = Math.max(0, parseInt(input.value) || 0);
        await commitEdit(cell, memberId, day, val);
    };

    cell.querySelector('.vs2-edit-ok').addEventListener('click', save);
    cell.querySelector('.vs2-edit-cancel').addEventListener('click', () => cancelEdit(cell, current));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  save();
        if (e.key === 'Escape') cancelEdit(cell, current);
    });
    input.addEventListener('blur', e => {
        // Delay to let button clicks register first
        setTimeout(() => { if (cell.querySelector('input')) cancelEdit(cell, current); }, 150);
    });
}

function cancelEdit(cell, originalVal) {
    cell.dataset.val = originalVal;
    cell.textContent = originalVal === 0 ? '—' : originalVal.toLocaleString();
}

async function commitEdit(cell, memberId, day, val) {
    const week = fmtDate(currentWeekDate);
    try {
        const res = await fetch(`${API_BASE}/vs-points/patch`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_date: week, member_id: memberId, day, value: val })
        });
        if (!res.ok) throw new Error(await res.text());

        // Update local state
        if (!vsData[memberId]) vsData[memberId] = { member_id: memberId };
        vsData[memberId][day] = val;
        cell.dataset.val = val;

        // Re-apply colour class and display
        const dailyT = settings.vs_points_daily_target || 0;
        cell.className = cell.className.replace(/vs2-cell-ok|vs2-cell-miss|vs2-zero/g, '').trim();
        if (val === 0) cell.classList.add('vs2-zero');
        else if (dailyT > 0 && val >= dailyT) cell.classList.add('vs2-cell-ok');
        else if (dailyT > 0) cell.classList.add('vs2-cell-miss');
        cell.textContent = val === 0 ? '—' : val.toLocaleString();

        // Refresh totals row and summary
        renderDayStrip();
        renderSummaryBar();
        // Refresh total cell for this row
        const row   = cell.closest('tr');
        const allId = memberId;
        const r     = vsData[allId];
        const weekTotal = r ? DAY_KEYS.reduce((s,k) => s+(r[k]||0), 0) : 0;
        const totalCell = row.querySelector('.vs2-col-total');
        if (totalCell) {
            const weeklyT = settings.vs_points_weekly_target || 0;
            totalCell.textContent = weekTotal === 0 ? '—' : weekTotal.toLocaleString();
            totalCell.className = 'vs2-col-total ' + (
                weekTotal === 0 ? 'vs2-zero' :
                weeklyT > 0 && weekTotal >= weeklyT ? 'vs2-cell-ok' :
                weeklyT > 0 ? 'vs2-cell-miss' : '');
        }
    } catch(e) {
        showToast('Failed to save: ' + e.message, 'error');
        cancelEdit(cell, parseInt(cell.dataset.val) || 0);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(v) {
    if (v >= 1_000_000) return (v/1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return (v/1_000).toFixed(0) + 'K';
    return v.toLocaleString();
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await requireAuth();
    if (!auth) return;
    canEdit = auth.can_manage_ranks || auth.is_admin;

    await Promise.all([loadSettings(), loadMembers()]);
    currentWeekDate = getMostRecentMonday();
    await loadVSPoints();

    document.getElementById('prev-week').addEventListener('click', () => {
        currentWeekDate.setDate(currentWeekDate.getDate() - 7);
        loadVSPoints();
    });
    document.getElementById('next-week').addEventListener('click', () => {
        currentWeekDate.setDate(currentWeekDate.getDate() + 7);
        loadVSPoints();
    });
    document.getElementById('vs2-search').addEventListener('input', renderTable);
    document.getElementById('vs2-sort').addEventListener('change', e => {
        sortBy = e.target.value;
        renderTable();
    });
});
