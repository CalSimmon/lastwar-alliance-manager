const API_BASE = '/api';
const SETTINGS_URL = `${API_BASE}/settings`;

let isR5OrAdmin = false;
let currentTimezones = ["Europe/London"];

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/check-auth`);
        if (!response.ok) {
            window.location.href = '/login.html';
            return false;
        }
        const data = await response.json();
        document.getElementById('username-display').textContent = `👤 ${data.username}`;
        isR5OrAdmin = data.is_r5_or_admin || false;
        
        // Disable form if not R5 or admin
        if (!isR5OrAdmin) {
            const form = document.getElementById('settings-form');
            const inputs = form.querySelectorAll('input, textarea, button[type="submit"]');
            inputs.forEach(input => input.disabled = true);
            
            const notice = document.createElement('div');
            notice.className = 'permission-notice';
            notice.style.cssText = 'background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px;';
            notice.innerHTML = '<p>ℹ️ Only R5 members and admins can modify settings.</p>';
            form.parentNode.insertBefore(notice, form);
        }
        
        return data;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return false;
    }
}

// Setup event listeners after auth check
async function setupEventListeners() {
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('dropdown-logout-btn');
    const adminLink = document.getElementById('admin-dropdown-link');
    
    if (usernameDisplay) {
        usernameDisplay.addEventListener('click', toggleUserDropdown);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Check if user is admin to show admin link
    try {
        const response = await fetch(`${API_BASE}/check-auth`);
        const data = await response.json();
        if (data.is_admin && adminLink) {
            adminLink.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('user-dropdown-menu');
        const usernameBtn = document.getElementById('username-display');
        if (dropdown && usernameBtn && !usernameBtn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
}

// Toggle user dropdown menu
function toggleUserDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Logout handler
async function handleLogout(event) {
    event.preventDefault();
    try {
        await fetch(`${API_BASE}/logout`, { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch(SETTINGS_URL);
        if (!response.ok) throw new Error('Failed to load settings');
        
        const settings = await response.json();
        
        document.getElementById('award-first').value = settings.award_first_points;
        document.getElementById('award-second').value = settings.award_second_points;
        document.getElementById('award-third').value = settings.award_third_points;
        document.getElementById('recommendation-points').value = settings.recommendation_points || 10;
        document.getElementById('recent-conductor-days').value = settings.recent_conductor_penalty_days;
        document.getElementById('above-average-penalty').value = settings.above_average_conductor_penalty;
        document.getElementById('r4r5-rank-boost').value = settings.r4r5_rank_boost;
        document.getElementById('first-time-boost').value = settings.first_time_conductor_boost || 5;
        document.getElementById('schedule-message-template').value = settings.schedule_message_template || 'Train Schedule - Week {WEEK}\n\n{SCHEDULES}\n\nNext in line:\n{NEXT_3}';
        document.getElementById('daily-message-template').value = settings.daily_message_template || 'ALL ABOARD! Daily Train Assignment\n\nDate: {DATE}\n\nToday\'s Conductor: {CONDUCTOR_NAME} ({CONDUCTOR_RANK})\nBackup Engineer: {BACKUP_NAME} ({BACKUP_RANK})\n\nDEPARTURE SCHEDULE:\n- 15:00 ST (17:00 UK) - Conductor {CONDUCTOR_NAME}, please request train assignment in alliance chat\n- 16:30 ST (18:30 UK) - If conductor hasn\'t shown up, Backup {BACKUP_NAME} takes over and assigns train to themselves\n\nRemember: Communication is key! Let the alliance know if you can\'t make it.\n\nAll aboard for another successful run!';
        
        // Server timezone
        document.getElementById('server-timezone').value = settings.server_timezone || 'UTC';
        
        // Train times
        document.getElementById('conductor-time').value = settings.conductor_time || '15:00';
        document.getElementById('backup-time').value = settings.backup_time || '16:30';
        
        // Display timezones
        currentTimezones = JSON.parse(settings.display_timezones || '["Europe/London"]');
        renderTimezoneTags();
        updateTimePreview();
        
        // Power tracking
        const powerTrackingEnabled = settings.power_tracking_enabled || false;
        document.getElementById('power-tracking-enabled').checked = powerTrackingEnabled;
        togglePowerUploadSection(powerTrackingEnabled);
    } catch (error) {
        console.error('Error loading settings:', error);
        alert('Failed to load settings');
    }
}

// Save settings
document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!isR5OrAdmin) {
        alert('You do not have permission to modify settings. Only R5 members and admins can do this.');
        return;
    }
    
    const settings = {
        award_first_points: parseInt(document.getElementById('award-first').value),
        award_second_points: parseInt(document.getElementById('award-second').value),
        award_third_points: parseInt(document.getElementById('award-third').value),
        recommendation_points: parseInt(document.getElementById('recommendation-points').value),
        recent_conductor_penalty_days: parseInt(document.getElementById('recent-conductor-days').value),
        above_average_conductor_penalty: parseInt(document.getElementById('above-average-penalty').value),
        r4r5_rank_boost: parseInt(document.getElementById('r4r5-rank-boost').value),
        first_time_conductor_boost: parseInt(document.getElementById('first-time-boost').value),
        schedule_message_template: document.getElementById('schedule-message-template').value,
        daily_message_template: document.getElementById('daily-message-template').value,
        power_tracking_enabled: document.getElementById('power-tracking-enabled').checked,
        server_timezone: document.getElementById('server-timezone').value,
        conductor_time: document.getElementById('conductor-time').value,
        backup_time: document.getElementById('backup-time').value,
        display_timezones: JSON.stringify(currentTimezones)
    };
    
    try {
        const response = await fetch(SETTINGS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }
        
        alert('✅ Settings saved successfully!');
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ Failed to save settings: ' + error.message);
    }
});

// Reset to defaults
document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
        document.getElementById('award-first').value = 3;
        document.getElementById('award-second').value = 2;
        document.getElementById('award-third').value = 1;
        document.getElementById('recommendation-points').value = 10;
        document.getElementById('recent-conductor-days').value = 30;
        document.getElementById('above-average-penalty').value = 10;
        document.getElementById('r4r5-rank-boost').value = 5;
        document.getElementById('first-time-boost').value = 5;
        document.getElementById('schedule-message-template').value = 'Train Schedule - Week {WEEK}\n\n{SCHEDULES}\n\nNext in line:\n{NEXT_3}';
        document.getElementById('daily-message-template').value = 'Daily train reminder for {DAY}, {DATE}:\\n🚂 Conductor: {CONDUCTOR} - Please be online at {CONDUCTOR_TIME}\\n🔄 Backup: {BACKUP} - Please be ready at {BACKUP_TIME}\\n\\nAsk in alliance chat for the train to be assigned. Thanks for keeping the train golden!';
        document.getElementById('server-timezone').value = 'Etc/GMT+2';
        document.getElementById('conductor-time').value = '15:00';
        document.getElementById('backup-time').value = '16:30';
        currentTimezones = ['Europe/London'];
        renderTimezoneTags();
        updateTimePreview();
        document.getElementById('power-tracking-enabled').checked = false;
    }
});

// Power tracking toggle
function togglePowerUploadSection(enabled) {
    const uploadLink = document.getElementById('power-upload-link');
    if (uploadLink) {
        uploadLink.style.display = enabled ? 'block' : 'none';
    }
}

// Timezone management
function renderTimezoneTags() {
    const container = document.getElementById('timezone-tags');
    container.innerHTML = '';
    
    if (currentTimezones.length === 0) {
        container.innerHTML = '<em style="color: var(--text-muted);">No additional timezones configured</em>';
        return;
    }
    
    currentTimezones.forEach((tz, index) => {
        const tag = document.createElement('div');
        tag.className = 'timezone-tag';
        tag.innerHTML = `
            <span>${tz}</span>
            <button class="remove-btn" data-index="${index}" type="button">×</button>
        `;
        container.appendChild(tag);
    });
    
    // Add event listeners to remove buttons
    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentTimezones.splice(index, 1);
            renderTimezoneTags();
            updateTimePreview();
        });
    });
}

document.getElementById('add-timezone-btn').addEventListener('click', () => {
    const select = document.getElementById('timezone-selector');
    const timezone = select.value;
    
    if (!timezone) {
        alert('Please select a timezone first');
        return;
    }
    
    if (currentTimezones.includes(timezone)) {
        alert('This timezone is already added');
        return;
    }
    
    currentTimezones.push(timezone);
    renderTimezoneTags();
    updateTimePreview();
    select.value = '';
});

// Update time preview
function updateTimePreview() {
    const conductorTime = document.getElementById('conductor-time').value;
    const backupTime = document.getElementById('backup-time').value;
    
    if (!conductorTime || currentTimezones.length === 0) {
        document.getElementById('time-preview').textContent = 'Configure times above to see preview';
        return;
    }
    
    // Simple client-side preview (actual formatting happens server-side with DST)
    const preview = `${conductorTime} ST / ...`;
    document.getElementById('time-preview').textContent = `Conductor: ${conductorTime} ST (will show in ${currentTimezones.length} timezone${currentTimezones.length !== 1 ? 's' : ''})`;
}

document.getElementById('conductor-time').addEventListener('change', updateTimePreview);
document.getElementById('backup-time').addEventListener('change', updateTimePreview);

document.getElementById('power-tracking-enabled').addEventListener('change', (e) => {
    togglePowerUploadSection(e.target.checked);
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth();
    if (auth) {
        await setupEventListeners();
        await loadSettings();
    }
});
