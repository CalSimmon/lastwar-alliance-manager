const API_URL = '/api/conduct-reports';
const MEMBERS_URL = '/api/members';

let allMembers = [];
let allConductReports = [];
let currentUsername = '';
let currentUserId = 0;
let currentView = 'list'; // 'list' or 'grouped'
let currentFilter = 'all'; // 'all', 'active', 'positive', 'negative', 'mine'

// Chart instances
let pointsChart = null;
let membersChart = null;
let timelineChart = null;

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/login.html';
            return false;
        }
        
        currentUsername = data.username;
        currentUserId = data.user_id || 0;
        let displayText = `👤 ${currentUsername}`;
        if (data.rank) {
            displayText += ` (${data.rank})`;
        }
        document.getElementById('username-display').textContent = displayText;
        
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
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
        const response = await fetch('/api/check-auth');
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
    const confirmed = await showConfirm('Are you sure you want to logout?', 'Logout', 'Logout');
    if (!confirmed) return;
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out. Please try again.', 'error');
    }
}

// Load members
async function loadMembers() {
    try {
        const response = await fetch(MEMBERS_URL);
        allMembers = await response.json();
        allMembers.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        populateMemberSelect();
    } catch (error) {
        console.error('Error loading members:', error);
        showToast('Failed to load members.', 'error');
    }
}

// Populate member select dropdown
function populateMemberSelect() {
    const select = document.getElementById('member-select');
    select.innerHTML = '<option value="">Select a member...</option>';
    
    allMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = `${member.name} (${member.rank})`;
        select.appendChild(option);
    });
}

// Setup search filter for member dropdown
function setupMemberSearch() {
    const searchInput = document.getElementById('member-search');
    const selectElement = document.getElementById('member-select');
    
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const options = selectElement.options;
        let visibleCount = 0;
        
        for (let i = 1; i < options.length; i++) {
            const text = options[i].textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                options[i].style.display = '';
                visibleCount++;
            } else {
                options[i].style.display = 'none';
            }
        }
        
        // Auto-select if only one match
        if (visibleCount === 1 && searchTerm) {
            for (let i = 1; i < options.length; i++) {
                if (options[i].style.display !== 'none') {
                    selectElement.selectedIndex = i;
                    break;
                }
            }
        }
    });
}

// Load conduct reports
async function loadConductReports() {
    try {
        const response = await fetch(API_URL);
        allConductReports = await response.json();
        updateStatistics();
        updateCharts();
        renderConductReports();
    } catch (error) {
        console.error('Error loading conduct reports:', error);
        showToast('Failed to load conduct reports.', 'error');
    }
}

// Update statistics dashboard
function updateStatistics() {
    const active = allConductReports.filter(r => !r.expired);
    const expired = allConductReports.filter(r => r.expired);
    const positive = active.filter(r => r.points > 0);
    const negative = active.filter(r => r.points < 0);
    
    document.getElementById('total-reports').textContent = active.length;
    document.getElementById('positive-reports').textContent = positive.length;
    document.getElementById('negative-reports').textContent = negative.length;
    document.getElementById('expired-reports').textContent = expired.length;
}

// Update all charts
function updateCharts() {
    updatePointsChart();
    updateMembersChart();
    updateTimelineChart();
}

