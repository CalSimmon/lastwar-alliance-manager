// Profile / Personnel File page
// Supports:  /profile.html          — view your own profile
//            /profile.html?id=X     — admin views another member

let mustChangePassword = false;
let radarChart = null;
let mgBarChart = null;
let vsBarChart = null;

// ── helpers ───────────────────────────────────────────────────────────────────
function formatDamage(val) {
    if (!val || val === 0) return '0';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'G';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    return val.toString();
}

function getTargetIdFromURL() {
    const p = new URLSearchParams(window.location.search);
    const v = parseInt(p.get('id'), 10);
    return isNaN(v) ? null : v;
}

// ── auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
    const response = await fetch(`${API_BASE}/check-auth`);
    if (!response.ok) { window.location.href = '/login.html'; return null; }
    const data = await response.json();

    document.getElementById('username-display').textContent = `👤 ${data.username}`;
    document.getElementById('profile-username').textContent = data.username;
    document.getElementById('profile-role').textContent = data.is_admin ? 'Administrator' : 'Member';
    if (data.rank) {
        document.getElementById('profile-member').textContent = data.rank;
        document.getElementById('profile-member-info').style.display = 'block';
    }

    mustChangePassword = data.must_change_password || false;
    if (mustChangePassword) {
        const banner = document.createElement('div');
        banner.className = 'password-change-banner';
        banner.innerHTML = '⚠️ <strong>You must change your password before continuing.</strong>';
        document.querySelector('main')?.prepend(banner);
        document.getElementById('password-form')?.scrollIntoView({ behavior: 'smooth' });
    }

    // Hide account block when viewing someone else
    const targetId = getTargetIdFromURL();
    if (targetId && targetId !== data.member_id) {
        document.getElementById('pf-account-section').style.display = 'none';
    }

    return data;
}

// ── password form ─────────────────────────────────────────────────────────────
document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur  = document.getElementById('current-password').value;
    const nw   = document.getElementById('new-password').value;
    const conf = document.getElementById('confirm-password').value;
    if (nw !== conf) { showToast('New passwords do not match!', 'warning'); return; }
    if (nw.length < 6) { showToast('Minimum 6 characters required.', 'warning'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, 'Saving...');
    try {
        const res = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: cur, new_password: nw })
        });
        if (!res.ok) throw new Error(await res.text());
        showToast('Password changed successfully!', 'success');
        document.getElementById('password-form').reset();
        if (mustChangePassword) {
            mustChangePassword = false;
            document.querySelector('.password-change-banner')?.remove();
            setTimeout(() => { window.location.href = '/'; }, 1500);
        }
    } catch (err) {
        showToast('Failed: ' + err.message, 'error');
    } finally {
        clearButtonLoading(btn);
    }
});

