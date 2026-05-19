// Marshal Guard page logic
let isOfficer = false;
let isAdmin = false;
let ocrPreviewData = null;
let selectedFiles = [];

async function checkAuth() {
    try {
        const res = await fetch('/api/check-auth');
        const data = await res.json();
        if (!data.authenticated) { window.location.href = '/login.html'; return false; }
        if (data.must_change_password) { window.location.href = '/profile.html?must_change_password=1'; return false; }

        let display = `👤 ${data.username}`;
        if (data.rank) display += ` (${data.rank})`;
        document.getElementById('username-display').textContent = display;

        isAdmin = data.is_admin || false;
        const rank = (data.rank || '').toUpperCase();
        isOfficer = isAdmin || rank === 'R4' || rank === 'R5';

        if (isOfficer) {
            document.querySelectorAll('.officer-only').forEach(el => el.style.display = '');
        }
        if (isAdmin) {
            const adminLink = document.getElementById('admin-nav-link');
            const gyLink = document.getElementById('graveyard-nav-link');
            if (adminLink) adminLink.style.display = 'block';
            if (gyLink) gyLink.style.display = 'block';
        }
        return true;
    } catch { return false; }
}

// ---- Tab switching ----
function initTabs() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });
    // Modal sub-tabs
    document.querySelectorAll('[data-modal-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-modal-tab]').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('modal-tab-' + btn.dataset.modalTab).classList.add('active');
        });
    });
}

// ---- Event list ----
async function loadEvents() {
    try {
        const res = await fetch('/api/marshal-guard');
        const events = await res.json();
        renderEventList(events);
    } catch (e) {
        document.getElementById('event-list').innerHTML = '<p class="empty">⚠️ Failed to load events.</p>';
    }
}

