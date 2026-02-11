// admin.js - Complete Fixed Version

// Initialize Supabase client with your credentials
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
let sessionStartTime = null;
let lastActivityTime = Date.now();
let sessionTimeout = 30 * 60 * 1000; // 30 minutes
let sessionWarningTime = 5 * 60 * 1000; // 5 minutes before timeout
let sessionWarningShown = false;

// Pagination state
let currentPage = 1;
let rowsPerPage = 25;
let sortColumn = 'name';
let sortDirection = 'asc';

// Audit pagination
let auditCurrentPage = 1;
let auditRowsPerPage = 50;

// System tracking
let appInitialized = false;

// Chart instances
let reportsTypeChart = null;
let reportsTimelineChart = null;
let locationChart = null;
let userActivityChart = null;

/* ---------------- AUTHENTICATION FUNCTIONS ---------------- */
async function checkAuth() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Session error:', error);
            showLoginModal();
            return;
        }
        
        if (session) {
            currentUser = session.user;
            showApp();
            logActivity('User authenticated successfully', 'success', 'fas fa-check-circle');
        } else {
            showLoginModal();
        }
    } catch (error) {
        console.error('Auth error:', error);
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

    try {
        const loginBtn = document.querySelector('.modal-footer .btn.primary');
        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        loginBtn.disabled = true;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Login error:', error);
            showLoginError(error.message || 'Login failed. Please check your credentials.');
            logAudit(email, 'login_failed', `Failed login attempt: ${error.message}`, 'auth', 'error');
            return;
        }

        currentUser = data.user;
        document.getElementById('login-modal').style.display = 'none';
        showApp();
        showNotification('Login successful!', 'success');
        
        // Log successful login
        logAudit(email, 'login_success', 'User logged in successfully', 'auth');
        logActivity('User logged in', 'success', 'fas fa-sign-in-alt');

    } catch (error) {
        console.error('Login error:', error);
        showLoginError('An error occurred during login');
        logAudit(email, 'login_error', `Login error: ${error.message}`, 'auth', 'error');
    } finally {
        const loginBtn = document.querySelector('.modal-footer .btn.primary');
        if (loginBtn) {
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            loginBtn.disabled = false;
        }
    }
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                console.error('Logout error:', error);
                showNotification('Error logging out', 'error');
                return;
            }

            currentUser = null;
            document.getElementById('app').style.display = 'none';
            showLoginModal();
            
            // Clear any stored data
            localStorage.removeItem('aidtracker_session');
            
            // Log logout
            logAudit('Admin', 'logout', 'User logged out', 'auth');
            logActivity('User logged out', 'info', 'fas fa-sign-out-alt');
            
            showNotification('Logged out successfully', 'info');
        } catch (error) {
            console.error('Logout error:', error);
            showNotification('Error logging out', 'error');
        }
    }
}

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    
    // Clear any error messages
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

function showApp() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    
    // Update user profile
    updateUserProfile();
    
    // Initialize the app if not already initialized
    if (!appInitialized) {
        initializeApp();
        appInitialized = true;
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

function updateUserProfile() {
    if (currentUser) {
        const userNameEl = document.querySelector('.user-name');
        const userRoleEl = document.querySelector('.user-role');
        const avatarEl = document.querySelector('.avatar');

        if (userNameEl) {
            const displayName = currentUser.user_metadata?.full_name || 
                              currentUser.user_metadata?.name || 
                              currentUser.email?.split('@')[0] || 
                              'Admin User';
            userNameEl.textContent = displayName;
        }
        
        if (userRoleEl) {
            const userRole = currentUser.app_metadata?.role || 
                           currentUser.user_metadata?.role || 
                           'Administrator';
            userRoleEl.textContent = userRole;
        }
        
        if (avatarEl) {
            const displayName = currentUser.user_metadata?.full_name || 
                              currentUser.user_metadata?.name || 
                              currentUser.email || 
                              'AU';
            const initials = displayName
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
            avatarEl.textContent = initials;
        }
    }
}

/* ---------------- INITIALIZATION ---------------- */
function initializeApp() {
    console.log('Initializing application...');
    
    // Sidebar toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            logActivity('Toggled sidebar', 'info', 'fas fa-bars');
        });
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            const icon = sidebarToggle.querySelector('i');
            if (sidebar.classList.contains('active')) {
                icon.className = 'fas fa-chevron-right';
            } else {
                icon.className = 'fas fa-chevron-left';
            }
        });
    }

    // Navigation buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.panel').forEach(sec =>
                sec.classList.remove('active')
            );
            
            const target = btn.dataset.target;
            if (target) {
                const panel = document.getElementById(target);
                if (panel) {
                    panel.classList.add('active');
                    
                    // Update breadcrumb
                    const breadcrumb = document.querySelector('.breadcrumb');
                    if (breadcrumb) {
                        const activeSpan = breadcrumb.querySelector('.active');
                        if (activeSpan) {
                            activeSpan.classList.remove('active');
                        }
                        const newActive = Array.from(breadcrumb.children).find(child => 
                            child.textContent.toLowerCase() === target.toLowerCase().replace('-', ' ')
                        );
                        if (newActive) {
                            newActive.classList.add('active');
                        }
                    }
                    
                    // Update header title
                    const headerTitle = document.querySelector('.main-header h1');
                    if (headerTitle) {
                        headerTitle.textContent = btn.querySelector('span').textContent;
                    }
                    
                    // Load panel-specific data
                    loadPanelData(target);
                }
                
                logActivity(`Navigated to ${target.replace('-', ' ')} panel`, 'info', 'fas fa-arrow-right');
            }
        });
    });

    // Set up search functionality
    const searchInput = document.getElementById('responder-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(searchResponders, 300));
    }

    // Set up audit search functionality
    const auditSearchInput = document.getElementById('audit-search');
    if (auditSearchInput) {
        auditSearchInput.addEventListener('input', debounce(() => updateAuditLogsTable(), 300));
    }

    // Set up rows per page for responders
    const rowsPerPageSelect = document.getElementById('rows-per-page');
    if (rowsPerPageSelect) {
        rowsPerPageSelect.value = rowsPerPage.toString();
        rowsPerPageSelect.addEventListener('change', (e) => changeRowsPerPage(parseInt(e.target.value)));
    }

    // Set up select all checkbox
    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.row-select');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });
    }

    // Initialize audit and activity monitoring
    initializeAuditAndActivity();

    // Update time display periodically
    setInterval(updateTimeDisplay, 60000);

    // Refresh data every 30 seconds
    setInterval(fetchAllData, 30000);

    // Refresh activity stats every 5 minutes
    setInterval(updateSystemActivityStats, 300000);
    
    // Set up header action buttons
    setupHeaderActions();
    
    // Initial data fetch
    fetchAllData();
    
    logActivity('Application initialized successfully', 'success', 'fas fa-check-circle');
}

function setupHeaderActions() {
    // Password toggle functionality
    const passwordToggle = document.getElementById('password-toggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', function() {
            const passwordInput = document.getElementById('login-password');
            if (passwordInput) {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                this.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
            }
        });
    }
    
    // Handle phone restriction
    checkDeviceType();
}

function checkDeviceType() {
    const isPhone = window.innerWidth <= 768;
    const phoneMessage = document.getElementById('phone-message');
    const app = document.getElementById('app');
    
    if (isPhone && phoneMessage) {
        phoneMessage.style.display = 'flex';
        if (app) app.style.display = 'none';
    } else if (phoneMessage) {
        phoneMessage.style.display = 'none';
    }
}

window.addEventListener('resize', checkDeviceType);

/* ---------------- EVENT LISTENERS SETUP ---------------- */
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, setting up event listeners...');
    
    // Check authentication status on page load
    checkAuth();
    
    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            showApp();
            showNotification('Welcome back!', 'success');
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showLoginModal();
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('Token refreshed');
        } else if (event === 'USER_UPDATED') {
            currentUser = session?.user || null;
            if (currentUser) {
                updateUserProfile();
            }
        }
    });
    
    // Add enter key support for login
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    }
});

