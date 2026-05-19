// Profile page

// Check authentication
let mustChangePassword = false;
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/check-auth`);
        if (!response.ok) {
            window.location.href = '/login.html';
            return false;
        }
        const data = await response.json();
        document.getElementById('username-display').textContent = `👤 ${data.username}`;
        
        // Display profile info
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
            banner.innerHTML = '⚠️ <strong>You must change your password before continuing.</strong> Default credentials are not allowed.';
            const main = document.querySelector('main');
            if (main) main.prepend(banner);
            // Scroll to password form
            const pwForm = document.getElementById('password-form');
            if (pwForm) pwForm.scrollIntoView({ behavior: 'smooth' });
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

// Change password
document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match!', 'warning');
        return;
    }

    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters!', 'warning');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, 'Saving...');
    try {
        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        showToast('Password changed successfully!', 'success');
        document.getElementById('password-form').reset();
        if (mustChangePassword) {
            mustChangePassword = false;
            const banner = document.querySelector('.password-change-banner');
            if (banner) banner.remove();
            showToast('Password updated! Redirecting...', 'success');
            setTimeout(() => { window.location.href = '/'; }, 1500);
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showToast('Failed to change password: ' + error.message, 'error');
    } finally {
        clearButtonLoading(btn);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const authData = await checkAuth();
    await setupEventListeners();
    if (authData && authData.member_id) {
        loadMGProfileStats(authData.member_id);
    }
});

// Load Marshal Guard participation for this member
async function loadMGProfileStats(memberId) {
    try {
        const res = await fetch('/api/marshal-guard/member-stats');
        if (!res.ok) return;
        const stats = await res.json();
        const mine = stats.find(s => s.member_id === memberId);
        const section = document.getElementById('mg-profile-section');
        if (!mine) return;
        section.style.display = '';
        document.getElementById('mg-profile-stats').innerHTML = `
            <p><strong>Events Participated:</strong> ${mine.event_count}</p>
            <p><strong>Total Damage:</strong> ${formatDamage(mine.total_damage)}</p>
            <p><strong>Average Rank:</strong> ${mine.avg_rank.toFixed(1)}</p>
            <p><strong>Best Damage:</strong> ${formatDamage(mine.best_damage)}</p>`;
    } catch (e) { /* silently fail */ }
}

function formatDamage(val) {
    if (!val || val === 0) return '0';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'G';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    return val.toString();
}
