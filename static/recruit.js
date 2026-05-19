// recruit.js — Recruitment Tracker page logic
'use strict';

const API_APPLICANTS = '/api/applicants';
const API_SETTINGS   = '/api/settings';

let allApplicants = [];
let isOfficer     = false; // R4, R5, or admin
let isR5Admin     = false; // R5 or admin (can delete)
let minPower      = 0;
let editingID     = null;  // applicant id being edited (null = new)
let statusTargetID = null; // applicant id for status modal

// ─── Auth & boot ─────────────────────────────────────────────────────────────
async function checkAuth() {
    const res = await fetch('/api/check-auth');
    if (!res.ok) { window.location.href = '/login.html'; return false; }
    const data = await res.json();
    if (!data.authenticated) { window.location.href = '/login.html'; return false; }
    if (data.must_change_password) { window.location.href = '/profile.html?must_change_password=1'; return false; }

    const rank = data.rank || '';
    isOfficer = data.is_admin || rank === 'R4' || rank === 'R5';
    isR5Admin = data.is_admin || rank === 'R5';

    let displayText = `👤 ${data.username}`;
    if (rank) displayText += ` (${rank})`;
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) {
        usernameDisplay.textContent = displayText;
        usernameDisplay.addEventListener('click', () => {
            const dropdown = document.getElementById('user-dropdown-menu');
            if (dropdown) dropdown.classList.toggle('show');
        });
    }

    // Show admin link in dropdown if user is admin
    const adminDropdownLink = document.getElementById('admin-dropdown-link');
    if (adminDropdownLink && data.is_admin) {
        adminDropdownLink.style.display = 'block';
    }

    if (isOfficer) {
        document.querySelectorAll('.officer-only').forEach(el => el.style.display = '');
    }
    return true;
}

async function loadSettings() {
    try {
        const res = await fetch(API_SETTINGS);
        if (!res.ok) return;
        const s = await res.json();
        minPower = s.min_power || 0;

        if (minPower > 0 || s.min_hq_level > 0) {
            const parts = [];
            if (minPower > 0) parts.push(`<strong>Minimum power:</strong> ${minPower.toLocaleString()}`);
            if (s.min_hq_level > 0) parts.push(`<strong>Minimum HQ level:</strong> ${s.min_hq_level}`);
            document.getElementById('requirements-text').innerHTML = 'Recruitment requirements &mdash; ' + parts.join(' &nbsp;|&nbsp; ');
            document.getElementById('requirements-banner').style.display = '';
        }
    } catch (_) { /* settings unavailable */ }
}

// ─── Load & render ────────────────────────────────────────────────────────────
async function loadApplicants() {
    const res = await fetch(API_APPLICANTS);
    if (!res.ok) {
        document.getElementById('applicant-list').innerHTML = '<div class="error-state">Failed to load applicants.</div>';
        return;
    }
    allApplicants = await res.json();
    renderApplicants();
}