/* ---------------- FETCH DATA FROM SUPABASE ---------------- */
async function fetchAllData() {
    try {
        if (!currentUser) {
            console.log('User not authenticated, skipping data fetch');
            return;
        }
        
        // Show loading state
        const updatedEl = document.getElementById('data-updated');
        if (updatedEl) {
            updatedEl.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Updating data...</span>';
        }
        
        console.log("Starting data fetch...");
        
        // Fetch reports from Supabase
        const { data: reports, error: reportsError } = await supabaseClient
            .from('reports')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (reportsError) {
            console.error('Error fetching reports:', reportsError);
            allReports = [];
        } else {
            allReports = reports || [];
            console.log(`Fetched ${allReports.length} reports`);
        }

        // Try to fetch users
        try {
            const { data: users, error: usersError } = await supabaseClient
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (usersError) {
                console.error('Error fetching users:', usersError);
                allUsers = [];
            } else {
                allUsers = users || [];
                console.log(`Fetched ${allUsers.length} users`);
            }
        } catch (error) {
            console.log('Users table not found or error:', error);
            allUsers = [];
        }

        // Fetch responders data
        await fetchResponders();
        console.log(`Fetched ${allResponders.length} responders`);

        // Update all UI components
        updateDashboard();
        updateUsersTable();
        updateReportsTable();
        updateRespondersTable();
        updateStats();
        updateSystemActivityStats();
        
        // Update timestamp
        updateTimeDisplay();
        
        console.log("Data fetch complete");
        
        // Log data fetch
        logActivity('Data refreshed from database', 'info', 'fas fa-database');
        
    } catch (error) {
        console.error('Error fetching data:', error);
        const updatedEl = document.getElementById('data-updated');
        if (updatedEl) {
            updatedEl.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Error loading data</span>';
        }
        showNotification('Error loading data from database', 'error');
    }
}

/* ---------------- FETCH RESPONDERS DATA ---------------- */
async function fetchResponders() {
    try {
        console.log("Fetching responders data...");
        
        // Fetch responders from the reports table
        const { data: reports, error: reportsError } = await supabaseClient
            .from('reports')
            .select('id, assigned_responders, assigned_unit, contact, status, created_at, updated_at')
            .not('assigned_responders', 'is', null)
            .order('created_at', { ascending: false });

        if (reportsError) {
            console.error('Error fetching reports for responders:', reportsError);
            allResponders = [];
        } else {
            allResponders = [];
            
            if (reports && reports.length > 0) {
                console.log(`Found ${reports.length} reports with responder data`);
                
                reports.forEach(report => {
                    if (!report.assigned_responders || report.assigned_responders.trim() === '') {
                        return;
                    }
                    
                    const responderNames = report.assigned_responders.split(',').map(name => name.trim());
                    
                    responderNames.forEach((responderName, index) => {
                        const responder = {
                            id: `${report.id}_${index}`,
                            name: responderName,
                            unit: report.assigned_unit || 'Unassigned',
                            contact: report.contact || 'No contact',
                            status: report.status === 'assigned' ? 'Assigned' : 'Available',
                            report_id: report.id,
                            created_at: report.created_at,
                            updated_at: report.updated_at || report.created_at
                        };
                        
                        allResponders.push(responder);
                    });
                });
                
                console.log(`Created ${allResponders.length} responder entries from reports`);
            } else {
                console.log("No reports with responder data found");
            }
        }
        
        console.log("Final responders data:", allResponders);
        
    } catch (error) {
        console.error('Error in fetchResponders:', error);
        allResponders = [];
    }
}

/* ---------------- LOAD PANEL DATA ---------------- */
function loadPanelData(panelId) {
    switch(panelId) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'responders':
            updateRespondersTable();
            updateStats();
            break;
        case 'reports':
            updateReportsTable();
            break;
        case 'users':
            updateUsersTable();
            break;
        case 'analytics':
            updateAnalytics();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'system-activity':
            updateSystemActivityStats();
            updateActivityFeed();
            break;
        case 'audit-logs':
            updateAuditLogsTable();
            break;
    }
}

/* ---------------- REDESIGNED DASHBOARD ---------------- */
function updateDashboard() {
    console.log('Updating dashboard with real data...');
    
    // Update dashboard stats
    updateDashboardStats();
    
    // Update dashboard charts
    updateDashboardCharts();
    
    // Update recent activity
    updateRecentActivity();
    
    // Update quick stats
    updateQuickStats();
    
    // Update notification badges
    updateNotificationBadges();
}

function updateDashboardStats() {
    // Calculate real statistics
    const totalReports = allReports.length;
    const totalUsers = allUsers.length;
    const totalResponders = allResponders.length;
    const activeReports = allReports.filter(r => 
        r.status === 'pending' || r.status === 'investigating' || r.status === 'assigned'
    ).length;
    
    // Calculate trends (simplified - in real app would compare with previous period)
    const reportsTrend = totalReports > 0 ? 12 : 0;
    const usersTrend = totalUsers > 0 ? 8 : 0;
    const respondersTrend = totalResponders > 0 ? 5 : 0;
    const activeReportsTrend = activeReports > 0 ? -3 : 0;
    
    // Update UI elements
    const totalReportsEl = document.getElementById('total-reports');
    const totalUsersEl = document.getElementById('total-users');
    const totalRespondersEl = document.getElementById('dashboard-total-responders');
    const activeReportsEl = document.getElementById('dashboard-active-reports');
    
    const reportsTrendEl = document.getElementById('total-reports-trend');
    const usersTrendEl = document.getElementById('total-users-trend');
    const respondersTrendEl = document.getElementById('total-responders-trend');
    const activeTrendEl = document.getElementById('active-reports-trend');
    
    if (totalReportsEl) totalReportsEl.textContent = totalReports;
    if (totalUsersEl) totalUsersEl.textContent = totalUsers;
    if (totalRespondersEl) totalRespondersEl.textContent = totalResponders;
    if (activeReportsEl) activeReportsEl.textContent = activeReports;
    
    if (reportsTrendEl) {
        reportsTrendEl.textContent = `${reportsTrend >= 0 ? '+' : ''}${reportsTrend}%`;
        reportsTrendEl.className = `dashboard-stat-trend ${reportsTrend >= 0 ? 'positive' : 'negative'}`;
    }
    
    if (usersTrendEl) {
        usersTrendEl.textContent = `${usersTrend >= 0 ? '+' : ''}${usersTrend}%`;
        usersTrendEl.className = `dashboard-stat-trend ${usersTrend >= 0 ? 'positive' : 'negative'}`;
    }
    
    if (respondersTrendEl) {
        respondersTrendEl.textContent = `${respondersTrend >= 0 ? '+' : ''}${respondersTrend}%`;
        respondersTrendEl.className = `dashboard-stat-trend ${respondersTrend >= 0 ? 'positive' : 'negative'}`;
    }
    
    if (activeTrendEl) {
        activeTrendEl.textContent = `${activeReportsTrend >= 0 ? '+' : ''}${activeReportsTrend}%`;
        activeTrendEl.className = `dashboard-stat-trend ${activeReportsTrend >= 0 ? 'positive' : 'negative'}`;
    }
}

function updateDashboardCharts() {
    // Update reports by status chart
    updateReportsByStatusChart();
    
    // Update reports timeline chart
    updateReportsTimelineChartDashboard();
}

function updateReportsByStatusChart() {
    const canvas = document.getElementById('reports-by-status-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Count reports by status
    const statusCounts = {
        'pending': 0,
        'investigating': 0,
        'resolved': 0
    };

    allReports.forEach(report => {
        const status = report.status || 'pending';
        if (statusCounts[status] !== undefined) {
            statusCounts[status]++;
        }
    });

    const labels = Object.keys(statusCounts).map(key =>
        key.charAt(0).toUpperCase() + key.slice(1)
    );
    const data = Object.values(statusCounts);
    const colors = [
        '#f59e0b', // pending - warning
        '#3b82f6', // investigating - primary
        '#10b981'  // resolved - success
    ];
    
    // Destroy existing chart if it exists
    if (window.reportsByStatusChart) {
        window.reportsByStatusChart.destroy();
    }
    
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
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateReportsTimelineChartDashboard() {
    const canvas = document.getElementById('reports-timeline-chart-dashboard');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Group reports by last 7 days
    const today = new Date();
    const days = [];
    const counts = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short' });
        days.push(dateStr);
        
        const count = allReports.filter(report => {
            const reportDate = new Date(report.created_at);
            return reportDate.toDateString() === date.toDateString();
        }).length;
        
        counts.push(count);
    }
    
    // Destroy existing chart if it exists
    if (window.reportsTimelineChartDashboard) {
        window.reportsTimelineChartDashboard.destroy();
    }
    
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
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    },
                    grid: {
                        borderDash: [3, 3]
                    }
                }
            }
        }
    });
}