// ── load member profile ───────────────────────────────────────────────────────
async function loadMemberProfile(memberId) {
    if (!memberId) return;
    const targetId = getTargetIdFromURL() || memberId;
    const url = `/api/member-profile?id=${targetId}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return;
        const d = await res.json();
        renderProfile(d);
    } catch (e) {
        console.error('Profile load failed', e);
    }
}

// ── render ────────────────────────────────────────────────────────────────────
function renderProfile(d) {
    document.getElementById('pf-member-section').style.display = '';

    // Header
    const m = d.member;
    document.getElementById('pf-name').textContent = m.name;
    const rankBadge = document.getElementById('pf-rank-badge');
    rankBadge.textContent = m.rank;
    rankBadge.className = `rank-badge rank-${m.rank.toLowerCase()}`;
    const nickEl = document.getElementById('pf-nick');
    if (m.nickname) { nickEl.textContent = `"${m.nickname}"`; nickEl.style.display = ''; }

    const rc = d.rank_context;
    document.getElementById('pf-position-overall').textContent =
        `#${rc.position} of ${rc.total_members}`;
    document.getElementById('pf-position-tier').textContent =
        `#${rc.tier_position} in ${m.rank} (${rc.tier_members})`;

    // Score breakdown
    const r = d.ranking;
    document.getElementById('pf-total-score').textContent = r.total_score;
    const rows = [
        ['🏆 Awards',            r.award_points,              r.award_points > 0],
        ['👍 Recommendations',   r.recommendation_points,     r.recommendation_points > 0],
        ['📈 Rank Boost',        r.rank_boost,                r.rank_boost > 0],
        ['⭐ First-Timer Boost', r.first_time_conductor_boost, r.first_time_conductor_boost > 0],
        ['⚠️ Recent Penalty',    -r.recent_conductor_penalty, r.recent_conductor_penalty > 0],
        ['⚠️ Above-Avg Penalty', -r.above_average_penalty,    r.above_average_penalty > 0],
    ].filter(([,, show]) => show);
    const tbody = document.querySelector('#pf-score-table tbody');
    tbody.innerHTML = rows.map(([label, val]) =>
        `<tr><td>${label}</td><td class="${val >= 0 ? 'pf-pos' : 'pf-neg'}">${val >= 0 ? '+' : ''}${val}</td></tr>`
    ).join('');

    // Summary stats rows
    [
        ['🛡️ MG Events',    r.mg_event_count],
        ['💥 Total Damage',  formatDamage(r.mg_total_damage)],
        ['🚂 Train Runs',    r.conductor_count],
        ['👍 Recs',          r.recommendation_count],
    ].filter(([, v]) => v).forEach(([label, val]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${label}</td><td>${val}</td>`;
        tbody.appendChild(tr);
    });

    // Charts
    buildRadarChart(d);
    buildMGChart(d.mg_events);
    buildVSChart(d.vs_weeks);
    buildTrainList(d.train_runs);
}

// ── Radar ─────────────────────────────────────────────────────────────────────
function buildRadarChart(d) {
    const ctx = document.getElementById('pf-radar').getContext('2d');
    if (radarChart) radarChart.destroy();
    const isDark = document.documentElement.classList.contains('theme-dark');
    const gridColor  = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
    const labelColor = isDark ? '#ccc' : '#444';
    const fillColor  = isDark ? 'rgba(99,179,237,0.3)'   : 'rgba(49,130,206,0.25)';
    const borderColor = isDark ? '#63b3ed' : '#3182ce';

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['MG Attendance', 'VS Compliance', 'Train Activity', 'Awards', 'Recommendations'],
            datasets: [{
                label: d.member.name,
                data: [
                    Math.round(d.radar_mg    * 100),
                    Math.round(d.radar_vs    * 100),
                    Math.round(d.radar_train * 100),
                    Math.round(d.radar_award * 100),
                    Math.round(d.radar_rec   * 100),
                ],
                backgroundColor: fillColor,
                borderColor: borderColor,
                pointBackgroundColor: borderColor,
                pointRadius: 4,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { display: false },
                    grid: { color: gridColor },
                    angleLines: { color: gridColor },
                    pointLabels: { color: labelColor, font: { size: 11 } },
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ── MG bar chart ──────────────────────────────────────────────────────────────
function buildMGChart(events) {
    const noData = document.getElementById('pf-mg-nodata');
    const canvas = document.getElementById('pf-mg-chart');
    if (!events || events.length === 0) {
        canvas.style.display = 'none'; noData.style.display = ''; return;
    }
    noData.style.display = 'none'; canvas.style.display = '';
    const isDark = document.documentElement.classList.contains('theme-dark');
    const barColor  = isDark ? '#63b3ed' : '#3182ce';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    const labelColor = isDark ? '#ccc' : '#555';

    if (mgBarChart) mgBarChart.destroy();
    mgBarChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: events.map(e => {
                const dt = new Date(e.event_date);
                return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Damage',
                data: events.map(e => e.damage),
                backgroundColor: barColor,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `Damage: ${formatDamage(ctx.raw)}  |  Rank #${events[ctx.dataIndex].rank}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: labelColor, font: { size: 10 } }, grid: { display: false } },
                y: {
                    ticks: { color: labelColor, font: { size: 10 }, callback: v => formatDamage(v) },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

// ── VS bar chart ──────────────────────────────────────────────────────────────
function buildVSChart(weeks) {
    const noData = document.getElementById('pf-vs-nodata');
    const canvas = document.getElementById('pf-vs-chart');
    if (!weeks || weeks.length === 0) {
        canvas.style.display = 'none'; noData.style.display = ''; return;
    }
    noData.style.display = 'none'; canvas.style.display = '';
    const isDark = document.documentElement.classList.contains('theme-dark');
    const labelColor = isDark ? '#ccc' : '#555';
    const gridColor  = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

    if (vsBarChart) vsBarChart.destroy();
    vsBarChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: weeks.map(w => w.week_label),
            datasets: [{
                label: 'VS Points',
                data: weeks.map(w => w.weekly_total),
                backgroundColor: weeks.map(w => w.weekly_met
                    ? (isDark ? '#68d391' : '#38a169')
                    : (isDark ? '#fc8181' : '#e53e3e')),
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.raw} pts — ${weeks[ctx.dataIndex].weekly_met ? '✅ Met' : '❌ Missed'}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: labelColor, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: labelColor, font: { size: 10 } }, grid: { color: gridColor } }
            }
        }
    });
}

// ── Train list ────────────────────────────────────────────────────────────────
function buildTrainList(runs) {
    const el = document.getElementById('pf-train-list');
    if (!runs || runs.length === 0) {
        el.innerHTML = '<p class="empty">No train runs recorded.</p>'; return;
    }
    const roleLabel = { conductor: '🚂 Conductor', sub: '🔄 Sub', backup: '🔁 Backup' };
    el.innerHTML = runs.map(t => {
        const dt = new Date(t.date);
        const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const cls = t.role === 'conductor' ? 'pf-train-conductor' : 'pf-train-other';
        return `<span class="pf-train-chip ${cls}">${label} — ${roleLabel[t.role] || t.role}</span>`;
    }).join('');
}

// ── init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const authData = await checkAuth();
    if (!authData) return;

    const memberId = getTargetIdFromURL() || authData.member_id;
    if (memberId) await loadMemberProfile(memberId);
});
