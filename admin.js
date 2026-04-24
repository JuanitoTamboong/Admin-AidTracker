// admin.js - Production Ready Version

// Initialize Supabase client
const SUPABASE_URL = 'https://gwvepxupoxyyydnisulb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dmVweHVwb3h5eXlkbmlzdWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDE4ODcsImV4cCI6MjA4MDM3Nzg4N30.Ku9SXTAKNMvHilgEpxj5HcVA-0TPt4ziuEq0Irao5Qc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Authentication state
let currentUser = null;

// Global state
let allReports = [];
let allUsers = [];
let allResponders = [];
let currentResponderId = null;

// Audit and Activity Monitoring
let auditLogs = [];
let activityLogs = [];
let lastActivityTime = Date.now();
let sessionTimeout = 30 * 60 * 1000;
let sessionWarningShown = false;

// Pagination state
let currentPage = 1;
let rowsPerPage = 25;
let sortColumn = 'name';
let sortDirection = 'asc';

// Audit pagination
let auditCurrentPage = 1;
let auditRowsPerPage = 50;

// Chart instances
let reportsTypeChart = null;
let reportsTimelineChart = null;
let locationChart = null;
let userActivityChart = null;

/* ---------------- AUTHENTICATION FUNCTIONS ---------------- */
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        showApp();
        logActivity('User authenticated successfully');
    } else {
        showLoginModal();
    }
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
        showLoginError('Please enter both email and password');
        return;
    }

    const loginBtn = document.querySelector('.modal-footer .btn.primary');
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    loginBtn.disabled = true;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        showLoginError(error.message || 'Login failed.');
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        loginBtn.disabled = false;
        return;
    }

    currentUser = data.user;
    document.getElementById('login-modal').style.display = 'none';
    showApp();
    logAudit(email, 'login_success', 'User logged in successfully', 'auth');
    logActivity('User logged in');
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await supabaseClient.auth.signOut();
        currentUser = null;
        document.getElementById('app').style.display = 'none';
        showLoginModal();
        localStorage.removeItem('aidtracker_session');
        logAudit('Admin', 'logout', 'User logged out', 'auth');
        logActivity('User logged out');
    }
}

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

function showApp() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    updateUserProfile();
    initializeApp();
}

function showLoginError(message) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function updateUserProfile() {
    if (currentUser) {
        const userNameEl = document.querySelector('.user-name');
        const userRoleEl = document.querySelector('.user-role');
        const avatarEl = document.querySelector('.avatar');

        if (userNameEl) {
            userNameEl.textContent = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Admin User';
        }
        if (userRoleEl) {
            userRoleEl.textContent = currentUser.app_metadata?.role || 'Administrator';
        }
        if (avatarEl) {
            const name = currentUser.user_metadata?.full_name || currentUser.email || 'AU';
            avatarEl.textContent = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
    }
}

/* ---------------- INITIALIZATION ---------------- */
function initializeApp() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.panel').forEach(sec => sec.classList.remove('active'));
            
            const target = btn.dataset.target;
            if (target) {
                document.getElementById(target).classList.add('active');
                loadPanelData(target);
            }
        });
    });

    const searchInput = document.getElementById('responder-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(searchResponders, 300));
    }

    const auditSearchInput = document.getElementById('audit-search');
    if (auditSearchInput) {
        auditSearchInput.addEventListener('input', debounce(() => updateAuditLogsTable(), 300));
    }

    const rowsPerPageSelect = document.getElementById('rows-per-page');
    if (rowsPerPageSelect) {
        rowsPerPageSelect.value = rowsPerPage.toString();
        rowsPerPageSelect.addEventListener('change', (e) => changeRowsPerPage(parseInt(e.target.value)));
    }

    initializeAuditAndActivity();
    setInterval(updateTimeDisplay, 60000);
    setInterval(fetchAllData, 30000);
    setInterval(updateSystemActivityStats, 300000);
    
    fetchAllData();
}

/* ---------------- EVENT LISTENERS SETUP ---------------- */
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            showApp();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showLoginModal();
        } else if (event === 'USER_UPDATED') {
            currentUser = session?.user || null;
            if (currentUser) updateUserProfile();
        }
    });
    
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });
    }

    const passwordToggle = document.getElementById('password-toggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', function() {
            const passwordInput = document.getElementById('login-password');
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    }
});

/* ---------------- FETCH DATA FROM SUPABASE ---------------- */
async function fetchAllData() {
    if (!currentUser) return;
    
    const updatedEl = document.getElementById('data-updated');
    if (updatedEl) updatedEl.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Updating...</span>';
    
    const { data: reports } = await supabaseClient
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
    allReports = reports || [];

    const { data: users } = await supabaseClient
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
    allUsers = users || [];

    await fetchResponders();
    
    updateDashboard();
    updateUsersTable();
    updateReportsTable();
    updateRespondersTable();
    updateStats();
    updateSystemActivityStats();
    updateTimeDisplay();
    
    logActivity('Data refreshed from database');
}

async function fetchResponders() {
    const { data: reports } = await supabaseClient
        .from('reports')
        .select('id, assigned_responders, assigned_unit, contact, status, created_at, updated_at')
        .not('assigned_responders', 'is', null)
        .order('created_at', { ascending: false });

    allResponders = [];
    
    if (reports) {
        reports.forEach(report => {
            if (report.assigned_responders && report.assigned_responders.trim() !== '') {
                const responderNames = report.assigned_responders.split(',').map(name => name.trim());
                responderNames.forEach((responderName, index) => {
                    allResponders.push({
                        id: `${report.id}_${index}`,
                        name: responderName,
                        unit: report.assigned_unit || 'Unassigned',
                        contact: report.contact || 'No contact',
                        status: report.status === 'assigned' ? 'Assigned' : 'Available',
                        report_id: report.id,
                        created_at: report.created_at,
                        updated_at: report.updated_at || report.created_at
                    });
                });
            }
        });
    }
}

