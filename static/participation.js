'use strict';

let ptData = null;       // full API response
let ptMembers = [];      // flat array after render
let ptFilter = 'all';
let ptRankFilter = '';
let ptSearch = '';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const authed = await checkAuth();
    if (!authed) return;

    await loadData();
    initFilters();
});

async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/check-auth`);
        if (!res.ok) { window.location.href = '/login.html'; return false; }
        return true;
    } catch { window.location.href = '/login.html'; return false; }
}

async function loadData() {
    try {
        const res = await fetch(`${API_BASE}/participation-summary`);
        if (!res.ok) throw new Error(res.statusText);
        ptData = await res.json();
        ptMembers = ptData.members || [];
        renderSummary();
        renderTable();
    } catch (e) {
        document.getElementById('pt-tbody').innerHTML =
            `<tr><td colspan="6" class="error">Failed to load data: ${escapeHtml(e.message)}</td></tr>`;
    }
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function renderSummary() {
    const total = ptMembers.length;
    const mgAbsent = ptMembers.filter(m => m.mg.recent_events === 0).length;
    const vsAbsent = ptMembers.filter(m => !m.vs.has_any_data).length;
    const trainZero = ptMembers.filter(m => m.train.conductor_count === 0).length;

    document.getElementById('pt-total').textContent = total;
    document.getElementById('pt-mg-absent').textContent = mgAbsent;
    document.getElementById('pt-vs-absent').textContent = vsAbsent;
    document.getElementById('pt-train-zero').textContent = trainZero;
}

// ── Table render ──────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('pt-tbody');
    const totalMG = ptData.recent_mg_events || 0;
    const weeklyTarget = ptData.weekly_vs_target || 0;

    const filtered = ptMembers.filter(m => {
        if (ptSearch && !m.name.toLowerCase().includes(ptSearch) &&
            !(m.nickname && m.nickname.toLowerCase().includes(ptSearch))) return false;
        if (ptRankFilter && m.rank !== ptRankFilter) return false;
        if (ptFilter === 'mg-absent'    && m.mg.recent_events > 0) return false;
        if (ptFilter === 'vs-absent'    && m.vs.has_any_data) return false;
        if (ptFilter === 'train-zero'   && m.train.conductor_count > 0) return false;
        if (ptFilter === 'any-absent'   &&
            m.mg.recent_events > 0 && m.vs.has_any_data && m.train.conductor_count > 0) return false;
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No members match the current filter.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(m => {
        const mgCell  = buildMGCell(m.mg, totalMG);
        const vsCell  = buildVSCell(m.vs, weeklyTarget);
        const trainCell = buildTrainCell(m.train);
        const statusBadges = buildStatusBadges(m, totalMG);
        const displayName = m.nickname
            ? `${escapeHtml(m.name)} <span class="member-nickname">${escapeHtml(m.nickname)}</span>`
            : escapeHtml(m.name);
        const rowClass = getRowClass(m, totalMG);

        return `<tr class="${rowClass}">
            <td class="pt-col-name"><a href="/profile.html?id=${m.id}" class="member-link">${displayName}</a></td>
            <td class="pt-col-rank"><span class="rank-badge rank-${m.rank.toLowerCase()}">${m.rank}</span></td>
            <td class="pt-col-mg">${mgCell}</td>
            <td class="pt-col-vs">${vsCell}</td>
            <td class="pt-col-train">${trainCell}</td>
            <td class="pt-col-status">${statusBadges}</td>
        </tr>`;
    }).join('');
}

function getRowClass(m, totalMG) {
    const mgAbsent  = totalMG > 0 && m.mg.recent_events === 0;
    const vsAbsent  = !m.vs.has_any_data;
    const trainZero = m.train.conductor_count === 0;
    if (mgAbsent && vsAbsent) return 'pt-row-critical';
    if (mgAbsent || vsAbsent) return 'pt-row-warn';
    return '';
}

// MG cell: "2 / 5" with colour indicating attendance rate
function buildMGCell(mg, totalMG) {
    if (totalMG === 0) return '<span class="pt-dim">No events</span>';
    const pct = totalMG > 0 ? mg.recent_events / totalMG : 0;
    const cls = mg.recent_events === 0 ? 'pt-absent'
              : pct >= 0.6             ? 'pt-good'
              : 'pt-partial';
    const icon = mg.recent_events === 0 ? '❌' : pct >= 0.6 ? '✅' : '⚠️';
    const tip = mg.last_event ? `Last: ${mg.last_event}` : 'No events attended';
    return `<span class="pt-stat ${cls}" title="${escapeAttr(tip)}">${icon} ${mg.recent_events}<span class="pt-dim"> / ${totalMG}</span></span>`;
}

// VS cell: current week total + compliance streak
function buildVSCell(vs, weeklyTarget) {
    if (!vs.has_any_data) return '<span class="pt-absent" title="No VS data submitted">❌ —</span>';
    const metIcon = vs.current_week_met ? '✅' : weeklyTarget > 0 ? '⚠️' : '➖';
    const cls = vs.current_week_met ? 'pt-good' : weeklyTarget > 0 ? 'pt-partial' : 'pt-dim';
    const streak = vs.weeks_met_last4;
    const tip = weeklyTarget > 0
        ? `This week: ${vs.current_week_total} pts (target ${weeklyTarget}) · Met ${streak}/4 weeks`
        : `This week: ${vs.current_week_total} pts · ${streak}/4 weeks with data`;
    return `<span class="pt-stat ${cls}" title="${escapeAttr(tip)}">${metIcon} ${vs.current_week_total}<span class="pt-dim"> (${streak}/4)</span></span>`;
}

// Train cell: run count + days since
function buildTrainCell(train) {
    if (train.conductor_count === 0) {
        return '<span class="pt-absent" title="Has never conducted a supply run">❌ 0 runs</span>';
    }
    const days = train.days_since_last_run;
    const dayStr = days != null ? ` · ${days}d ago` : '';
    const cls = days == null || days <= 30 ? 'pt-good'
              : days <= 60               ? 'pt-partial'
              : 'pt-warn-text';
    return `<span class="pt-stat ${cls}" title="${train.conductor_count} runs${dayStr}">${train.conductor_count} runs<span class="pt-dim">${dayStr}</span></span>`;
}

// Status column: badges for each absence
function buildStatusBadges(m, totalMG) {
    const badges = [];
    if (totalMG > 0 && m.mg.recent_events === 0)
        badges.push('<span class="pt-badge pt-badge-absent">MG Absent</span>');
    else if (totalMG > 0 && m.mg.recent_events / totalMG < 0.4)
        badges.push('<span class="pt-badge pt-badge-low">MG Low</span>');
    if (!m.vs.has_any_data)
        badges.push('<span class="pt-badge pt-badge-absent">VS Absent</span>');
    else if (!m.vs.current_week_met && ptData.weekly_vs_target > 0)
        badges.push('<span class="pt-badge pt-badge-low">VS Behind</span>');
    if (m.train.conductor_count === 0)
        badges.push('<span class="pt-badge pt-badge-info">No Train Runs</span>');
    if (!badges.length) return '<span class="pt-badge pt-badge-ok">✅ Active</span>';
    return badges.join(' ');
}

// ── Filters ───────────────────────────────────────────────────────────────────
function initFilters() {
    // Filter chips
    document.querySelectorAll('.pt-filter-chips .filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pt-filter-chips .filter-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ptFilter = btn.dataset.filter;
            renderTable();
        });
    });

    // Rank chips
    document.querySelectorAll('#pt-rank-chips .filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pt-rank-chips .filter-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ptRankFilter = btn.dataset.rank;
            renderTable();
        });
    });

    // Summary card clicks → activate filter
    document.getElementById('pt-mg-absent').closest('.pt-card').addEventListener('click', () => activateFilter('mg-absent'));
    document.getElementById('pt-vs-absent').closest('.pt-card').addEventListener('click', () => activateFilter('vs-absent'));
    document.getElementById('pt-train-zero').closest('.pt-card').addEventListener('click', () => activateFilter('train-zero'));

    // Search
    document.getElementById('pt-search').addEventListener('input', e => {
        ptSearch = e.target.value.toLowerCase().trim();
        renderTable();
    });
}

function activateFilter(filter) {
    document.querySelectorAll('.pt-filter-chips .filter-chip').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filter);
    });
    ptFilter = filter;
    renderTable();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