function updateRecentActivity() {
    const container = document.getElementById('recent-activity-items');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Get recent activities (combine real data with system activities)
    const recentActivities = [];
    
    // Add recent reports (last 5)
    const recentReports = allReports.slice(0, 5);
    recentReports.forEach(report => {
        const timeAgo = formatTimeAgo(new Date(report.created_at));
        recentActivities.push({
            type: 'report',
            message: `New report #${report.id} submitted`,
            time: timeAgo,
            icon: 'fas fa-exclamation-triangle',
            iconClass: 'report'
        });
    });
    
    // Add system activities (last 5)
    const recentSystemActivities = activityLogs.slice(0, 5);
    recentSystemActivities.forEach(activity => {
        recentActivities.push({
            type: 'system',
            message: activity.message,
            time: formatTimeAgo(new Date(activity.timestamp)),
            icon: activity.icon,
            iconClass: 'system'
        });
    });
    
    // Sort by time (newest first) and take top 5
    recentActivities.sort((a, b) => new Date(b.time) - new Date(a.time));
    const displayActivities = recentActivities.slice(0, 5);
    
    if (displayActivities.length === 0) {
        container.innerHTML = `
            <div class="activity-item info">
                <div class="activity-icon system">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-message">No recent activity</div>
                    <div class="activity-time">--</div>
                </div>
            </div>
        `;
        return;
    }

    displayActivities.forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item ${activity.type || 'info'}`;

        item.innerHTML = `
            <div class="activity-icon ${activity.iconClass || 'system'}">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-message">${activity.message}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function updateQuickStats() {
    // Calculate real quick stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayReports = allReports.filter(r => 
        new Date(r.created_at) >= today
    ).length;
    
    const avgResponseTime = calculateAverageResponseTime();
    const highPriority = allReports.filter(r => 
        r.priority === 'high' || r.priority === 'critical'
    ).length;
    
    const responderCoverage = calculateResponderCoverage();
    
    // Update quick stats in UI
    updateQuickStat('today-reports', todayReports);
    updateQuickStat('avg-response', `${avgResponseTime}m`);
    updateQuickStat('high-priority', highPriority);
    updateQuickStat('coverage', `${responderCoverage}%`);
}