function renderApplicants() {
    const filter  = document.getElementById('status-filter').value;
    const list    = filter === 'all' ? allApplicants : allApplicants.filter(a => a.status === filter);
    const today   = new Date().toISOString().slice(0, 10);
    const container = document.getElementById('applicant-list');

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:32px; text-align:center; color:var(--text-muted);">No applicants in this category.</div>';
        return;
    }

    container.innerHTML = list.map(a => {
        const trialExpired = a.status === 'on_trial' && a.trial_end_date && a.trial_end_date < today;
        const belowPower   = minPower > 0 && a.power != null && a.power < minPower;
        const statusBadge  = statusBadgeHTML(a.status, trialExpired);

        const powerText = a.power != null
            ? `<span class="${belowPower ? 'text-danger' : ''}" title="${belowPower ? 'Below minimum power requirement' : ''}">${Number(a.power).toLocaleString()}${belowPower ? ' ⚠️' : ''}</span>`
            : '<span style="color:var(--text-muted)">—</span>';

        const metaItems = [];
        if (a.rank)       metaItems.push(`<span class="rank-badge">${esc(a.rank)}</span>`);
        if (a.vouched_by) metaItems.push(`👋 Vouched by <strong>${esc(a.vouched_by)}</strong>`);
        if (a.trial_end_date) metaItems.push(`⏱️ Trial ends: <strong class="${trialExpired ? 'text-danger' : ''}">${a.trial_end_date}</strong>${trialExpired ? ' <em>(expired)</em>' : ''}`);
        if (a.decision_by) metaItems.push(`✅ Decision by <strong>${esc(a.decision_by)}</strong>${a.decided_at ? ' on ' + a.decided_at.slice(0,10) : ''}`);

        const notesHTML = a.notes
            ? `<div class="conduct-notes" style="margin-top:8px; font-size:0.9em; color:var(--text-muted);">${esc(a.notes)}</div>`
            : '';
        const rejectionHTML = a.rejection_reason
            ? `<div class="conduct-notes" style="margin-top:6px; font-size:0.85em; background:var(--bs-danger-bg,rgba(220,38,38,0.1)); padding:6px 10px; border-radius:4px; color:var(--accent-danger,#dc2626);">🔒 <em>${esc(a.rejection_reason)}</em></div>`
            : '';

        const editBtn   = isOfficer ? `<button class="btn-icon" onclick="openEditModal(${a.id})" title="Edit">✏️</button>` : '';
        const statusBtn = isOfficer ? `<button class="secondary-btn btn-sm" onclick="openStatusModal(${a.id})" style="font-size:0.8em; padding:3px 10px;">Change status</button>` : '';
        const deleteBtn = isR5Admin  ? `<button class="btn-icon" onclick="deleteApplicant(${a.id}, '${esc(a.name)}')" title="Delete" style="color:var(--accent-danger);">🗑️</button>` : '';

        return `
        <div class="recommendation-item ${trialExpired ? 'trial-expired' : ''}" style="position:relative;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                    <strong style="font-size:1.05em;">${esc(a.name)}</strong>
                    &nbsp; ${statusBadge}
                    &nbsp; <span style="color:var(--text-muted); font-size:0.85em;">${a.applied_at ? a.applied_at.slice(0,10) : ''}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    ${powerText}
                    ${statusBtn}
                    ${editBtn}
                    ${deleteBtn}
                </div>
            </div>
            ${metaItems.length ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:8px; font-size:0.85em; color:var(--text-muted);">${metaItems.join(' &nbsp; ')}</div>` : ''}
            ${notesHTML}
            ${rejectionHTML}
        </div>`;
    }).join('');
}

function statusBadgeHTML(status, expired) {
    const labels = { pending: '⏳ Pending', on_trial: '🔍 On Trial', approved: '✅ Approved', rejected: '❌ Rejected' };
    const colors = {
        pending:  'var(--bs-warning-text, #856404)',
        on_trial: expired ? 'var(--accent-danger, #dc2626)' : 'var(--bs-info-text, #0c5460)',
        approved: 'var(--bs-success-text, #155724)',
        rejected: 'var(--bs-secondary-text, #6c757d)',
    };
    const bgs = {
        pending:  'var(--bs-warning-bg, rgba(255,193,7,0.2))',
        on_trial: expired ? 'rgba(220,38,38,0.1)' : 'var(--bs-info-bg, rgba(23,162,184,0.15))',
        approved: 'var(--bs-success-bg, rgba(40,167,69,0.15))',
        rejected: 'var(--bs-secondary-bg, rgba(108,117,125,0.15))',
    };
    return `<span style="background:${bgs[status]||''}; color:${colors[status]||''}; padding:2px 8px; border-radius:10px; font-size:0.82em; font-weight:600;">${labels[status] || status}</span>`;
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────
function openAddModal() {
    editingID = null;
    document.getElementById('modal-title').textContent = 'Add Applicant';
    document.getElementById('applicant-form').reset();
    document.getElementById('modal-trial-group').style.display = 'none';
    document.getElementById('modal-rejection-group').style.display = 'none';
    document.getElementById('modal-power-warn').style.display = 'none';
    document.getElementById('applicant-modal').style.display = 'flex';
}

function openEditModal(id) {
    const a = allApplicants.find(x => x.id === id);
    if (!a) return;
    editingID = id;
    document.getElementById('modal-title').textContent = 'Edit Applicant';
    document.getElementById('modal-name').value    = a.name || '';
    document.getElementById('modal-power').value   = a.power != null ? a.power : '';
    document.getElementById('modal-rank').value    = a.rank  || '';
    document.getElementById('modal-vouched').value = a.vouched_by || '';
    document.getElementById('modal-notes').value   = a.notes || '';
    document.getElementById('modal-status').value  = a.status || 'pending';
    document.getElementById('modal-trial-end').value   = a.trial_end_date || '';
    document.getElementById('modal-rejection').value   = a.rejection_reason || '';
    handleModalStatusChange(a.status);
    checkModalPowerWarn();
    document.getElementById('applicant-modal').style.display = 'flex';
}

function closeApplicantModal() {
    document.getElementById('applicant-modal').style.display = 'none';
}

function handleModalStatusChange(status) {
    document.getElementById('modal-trial-group').style.display     = status === 'on_trial' ? '' : 'none';
    document.getElementById('modal-rejection-group').style.display = (status === 'rejected' && isOfficer) ? '' : 'none';
}

function checkModalPowerWarn() {
    const p    = parseInt(document.getElementById('modal-power').value);
    const warn = document.getElementById('modal-power-warn');
    if (minPower > 0 && !isNaN(p) && p < minPower) {
        warn.textContent = `⚠️ Below minimum power (${minPower.toLocaleString()})`;
        warn.style.display = '';
    } else {
        warn.style.display = 'none';
    }
}

document.getElementById('modal-status').addEventListener('change', e => handleModalStatusChange(e.target.value));
document.getElementById('modal-power').addEventListener('input', checkModalPowerWarn);
document.getElementById('modal-cancel-btn').addEventListener('click', closeApplicantModal);

document.getElementById('applicant-form').addEventListener('submit', async e => {
    e.preventDefault();

    const statusVal = document.getElementById('modal-status').value;
    const body = {
        name:       document.getElementById('modal-name').value.trim(),
        power:      document.getElementById('modal-power').value ? parseInt(document.getElementById('modal-power').value) : null,
        rank:       document.getElementById('modal-rank').value.trim() || null,
        vouched_by: document.getElementById('modal-vouched').value.trim() || null,
        notes:      document.getElementById('modal-notes').value.trim() || null,
        status:     statusVal,
    };

    try {
        let res;
        if (editingID === null) {
            // Create
            res = await fetch(API_APPLICANTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } else {
            // Update fields
            res = await fetch(`${API_APPLICANTS}/${editingID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        }
        if (!res.ok) { const t = await res.text(); throw new Error(t); }

        // If editing and status changed, also fire status update
        if (editingID !== null) {
            const existing = allApplicants.find(x => x.id === editingID);
            if (existing && existing.status !== statusVal) {
                const statusBody = {
                    status: statusVal,
                    trial_end_date:    statusVal === 'on_trial' ? (document.getElementById('modal-trial-end').value || null) : null,
                    rejection_reason:  statusVal === 'rejected' ? (document.getElementById('modal-rejection').value.trim() || null) : null,
                };
                const statusRes = await fetch(`${API_APPLICANTS}/${editingID}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(statusBody),
                });
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    if (statusData.member_created) {
                        closeApplicantModal();
                        showToast('Applicant updated. Added to member roster as R1 (not eligible for train).', 'success');
                        await loadApplicants();
                        return;
                    }
                }
            }
        }

        closeApplicantModal();
        showToast(editingID === null ? 'Applicant added.' : 'Applicant updated.', 'success');
        await loadApplicants();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});

// ─── Status modal ─────────────────────────────────────────────────────────────
function openStatusModal(id) {
    const a = allApplicants.find(x => x.id === id);
    if (!a) return;
    statusTargetID = id;
    document.getElementById('status-modal-title').textContent = `Change status — ${a.name}`;
    document.getElementById('status-select').value            = a.status;
    document.getElementById('status-trial-end').value         = a.trial_end_date || '';
    document.getElementById('status-rejection').value         = a.rejection_reason || '';
    handleStatusModalChange(a.status);
    document.getElementById('status-modal').style.display = 'flex';
}

function closeStatusModal() {
    document.getElementById('status-modal').style.display = 'none';
    statusTargetID = null;
}

function handleStatusModalChange(status) {
    document.getElementById('status-trial-group').style.display     = status === 'on_trial' ? '' : 'none';
    document.getElementById('status-rejection-group').style.display = (status === 'rejected' && isOfficer) ? '' : 'none';
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function deleteApplicant(id, name) {
    const confirmed = await showConfirm(`Delete applicant "${name}"? This cannot be undone.`, 'Delete Applicant', 'Delete', 'Cancel', true);
    if (!confirmed) return;
    try {
        const res = await fetch(`${API_APPLICANTS}/${id}`, { method: 'DELETE' });
        if (!res.ok) { const t = await res.text(); throw new Error(t); }
        showToast('Applicant deleted.', 'success');
        await loadApplicants();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ─── Event wiring & Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('add-applicant-btn').addEventListener('click', openAddModal);
    document.getElementById('status-filter').addEventListener('change', renderApplicants);
    document.getElementById('status-select').addEventListener('change', e => handleStatusModalChange(e.target.value));
    document.getElementById('status-cancel-btn').addEventListener('click', closeStatusModal);
    document.getElementById('status-confirm-btn').addEventListener('click', async () => {
        if (!statusTargetID) return;
        const status = document.getElementById('status-select').value;
        const body = {
            status,
            trial_end_date:   status === 'on_trial' ? (document.getElementById('status-trial-end').value || null) : null,
            rejection_reason: status === 'rejected'  ? (document.getElementById('status-rejection').value.trim() || null) : null,
        };
        try {
            const res = await fetch(`${API_APPLICANTS}/${statusTargetID}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) { const t = await res.text(); throw new Error(t); }
            const data = await res.json();
            closeStatusModal();
            if (data.member_created) {
                showToast('Status updated. Added to member roster as R1 (not eligible for train).', 'success');
            } else {
                showToast('Status updated.', 'success');
            }
            await loadApplicants();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });

    // Close modals on overlay click
    document.getElementById('applicant-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeApplicantModal();
    });
    document.getElementById('status-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeStatusModal();
    });

    if (!await checkAuth()) return;
    await Promise.all([loadSettings(), loadApplicants()]);
});