// Create/Update Points Distribution Chart
function updatePointsChart() {
    const ctx = document.getElementById('points-chart');
    if (!ctx) return;
    
    const active = allConductReports.filter(r => !r.expired);
    const positiveCount = active.filter(r => r.points > 0).length;
    const negativeCount = active.filter(r => r.points < 0).length;
    const neutralCount = active.filter(r => r.points === 0).length;
    
    if (pointsChart) {
        pointsChart.destroy();
    }
    
    pointsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Negative', 'Neutral'],
            datasets: [{
                data: [positiveCount, negativeCount, neutralCount],
                backgroundColor: [
                    'rgba(67, 233, 123, 0.8)',
                    'rgba(245, 87, 108, 0.8)',
                    'rgba(156, 163, 175, 0.8)'
                ],
                borderColor: [
                    'rgba(67, 233, 123, 1)',
                    'rgba(245, 87, 108, 1)',
                    'rgba(156, 163, 175, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Create/Update Top Members Chart
function updateMembersChart() {
    const ctx = document.getElementById('members-chart');
    if (!ctx) return;
    
    const active = allConductReports.filter(r => !r.expired);
    
    // Calculate net points per member
    const memberPoints = {};
    active.forEach(rec => {
        if (!memberPoints[rec.member_name]) {
            memberPoints[rec.member_name] = 0;
        }
        memberPoints[rec.member_name] += rec.points;
    });
    
    // Sort and get top 10 by absolute value
    const sorted = Object.entries(memberPoints)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 10);
    
    const labels = sorted.map(([name]) => name);
    const data = sorted.map(([, points]) => points);
    const colors = data.map(points => points >= 0 ? 'rgba(67, 233, 123, 0.8)' : 'rgba(245, 87, 108, 0.8)');
    const borderColors = data.map(points => points >= 0 ? 'rgba(67, 233, 123, 1)' : 'rgba(245, 87, 108, 1)');
    
    if (membersChart) {
        membersChart.destroy();
    }
    
    membersChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Net Points',
                data: data,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.x;
                            return `Net Points: ${value > 0 ? '+' : ''}${value}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Create/Update Timeline Chart
function updateTimelineChart() {
    const ctx = document.getElementById('timeline-chart');
    if (!ctx) return;
    
    // Get last 7 days
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        days.push(date);
    }
    
    const labels = days.map(d => {
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${month}/${day}`;
    });
    
    // Count recommendations per day
    const positiveData = days.map(date => {
        const dateStr = formatDateOnly(date);
        return allConductReports.filter(rec => {
            const recDate = formatDateOnly(new Date(rec.created_at));
            return recDate === dateStr && rec.points > 0;
        }).length;
    });
    
    const negativeData = days.map(date => {
        const dateStr = formatDateOnly(date);
        return allConductReports.filter(rec => {
            const recDate = formatDateOnly(new Date(rec.created_at));
            return recDate === dateStr && rec.points < 0;
        }).length;
    });
    
    if (timelineChart) {
        timelineChart.destroy();
    }
    
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Positive',
                data: positiveData,
                borderColor: 'rgba(67, 233, 123, 1)',
                backgroundColor: 'rgba(67, 233, 123, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }, {
                label: 'Negative',
                data: negativeData,
                borderColor: 'rgba(245, 87, 108, 1)',
                backgroundColor: 'rgba(245, 87, 108, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y} reports`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Helper function to format date as YYYY-MM-DD
function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Render conduct reports
function renderConductReports() {
    const container = document.getElementById('conduct-list');
    const filterSearch = document.getElementById('filter-search').value.toLowerCase();
    
    // Apply filter
    let filtered = allConductReports.filter(rec => {
        const memberMatch = rec.member_name.toLowerCase().includes(filterSearch);
        const creatorMatch = rec.created_by.toLowerCase().includes(filterSearch);
        const searchMatch = !filterSearch || memberMatch || creatorMatch;
        
        let statusMatch = true;
        if (currentFilter === 'active') {
            statusMatch = !rec.expired;
        } else if (currentFilter === 'positive') {
            statusMatch = !rec.expired && rec.points > 0;
        } else if (currentFilter === 'negative') {
            statusMatch = !rec.expired && rec.points < 0;
        } else if (currentFilter === 'mine') {
            statusMatch = rec.created_by_id === currentUserId;
        }
        
        return searchMatch && statusMatch;
    });
    
    if (filtered.length === 0) {
        container.innerHTML = '<p class="no-data">No conduct reports found.</p>';
        return;
    }
    
    if (currentView === 'grouped') {
        renderGroupedView(filtered, container);
    } else {
        renderListView(filtered, container);
    }
}

// Render list view
function renderListView(recs, container) {
    container.innerHTML = '';
    
    recs.forEach(rec => {
        const card = createConductCard(rec);
        container.appendChild(card);
    });
}

// Render grouped view (by member)
function renderGroupedView(recs, container) {
    container.innerHTML = '';
    
    // Group by member
    const grouped = {};
    recs.forEach(rec => {
        if (!grouped[rec.member_id]) {
            grouped[rec.member_id] = {
                member: { id: rec.member_id, name: rec.member_name, rank: rec.member_rank },
                recommendations: []
            };
        }
        grouped[rec.member_id].recommendations.push(rec);
    });
    
    Object.values(grouped).forEach(group => {
        const groupCard = document.createElement('div');
        groupCard.className = 'member-group-card';
        
        const totalPoints = group.recommendations.reduce((sum, r) => sum + r.points, 0);
        const activeRecs = group.recommendations.filter(r => !r.expired);
        
        groupCard.innerHTML = `
            <div class="member-group-header">
                <div class="member-info">
                    <span class="member-name">${group.member.name}</span>
                    <span class="rank-badge rank-badge-${group.member.rank.toLowerCase()}">${group.member.rank}</span>
                    <span class="conduct-count">${activeRecs.length} active</span>
                </div>
                <div class="member-total-points ${totalPoints >= 0 ? 'positive' : 'negative'}">
                    ${totalPoints > 0 ? '+' : ''}${totalPoints} pts
                </div>
            </div>
            <div class="grouped-recommendations"></div>
        `;
        
        const recsContainer = groupCard.querySelector('.grouped-recommendations');
        group.recommendations.forEach(rec => {
            const card = createConductCard(rec, true);
            recsContainer.appendChild(card);
        });
        
        container.appendChild(groupCard);
    });
}

// Create conduct report card
function createConductCard(rec, compact = false) {
    const card = document.createElement('div');
    card.className = `recommendation-card ${rec.expired ? 'expired' : ''}`;
    
    const pointsClass = rec.points > 0 ? 'positive' : (rec.points < 0 ? 'negative' : 'neutral');
    const pointsIcon = rec.points > 0 ? '✅' : (rec.points < 0 ? '❌' : '➖');
    
    const createdDate = new Date(rec.created_at);
    const now = new Date();
    const expiryDate = new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    const expiryText = rec.expired 
        ? '⏱️ Expired' 
        : `⏱️ ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
    
    card.innerHTML = `
        <div class="rec-header">
            ${!compact ? `
            <div class="member-info">
                <span class="member-name">${rec.member_name}</span>
                <span class="rank-badge rank-badge-${rec.member_rank.toLowerCase()}">${rec.member_rank}</span>
            </div>
            ` : ''}
            <div class="rec-points ${pointsClass}">
                ${pointsIcon} ${rec.points > 0 ? '+' : ''}${rec.points}
            </div>
        </div>
        <div class="rec-notes">${rec.notes || 'No notes provided'}</div>
        <div class="rec-footer">
            <div class="rec-meta">
                <span class="rec-by">by ${rec.created_by}</span>
                <span class="rec-date">${formatDate(rec.created_at)}</span>
                <span class="expiry-badge ${rec.expired ? 'expired' : ''}">${expiryText}</span>
            </div>
            ${rec.created_by_id === currentUserId ? `
                <button class="delete-btn" onclick="deleteConductReport(${rec.id})">🗑️ Delete</button>
            ` : ''}
        </div>
    `;
    
    return card;
}

// Submit conduct report
async function submitConductReport() {
    const memberId = parseInt(document.getElementById('member-select').value);
    const points = parseInt(document.getElementById('points-input').value);
    const notes = document.getElementById('notes-input').value.trim();
    
    if (!memberId) {
        showToast('Please select a member.', 'warning');
        return;
    }

    if (isNaN(points)) {
        showToast('Please enter valid points.', 'warning');
        return;
    }

    if (!notes) {
        showToast('Please provide notes for this report.', 'warning');
        return;
    }

    const btn = document.getElementById('submit-conduct-btn');
    setButtonLoading(btn, 'Submitting...');
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: memberId, points: points, notes: notes })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        document.getElementById('member-select').value = '';
        document.getElementById('member-search').value = '';
        document.getElementById('points-input').value = '';
        document.getElementById('notes-input').value = '';

        await loadConductReports();
        showToast('Conduct report submitted successfully!', 'success');
    } catch (error) {
        console.error('Error submitting conduct report:', error);
        showToast('Failed to submit conduct report: ' + error.message, 'error');
    } finally {
        clearButtonLoading(btn);
    }
}

// Delete conduct report
async function deleteConductReport(id) {
    const confirmed = await showConfirm('Are you sure you want to delete this conduct report?', 'Delete Report', 'Delete', 'Cancel', true);
    if (!confirmed) return;
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete conduct report');
        }

        await loadConductReports();
    } catch (error) {
        console.error('Error deleting conduct report:', error);
        showToast('Failed to delete conduct report.', 'error');
    }
}

// Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// Setup view toggle
function setupViewToggle() {
    const listBtn = document.getElementById('list-view-btn');
    const groupedBtn = document.getElementById('grouped-view-btn');
    
    listBtn.addEventListener('click', () => {
        currentView = 'list';
        listBtn.classList.add('active');
        groupedBtn.classList.remove('active');
        renderConductReports();
    });
    
    groupedBtn.addEventListener('click', () => {
        currentView = 'grouped';
        groupedBtn.classList.add('active');
        listBtn.classList.remove('active');
        renderConductReports();
    });
}

// Setup filter chips
function setupFilters() {
    const filterChips = document.querySelectorAll('.filter-chip');
    
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            renderConductReports();
        });
    });
    
    // Search filter
    const searchInput = document.getElementById('filter-search');
    searchInput.addEventListener('input', () => {
        renderConductReports();
    });
}

// Initialize
async function init() {
    const authenticated = await checkAuth();
    if (!authenticated) return;
    
    await setupEventListeners();
    await loadMembers();
    await loadConductReports();
    
    setupMemberSearch();
    setupViewToggle();
    setupFilters();
    
    // Submit button
    document.getElementById('submit-conduct-btn').addEventListener('click', submitConductReport);
}

// Run on page load
document.addEventListener('DOMContentLoaded', init);