function renderEventList(events) {
    const el = document.getElementById('event-list');
    if (!events || events.length === 0) {
        el.innerHTML = '<p class="empty">🛡️ No Marshal Guard events recorded yet.</p>';
        return;
    }
    let html = `<table class="rk-table"><thead><tr>
        <th>Date</th><th>Total Damage</th><th># Players</th><th>Top Dealer</th><th>Top Damage</th>`;
    if (isOfficer) html += '<th>Actions</th>';
    html += '</tr></thead><tbody>';
    for (const ev of events) {
        html += `<tr class="mg-event-row" data-id="${ev.id}">
            <td>${ev.event_date}</td>
            <td>${formatDamage(ev.total_alliance_damage)}</td>
            <td>${ev.participant_count}</td>
            <td>${escapeHtml(ev.top_damage_dealer)}</td>
            <td>${formatDamage(ev.top_damage)}</td>`;
        if (isOfficer) {
            html += `<td class="list-actions">
                <button class="edit-schedule-btn" onclick="event.stopPropagation(); deleteEvent(${ev.id})" title="Delete">🗑️</button>
            </td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;

    // Click row to view details
    el.querySelectorAll('.mg-event-row').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => viewEventDetail(parseInt(row.dataset.id)));
    });
}

async function viewEventDetail(id) {
    try {
        const res = await fetch('/api/marshal-guard/' + id);
        const ev = await res.json();
        document.getElementById('detail-modal-title').textContent = `🛡️ Event: ${ev.event_date}`;
        document.getElementById('detail-summary').innerHTML = `
            <p><strong>Total Alliance Damage:</strong> ${formatDamage(ev.total_alliance_damage)}</p>
            ${ev.notes ? '<p><strong>Notes:</strong> ' + escapeHtml(ev.notes) + '</p>' : ''}
            <p><strong>Participants:</strong> ${ev.participants.length}</p>`;
        let thtml = `<table class="rk-table"><thead><tr>
            <th>#</th><th>Player</th><th>Damage</th><th>Attacks</th><th>Member</th>
        </tr></thead><tbody>`;
        for (const p of ev.participants) {
            const matched = p.member_id ? `✅ ${escapeHtml(p.member_name)}` : '❌ Unmatched';
            thtml += `<tr${p.rank_in_event === 1 ? ' class="mg-mvp-row"' : ''}>
                <td>${p.rank_in_event === 1 ? '🏆' : p.rank_in_event}</td>
                <td>${escapeHtml(p.name_snapshot)}${p.alliance_tag ? ' <span class="text-muted">[' + escapeHtml(p.alliance_tag) + ']</span>' : ''}</td>
                <td>${formatDamage(p.damage)}</td>
                <td>${p.attack_count != null ? p.attack_count : '—'}</td>
                <td>${matched}</td>
            </tr>`;
        }
        thtml += '</tbody></table>';
        document.getElementById('detail-participants').innerHTML = thtml;
        document.getElementById('detail-modal').style.display = 'flex';
    } catch (e) {
        showToast('Failed to load event details', 'error');
    }
}

async function deleteEvent(id) {
    if (!confirm('Delete this Marshal Guard event and all its participants?')) return;
    try {
        const res = await fetch('/api/marshal-guard/' + id, { method: 'DELETE' });
        if (res.ok) {
            showToast('Event deleted', 'success');
            loadEvents();
        } else {
            showToast('Failed to delete event', 'error');
        }
    } catch { showToast('Failed to delete event', 'error'); }
}

// ---- Member stats ----
async function loadMemberStats() {
    try {
        const res = await fetch('/api/marshal-guard/member-stats');
        const stats = await res.json();
        renderMemberStats(stats);
    } catch {
        document.getElementById('stats-list').innerHTML = '<p class="empty">⚠️ Failed to load stats.</p>';
    }
}

function renderMemberStats(stats) {
    const el = document.getElementById('stats-list');
    if (!stats || stats.length === 0) {
        el.innerHTML = '<p class="empty">🛡️ No participation data yet.</p>';
        return;
    }
    let html = `<table class="rk-table" id="mg-stats-table"><thead><tr>
        <th>Member</th><th>Rank</th><th>Events</th><th>Total Damage</th><th>Avg Rank</th><th>Best Damage</th>
    </tr></thead><tbody>`;
    for (const s of stats) {
        html += `<tr>
            <td>${escapeHtml(s.member_name)}</td>
            <td>${escapeHtml(s.member_rank)}</td>
            <td>${s.event_count}</td>
            <td>${formatDamage(s.total_damage)}</td>
            <td>${s.avg_rank.toFixed(1)}</td>
            <td>${formatDamage(s.best_damage)}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
}

// ---- Upload / OCR flow ----
function initUpload() {
    const dropZone = document.getElementById('mg-drop-zone');
    const fileInput = document.getElementById('mg-image-input');
    const processBtn = document.getElementById('mg-process-btn');
    const clearBtn = document.getElementById('mg-clear-btn');

    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        fileInput.click();
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
    clearBtn.addEventListener('click', clearFiles);
    processBtn.addEventListener('click', processScreenshots);
}

function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    selectedFiles = selectedFiles.concat(files).slice(0, 10);
    renderFilePreview();
}

function renderFilePreview() {
    const gallery = document.getElementById('mg-preview-gallery');
    const container = document.getElementById('mg-preview-container');
    const dropContent = document.getElementById('mg-drop-content');
    const processBtn = document.getElementById('mg-process-btn');
    const countEl = document.getElementById('mg-files-count');

    if (selectedFiles.length === 0) {
        container.style.display = 'none';
        dropContent.style.display = '';
        processBtn.style.display = 'none';
        return;
    }

    dropContent.style.display = 'none';
    container.style.display = 'block';
    processBtn.style.display = 'block';
    countEl.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`;

    gallery.innerHTML = '';
    selectedFiles.forEach((file, i) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        const img = document.createElement('img');
        img.className = 'preview-img';
        img.src = URL.createObjectURL(file);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file';
        removeBtn.textContent = '×';
        removeBtn.onclick = (e) => { e.stopPropagation(); selectedFiles.splice(i, 1); renderFilePreview(); };
        const nameEl = document.createElement('div');
        nameEl.className = 'file-name';
        nameEl.textContent = file.name;
        div.append(img, removeBtn, nameEl);
        gallery.appendChild(div);
    });
}

function clearFiles() {
    selectedFiles = [];
    document.getElementById('mg-image-input').value = '';
    renderFilePreview();
}

async function processScreenshots() {
    if (selectedFiles.length === 0) return;
    const processBtn = document.getElementById('mg-process-btn');
    processBtn.disabled = true;
    processBtn.textContent = '⏳ Processing...';

    try {
        const formData = new FormData();
        selectedFiles.forEach(f => formData.append('images[]', f));

        const res = await fetch('/api/marshal-guard/process-screenshots', { method: 'POST', body: formData });
        if (!res.ok) { showToast('OCR processing failed', 'error'); return; }

        ocrPreviewData = await res.json();
        showOCRPreview();
        document.getElementById('event-modal').style.display = 'none';
    } catch (e) {
        showToast('OCR processing failed: ' + e.message, 'error');
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = '🔍 Process Screenshots with OCR';
    }
}

function showOCRPreview() {
    if (!ocrPreviewData) return;
    const modal = document.getElementById('ocr-preview-modal');
    document.getElementById('ocr-event-date').value = ocrPreviewData.event_date || '';
    document.getElementById('ocr-total-damage').textContent = formatDamage(ocrPreviewData.total_damage);

    // Overwrite warning
    const warn = document.getElementById('ocr-overwrite-warning');
    warn.style.display = ocrPreviewData.existing_event_id ? '' : 'none';

    // Participants table
    const el = document.getElementById('ocr-participants-table');
    if (!ocrPreviewData.participants || ocrPreviewData.participants.length === 0) {
        el.innerHTML = '<p class="empty">No participants detected. Try different screenshots.</p>';
    } else {
        let html = `<table class="rk-table"><thead><tr>
            <th>#</th><th>Name</th><th>Tag</th><th>Damage</th><th>Attacks</th><th>Member Match</th>
        </tr></thead><tbody>`;
        for (const p of ocrPreviewData.participants) {
            const matched = p.member_id ? `✅ ${escapeHtml(p.member_name)}` : '❌';
            html += `<tr>
                <td>${p.rank_in_event}</td>
                <td>${escapeHtml(p.name_snapshot)}</td>
                <td>${escapeHtml(p.alliance_tag || '')}</td>
                <td>${formatDamage(p.damage)}</td>
                <td>${p.attack_count != null ? p.attack_count : '—'}</td>
                <td>${matched}</td>
            </tr>`;
        }
        html += '</tbody></table>';
        el.innerHTML = html;
    }

    modal.style.display = 'flex';
}

async function confirmOCR() {
    const eventDate = document.getElementById('ocr-event-date').value;
    if (!eventDate) { showToast('Event date is required', 'warning'); return; }

    const body = {
        event_date: eventDate,
        total_damage: ocrPreviewData.total_damage,
        notes: document.getElementById('ocr-notes').value,
        participants: ocrPreviewData.participants || [],
    };
    if (ocrPreviewData.existing_event_id) {
        body.overwrite_event_id = ocrPreviewData.existing_event_id;
    }

    try {
        const res = await fetch('/api/marshal-guard/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Event imported', 'success');
            document.getElementById('ocr-preview-modal').style.display = 'none';
            clearFiles();
            ocrPreviewData = null;
            loadEvents();
            loadMemberStats();
        } else {
            showToast(data.message || 'Import failed', 'error');
        }
    } catch (e) {
        showToast('Import failed: ' + e.message, 'error');
    }
}

// ---- Manual event creation ----
function initManualForm() {
    document.getElementById('event-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('mg-date').value;
        if (!date) { showToast('Date is required', 'warning'); return; }

        try {
            const res = await fetch('/api/marshal-guard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_date: date,
                    total_alliance_damage: parseInt(document.getElementById('mg-total-damage').value) || 0,
                    notes: document.getElementById('mg-notes').value,
                }),
            });
            if (res.ok) {
                showToast('Event created', 'success');
                document.getElementById('event-modal').style.display = 'none';
                document.getElementById('event-form').reset();
                loadEvents();
            } else {
                showToast('Failed to create event', 'error');
            }
        } catch { showToast('Failed to create event', 'error'); }
    });
}

// ---- Modal management ----
function initModals() {
    // Add event button
    document.getElementById('add-event-btn').addEventListener('click', () => {
        document.getElementById('event-modal').style.display = 'flex';
    });

    // Close buttons
    document.querySelectorAll('.modal .close').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal').style.display = 'none');
    });

    // Overlay click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    });

    // OCR confirm/cancel
    document.getElementById('ocr-confirm-btn').addEventListener('click', confirmOCR);
    document.getElementById('ocr-cancel-btn').addEventListener('click', () => {
        document.getElementById('ocr-preview-modal').style.display = 'none';
    });
}

// ---- Search filter ----
function initSearch() {
    const input = document.getElementById('stats-search');
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase();
        const rows = document.querySelectorAll('#mg-stats-table tbody tr');
        rows.forEach(row => {
            const name = row.cells[0].textContent.toLowerCase();
            row.style.display = name.includes(q) ? '' : 'none';
        });
    });
}

// ---- Damage formatting ----
function formatDamage(val) {
    if (!val || val === 0) return '0';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'G';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    return val.toString();
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    const authed = await checkAuth();
    if (!authed) return;

    initTabs();
    initModals();
    initUpload();
    initManualForm();
    initSearch();

    await Promise.all([loadEvents(), loadMemberStats()]);
});