/* ---------------- UPDATE FUNCTIONS ---------------- */
function updateDashboard() {
    updateDashboardStats();
    updateDashboardCharts();
    updateRecentActivity();
    updateQuickStats();
    updateNotificationBadges();
}

function updateDashboardStats() {
    const totalReports = allReports.length;
    const totalUsers = allUsers.length;
    const totalResponders = allResponders.length;
    const activeReports = allReports.filter(r => ['pending', 'investigating', 'assigned'].includes(r.status)).length;
    
    const reportsTrend = totalReports > 0 ? 12 : 0;
    const usersTrend = totalUsers > 0 ? 8 : 0;
    const respondersTrend = totalResponders > 0 ? 5 : 0;
    const activeReportsTrend = activeReports > 0 ? -3 : 0;
    
    const elements = {
        'total-reports': totalReports,
        'total-users': totalUsers,
        'dashboard-total-responders': totalResponders,
        'dashboard-active-reports': activeReports
    };
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
    
    const setTrend = (id, value, cls) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = `${value >= 0 ? '+' : ''}${value}%`;
            el.className = `dashboard-stat-trend ${value >= 0 ? 'positive' : 'negative'}`;
        }
    };
    setTrend('total-reports-trend', reportsTrend);
    setTrend('total-users-trend', usersTrend);
    setTrend('total-responders-trend', respondersTrend);
    setTrend('active-reports-trend', activeReportsTrend);
}

function updateDashboardCharts() {
    updateReportsByStatusChart();
    updateReportsTimelineChartDashboard();
}