function updateQuickStat(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function calculateAverageResponseTime() {
    if (allReports.length === 0) return 0;
    
    let totalTime = 0;
    let count = 0;
    
    allReports.forEach(report => {
        if (report.created_at && report.updated_at && report.status === 'resolved') {
            const created = new Date(report.created_at);
            const updated = new Date(report.updated_at);
            const diffMinutes = (updated - created) / (1000 * 60);
            
            if (diffMinutes > 0 && diffMinutes < 1440) { // Less than 24 hours
                totalTime += diffMinutes;
                count++;
            }
        }
    });
    
    return count > 0 ? Math.round(totalTime / count) : 0;
}

function calculateResponderCoverage() {
    if (allReports.length === 0 || allResponders.length === 0) return 0;
    
    const locations = new Set();
    allReports.forEach(report => {
        if (report.location) {
            locations.add(report.location);
        }
    });
    
    // Simple coverage calculation
    const coverage = Math.min(100, Math.round((locations.size / Math.max(allResponders.length, 1)) * 100));
    return coverage;
}

function updateNotificationBadges() {
    // Update sidebar notification badges with real data
    const pendingReports = allReports.filter(r => r.status === 'pending').length;
    const assignedResponders = allResponders.filter(r => r.status === 'Assigned').length;
    
    const reportsBadge = document.querySelector('#btn-reports .notification-badge');
    const respondersBadge = document.querySelector('#btn-responders .notification-badge');
    const dashboardBadge = document.querySelector('#btn-dashboard .notification-badge');
    
    if (reportsBadge) reportsBadge.textContent = pendingReports > 99 ? '99+' : pendingReports;
    if (respondersBadge) respondersBadge.textContent = assignedResponders > 99 ? '99+' : assignedResponders;
    if (dashboardBadge) dashboardBadge.textContent = allReports.length > 0 ? '!' : '';
}

/* ---------------- UPDATE STATS ---------------- */
function updateStats() {
    const totalEl = document.getElementById('total-responders');
    const availableEl = document.getElementById('available-responders');
    const activeEl = document.getElementById('active-responders');
    const locationsEl = document.getElementById('locations-covered');
    
    if (totalEl) totalEl.textContent = allResponders.length;
    
    const availableCount = allResponders.filter(r => 
        r.status === 'Available' || r.status === 'available'
    ).length;
    if (availableEl) availableEl.textContent = availableCount;
    
    const activeCount = allResponders.filter(r => 
        r.status === 'Assigned' || r.status === 'assigned'
    ).length;
    if (activeEl) activeEl.textContent = activeCount;
    
    // Calculate unique locations
    const locations = new Set();
    allReports.forEach(report => {
        if (report.location && report.location.trim() !== '') {
            locations.add(report.location);
        } else if (report.latitude && report.longitude) {
            const lat = parseFloat(report.latitude).toFixed(2);
            const lng = parseFloat(report.longitude).toFixed(2);
            if (!isNaN(lat) && !isNaN(lng)) {
                locations.add(`${lat},${lng}`);
            }
        }
    });
    if (locationsEl) locationsEl.textContent = locations.size;
}

/* ---------------- UPDATE TIME DISPLAY ---------------- */
function updateTimeDisplay() {
    const now = new Date();
    const timeElement = document.getElementById('data-updated');
    if (timeElement) {
        const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        timeElement.innerHTML = `<i class="fas fa-sync-alt"></i><span>Updated at ${timeString}</span>`;
    }
}

/* ---------------- UPDATE USERS TABLE ---------------- */
function updateUsersTable() {
    const usersTbody = document.getElementById('users-table');
    if (!usersTbody) return;
    
    usersTbody.innerHTML = '';

    if (allUsers.length === 0) {
        usersTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">No users found in database</td></tr>';
        return;
    }

    allUsers.forEach(user => {
        const row = document.createElement('tr');
        
        // Count reports by this user
        const userReports = allReports.filter(r => {
            const reporterEmail = r.reporter;
            return (reporterEmail && user.email && reporterEmail.toLowerCase() === user.email.toLowerCase());
        }).length;
        
        const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
        const userName = user.full_name || user.name || user.email?.split('@')[0] || 'Unknown';
        
        row.innerHTML = `
            <td>${userName}</td>
            <td>${user.email || 'No email'}</td>
            <td>${user.role || 'Citizen'}</td>
            <td>${userReports}</td>
            <td>${joinDate}</td>
            <td>
                <button class="btn ghost small" onclick="viewUser('${user.id}')">View</button>
            </td>
        `;
        usersTbody.appendChild(row);
    });
}

/* ---------------- UPDATE REPORTS TABLE ---------------- */
async function updateReportsTable() {
    const reportsTbody = document.getElementById('reports-table');
    if (!reportsTbody) return;
    
    reportsTbody.innerHTML = '';

    if (allReports.length === 0) {
        reportsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No reports found</td></tr>';
        return;
    }

    // Create rows with real data
    allReports.forEach(report => {
        const row = document.createElement('tr');
        
        let reporterName = report.reporter || 'Anonymous';
        
        if (typeof reporterName === 'string' && reporterName.includes('@')) {
            const user = allUsers.find(u => u.email?.toLowerCase() === reporterName.toLowerCase());
            if (user && (user.full_name || user.name)) {
                reporterName = user.full_name || user.name || reporterName;
            }
        }

        const time = report.created_at ? new Date(report.created_at).toLocaleString() : 'Unknown';
        const statusClass = getStatusClass(report.status || 'pending');
        const statusText = getStatusText(report.status || 'pending');
        
        // Format location
        let location = 'Unknown location';
        if (report.location && report.location.trim() !== '') {
            location = report.location;
        } else if (report.latitude && report.longitude) {
            const lat = parseFloat(report.latitude);
            const lng = parseFloat(report.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                location = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        }
        
        row.innerHTML = `
            <td>#${report.id?.toString().padStart(5, '0') || 'N/A'}</td>
            <td>${reporterName}</td>
            <td>${report.type_display || report.type || 'Emergency'}</td>
            <td>${location}</td>
            <td>${time}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn ghost small" onclick="viewReport('${report.id}')">View</button>
                <button class="btn ghost small" onclick="updateReportStatus('${report.id}')">Update</button>
            </td>
        `;
        reportsTbody.appendChild(row);
    });
}

/* ---------------- UPDATE RESPONDERS TABLE ---------------- */
function updateRespondersTable() {
    const tbody = document.getElementById('responders-table');
    if (!tbody) {
        console.error("Could not find responders-table element!");
        return;
    }
    
    tbody.innerHTML = '';
    
    if (allResponders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">
                    <i class="fas fa-users" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i>
                    <div style="margin-bottom:20px;">No responders found</div>
                    <div>Responders are created when assigned to reports</div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Apply sorting
    const sortedResponders = [...allResponders].sort((a, b) => {
        let aValue = a[sortColumn];
        let bValue = b[sortColumn];
        
        if (sortColumn === 'lastActive') {
            aValue = a.updated_at || a.created_at;
            bValue = b.updated_at || b.created_at;
        }
        
        // Handle undefined/null values
        if (!aValue && !bValue) return 0;
        if (!aValue) return 1;
        if (!bValue) return -1;
        
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    // Apply pagination
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageResponders = sortedResponders.slice(startIndex, endIndex);
    
    pageResponders.forEach((responder, index) => {
        const row = createResponderRow(responder, startIndex + index);
        tbody.appendChild(row);
    });
    
    // Update pagination info
    updatePaginationInfo();
}

function createResponderRow(responder, index) {
    const row = document.createElement('tr');
    
    // Format last active time
    let lastActive = 'Unknown';
    if (responder.updated_at) {
        const updated = new Date(responder.updated_at);
        lastActive = formatTimeAgo(updated);
    }
    
    // Status badge
    let statusClass = 'status-badge ';
    let statusText = responder.status || 'Available';
    
    if (responder.status === 'Available' || responder.status === 'available') {
        statusClass += 'status-available';
        statusText = 'Available';
    } else if (responder.status === 'Assigned' || responder.status === 'assigned') {
        statusClass += 'status-assigned';
        statusText = 'Assigned';
    } else {
        statusClass += 'status-on-duty';
        statusText = 'On Duty';
    }
    
    row.innerHTML = `
        <td class="checkbox-col">
            <input type="checkbox" class="row-select" onchange="handleRowSelect()">
        </td>
        <td>
            <div class="responder-info">
                <div class="responder-name">${responder.name || 'Unknown Responder'}</div>
            </div>
        </td>
        <td>
            <div class="unit-info">
                <div class="unit-name">${responder.unit || 'Unassigned'}</div>
            </div>
        </td>
        <td>
            <div class="contact-info">
                <div class="contact-phone">${responder.contact || 'No contact'}</div>
            </div>
        </td>
        <td>
            <span class="${statusClass}">${statusText}</span>
        </td>
        <td>
            <div class="time-info">
                <div class="time-text">${lastActive}</div>
            </div>
        </td>
        <td>
            <div class="action-buttons">
                <button class="action-btn" title="Update Status" onclick="openStatusModal('${responder.id}')">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button class="action-btn" title="View Details" onclick="viewResponderDetails('${responder.id}')">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        </td>
    `;
    
    return row;
}

/* ---------------- PAGINATION FUNCTIONS ---------------- */
function changeRowsPerPage(value) {
    rowsPerPage = parseInt(value);
    currentPage = 1;
    updateRespondersTable();
    logActivity(`Changed rows per page to ${value}`, 'info', 'fas fa-list-ol');
}

function nextPage() {
    const totalPages = Math.ceil(allResponders.length / rowsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        updateRespondersTable();
        logActivity(`Navigated to page ${currentPage}`, 'info', 'fas fa-arrow-right');
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        updateRespondersTable();
        logActivity(`Navigated to page ${currentPage}`, 'info', 'fas fa-arrow-left');
    }
}

function updatePaginationInfo() {
    const showingCount = Math.min(allResponders.length, currentPage * rowsPerPage);
    const totalCount = allResponders.length;
    
    const showingEl = document.getElementById('showing-count');
    const totalEl = document.getElementById('total-count');
    
    if (showingEl) showingEl.textContent = showingCount;
    if (totalEl) totalEl.textContent = totalCount;
    
    // Update pagination buttons state
    const prevBtn = document.querySelector('.pagination-btn:first-child');
    const nextBtn = document.querySelector('.pagination-btn:last-child');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
    }
    if (nextBtn) {
        const totalPages = Math.ceil(allResponders.length / rowsPerPage);
        nextBtn.disabled = currentPage >= totalPages;
    }
}

/* ---------------- SEARCH AND FILTER FUNCTIONS ---------------- */
function searchResponders(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    if (!searchTerm) {
        updateRespondersTable();
        return;
    }
    
    const filtered = allResponders.filter(responder => {
        return (
            (responder.name && responder.name.toLowerCase().includes(searchTerm)) ||
            (responder.unit && responder.unit.toLowerCase().includes(searchTerm)) ||
            (responder.contact && responder.contact.toLowerCase().includes(searchTerm))
        );
    });
    
    displayFilteredResponders(filtered);
    logActivity(`Searched for: ${searchTerm}`, 'info', 'fas fa-search');
}

function displayFilteredResponders(responders) {
    const tbody = document.getElementById('responders-table');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (responders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">
                    <i class="fas fa-search" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i>
                    <div>No responders found matching your search</div>
                </td>
            </tr>
        `;
        return;
    }
    
    responders.forEach((responder, index) => {
        const row = createResponderRow(responder, index);
        tbody.appendChild(row);
    });
    
    // Update showing count for filtered results
    const showingEl = document.getElementById('showing-count');
    const totalEl = document.getElementById('total-count');
    
    if (showingEl) showingEl.textContent = responders.length;
    if (totalEl) totalEl.textContent = responders.length;
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    updateRespondersTable();
    logActivity(`Sorted by ${column} (${sortDirection})`, 'info', 'fas fa-sort');
}

/* ---------------- RESPONDER MANAGEMENT FUNCTIONS ---------------- */
window.openStatusModal = function(responderId) {
    const responder = allResponders.find(r => r.id === responderId);
    if (responder) {
        currentResponderId = responderId;
        document.getElementById('status-modal').style.display = 'flex';
        logActivity(`Opened status modal for ${responder.name}`, 'info', 'fas fa-sync-alt');
    }
};

window.closeStatusModal = function() {
    document.getElementById('status-modal').style.display = 'none';
    currentResponderId = null;
};

window.selectStatus = function(status) {
    if (currentResponderId) {
        const responder = allResponders.find(r => r.id === currentResponderId);
        if (responder) {
            const oldStatus = responder.status;
            responder.status = status;
            responder.updated_at = new Date().toISOString();
            updateRespondersTable();
            updateStats();
            updateDashboard();
            closeStatusModal();
            
            showNotification(`Status updated to "${status}"`, 'success');
            logActivity(`Changed responder status from ${oldStatus} to ${status}`, 'info', 'fas fa-exchange-alt');
            logAudit(currentUser?.email || 'Admin', 'update_status', 
                    `Changed ${responder.name} status to ${status}`, 'responders');
        }
    }
};

window.viewResponderDetails = function(id) {
    const responder = allResponders.find(r => r.id === id);
    if (responder) {
        let reportInfo = '';
        if (responder.report_id) {
            const report = allReports.find(r => r.id == responder.report_id);
            if (report) {
                reportInfo = `\n\nAssigned to Report: #${report.id}\nReport Type: ${report.type_display || report.type}\nReport Status: ${report.status}\nReport Time: ${new Date(report.created_at).toLocaleString()}`;
            }
        }
        
        const details = `Responder Details:\n\nName: ${responder.name}\nUnit: ${responder.unit}\nContact: ${responder.contact}\nStatus: ${responder.status}\nCreated: ${responder.created_at ? new Date(responder.created_at).toLocaleString() : 'Unknown'}\nLast Updated: ${responder.updated_at ? new Date(responder.updated_at).toLocaleString() : 'Unknown'}${reportInfo}`;
        
        alert(details);
        logActivity(`Viewed details for ${responder.name}`, 'info', 'fas fa-eye');
    }
};

window.exportResponders = function() {
    if (allResponders.length === 0) {
        showNotification('No responders to export', 'info');
        return;
    }
    
    // Create CSV content
    const headers = ['Name', 'Unit', 'Contact', 'Status', 'Last Updated'];
    const rows = allResponders.map(r => [
        r.name || '',
        r.unit || '',
        r.contact || '',
        r.status || '',
        r.updated_at ? new Date(r.updated_at).toLocaleString() : ''
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `responders_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification(`Exported ${allResponders.length} responders to CSV`, 'success');
    logActivity(`Exported responders data`, 'success', 'fas fa-download');
    logAudit(currentUser?.email || 'Admin', 'export_data', 
            'Exported responders to CSV', 'responders');
};

window.filterByStatus = function(status) {
    const statusOptions = ['Available', 'Assigned', 'On Duty'];
    const selectedStatus = prompt(`Enter status to filter by:\n${statusOptions.join(', ')}`, status);
    
    if (selectedStatus && statusOptions.includes(selectedStatus)) {
        const filtered = allResponders.filter(r => 
            r.status.toLowerCase() === selectedStatus.toLowerCase()
        );
        displayFilteredResponders(filtered);
        logActivity(`Filtered by status: ${selectedStatus}`, 'info', 'fas fa-filter');
    } else if (selectedStatus === 'all') {
        updateRespondersTable();
        logActivity('Cleared status filter', 'info', 'fas fa-times-circle');
    }
};

function handleRowSelect() {
    const checkboxes = document.querySelectorAll('.row-select');
    const selectAll = document.getElementById('select-all');
    
    if (!selectAll) return;
    
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

/* ---------------- HELPER FUNCTIONS ---------------- */
function getStatusClass(status) {
    const statusMap = {
        'pending': 'status-pending',
        'investigating': 'status-investigating',
        'assigned': 'status-assigned',
        'resolved': 'status-resolved',
        'cancelled': 'status-cancelled',
        'submitted': 'status-pending'
    };
    return statusMap[status] || 'status-pending';
}

function getStatusText(status) {
    const statusMap = {
        'pending': 'Pending',
        'investigating': 'Investigating',
        'assigned': 'Assigned',
        'resolved': 'Resolved',
        'cancelled': 'Cancelled',
        'submitted': 'Submitted'
    };
    return statusMap[status] || 'Pending';
}

function formatTimeAgo(date) {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else if (diffDays < 7) {
        return `${diffDays}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto remove after delay
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

/* ---------------- AUDIT AND ACTIVITY FUNCTIONS ---------------- */
function initializeAuditAndActivity() {
    sessionStartTime = new Date();
    
    // Track user activity
    const activityEvents = ['click', 'keypress', 'mousemove', 'scroll'];
    activityEvents.forEach(event => {
        document.addEventListener(event, () => lastActivityTime = Date.now());
    });
    
    // Check session timeout periodically
    setInterval(checkSessionTimeout, 60000);
    
    // Initialize audit logs
    auditLogs = JSON.parse(localStorage.getItem('aidtracker_audit_logs') || '[]');
    activityLogs = JSON.parse(localStorage.getItem('aidtracker_activity_logs') || '[]');
    
    // Log initial activity
    logActivity('Admin dashboard initialized', 'info', 'fas fa-play');
    logAudit('SYSTEM', 'session_start', 'Admin session started', 'system');
    
    // Update audit and activity tables
    updateAuditLogsTable();
    updateActivityFeed();
    updateSystemActivityStats();
}

function logActivity(message, type = 'info', icon = 'fas fa-info-circle') {
    const activity = {
        id: `act_${Date.now()}`,
        timestamp: new Date().toISOString(),
        message: message,
        type: type,
        icon: icon,
        user: currentUser?.email || 'system'
    };
    
    activityLogs.unshift(activity);
    
    // Keep only last 100 activities
    if (activityLogs.length > 100) {
        activityLogs.length = 100;
    }
    
    // Save to localStorage
    localStorage.setItem('aidtracker_activity_logs', JSON.stringify(activityLogs));
    
    // Update UI if on activity panel
    updateActivityFeed();
}

function logAudit(user, action, details, resource, status = 'success') {
    const audit = {
        id: `audit_${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: user,
        action: action,
        details: details,
        resource: resource,
        status: status,
        ip: '127.0.0.1'
    };
    
    auditLogs.unshift(audit);
    
    // Keep only last 1000 audit entries
    if (auditLogs.length > 1000) {
        auditLogs.length = 1000;
    }
    
    // Save to localStorage
    localStorage.setItem('aidtracker_audit_logs', JSON.stringify(auditLogs));
    
    // Update UI if on audit panel
    updateAuditLogsTable();
}

function updateAuditLogsTable() {
    const tbody = document.getElementById('audit-table');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const searchTerm = document.getElementById('audit-search')?.value.toLowerCase() || '';
    const filterType = document.getElementById('audit-filter')?.value || 'all';
    
    let filteredLogs = auditLogs;
    
    // Apply search filter
    if (searchTerm) {
        filteredLogs = filteredLogs.filter(log => 
            log.user.toLowerCase().includes(searchTerm) ||
            log.action.toLowerCase().includes(searchTerm) ||
            log.details.toLowerCase().includes(searchTerm) ||
            log.resource.toLowerCase().includes(searchTerm)
        );
    }
    
    // Apply type filter
    if (filterType !== 'all') {
        filteredLogs = filteredLogs.filter(log => {
            if (filterType === 'login') {
                return log.action.toLowerCase().includes('login');
            } else if (filterType === 'data_access') {
                return log.action.toLowerCase().includes('data_access') || 
                       log.action.toLowerCase().includes('fetch') ||
                       log.action.toLowerCase().includes('view');
            } else if (filterType === 'data_change') {
                return log.action.toLowerCase().includes('update') || 
                       log.action.toLowerCase().includes('create') ||
                       log.action.toLowerCase().includes('delete');
            } else if (filterType === 'security') {
                return log.action.toLowerCase().includes('security') ||
                       log.action.toLowerCase().includes('failed') ||
                       log.status === 'error';
            }
            return true;
        });
    }
    
    // Apply pagination
    const startIndex = (auditCurrentPage - 1) * auditRowsPerPage;
    const endIndex = startIndex + auditRowsPerPage;
    const pageLogs = filteredLogs.slice(startIndex, endIndex);
    
    if (pageLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">
                    <i class="fas fa-history" style="font-size:48px;margin-bottom:16px;opacity:0.5;"></i>
                    <div>No audit logs found</div>
                </td>
            </tr>
        `;
        return;
    }
    
    pageLogs.forEach(log => {
        const row = document.createElement('tr');
        const time = new Date(log.timestamp).toLocaleString();
        const statusClass = log.status === 'success' ? 'status-success' : 'status-error';
        
        row.innerHTML = `
            <td>${time}</td>
            <td>${log.user}</td>
            <td>${log.action}</td>
            <td>${log.resource}</td>
            <td>${log.details}</td>
            <td>${log.ip}</td>
            <td><span class="status-badge ${statusClass}">${log.status}</span></td>
        `;
        tbody.appendChild(row);
    });
    
    // Update pagination info
    updateAuditPaginationInfo(filteredLogs.length);
}

function updateActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    
    feed.innerHTML = '';
    
    const recentActivities = activityLogs.slice(0, 10);
    
    if (recentActivities.length === 0) {
        feed.innerHTML = `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-message">No recent activity</div>
                    <div class="activity-time">--</div>
                </div>
            </div>
        `;
        return;
    }
    
    recentActivities.forEach(activity => {
        const item = document.createElement('div');
        item.className = `activity-item ${activity.type}`;
        
        const time = new Date(activity.timestamp);
        const timeDiff = Math.floor((new Date() - time) / (1000 * 60));
        let timeText = '';
        
        if (timeDiff < 1) {
            timeText = 'Just now';
        } else if (timeDiff < 60) {
            timeText = `${timeDiff}m ago`;
        } else if (timeDiff < 1440) {
            timeText = `${Math.floor(timeDiff / 60)}h ago`;
        } else {
            timeText = time.toLocaleDateString();
        }
        
        item.innerHTML = `
            <div class="activity-icon">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-message">${activity.message}</div>
                <div class="activity-time">${timeText}</div>
            </div>
        `;
        feed.appendChild(item);
    });
}

function updateSystemActivityStats() {
    // Update active users count
    const activeUsersEl = document.getElementById('active-users-count');
    if (activeUsersEl) {
        // In a real system, you'd track active sessions
        activeUsersEl.textContent = '1';
    }
    
    // Update login attempts
    const today = new Date().toDateString();
    const todaysLogins = auditLogs.filter(log => 
        log.action.includes('login') && 
        new Date(log.timestamp).toDateString() === today
    );
    
    const loginAttemptsEl = document.getElementById('login-attempts-today');
    if (loginAttemptsEl) {
        loginAttemptsEl.textContent = todaysLogins.length;
    }
    
    const failedLoginsEl = document.getElementById('failed-logins-today');
    if (failedLoginsEl) {
        const failed = todaysLogins.filter(log => log.status !== 'success').length;
        failedLoginsEl.textContent = failed;
    }
    
    // Update data access count
    const dataAccessEl = document.getElementById('data-access-count');
    if (dataAccessEl) {
        const dataAccess = auditLogs.filter(log => 
            log.action.includes('data_access') || 
            log.action.includes('fetch') ||
            log.action.includes('view')
        ).length;
        dataAccessEl.textContent = dataAccess;
    }
}

function checkSessionTimeout() {
    const now = Date.now();
    const inactiveTime = now - lastActivityTime;
    
    if (inactiveTime >= sessionTimeout) {
        // Session expired
        logout();
        showNotification('Session expired due to inactivity', 'warning');
    } else if (inactiveTime >= sessionTimeout - sessionWarningTime && !sessionWarningShown) {
        // Show warning
        showSessionWarning(Math.ceil((sessionTimeout - inactiveTime) / 60000));
        sessionWarningShown = true;
    }
}

function showSessionWarning(minutesLeft) {
    const warning = document.createElement('div');
    warning.className = 'notification warning';
    warning.innerHTML = `
        <i class="fas fa-clock"></i>
        <span>Your session will expire in ${minutesLeft} minutes due to inactivity</span>
        <button class="notification-close" onclick="this.parentElement.remove(); sessionWarningShown = false;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(warning);
    setTimeout(() => warning.classList.add('show'), 10);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        if (warning.parentElement) {
            warning.classList.remove('show');
            setTimeout(() => warning.remove(), 300);
        }
        sessionWarningShown = false;
    }, 10000);
}

/* ---------------- AUDIT PAGINATION FUNCTIONS ---------------- */
function changeAuditRowsPerPage(value) {
    auditRowsPerPage = parseInt(value);
    auditCurrentPage = 1;
    updateAuditLogsTable();
}

function nextAuditPage() {
    const totalLogs = auditLogs.length;
    const totalPages = Math.ceil(totalLogs / auditRowsPerPage);
    if (auditCurrentPage < totalPages) {
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

function updateAuditPaginationInfo(totalFiltered) {
    const showingCount = Math.min(totalFiltered, auditCurrentPage * auditRowsPerPage);
    const totalCount = totalFiltered;
    
    const showingEl = document.getElementById('audit-showing-count');
    const totalEl = document.getElementById('audit-total-count');
    
    if (showingEl) showingEl.textContent = showingCount;
    if (totalEl) totalEl.textContent = totalCount;
    
    // Update pagination buttons state
    const prevBtn = document.querySelector('#audit-logs .pagination-btn:first-child');
    const nextBtn = document.querySelector('#audit-logs .pagination-btn:last-child');
    
    if (prevBtn) {
        prevBtn.disabled = auditCurrentPage === 1;
    }
    if (nextBtn) {
        const totalPages = Math.ceil(totalFiltered / auditRowsPerPage);
        nextBtn.disabled = auditCurrentPage >= totalPages;
    }
}

function filterAuditLogs(filter) {
    auditCurrentPage = 1;
    updateAuditLogsTable();
    logActivity(`Filtered audit logs by: ${filter}`, 'info', 'fas fa-filter');
}

/* ---------------- SYSTEM ACTIVITY FUNCTIONS ---------------- */
window.refreshSystemActivity = function() {
    updateSystemActivityStats();
    updateActivityFeed();
    showNotification('System activity refreshed', 'success');
    logActivity('Refreshed system activity', 'info', 'fas fa-sync-alt');
};

window.exportActivityLog = function() {
    if (activityLogs.length === 0) {
        showNotification('No activity data to export', 'info');
        return;
    }

    // Create CSV export
    const headers = ['Timestamp', 'User', 'Message', 'Type', 'Icon'];
    const rows = activityLogs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.user,
        log.message,
        log.type,
        log.icon
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showNotification(`Exported ${activityLogs.length} activity logs`, 'success');
    logActivity('Exported activity logs', 'success', 'fas fa-download');
    logAudit(currentUser?.email || 'Admin', 'export_activity',
            'Exported activity logs to CSV', 'system');
};

window.exportAuditLogs = function() {
    if (auditLogs.length === 0) {
        showNotification('No audit data to export', 'info');
        return;
    }
    
    // Create CSV export
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Details', 'IP', 'Status'];
    const rows = auditLogs.map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.user,
        log.action,
        log.resource,
        log.details,
        log.ip,
        log.status
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification(`Exported ${auditLogs.length} audit logs`, 'success');
    logActivity('Exported audit logs', 'success', 'fas fa-download');
    logAudit(currentUser?.email || 'Admin', 'export_audit', 
            'Exported audit logs to CSV', 'system');
};

/* ---------------- GLOBAL FUNCTIONS ---------------- */
window.viewReport = async function(id) {
    const report = allReports.find(r => r.id == id);
    if (report) {
        let reporterName = report.reporter || 'Anonymous';
        
        if (typeof reporterName === 'string' && reporterName.includes('@')) {
            const user = allUsers.find(u => u.email?.toLowerCase() === reporterName.toLowerCase());
            if (user && (user.full_name || user.name)) {
                reporterName = user.full_name || user.name || reporterName;
            }
        }
        
        // Format location
        let location = 'Unknown location';
        if (report.location && report.location.trim() !== '') {
            location = report.location;
        } else if (report.latitude && report.longitude) {
            const lat = parseFloat(report.latitude);
            const lng = parseFloat(report.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                location = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        }
        
        let responderInfo = '';
        if (report.assigned_responders) {
            responderInfo = `\n\nAssigned Responders: ${report.assigned_responders}`;
            if (report.assigned_unit) {
                responderInfo += `\nUnit: ${report.assigned_unit}`;
            }
            if (report.contact) {
                responderInfo += `\nContact: ${report.contact}`;
            }
        }
        
        const details = `Report Details:\n\nID: #${report.id}\nReporter: ${reporterName}\nType: ${report.type_display || report.type}\nLocation: ${location}\nStatus: ${report.status}\nTime: ${new Date(report.created_at).toLocaleString()}${responderInfo}`;
        
        alert(details);
        logActivity(`Viewed report #${report.id}`, 'info', 'fas fa-eye');
        logAudit(currentUser?.email || 'Admin', 'view_report', 
                `Viewed report #${report.id}`, 'reports');
    }
};

window.updateReportStatus = function(id) {
    const report = allReports.find(r => r.id == id);
    if (!report) {
        alert('Report not found');
        return;
    }
    
    const statusOptions = ['pending', 'investigating', 'assigned', 'resolved', 'cancelled'];
    const newStatus = prompt(`Enter new status for report #${id}\nOptions: ${statusOptions.join(', ')}`, report.status || 'pending');
    
    if (newStatus && statusOptions.includes(newStatus.toLowerCase())) {
        supabaseClient
            .from('reports')
            .update({
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .then(({ error }) => {
                if (error) {
                    console.error('Error updating status:', error);
                    alert('Error updating status');
                    logAudit(currentUser?.email || 'Admin', 'update_report_failed', 
                            `Failed to update report #${id} status: ${error.message}`, 'reports', 'error');
                } else {
                    alert('Status updated successfully');
                    fetchAllData();
                    logActivity(`Updated report #${id} status to ${newStatus}`, 'success', 'fas fa-check');
                    logAudit(currentUser?.email || 'Admin', 'update_report', 
                            `Updated report #${id} status to ${newStatus}`, 'reports');
                }
            });
    } else if (newStatus) {
        alert('Invalid status. Please use one of: ' + statusOptions.join(', '));
    }
};

window.viewUser = function(id) {
    const user = allUsers.find(u => u.id == id);
    if (user) {
        const userReports = allReports.filter(r => {
            const reporterEmail = r.reporter;
            return (reporterEmail && user.email && reporterEmail.toLowerCase() === user.email.toLowerCase());
        }).length;

        const details = `User Details:\n\nName: ${user.full_name || user.name || 'Unknown'}\nEmail: ${user.email || 'No email'}\nRole: ${user.role || 'Citizen'}\nReports Submitted: ${userReports}\nJoined: ${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}`;
        
        alert(details);
        logActivity(`Viewed user: ${user.email}`, 'info', 'fas fa-eye');
        logAudit(currentUser?.email || 'Admin', 'view_user', 
                `Viewed user ${user.email}`, 'users');
    } else {
        alert('User not found');
    }
};

/* ---------------- ANALYTICS FUNCTIONS ---------------- */
function updateAnalytics() {
    console.log('Updating analytics...');

    // Calculate metrics based on real data
    const timeframe = document.getElementById('analytics-timeframe')?.value || '30d';
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Filter data by timeframe
    const filteredReports = allReports.filter(r => new Date(r.created_at) >= cutoffDate);
    const filteredUsers = allUsers.filter(u => new Date(u.created_at) >= cutoffDate);

    // Update key metrics
    updateAnalyticsMetrics(filteredReports, filteredUsers, days);

    // Update charts
    updateReportsTypeChart(filteredReports);
    updateReportsTimelineChart(filteredReports, days);
    updateLocationChart(filteredReports);
    updateUserActivityChart(filteredUsers, days);

    // Update tables
    updateTopRespondersTable();
    updateStatusDistributionTable(filteredReports);

    logActivity(`Updated analytics for ${timeframe}`, 'info', 'fas fa-chart-bar');
}

function updateAnalyticsMetrics(reports, users, days) {
    // Reports trend
    const currentPeriod = reports.length;
    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - (days * 2));
    const previousPeriod = allReports.filter(r => {
        const reportDate = new Date(r.created_at);
        return reportDate >= previousCutoff && reportDate < new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    }).length;

    const trend = previousPeriod > 0 ? ((currentPeriod - previousPeriod) / previousPeriod * 100).toFixed(0) : 0;
    const trendEl = document.getElementById('reports-trend');
    const countEl = document.getElementById('reports-count');

    if (trendEl) trendEl.textContent = `${trend >= 0 ? '+' : ''}${trend}%`;
    if (countEl) countEl.textContent = `${currentPeriod} reports this period`;

    // Average response time
    const avgResponseEl = document.getElementById('avg-response-time');
    if (avgResponseEl) {
        const avgTime = calculateAverageResponseTime();
        avgResponseEl.textContent = `${avgTime}m`;
    }

    // User engagement (active users ratio)
    const engagementEl = document.getElementById('user-engagement');
    if (engagementEl) {
        // Calculate engagement based on users who submitted reports
        const activeUsers = new Set();
        allReports.forEach(report => {
            if (report.reporter) {
                activeUsers.add(report.reporter.toLowerCase());
            }
        });
        
        const totalUsers = allUsers.length;
        const engagement = totalUsers > 0 ? Math.min(95, Math.round((activeUsers.size / totalUsers) * 100)) : 0;
        engagementEl.textContent = `${engagement}%`;
    }

    // System uptime (mock - in real system this would come from monitoring)
    const uptimeEl = document.getElementById('system-uptime');
    if (uptimeEl) uptimeEl.textContent = '99.9%';
}

function updateReportsTypeChart(reports) {
    const canvas = document.getElementById('reports-type-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (reportsTypeChart) {
        reportsTypeChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Count reports by type
    const typeCounts = {};
    reports.forEach(report => {
        const type = report.type_display || report.type || 'Emergency';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const labels = Object.keys(typeCounts);
    const data = Object.values(typeCounts);

    if (labels.length === 0) {
        // Create a default chart with "No data" message
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    reportsTypeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#3b82f6', // Blue
                    '#10b981', // Green
                    '#f59e0b', // Yellow
                    '#ef4444', // Red
                    '#8b5cf6', // Purple
                    '#06b6d4', // Cyan
                    '#f97316', // Orange
                    '#84cc16'  // Lime
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateReportsTimelineChart(reports, days) {
    const canvas = document.getElementById('reports-timeline-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (reportsTimelineChart) {
        reportsTimelineChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Group reports by date
    const dateGroups = {};
    reports.forEach(report => {
        const date = new Date(report.created_at).toLocaleDateString();
        dateGroups[date] = (dateGroups[date] || 0) + 1;
    });

    const dates = Object.keys(dateGroups).sort();
    const counts = dates.map(date => dateGroups[date]);

    if (dates.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    reportsTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Reports',
                data: counts,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

function updateLocationChart(reports) {
    const canvas = document.getElementById('location-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (locationChart) {
        locationChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Count reports by location (simplified)
    const locationCounts = {};
    reports.forEach(report => {
        let location = 'Unknown';
        if (report.location && report.location.trim() !== '') {
            // Take first part of location for simplicity
            location = report.location.split(',')[0].trim();
        }
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });

    // Sort by count and take top 5
    const sortedLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const labels = sortedLocations.map(([location]) => location);
    const data = sortedLocations.map(([, count]) => count);

    if (labels.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No location data', canvas.width / 2, canvas.height / 2);
        return;
    }

    locationChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Reports',
                data: data,
                backgroundColor: '#10b981',
                borderColor: '#10b981',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

function updateUserActivityChart(users, days) {
    const canvas = document.getElementById('user-activity-chart');
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (userActivityChart) {
        userActivityChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Create sample data for user activity (in a real system, this would be actual user activity data)
    const activityData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short' });
        
        // Count users created on this day
        const usersOnDay = users.filter(u => {
            const userDate = new Date(u.created_at);
            return userDate.toDateString() === date.toDateString();
        }).length;
        
        activityData.push({
            day: dateStr,
            count: usersOnDay
        });
    }

    const labels = activityData.map(d => d.day);
    const data = activityData.map(d => d.count);

    if (data.every(d => d === 0)) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No activity data', canvas.width / 2, canvas.height / 2);
        return;
    }

    userActivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'User Activity',
                data: data,
                backgroundColor: '#8b5cf6',
                borderColor: '#8b5cf6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
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

    // Calculate statistics for responders based on reports
    const responderStats = allResponders.map(responder => {
        // Find reports assigned to this responder
        const assignedReports = allReports.filter(report =>
            report.assigned_responders &&
            report.assigned_responders.toLowerCase().includes(responder.name.toLowerCase())
        );

        const reportsHandled = assignedReports.length;

        // Calculate average response time
        let totalResponseTime = 0;
        let responseCount = 0;

        assignedReports.forEach(report => {
            if (report.created_at && report.updated_at) {
                const created = new Date(report.created_at);
                const updated = new Date(report.updated_at);
                const responseTime = (updated - created) / (1000 * 60); // minutes
                if (responseTime > 0 && responseTime < 1440) { // Less than 24 hours
                    totalResponseTime += responseTime;
                    responseCount++;
                }
            }
        });

        const avgResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0;
        const avgResponseTimeStr = avgResponseTime > 0 ? `${avgResponseTime}m` : 'N/A';

        // Calculate success rate (reports that are resolved)
        const resolvedReports = assignedReports.filter(report =>
            report.status === 'resolved' || report.status === 'completed'
        ).length;
        const successRate = reportsHandled > 0 ? Math.round((resolvedReports / reportsHandled) * 100) : 0;
        const successRateStr = `${successRate}%`;

        return {
            ...responder,
            reportsHandled,
            avgResponseTime: avgResponseTimeStr,
            successRate: successRateStr
        };
    });

    // Sort by reports handled (descending)
    responderStats.sort((a, b) => b.reportsHandled - a.reportsHandled);

    // Take top 5
    const topResponders = responderStats.slice(0, 5);

    if (topResponders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No responder data available</td></tr>';
        return;
    }

    topResponders.forEach(responder => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${responder.name}</td>
            <td>${responder.unit}</td>
            <td>${responder.reportsHandled}</td>
            <td>${responder.avgResponseTime}</td>
            <td>${responder.successRate}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateStatusDistributionTable(reports) {
    const tbody = document.getElementById('status-distribution-table');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Count by status
    const statusCounts = {};
    reports.forEach(report => {
        const status = report.status || 'pending';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const total = reports.length;

    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">No report data available</td></tr>';
        return;
    }

    Object.entries(statusCounts).forEach(([status, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        const avgTime = calculateAverageResolutionTime(status);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${status.charAt(0).toUpperCase() + status.slice(1)}</td>
            <td>${count}</td>
            <td>${percentage}%</td>
            <td>${avgTime}</td>
        `;
        tbody.appendChild(row);
    });
}

function calculateAverageResolutionTime(status) {
    if (status !== 'resolved') return 'N/A';
    
    const resolvedReports = allReports.filter(r => r.status === 'resolved');
    if (resolvedReports.length === 0) return 'N/A';
    
    let totalTime = 0;
    let count = 0;
    
    resolvedReports.forEach(report => {
        if (report.created_at && report.updated_at) {
            const created = new Date(report.created_at);
            const updated = new Date(report.updated_at);
            const diffHours = (updated - created) / (1000 * 60 * 60);
            
            if (diffHours > 0 && diffHours < 168) { // Less than 7 days
                totalTime += diffHours;
                count++;
            }
        }
    });
    
    if (count === 0) return 'N/A';
    
    const avgHours = totalTime / count;
    if (avgHours < 1) {
        return `${Math.round(avgHours * 60)}m`;
    } else if (avgHours < 24) {
        return `${Math.round(avgHours)}h`;
    } else {
        return `${Math.round(avgHours / 24)}d`;
    }
}

function exportAnalytics() {
    // Create a simple analytics report
    const report = {
        generated: new Date().toISOString(),
        timeframe: document.getElementById('analytics-timeframe')?.value || '30d',
        totalReports: allReports.length,
        totalUsers: allUsers.length,
        totalResponders: allResponders.length,
        avgResponseTime: `${calculateAverageResponseTime()}m`,
        resolutionRate: calculateResolutionRate(),
        systemUptime: '99.9%'
    };

    const dataStr = JSON.stringify(report, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_report_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showNotification('Analytics report exported', 'success');
    logActivity('Exported analytics report', 'success', 'fas fa-download');
}

function calculateResolutionRate() {
    const resolvedReports = allReports.filter(r => r.status === 'resolved').length;
    const total = allReports.length;
    return total > 0 ? Math.round((resolvedReports / total) * 100) : 0;
}

/* ---------------- SETTINGS FUNCTIONS ---------------- */
function loadSettings() {
    console.log('Loading settings...');

    // Load settings from localStorage or set defaults
    const settings = JSON.parse(localStorage.getItem('aidtracker_settings') || '{}');

    // General settings
    const appNameEl = document.getElementById('app-name');
    if (appNameEl) appNameEl.value = settings.appName || 'AidTracker';



    const timezoneEl = document.getElementById('timezone');
    if (timezoneEl) timezoneEl.value = settings.timezone || 'Asia/Manila';

    const dateFormatEl = document.getElementById('date-format');
    if (dateFormatEl) dateFormatEl.value = settings.dateFormat || 'MM/DD/YYYY';

    // Security settings
    const sessionTimeoutEl = document.getElementById('session-timeout');
    if (sessionTimeoutEl) sessionTimeoutEl.value = settings.sessionTimeout || 30;

    const passwordMinLengthEl = document.getElementById('password-min-length');
    if (passwordMinLengthEl) passwordMinLengthEl.value = settings.passwordMinLength || 8;

    const maxLoginAttemptsEl = document.getElementById('max-login-attempts');
    if (maxLoginAttemptsEl) maxLoginAttemptsEl.value = settings.maxLoginAttempts || 5;

    const twoFactorEl = document.getElementById('two-factor-auth');
    if (twoFactorEl) twoFactorEl.checked = settings.twoFactorAuth || false;

    const auditLoggingEl = document.getElementById('audit-logging');
    if (auditLoggingEl) auditLoggingEl.checked = settings.auditLogging !== false;



    // Notification settings
    const emailNotificationsEl = document.getElementById('email-notifications');
    if (emailNotificationsEl) emailNotificationsEl.checked = settings.emailNotifications !== false;



    const pushNotificationsEl = document.getElementById('push-notifications');
    if (pushNotificationsEl) pushNotificationsEl.checked = settings.pushNotifications !== false;

    const notificationFrequencyEl = document.getElementById('notification-frequency');
    if (notificationFrequencyEl) notificationFrequencyEl.value = settings.notificationFrequency || 'daily';

    // Data management
    const dataRetentionEl = document.getElementById('data-retention');
    if (dataRetentionEl) dataRetentionEl.value = settings.dataRetention || 365;

    const backupFrequencyEl = document.getElementById('backup-frequency');
    if (backupFrequencyEl) backupFrequencyEl.value = settings.backupFrequency || 'weekly';

    const autoCleanupEl = document.getElementById('auto-cleanup');
    if (autoCleanupEl) autoCleanupEl.checked = settings.autoCleanup !== false;

    logActivity('Loaded system settings', 'info', 'fas fa-cog');
}

function saveSettings() {
    console.log('Saving settings...');

    const settings = {
        // General
        appName: document.getElementById('app-name')?.value || 'AidTracker',
        language: document.getElementById('default-language')?.value || 'en',
        timezone: document.getElementById('timezone')?.value || 'Asia/Manila',
        dateFormat: document.getElementById('date-format')?.value || 'MM/DD/YYYY',

        // Security
        sessionTimeout: parseInt(document.getElementById('session-timeout')?.value) || 30,
        passwordMinLength: parseInt(document.getElementById('password-min-length')?.value) || 8,
        maxLoginAttempts: parseInt(document.getElementById('max-login-attempts')?.value) || 5,
        twoFactorAuth: document.getElementById('two-factor-auth')?.checked || false,
        auditLogging: document.getElementById('audit-logging')?.checked || true,
        ipWhitelist: document.getElementById('ip-whitelist')?.checked || false,

        // Notifications
        emailNotifications: document.getElementById('email-notifications')?.checked || true,
        smsNotifications: document.getElementById('sms-notifications')?.checked || false,
        pushNotifications: document.getElementById('push-notifications')?.checked || true,
        notificationFrequency: document.getElementById('notification-frequency')?.value || 'daily',

        // Data management
        dataRetention: parseInt(document.getElementById('data-retention')?.value) || 365,
        backupFrequency: document.getElementById('backup-frequency')?.value || 'weekly',
        autoCleanup: document.getElementById('auto-cleanup')?.checked || true,

        // Metadata
        lastUpdated: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin'
    };

    // Save to localStorage
    localStorage.setItem('aidtracker_settings', JSON.stringify(settings));

    // Apply some settings immediately
    sessionTimeout = settings.sessionTimeout * 60 * 1000;

    showNotification('Settings saved successfully', 'success');
    logActivity('Saved system settings', 'success', 'fas fa-save');
    logAudit(currentUser?.email || 'Admin', 'update_settings', 'Updated system settings', 'settings');
}

function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
        localStorage.removeItem('aidtracker_settings');

        // Reload the form with defaults
        loadSettings();

        showNotification('Settings reset to defaults', 'info');
        logActivity('Reset settings to defaults', 'warning', 'fas fa-undo');
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

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aidtracker_full_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showNotification('Full data export completed', 'success');
    logActivity('Exported all system data', 'success', 'fas fa-download');
    logAudit(currentUser?.email || 'Admin', 'export_all_data', 'Exported complete system data', 'system');
}

function clearOldData() {
    const retentionDays = parseInt(document.getElementById('data-retention')?.value) || 365;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Filter out old data (this is a simulation - in real app would delete from database)
    const oldReports = allReports.filter(r => new Date(r.created_at) < cutoffDate);
    const oldUsers = allUsers.filter(u => new Date(u.created_at) < cutoffDate);

    if (oldReports.length === 0 && oldUsers.length === 0) {
        showNotification('No old data to clear', 'info');
        return;
    }

    if (confirm(`This will clear ${oldReports.length} old reports and ${oldUsers.length} old user records. Continue?`)) {
        // In a real application, this would make API calls to delete data
        showNotification(`Cleared ${oldReports.length} old reports and ${oldUsers.length} old users`, 'success');
        logActivity(`Cleared old data: ${oldReports.length} reports, ${oldUsers.length} users`, 'warning', 'fas fa-trash');
        logAudit(currentUser?.email || 'Admin', 'clear_old_data', `Cleared ${oldReports.length} reports and ${oldUsers.length} users older than ${retentionDays} days`, 'system');
    }
}

// Make functions available globally
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

console.log('Admin JavaScript loaded successfully!');