function updateReportsByStatusChart() {
    const canvas = document.getElementById('reports-by-status-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const statusCounts = { pending: 0, investigating: 0, resolved: 0 };
    allReports.forEach(report => {
        const status = report.status || 'pending';
        if (statusCounts[status] !== undefined) statusCounts[status]++;
    });

    if (window.reportsByStatusChart) window.reportsByStatusChart.destroy();
    
    if (allReports.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No reports data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    window.reportsByStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Investigating', 'Resolved'],
            datasets: [{
                data: [statusCounts.pending, statusCounts.investigating, statusCounts.resolved],
                backgroundColor: ['#f59e0b', '#3b82f6', '#10b981'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

function updateReportsTimelineChartDashboard() {
    const canvas = document.getElementById('reports-timeline-chart-dashboard');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const today = new Date();
    const days = [];
    const counts = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        counts.push(allReports.filter(r => new Date(r.created_at).toDateString() === date.toDateString()).length);
    }
    
    if (window.reportsTimelineChartDashboard) window.reportsTimelineChartDashboard.destroy();
    
    if (allReports.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No reports data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    window.reportsTimelineChartDashboard = new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [{
                label: 'Reports',
                data: counts,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function updateRecentActivity() {
    const container = document.getElementById('recent-activity-items');
    if (!container) return;
    
    container.innerHTML = '';
    
    const recentActivities = [];
    const recentReports = allReports.slice(0, 5);
    recentReports.forEach(report => {
        recentActivities.push({
            message: `New report #${report.id} submitted`,
            time: formatTimeAgo(new Date(report.created_at)),
            icon: 'fas fa-exclamation-triangle',
            iconClass: 'report'
        });
    });
    
    const recentSystemActivities = activityLogs.slice(0, 5);
    recentSystemActivities.forEach(activity => {
        recentActivities.push({
            message: activity.message,
            time: formatTimeAgo(new Date(activity.timestamp)),
            icon: activity.icon,
            iconClass: 'system'
        });
    });
    
    recentActivities.sort((a, b) => new Date(b.time) - new Date(a.time));
    const displayActivities = recentActivities.slice(0, 5);
    
    if (displayActivities.length === 0) {
        container.innerHTML = `<div class="activity-item info"><div class="activity-icon system"><i class="fas fa-info-circle"></i></div><div class="activity-content"><div class="activity-message">No recent activity</div><div class="activity-time">--</div></div></div>`;
        return;
    }

    displayActivities.forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item ${activity.type || 'info'}`;
        item.innerHTML = `<div class="activity-icon ${activity.iconClass || 'system'}"><i class="${activity.icon}"></i></div><div class="activity-content"><div class="activity-message">${activity.message}</div><div class="activity-time">${activity.time}</div></div>`;
        container.appendChild(item);
    });
}

function updateQuickStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayReports = allReports.filter(r => new Date(r.created_at) >= today).length;
    const avgResponseTime = calculateAverageResponseTime();
    const highPriority = allReports.filter(r => ['high', 'critical'].includes(r.priority)).length;
    
    const quickStatIds = ['today-reports', 'avg-response', 'high-priority', 'coverage'];
    const quickStatValues = [todayReports, `${avgResponseTime}m`, highPriority, '85%'];
    quickStatIds.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (el) el.textContent = quickStatValues[idx];
    });
}

function calculateAverageResponseTime() {
    if (allReports.length === 0) return 0;
    let totalTime = 0, count = 0;
    allReports.forEach(report => {
        if (report.created_at && report.updated_at && report.status === 'resolved') {
            const diffMinutes = (new Date(report.updated_at) - new Date(report.created_at)) / (1000 * 60);
            if (diffMinutes > 0 && diffMinutes < 1440) { totalTime += diffMinutes; count++; }
        }
    });
    return count > 0 ? Math.round(totalTime / count) : 0;
}

function updateNotificationBadges() {
    const pendingReports = allReports.filter(r => r.status === 'pending').length;
    const assignedResponders = allResponders.filter(r => r.status === 'Assigned').length;
    
    const reportsBadge = document.querySelector('#btn-reports .notification-badge');
    const respondersBadge = document.querySelector('#btn-responders .notification-badge');
    
    if (reportsBadge) reportsBadge.textContent = pendingReports > 99 ? '99+' : pendingReports;
    if (respondersBadge) respondersBadge.textContent = assignedResponders > 99 ? '99+' : assignedResponders;
}

function updateStats() {
    const elements = {
        'total-responders': allResponders.length,
        'available-responders': allResponders.filter(r => ['Available', 'available'].includes(r.status)).length,
        'active-responders': allResponders.filter(r => ['Assigned', 'assigned'].includes(r.status)).length
    };
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
    
    const locations = new Set();
    allReports.forEach(report => {
        if (report.location && report.location.trim() !== '') locations.add(report.location);
        else if (report.latitude && report.longitude) {
            const lat = parseFloat(report.latitude).toFixed(2);
            const lng = parseFloat(report.longitude).toFixed(2);
            if (!isNaN(lat) && !isNaN(lng)) locations.add(`${lat},${lng}`);
        }
    });
    const locationsEl = document.getElementById('locations-covered');
    if (locationsEl) locationsEl.textContent = locations.size;
}

function updateTimeDisplay() {
    const timeElement = document.getElementById('data-updated');
    if (timeElement) {
        timeElement.innerHTML = `<i class="fas fa-sync-alt"></i><span>Updated at ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
    }
}

function updateUsersTable() {
    const tbody = document.getElementById('users-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No users found</td></tr>';
        return;
    }
    
    allUsers.forEach(user => {
        const row = document.createElement('tr');
        const userReports = allReports.filter(r => r.reporter && user.email && r.reporter.toLowerCase() === user.email.toLowerCase()).length;
        row.innerHTML = `
            <td>${user.full_name || user.name || user.email?.split('@')[0] || 'Unknown'}</td>
            <td>${user.email || 'No email'}</td>
            <td>${user.role || 'Citizen'}</td>
            <td>${userReports}</td>
            <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</td>
            <td><button class="btn ghost small" onclick="viewUser('${user.id}')">View</button></td>
        `;
        tbody.appendChild(row);
    });
}

function updateReportsTable() {
    const tbody = document.getElementById('reports-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (allReports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No reports found</td></tr>';
        return;
    }
    
    allReports.forEach(report => {
        const row = document.createElement('tr');
        let reporterName = report.reporter || 'Anonymous';
        if (typeof reporterName === 'string' && reporterName.includes('@')) {
            const user = allUsers.find(u => u.email?.toLowerCase() === reporterName.toLowerCase());
            if (user && (user.full_name || user.name)) reporterName = user.full_name || user.name;
        }
        
        let location = 'Unknown location';
        if (report.location && report.location.trim() !== '') location = report.location;
        else if (report.latitude && report.longitude) {
            const lat = parseFloat(report.latitude), lng = parseFloat(report.longitude);
            if (!isNaN(lat) && !isNaN(lng)) location = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
        
        row.innerHTML = `
            <td>#${report.id?.toString().padStart(5, '0') || 'N/A'}</td>
            <td>${reporterName}</td>
            <td>${report.type_display || report.type || 'Emergency'}</td>
            <td>${location}</td>
            <td>${report.created_at ? new Date(report.created_at).toLocaleString() : 'Unknown'}</td>
            <td><span class="status-badge ${getStatusClass(report.status || 'pending')}">${getStatusText(report.status || 'pending')}</span></td>
            <td>
                <button class="btn ghost small" onclick="viewReport('${report.id}')">View</button>
                <button class="btn ghost small" onclick="updateReportStatus('${report.id}')">Update</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateRespondersTable() {
    const tbody = document.getElementById('responders-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (allResponders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;"><i class="fas fa-users" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i><div>No responders found</div><div>Responders are created when assigned to reports</div></td></tr>`;
        return;
    }
    
    const sortedResponders = [...allResponders].sort((a, b) => {
        let aVal = a[sortColumn] || '', bVal = b[sortColumn] || '';
        if (sortColumn === 'lastActive') { aVal = a.updated_at || a.created_at; bVal = b.updated_at || b.created_at; }
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    const startIdx = (currentPage - 1) * rowsPerPage;
    const pageResponders = sortedResponders.slice(startIdx, startIdx + rowsPerPage);
    
    pageResponders.forEach(responder => {
        const row = document.createElement('tr');
        let lastActive = responder.updated_at ? formatTimeAgo(new Date(responder.updated_at)) : 'Unknown';
        let statusClass = 'status-badge ', statusText = responder.status || 'Available';
        if (['Available', 'available'].includes(responder.status)) { statusClass += 'status-available'; statusText = 'Available'; }
        else if (['Assigned', 'assigned'].includes(responder.status)) { statusClass += 'status-assigned'; statusText = 'Assigned'; }
        else { statusClass += 'status-on-duty'; statusText = 'On Duty'; }
        
        row.innerHTML = `
            <td class="checkbox-col"><input type="checkbox" class="row-select" onchange="handleRowSelect()"></td>
            <td><div class="responder-info"><div class="responder-name">${responder.name || 'Unknown'}</div></div></td>
            <td><div class="unit-info"><div class="unit-name">${responder.unit || 'Unassigned'}</div></div></td>
            <td><div class="contact-info"><div class="contact-phone">${responder.contact || 'No contact'}</div></div></td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td><div class="time-info"><div class="time-text">${lastActive}</div></div></td>
            <td><div class="action-buttons"><button class="action-btn" title="Update Status" onclick="openStatusModal('${responder.id}')"><i class="fas fa-sync-alt"></i></button><button class="action-btn" title="View Details" onclick="viewResponderDetails('${responder.id}')"><i class="fas fa-eye"></i></button></div></td>
        `;
        tbody.appendChild(row);
    });
    
    const showingEl = document.getElementById('showing-count');
    const totalEl = document.getElementById('total-count');
    if (showingEl) showingEl.textContent = Math.min(allResponders.length, currentPage * rowsPerPage);
    if (totalEl) totalEl.textContent = allResponders.length;
}

/* ---------------- HELPER FUNCTIONS ---------------- */
function getStatusClass(status) {
    const map = { pending: 'status-pending', investigating: 'status-investigating', assigned: 'status-assigned', resolved: 'status-resolved', cancelled: 'status-cancelled', submitted: 'status-pending' };
    return map[status] || 'status-pending';
}

function getStatusText(status) {
    const map = { pending: 'Pending', investigating: 'Investigating', assigned: 'Assigned', resolved: 'Resolved', cancelled: 'Cancelled', submitted: 'Submitted' };
    return map[status] || 'Pending';
}

function formatTimeAgo(date) {
    if (!date) return 'Unknown';
    const diffMins = Math.floor((new Date() - date) / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    if (diffMins < 10080) return `${Math.floor(diffMins / 1440)}d ago`;
    return date.toLocaleDateString();
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/* ---------------- PAGINATION & SEARCH ---------------- */
function changeRowsPerPage(value) {
    rowsPerPage = value;
    currentPage = 1;
    updateRespondersTable();
}

function nextPage() {
    if (currentPage < Math.ceil(allResponders.length / rowsPerPage)) {
        currentPage++;
        updateRespondersTable();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        updateRespondersTable();
    }
}

function searchResponders(event) {
    const term = event.target.value.toLowerCase().trim();
    if (!term) { updateRespondersTable(); return; }
    const filtered = allResponders.filter(r => (r.name && r.name.toLowerCase().includes(term)) || (r.unit && r.unit.toLowerCase().includes(term)) || (r.contact && r.contact.toLowerCase().includes(term)));
    displayFilteredResponders(filtered);
}

function displayFilteredResponders(responders) {
    const tbody = document.getElementById('responders-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (responders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;"><i class="fas fa-search" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i><div>No responders found matching your search</div></td></tr>`;
        return;
    }
    responders.forEach((responder, idx) => tbody.appendChild(createResponderRow(responder, idx)));
    const showingEl = document.getElementById('showing-count');
    if (showingEl) showingEl.textContent = responders.length;
}

function createResponderRow(responder, index) {
    const row = document.createElement('tr');
    let lastActive = responder.updated_at ? formatTimeAgo(new Date(responder.updated_at)) : 'Unknown';
    let statusClass = 'status-badge ', statusText = responder.status || 'Available';
    if (['Available', 'available'].includes(responder.status)) { statusClass += 'status-available'; statusText = 'Available'; }
    else if (['Assigned', 'assigned'].includes(responder.status)) { statusClass += 'status-assigned'; statusText = 'Assigned'; }
    else { statusClass += 'status-on-duty'; statusText = 'On Duty'; }
    row.innerHTML = `<td class="checkbox-col"><input type="checkbox" class="row-select" onchange="handleRowSelect()"></td><td><div class="responder-info"><div class="responder-name">${responder.name || 'Unknown'}</div></div></td><td><div class="unit-info"><div class="unit-name">${responder.unit || 'Unassigned'}</div></div></td><td><div class="contact-info"><div class="contact-phone">${responder.contact || 'No contact'}</div></div></td><td><span class="${statusClass}">${statusText}</span></td><td><div class="time-info"><div class="time-text">${lastActive}</div></div></td><td><div class="action-buttons"><button class="action-btn" title="Update Status" onclick="openStatusModal('${responder.id}')"><i class="fas fa-sync-alt"></i></button><button class="action-btn" title="View Details" onclick="viewResponderDetails('${responder.id}')"><i class="fas fa-eye"></i></button></div></td>`;
    return row;
}

function sortTable(column) {
    if (sortColumn === column) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else { sortColumn = column; sortDirection = 'asc'; }
    updateRespondersTable();
}

/* ---------------- RESPONDER MANAGEMENT ---------------- */
window.openStatusModal = function(responderId) {
    currentResponderId = responderId;
    document.getElementById('status-modal').style.display = 'flex';
};

window.closeStatusModal = function() {
    document.getElementById('status-modal').style.display = 'none';
    currentResponderId = null;
};

window.selectStatus = function(status) {
    if (currentResponderId) {
        const responder = allResponders.find(r => r.id === currentResponderId);
        if (responder) {
            responder.status = status;
            responder.updated_at = new Date().toISOString();
            updateRespondersTable();
            updateStats();
            updateDashboard();
            closeStatusModal();
            logAudit(currentUser?.email || 'Admin', 'update_status', `Changed ${responder.name} status to ${status}`, 'responders');
        }
    }
};

window.viewResponderDetails = function(id) {
    const responder = allResponders.find(r => r.id === id);
    if (responder) {
        let reportInfo = '';
        if (responder.report_id) {
            const report = allReports.find(r => r.id == responder.report_id);
            if (report) reportInfo = `\n\nAssigned to Report: #${report.id}\nType: ${report.type_display || report.type}\nStatus: ${report.status}`;
        }
        alert(`Responder Details:\n\nName: ${responder.name}\nUnit: ${responder.unit}\nContact: ${responder.contact}\nStatus: ${responder.status}\nCreated: ${responder.created_at ? new Date(responder.created_at).toLocaleString() : 'Unknown'}${reportInfo}`);
    }
};

window.exportResponders = function() {
    if (allResponders.length === 0) return;
    const headers = ['Name', 'Unit', 'Contact', 'Status', 'Last Updated'];
    const rows = allResponders.map(r => [r.name || '', r.unit || '', r.contact || '', r.status || '', r.updated_at ? new Date(r.updated_at).toLocaleString() : '']);
    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `responders_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logAudit(currentUser?.email || 'Admin', 'export_data', 'Exported responders to CSV', 'responders');
};

window.filterByStatus = function() {
    const status = prompt('Enter status to filter by:\nAvailable, Assigned, On Duty', 'Available');
    if (status && ['Available', 'Assigned', 'On Duty'].includes(status)) {
        displayFilteredResponders(allResponders.filter(r => r.status.toLowerCase() === status.toLowerCase()));
    } else if (status === 'all') updateRespondersTable();
};

function handleRowSelect() {
    const selectAll = document.getElementById('select-all');
    if (!selectAll) return;
    const checkboxes = document.querySelectorAll('.row-select');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

/* ---------------- AUDIT AND ACTIVITY FUNCTIONS ---------------- */
function initializeAuditAndActivity() {
    document.addEventListener('click', () => lastActivityTime = Date.now());
    setInterval(checkSessionTimeout, 60000);
    auditLogs = JSON.parse(localStorage.getItem('aidtracker_audit_logs') || '[]');
    activityLogs = JSON.parse(localStorage.getItem('aidtracker_activity_logs') || '[]');
    logActivity('Admin dashboard initialized');
    logAudit('SYSTEM', 'session_start', 'Admin session started', 'system');
    updateAuditLogsTable();
    updateActivityFeed();
    updateSystemActivityStats();
}

function logActivity(message, type = 'info', icon = 'fas fa-info-circle') {
    activityLogs.unshift({ id: `act_${Date.now()}`, timestamp: new Date().toISOString(), message, type, icon, user: currentUser?.email || 'system' });
    if (activityLogs.length > 100) activityLogs.length = 100;
    localStorage.setItem('aidtracker_activity_logs', JSON.stringify(activityLogs));
    updateActivityFeed();
}

function logAudit(user, action, details, resource, status = 'success') {
    auditLogs.unshift({ id: `audit_${Date.now()}`, timestamp: new Date().toISOString(), user, action, details, resource, status, ip: '127.0.0.1' });
    if (auditLogs.length > 1000) auditLogs.length = 1000;
    localStorage.setItem('aidtracker_audit_logs', JSON.stringify(auditLogs));
    updateAuditLogsTable();
}

function updateAuditLogsTable() {
    const tbody = document.getElementById('audit-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const searchTerm = document.getElementById('audit-search')?.value.toLowerCase() || '';
    const filterType = document.getElementById('audit-filter')?.value || 'all';
    let filtered = auditLogs;
    if (searchTerm) filtered = filtered.filter(l => l.user.toLowerCase().includes(searchTerm) || l.action.toLowerCase().includes(searchTerm) || l.details.toLowerCase().includes(searchTerm));
    if (filterType === 'login') filtered = filtered.filter(l => l.action.toLowerCase().includes('login'));
    else if (filterType === 'data_access') filtered = filtered.filter(l => l.action.toLowerCase().includes('data_access') || l.action.toLowerCase().includes('fetch') || l.action.toLowerCase().includes('view'));
    else if (filterType === 'data_change') filtered = filtered.filter(l => l.action.toLowerCase().includes('update') || l.action.toLowerCase().includes('create') || l.action.toLowerCase().includes('delete'));
    else if (filterType === 'security') filtered = filtered.filter(l => l.action.toLowerCase().includes('security') || l.action.toLowerCase().includes('failed') || l.status === 'error');
    
    const start = (auditCurrentPage - 1) * auditRowsPerPage;
    const pageLogs = filtered.slice(start, start + auditRowsPerPage);
    
    if (pageLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;"><i class="fas fa-history" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i><div>No audit logs found</div></td></tr>`;
        return;
    }
    
    pageLogs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(log.timestamp).toLocaleString()}</td>
            <td>${log.user}</td>
            <td>${log.action}</td>
            <td>${log.resource}</td>
            <td>${log.details}</td>
            <td>${log.ip}</td>
            <td><span class="status-badge ${log.status === 'success' ? 'status-success' : 'status-error'}">${log.status}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    const showingEl = document.getElementById('audit-showing-count');
    const totalEl = document.getElementById('audit-total-count');
    if (showingEl) showingEl.textContent = Math.min(filtered.length, auditCurrentPage * auditRowsPerPage);
    if (totalEl) totalEl.textContent = filtered.length;
}

function updateActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    feed.innerHTML = '';
    const recent = activityLogs.slice(0, 10);
    if (recent.length === 0) {
        feed.innerHTML = `<div class="activity-item"><div class="activity-icon"><i class="fas fa-info-circle"></i></div><div class="activity-content"><div class="activity-message">No recent activity</div><div class="activity-time">--</div></div></div>`;
        return;
    }
    recent.forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item ${activity.type}`;
        const time = new Date(activity.timestamp);
        const diff = Math.floor((new Date() - time) / 60000);
        let timeText = diff < 1 ? 'Just now' : diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.floor(diff / 60)}h ago` : time.toLocaleDateString();
        item.innerHTML = `<div class="activity-icon"><i class="${activity.icon}"></i></div><div class="activity-content"><div class="activity-message">${activity.message}</div><div class="activity-time">${timeText}</div></div>`;
        feed.appendChild(item);
    });
}

function updateSystemActivityStats() {
    const activeUsersEl = document.getElementById('active-users-count');
    if (activeUsersEl) activeUsersEl.textContent = '1';
    const today = new Date().toDateString();
    const todaysLogins = auditLogs.filter(l => l.action.includes('login') && new Date(l.timestamp).toDateString() === today);
    const loginAttemptsEl = document.getElementById('login-attempts-today');
    if (loginAttemptsEl) loginAttemptsEl.textContent = todaysLogins.length;
    const failedLoginsEl = document.getElementById('failed-logins-today');
    if (failedLoginsEl) failedLoginsEl.textContent = todaysLogins.filter(l => l.status !== 'success').length;
}

function checkSessionTimeout() {
    if (Date.now() - lastActivityTime >= sessionTimeout) {
        logout();
    }
}

/* ---------------- AUDIT PAGINATION ---------------- */
function changeAuditRowsPerPage(value) {
    auditRowsPerPage = parseInt(value);
    auditCurrentPage = 1;
    updateAuditLogsTable();
}

function nextAuditPage() {
    if (auditCurrentPage < Math.ceil(auditLogs.length / auditRowsPerPage)) {
        auditCurrentPage++;
        updateAuditLogsTable();
    }
}

function prevAuditPage() {
    if (auditCurrentPage > 1) {
        auditCurrentPage--;
        updateAuditLogsTable();
    }
}

function filterAuditLogs(filter) {
    auditCurrentPage = 1;
    updateAuditLogsTable();
}

/* ---------------- SYSTEM ACTIVITY FUNCTIONS ---------------- */
window.refreshSystemActivity = function() {
    updateSystemActivityStats();
    updateActivityFeed();
    logActivity('Refreshed system activity');
};

window.exportActivityLog = function() {
    if (activityLogs.length === 0) return;
    const headers = ['Timestamp', 'User', 'Message', 'Type', 'Icon'];
    const rows = activityLogs.map(l => [new Date(l.timestamp).toLocaleString(), l.user, l.message, l.type, l.icon]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logAudit(currentUser?.email || 'Admin', 'export_activity', 'Exported activity logs to CSV', 'system');
};

window.exportAuditLogs = function() {
    if (auditLogs.length === 0) return;
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Details', 'IP', 'Status'];
    const rows = auditLogs.map(l => [new Date(l.timestamp).toLocaleString(), l.user, l.action, l.resource, l.details, l.ip, l.status]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logAudit(currentUser?.email || 'Admin', 'export_audit', 'Exported audit logs to CSV', 'system');
};

/* ---------------- GLOBAL FUNCTIONS ---------------- */
window.viewReport = async function(id) {
    const report = allReports.find(r => r.id == id);
    if (report) {
        let reporterName = report.reporter || 'Anonymous';
        if (typeof reporterName === 'string' && reporterName.includes('@')) {
            const user = allUsers.find(u => u.email?.toLowerCase() === reporterName.toLowerCase());
            if (user && (user.full_name || user.name)) reporterName = user.full_name || user.name;
        }
        let location = 'Unknown location';
        if (report.location && report.location.trim() !== '') location = report.location;
        else if (report.latitude && report.longitude) {
            const lat = parseFloat(report.latitude), lng = parseFloat(report.longitude);
            if (!isNaN(lat) && !isNaN(lng)) location = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
        let responderInfo = '';
        if (report.assigned_responders) {
            responderInfo = `\n\nAssigned Responders: ${report.assigned_responders}`;
            if (report.assigned_unit) responderInfo += `\nUnit: ${report.assigned_unit}`;
            if (report.contact) responderInfo += `\nContact: ${report.contact}`;
        }
        alert(`Report Details:\n\nID: #${report.id}\nReporter: ${reporterName}\nType: ${report.type_display || report.type}\nLocation: ${location}\nStatus: ${report.status}\nTime: ${new Date(report.created_at).toLocaleString()}${responderInfo}`);
        logAudit(currentUser?.email || 'Admin', 'view_report', `Viewed report #${report.id}`, 'reports');
    }
};

window.updateReportStatus = function(id) {
    const report = allReports.find(r => r.id == id);
    if (!report) return;
    const statusOptions = ['pending', 'investigating', 'assigned', 'resolved', 'cancelled'];
    const newStatus = prompt(`Enter new status for report #${id}\nOptions: ${statusOptions.join(', ')}`, report.status || 'pending');
    if (newStatus && statusOptions.includes(newStatus.toLowerCase())) {
        supabaseClient.from('reports').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => {
            if (error) logAudit(currentUser?.email || 'Admin', 'update_report_failed', `Failed to update report #${id} status: ${error.message}`, 'reports', 'error');
            else { fetchAllData(); logAudit(currentUser?.email || 'Admin', 'update_report', `Updated report #${id} status to ${newStatus}`, 'reports'); }
        });
    }
};

window.viewUser = function(id) {
    const user = allUsers.find(u => u.id == id);
    if (user) {
        const userReports = allReports.filter(r => r.reporter && user.email && r.reporter.toLowerCase() === user.email.toLowerCase()).length;
        alert(`User Details:\n\nName: ${user.full_name || user.name || 'Unknown'}\nEmail: ${user.email || 'No email'}\nRole: ${user.role || 'Citizen'}\nReports: ${userReports}\nJoined: ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}`);
        logAudit(currentUser?.email || 'Admin', 'view_user', `Viewed user ${user.email}`, 'users');
    }
};

/* ---------------- ANALYTICS FUNCTIONS ---------------- */
function updateAnalytics() {
    const timeframe = document.getElementById('analytics-timeframe')?.value || '30d';
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filteredReports = allReports.filter(r => new Date(r.created_at) >= cutoff);
    const filteredUsers = allUsers.filter(u => new Date(u.created_at) >= cutoff);
    
    const current = filteredReports.length;
    const prevCutoff = new Date();
    prevCutoff.setDate(prevCutoff.getDate() - (days * 2));
    const previous = allReports.filter(r => new Date(r.created_at) >= prevCutoff && new Date(r.created_at) < new Date(Date.now() - (days * 86400000))).length;
    const trend = previous > 0 ? ((current - previous) / previous * 100).toFixed(0) : 0;
    const reportsTrendEl = document.getElementById('reports-trend');
    const reportsCountEl = document.getElementById('reports-count');
    if (reportsTrendEl) reportsTrendEl.textContent = `${trend >= 0 ? '+' : ''}${trend}%`;
    if (reportsCountEl) reportsCountEl.textContent = `${current} reports this period`;
    const avgResponseEl = document.getElementById('avg-response-time');
    if (avgResponseEl) avgResponseEl.textContent = `${calculateAverageResponseTime()}m`;
    
    const activeUsers = new Set();
    allReports.forEach(r => { if (r.reporter) activeUsers.add(r.reporter.toLowerCase()); });
    const engagement = allUsers.length > 0 ? Math.min(95, Math.round((activeUsers.size / allUsers.length) * 100)) : 0;
    const engagementEl = document.getElementById('user-engagement');
    if (engagementEl) engagementEl.textContent = `${engagement}%`;
    const uptimeEl = document.getElementById('system-uptime');
    if (uptimeEl) uptimeEl.textContent = '99.9%';
    
    updateReportsTypeChart(filteredReports);
    updateReportsTimelineChart(filteredReports, days);
    updateLocationChart(filteredReports);
    updateUserActivityChart(filteredUsers, days);
    updateTopRespondersTable();
    updateStatusDistributionTable(filteredReports);
}

function updateReportsTypeChart(reports) {
    const canvas = document.getElementById('reports-type-chart');
    if (!canvas) return;
    if (reportsTypeChart) reportsTypeChart.destroy();
    const ctx = canvas.getContext('2d');
    const typeCounts = {};
    reports.forEach(r => { const t = r.type_display || r.type || 'Emergency'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    const labels = Object.keys(typeCounts);
    const data = Object.values(typeCounts);
    if (labels.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    reportsTypeChart = new Chart(ctx, {
        type: 'pie',
        data: { labels, datasets: [{ data, backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'], borderWidth: 2, borderColor: '#ffffff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

function updateReportsTimelineChart(reports, days) {
    const canvas = document.getElementById('reports-timeline-chart');
    if (!canvas) return;
    if (reportsTimelineChart) reportsTimelineChart.destroy();
    const ctx = canvas.getContext('2d');
    const groups = {};
    reports.forEach(r => { const d = new Date(r.created_at).toLocaleDateString(); groups[d] = (groups[d] || 0) + 1; });
    const dates = Object.keys(groups).sort();
    const counts = dates.map(d => groups[d]);
    if (dates.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }
    reportsTimelineChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets: [{ label: 'Reports', data: counts, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function updateLocationChart(reports) {
    const canvas = document.getElementById('location-chart');
    if (!canvas) return;
    if (locationChart) locationChart.destroy();
    const ctx = canvas.getContext('2d');
    const locCounts = {};
    reports.forEach(r => { let loc = 'Unknown'; if (r.location && r.location.trim() !== '') loc = r.location.split(',')[0].trim(); locCounts[loc] = (locCounts[loc] || 0) + 1; });
    const sorted = Object.entries(locCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(([l]) => l);
    const data = sorted.map(([,c]) => c);
    if (labels.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.fillText('No location data', canvas.width / 2, canvas.height / 2);
        return;
    }
    locationChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Reports', data, backgroundColor: '#10b981', borderColor: '#10b981', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function updateUserActivityChart(users, days) {
    const canvas = document.getElementById('user-activity-chart');
    if (!canvas) return;
    if (userActivityChart) userActivityChart.destroy();
    const ctx = canvas.getContext('2d');
    const now = new Date();
    const activityData = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short' });
        const count = users.filter(u => new Date(u.created_at).toDateString() === date.toDateString()).length;
        activityData.push({ day: dateStr, count });
    }
    const labels = activityData.map(d => d.day);
    const data = activityData.map(d => d.count);
    if (data.every(v => v === 0)) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.fillText('No activity data', canvas.width / 2, canvas.height / 2);
        return;
    }
    userActivityChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'User Activity', data, backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function updateTopRespondersTable() {
    const tbody = document.getElementById('top-responders-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (allResponders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-state"><div class="spinner"></div><span>Loading data...</span></td></tr>';
        return;
    }
    const stats = allResponders.map(responder => {
        const assigned = allReports.filter(r => r.assigned_responders && r.assigned_responders.toLowerCase().includes(responder.name.toLowerCase()));
        const handled = assigned.length;
        let totalTime = 0, timeCount = 0;
        assigned.forEach(r => {
            if (r.created_at && r.updated_at) {
                const t = (new Date(r.updated_at) - new Date(r.created_at)) / 60000;
                if (t > 0 && t < 1440) { totalTime += t; timeCount++; }
            }
        });
        const avgTime = timeCount > 0 ? Math.round(totalTime / timeCount) : 0;
        const resolved = assigned.filter(r => r.status === 'resolved').length;
        const successRate = handled > 0 ? Math.round((resolved / handled) * 100) : 0;
        return { ...responder, reportsHandled: handled, avgResponseTime: avgTime > 0 ? `${avgTime}m` : 'N/A', successRate: `${successRate}%` };
    });
    stats.sort((a, b) => b.reportsHandled - a.reportsHandled);
    stats.slice(0, 5).forEach(responder => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${responder.name}</td><td>${responder.unit}</td><td>${responder.reportsHandled}</td><td>${responder.avgResponseTime}</td><td>${responder.successRate}</td>`;
        tbody.appendChild(row);
    });
}

function updateStatusDistributionTable(reports) {
    const tbody = document.getElementById('status-distribution-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    const counts = {};
    reports.forEach(r => { const s = r.status || 'pending'; counts[s] = (counts[s] || 0) + 1; });
    const total = reports.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">No report data available</td></tr>';
        return;
    }
    Object.entries(counts).forEach(([status, count]) => {
        const percentage = ((count / total) * 100).toFixed(1);
        const row = document.createElement('tr');
        let avgTime = 'N/A';
        if (status === 'resolved') {
            const resolved = allReports.filter(r => r.status === 'resolved');
            let totalTime = 0, timeCount = 0;
            resolved.forEach(r => {
                if (r.created_at && r.updated_at) {
                    const hours = (new Date(r.updated_at) - new Date(r.created_at)) / 3600000;
                    if (hours > 0 && hours < 168) { totalTime += hours; timeCount++; }
                }
            });
            if (timeCount > 0) {
                const avg = totalTime / timeCount;
                avgTime = avg < 1 ? `${Math.round(avg * 60)}m` : avg < 24 ? `${Math.round(avg)}h` : `${Math.round(avg / 24)}d`;
            }
        }
        row.innerHTML = `<td>${status.charAt(0).toUpperCase() + status.slice(1)}</td><td>${count}</td><td>${percentage}%</td><td>${avgTime}</td>`;
        tbody.appendChild(row);
    });
}

function exportAnalytics() {
    const report = {
        generated: new Date().toISOString(),
        timeframe: document.getElementById('analytics-timeframe')?.value || '30d',
        totalReports: allReports.length,
        totalUsers: allUsers.length,
        totalResponders: allResponders.length,
        avgResponseTime: `${calculateAverageResponseTime()}m`
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_report_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logActivity('Exported analytics report');
}

/* ---------------- SETTINGS FUNCTIONS ---------------- */
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('aidtracker_settings') || '{}');
    const setVal = (id, def) => { const el = document.getElementById(id); if (el) el.value = settings[id] || def; };
    const setChecked = (id, def) => { const el = document.getElementById(id); if (el) el.checked = settings[id] !== undefined ? settings[id] : def; };
    setVal('app-name', 'AidTracker');
    setVal('timezone', 'Asia/Manila');
    setVal('date-format', 'MM/DD/YYYY');
    setVal('session-timeout', 30);
    setVal('password-min-length', 8);
    setVal('max-login-attempts', 5);
    setChecked('two-factor-auth', false);
    setChecked('audit-logging', true);
    setChecked('email-notifications', true);
    setChecked('push-notifications', true);
    setVal('notification-frequency', 'daily');
    setVal('data-retention', 365);
    setVal('backup-frequency', 'weekly');
    setChecked('auto-cleanup', true);
}

function saveSettings() {
    const settings = {
        appName: document.getElementById('app-name')?.value || 'AidTracker',
        language: document.getElementById('default-language')?.value || 'en',
        timezone: document.getElementById('timezone')?.value || 'Asia/Manila',
        dateFormat: document.getElementById('date-format')?.value || 'MM/DD/YYYY',
        sessionTimeout: parseInt(document.getElementById('session-timeout')?.value) || 30,
        passwordMinLength: parseInt(document.getElementById('password-min-length')?.value) || 8,
        maxLoginAttempts: parseInt(document.getElementById('max-login-attempts')?.value) || 5,
        twoFactorAuth: document.getElementById('two-factor-auth')?.checked || false,
        auditLogging: document.getElementById('audit-logging')?.checked || true,
        ipWhitelist: document.getElementById('ip-whitelist')?.checked || false,
        emailNotifications: document.getElementById('email-notifications')?.checked || true,
        smsNotifications: document.getElementById('sms-notifications')?.checked || false,
        pushNotifications: document.getElementById('push-notifications')?.checked || true,
        notificationFrequency: document.getElementById('notification-frequency')?.value || 'daily',
        dataRetention: parseInt(document.getElementById('data-retention')?.value) || 365,
        backupFrequency: document.getElementById('backup-frequency')?.value || 'weekly',
        autoCleanup: document.getElementById('auto-cleanup')?.checked || true,
        lastUpdated: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin'
    };
    localStorage.setItem('aidtracker_settings', JSON.stringify(settings));
    sessionTimeout = settings.sessionTimeout * 60 * 1000;
    logAudit(currentUser?.email || 'Admin', 'update_settings', 'Updated system settings', 'settings');
}

function resetSettings() {
    if (confirm('Reset all settings to defaults?')) {
        localStorage.removeItem('aidtracker_settings');
        loadSettings();
        logAudit(currentUser?.email || 'Admin', 'reset_settings', 'Reset system settings to defaults', 'settings');
    }
}

function exportAllData() {
    const exportData = {
        reports: allReports,
        users: allUsers,
        responders: allResponders,
        auditLogs: auditLogs,
        activityLogs: activityLogs,
        settings: JSON.parse(localStorage.getItem('aidtracker_settings') || '{}'),
        exported: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aidtracker_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logAudit(currentUser?.email || 'Admin', 'export_all_data', 'Exported complete system data', 'system');
}

function clearOldData() {
    const retentionDays = parseInt(document.getElementById('data-retention')?.value) || 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const oldReports = allReports.filter(r => new Date(r.created_at) < cutoff);
    const oldUsers = allUsers.filter(u => new Date(u.created_at) < cutoff);
    if (oldReports.length === 0 && oldUsers.length === 0) return;
    if (confirm(`Clear ${oldReports.length} old reports and ${oldUsers.length} old users?`)) {
        logAudit(currentUser?.email || 'Admin', 'clear_old_data', `Cleared old data older than ${retentionDays} days`, 'system');
    }
}

function loadPanelData(panelId) {
    if (panelId === 'dashboard') updateDashboard();
    else if (panelId === 'responders') { updateRespondersTable(); updateStats(); }
    else if (panelId === 'reports') updateReportsTable();
    else if (panelId === 'users') updateUsersTable();
    else if (panelId === 'analytics') updateAnalytics();
    else if (panelId === 'settings') loadSettings();
    else if (panelId === 'system-activity') { updateSystemActivityStats(); updateActivityFeed(); }
    else if (panelId === 'audit-logs') updateAuditLogsTable();
}

// Global exports
window.login = login;
window.logout = logout;
window.selectStatus = selectStatus;
window.closeStatusModal = closeStatusModal;
window.filterByStatus = filterByStatus;
window.refreshSystemActivity = refreshSystemActivity;
window.exportActivityLog = exportActivityLog;
window.exportAuditLogs = exportAuditLogs;
window.filterAuditLogs = filterAuditLogs;
window.nextAuditPage = nextAuditPage;
window.prevAuditPage = prevAuditPage;
window.changeAuditRowsPerPage = changeAuditRowsPerPage;
window.sortTable = sortTable;
window.nextPage = nextPage;
window.prevPage = prevPage;
window.changeRowsPerPage = changeRowsPerPage;
window.updateAnalytics = updateAnalytics;
window.exportAnalytics = exportAnalytics;
window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;
window.exportAllData = exportAllData;
window.clearOldData = clearOldData;
window.viewReport = viewReport;
window.updateReportStatus = updateReportStatus;
window.viewUser = viewUser;
window.viewResponderDetails = viewResponderDetails;
window.exportResponders = exportResponders;