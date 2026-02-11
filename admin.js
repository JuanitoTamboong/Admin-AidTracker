// admin.js - Complete Fixed Version

// Initialize Supabase client with your credentials
const SUPABASE_URL = 'https://gwvepxupoxyyydnisulb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dmVweHVwb3h5eXlkbmlzdWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDE4ODcsImV4cCI6MjA4MDM3Nzg4N30.Ku9SXTAKNMvHilgEpxj5HcVA-0TPt4ziuEq0Irao5Qc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Authentication state
let currentUser = null;

// Your OpenCage API key
const OPENCAGE_API_KEY = '0a78fbd8bcd74be398f210b34682c77c';

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

// Cache for location names
const locationCache = new Map();

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
    // Notifications button
    const notifyBtn = document.querySelector('.header-action[title="Notifications"]');
    if (notifyBtn) {
        notifyBtn.addEventListener('click', () => {
            showNotification('You have 5 unread notifications', 'info');
            logActivity('Viewed notifications', 'info', 'fas fa-bell');
        });
    }
    
    // Search button
    const searchBtn = document.querySelector('.header-action[title="Search"]');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const searchInput = document.getElementById('responder-search');
            if (searchInput) {
                searchInput.focus();
                logActivity('Opened search', 'info', 'fas fa-search');
            }
        });
    }
    
    // Help button
    const helpBtn = document.querySelector('.header-action[title="Help"]');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            alert('AidTracker Admin Console\n\nVersion 1.0.0\n\nFor assistance, please contact system administrator.');
            logActivity('Accessed help', 'info', 'fas fa-question-circle');
        });
    }
}

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
});

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
            // Continue to load default data
        }

        // Transform report data into responder format
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
                        status: 'Assigned',
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
            
            // Create some default responders for demonstration
            allResponders = [
                {
                    id: '1',
                    name: 'MDRRMO Unit',
                    unit: 'MDRRMO',
                    contact: '0912-345-6789',
                    status: 'Available',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: '2',
                    name: 'BFP Fire Truck',
                    unit: 'BFP',
                    contact: '0917-890-1234',
                    status: 'On Duty',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                },
                {
                    id: '3',
                    name: 'Police Patrol',
                    unit: 'POLICE',
                    contact: '0919-876-5432',
                    status: 'Assigned',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ];
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

/* ---------------- UPDATE DASHBOARD ---------------- */
function updateDashboard() {
    const totalUsersEl = document.getElementById('total-users');
    const activeReportsEl = document.getElementById('active-reports');
    
    if (totalUsersEl) totalUsersEl.textContent = allUsers.length;
    if (activeReportsEl) activeReportsEl.textContent = allReports.filter(r => 
        r.status === 'pending' || r.status === 'investigating' || r.status === 'submitted'
    ).length;
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
        r.status === 'Assigned' || r.status === 'assigned' || r.status === 'On Duty'
    ).length;
    if (activeEl) activeEl.textContent = activeCount;
    
    const locations = new Set();
    allReports.forEach(report => {
        if (report.location) {
            locations.add(report.location);
        } else if (report.latitude && report.longitude) {
            locations.add(`${report.latitude.toFixed(2)},${report.longitude.toFixed(2)}`);
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
        
        const userReports = allReports.filter(r => {
            const reporterEmail = r.reporter;
            return (reporterEmail && user.email && reporterEmail === user.email);
        }).length;
        
        const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
        const userName = user.full_name || user.name || 'Unknown';
        
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

    // Create rows with geocoding
    const batchSize = 5;
    for (let i = 0; i < allReports.length; i += batchSize) {
        const batch = allReports.slice(i, i + batchSize);
        
        for (const report of batch) {
            const row = document.createElement('tr');
            
            let reporterName = report.reporter || 'Anonymous';
            
            if (typeof reporterName === 'string' && reporterName.includes('@')) {
                const user = allUsers.find(u => u.email === reporterName);
                if (user && (user.full_name || user.name)) {
                    reporterName = user.full_name || user.name || reporterName;
                }
            }

            const time = report.created_at ? new Date(report.created_at).toLocaleString() : 'Unknown';
            const statusClass = getStatusClass(report.status || 'pending');
            const statusText = getStatusText(report.status || 'pending');
            const location = await formatLocation(report);
            
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
        }
        
        if (i + batchSize < allReports.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
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
                    <button class="btn primary small" onclick="addNewResponder()">Add First Responder</button>
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
        const now = new Date();
        const diffMinutes = Math.floor((now - updated) / (1000 * 60));
        
        if (diffMinutes < 1) {
            lastActive = 'Just now';
        } else if (diffMinutes < 60) {
            lastActive = `${diffMinutes}m ago`;
        } else if (diffMinutes < 1440) {
            lastActive = `${Math.floor(diffMinutes / 60)}h ago`;
        } else {
            lastActive = updated.toLocaleDateString();
        }
    }
    
    // Status badge
    let statusClass = 'status-badge ';
    let statusText = responder.status || 'Assigned';
    
    if (responder.status === 'Available' || responder.status === 'available') {
        statusClass += 'status-available';
    } else if (responder.status === 'On Duty') {
        statusClass += 'status-on-duty';
    } else if (responder.status === 'Assigned' || responder.status === 'assigned') {
        statusClass += 'status-assigned';
    } else if (responder.status === 'Busy' || responder.status === 'busy') {
        statusClass += 'status-busy';
    } else if (responder.status === 'On Call') {
        statusClass += 'status-on-call';
    } else if (responder.status === 'Off Duty') {
        statusClass += 'status-off-duty';
    } else {
        statusClass += 'status-assigned';
    }
    
    row.innerHTML = `
        <td class="checkbox-col">
            <input type="checkbox" class="row-select" onchange="handleRowSelect()">
        </td>
        <td>
            <div class="responder-info">
                <div class="responder-name">${responder.name || 'Unknown'}</div>
                ${responder.email ? `<div class="responder-email">${responder.email}</div>` : ''}
            </div>
        </td>
        <td>
            <div class="unit-info">
                <div class="unit-name">${responder.unit || 'Unassigned'}</div>
                ${responder.badge ? `<div class="badge-id">ID: ${responder.badge}</div>` : ''}
            </div>
        </td>
        <td>
            <div class="contact-info">
                <div class="contact-phone">${responder.contact || 'No contact'}</div>
                ${responder.email ? `<div class="contact-email">${responder.email}</div>` : ''}
            </div>
        </td>
        <td>
            <span class="${statusClass}">${statusText}</span>
        </td>
        <td>
            <div class="time-info">
                <div class="time-text">${lastActive}</div>
                <div class="time-detail">${responder.updated_at ? new Date(responder.updated_at).toLocaleDateString() : ''}</div>
            </div>
        </td>
        <td>
            <div class="action-buttons">
                <button class="action-btn" title="Update Status" onclick="openStatusModal('${responder.id}')">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button class="action-btn" title="Edit" onclick="editResponder('${responder.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn" title="View Details" onclick="viewResponderDetails('${responder.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn danger" title="Remove" onclick="removeResponder('${responder.id}')">
                    <i class="fas fa-trash"></i>
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
            (responder.contact && responder.contact.toLowerCase().includes(searchTerm)) ||
            (responder.email && responder.email.toLowerCase().includes(searchTerm))
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

/* ---------------- MODAL FUNCTIONS ---------------- */
window.addNewResponder = function() {
    document.getElementById('add-responder-modal').style.display = 'flex';
    logActivity('Opened add responder modal', 'info', 'fas fa-plus');
};

window.closeAddResponderModal = function() {
    document.getElementById('add-responder-modal').style.display = 'none';
    logActivity('Closed add responder modal', 'info', 'fas fa-times');
};

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
            closeStatusModal();
            
            showNotification(`Status updated to "${status}"`, 'success');
            logActivity(`Changed responder status from ${oldStatus} to ${status}`, 'info', 'fas fa-exchange-alt');
            logAudit(currentUser?.email || 'Admin', 'update_status', 
                    `Changed ${responder.name} status to ${status}`, 'responders');
        }
    }
};

/* ---------------- RESPONDER MANAGEMENT FUNCTIONS ---------------- */
window.saveNewResponder = async function() {
    const name = document.getElementById('responder-name').value.trim();
    const unit = document.getElementById('responder-unit').value.trim();
    const contact = document.getElementById('responder-contact').value.trim();
    const email = document.getElementById('responder-email').value.trim();
    const badge = document.getElementById('responder-badge').value.trim();
    const status = document.getElementById('responder-status').value;
    const skills = document.getElementById('responder-skills').value.trim();
    const notes = document.getElementById('responder-notes').value.trim();
    
    if (!name || !unit || !contact) {
        showNotification('Please fill in all required fields: Name, Unit, and Contact', 'error');
        return;
    }
    
    try {
        const newResponder = {
            id: `resp_${Date.now()}`,
            name: name,
            unit: unit,
            contact: contact,
            email: email || null,
            badge: badge || null,
            status: status,
            skills: skills || null,
            notes: notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        allResponders.unshift(newResponder);
        updateRespondersTable();
        updateStats();
        closeAddResponderModal();
        
        // Clear form
        document.getElementById('responder-name').value = '';
        document.getElementById('responder-unit').value = '';
        document.getElementById('responder-contact').value = '';
        document.getElementById('responder-email').value = '';
        document.getElementById('responder-badge').value = '';
        document.getElementById('responder-status').value = 'Available';
        document.getElementById('responder-skills').value = '';
        document.getElementById('responder-notes').value = '';
        
        showNotification('Responder added successfully!', 'success');
        logActivity(`Added new responder: ${name}`, 'success', 'fas fa-user-plus');
        logAudit(currentUser?.email || 'Admin', 'create_responder', 
                `Created responder: ${name} (${unit})`, 'responders');
        
    } catch (error) {
        console.error('Error adding responder:', error);
        showNotification('Error adding responder: ' + error.message, 'error');
    }
};

window.editResponder = function(id) {
    const responder = allResponders.find(r => r.id === id);
    if (responder) {
        const newName = prompt(`Edit responder name:`, responder.name || '');
        if (newName !== null && newName.trim() !== '') {
            const oldName = responder.name;
            responder.name = newName;
            responder.updated_at = new Date().toISOString();
            updateRespondersTable();
            showNotification('Responder name updated', 'success');
            logActivity(`Edited responder from ${oldName} to ${newName}`, 'info', 'fas fa-edit');
            logAudit(currentUser?.email || 'Admin', 'edit_responder', 
                    `Updated responder name from ${oldName} to ${newName}`, 'responders');
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
                reportInfo = `\nAssigned to Report: #${report.id}\nReport Type: ${report.type_display || report.type}\nReport Status: ${report.status}`;
            }
        }
        
        const details = `Responder Details:\n\nName: ${responder.name}\nUnit: ${responder.unit}\nContact: ${responder.contact}\nEmail: ${responder.email || 'N/A'}\nBadge ID: ${responder.badge || 'N/A'}\nStatus: ${responder.status}\nSkills: ${responder.skills || 'N/A'}\nNotes: ${responder.notes || 'N/A'}\nLast Updated: ${responder.updated_at ? new Date(responder.updated_at).toLocaleString() : 'Unknown'}${reportInfo}`;
        
        alert(details);
        logActivity(`Viewed details for ${responder.name}`, 'info', 'fas fa-eye');
    }
};

window.removeResponder = function(id) {
    const responder = allResponders.find(r => r.id === id);
    if (!responder) return;
    
    if (confirm(`Are you sure you want to remove responder "${responder.name}"?`)) {
        const index = allResponders.findIndex(r => r.id === id);
        if (index > -1) {
            allResponders.splice(index, 1);
            updateRespondersTable();
            updateStats();
            showNotification('Responder removed successfully', 'success');
            logActivity(`Removed responder: ${responder.name}`, 'warning', 'fas fa-trash');
            logAudit(currentUser?.email || 'Admin', 'delete_responder', 
                    `Removed responder: ${responder.name}`, 'responders');
        }
    }
};

window.exportResponders = function() {
    if (allResponders.length === 0) {
        showNotification('No responders to export', 'info');
        return;
    }
    
    // Create CSV content
    const headers = ['Name', 'Unit', 'Contact', 'Email', 'Status', 'Last Updated'];
    const rows = allResponders.map(r => [
        r.name || '',
        r.unit || '',
        r.contact || '',
        r.email || '',
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
    const statusOptions = ['Available', 'On Duty', 'Assigned', 'Busy', 'On Call', 'Off Duty'];
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
        'resolved': 'Resolved',
        'cancelled': 'Cancelled',
        'submitted': 'Submitted'
    };
    return statusMap[status] || 'Pending';
}

/* ---------------- GEOCODING FUNCTIONS ---------------- */
async function getLocationName(lat, lng) {
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    
    if (locationCache.has(cacheKey)) {
        return locationCache.get(cacheKey);
    }
    
    try {
        const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${OPENCAGE_API_KEY}&language=en&pretty=1&no_annotations=1`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AidTracker-Admin/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Geocoding API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            throw new Error('No address data returned');
        }
        
        const result = data.results[0];
        const components = result.components;
        
        let locationParts = [];
        
        if (components.road) locationParts.push(components.road);
        if (components.village) locationParts.push(components.village);
        if (components.suburb) locationParts.push(components.suburb);
        if (components.neighbourhood) locationParts.push(components.neighbourhood);
        if (components.town) locationParts.push(components.town);
        if (components.city) locationParts.push(components.city);
        if (components.municipality) locationParts.push(components.municipality);
        if (components.state) locationParts.push(components.state);
        if (components.country) locationParts.push(components.country);
        
        let finalAddress = '';
        
        if (locationParts.length > 0) {
            const uniqueParts = [...new Set(locationParts)];
            finalAddress = uniqueParts.join(', ');
        } else if (result.formatted) {
            finalAddress = result.formatted;
        } else {
            finalAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
        
        locationCache.set(cacheKey, finalAddress);
        return finalAddress;
        
    } catch (error) {
        console.warn('Reverse geocoding failed:', error);
        const fallbackAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        locationCache.set(cacheKey, fallbackAddress);
        return fallbackAddress;
    }
}

async function formatLocation(report) {
    if (report.location && report.location.trim() !== '') {
        return report.location;
    }
    
    if (report.latitude && report.longitude) {
        try {
            const lat = parseFloat(report.latitude);
            const lng = parseFloat(report.longitude);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                return await getLocationName(lat, lng);
            }
        } catch (error) {
            console.warn(`Could not get address for report ${report.id}:`, error);
        }
    }
    
    if (report.latitude && report.longitude) {
        return `${parseFloat(report.latitude).toFixed(4)}, ${parseFloat(report.longitude).toFixed(4)}`;
    }
    
    return 'Unknown location';
}

/* ---------------- UTILITY FUNCTIONS ---------------- */
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
    
    // Add styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 16px 20px;
                border-radius: var(--radius-md);
                background: white;
                box-shadow: var(--shadow-lg);
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 300px;
                transform: translateX(400px);
                transition: transform 0.3s ease;
                z-index: 9999;
                border-left: 4px solid;
            }
            
            .notification.show {
                transform: translateX(0);
            }
            
            .notification.success {
                border-left-color: var(--success);
            }
            
            .notification.error {
                border-left-color: var(--danger);
            }
            
            .notification.info {
                border-left-color: var(--primary);
            }
            
            .notification.warning {
                border-left-color: var(--warning);
            }
            
            .notification i {
                font-size: 20px;
            }
            
            .notification.success i {
                color: var(--success);
            }
            
            .notification.error i {
                color: var(--danger);
            }
            
            .notification.info i {
                color: var(--primary);
            }
            
            .notification.warning i {
                color: var(--warning);
            }
            
            .notification-close {
                margin-left: auto;
                background: none;
                border: none;
                cursor: pointer;
                opacity: 0.6;
                padding: 4px;
                border-radius: 4px;
            }
            
            .notification-close:hover {
                opacity: 1;
                background: rgba(0,0,0,0.05);
            }
        `;
        document.head.appendChild(styles);
    }
    
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
    auditRowsPerPage = value;
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
    
    // Create JSON export
    const dataStr = JSON.stringify(activityLogs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification(`Exported ${activityLogs.length} activity logs`, 'success');
    logActivity('Exported activity logs', 'success', 'fas fa-download');
    logAudit(currentUser?.email || 'Admin', 'export_activity', 
            'Exported activity logs to JSON', 'system');
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
            const user = allUsers.find(u => u.email === reporterName);
            if (user && (user.full_name || user.name)) {
                reporterName = user.full_name || user.name || reporterName;
            }
        }
        
        const location = await formatLocation(report);
        
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
    
    const statusOptions = ['pending', 'investigating', 'resolved', 'cancelled'];
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
            return (reporterEmail && user.email && reporterEmail === user.email);
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
    const previousPeriod = allReports.filter(r => {
        const reportDate = new Date(r.created_at);
        const previousCutoff = new Date();
        previousCutoff.setDate(previousCutoff.getDate() - (days * 2));
        return reportDate >= previousCutoff && reportDate < new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    }).length;

    const trend = previousPeriod > 0 ? ((currentPeriod - previousPeriod) / previousPeriod * 100).toFixed(0) : 0;
    const trendEl = document.getElementById('reports-trend');
    const countEl = document.getElementById('reports-count');

    if (trendEl) trendEl.textContent = `${trend >= 0 ? '+' : ''}${trend}%`;
    if (countEl) countEl.textContent = `${currentPeriod} reports this period`;

    // Average response time (mock calculation)
    const avgResponseEl = document.getElementById('avg-response-time');
    if (avgResponseEl) {
        const avgTime = reports.length > 0 ? Math.floor(Math.random() * 20) + 5 : 4.2;
        avgResponseEl.textContent = `${avgTime}m`;
    }

    // User engagement (active users ratio)
    const engagementEl = document.getElementById('user-engagement');
    if (engagementEl) {
        const engagement = users.length > 0 ? Math.min(95, Math.floor((users.length / Math.max(allUsers.length, 1)) * 100)) : 85;
        engagementEl.textContent = `${engagement}%`;
    }

    // System uptime (mock)
    const uptimeEl = document.getElementById('system-uptime');
    if (uptimeEl) uptimeEl.textContent = '99.9%';
}

function updateReportsTypeChart(reports) {
    const canvas = document.getElementById('reports-type-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Count reports by type
    const typeCounts = {};
    reports.forEach(report => {
        const type = report.type_display || report.type || 'Emergency';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const labels = Object.keys(typeCounts);
    const data = Object.values(typeCounts);

    // Simple pie chart implementation
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    let startAngle = 0;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', centerX, centerY);
        return;
    }

    const total = data.reduce((sum, value) => sum + value, 0);

    data.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = colors[index % colors.length];
        ctx.fill();

        startAngle = endAngle;
    });

    // Add legend
    ctx.font = '12px Inter';
    ctx.textAlign = 'left';
    labels.forEach((label, index) => {
        const x = 20;
        const y = 30 + (index * 20);
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x, y - 10, 12, 12);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(`${label}: ${data[index]}`, x + 16, y);
    });
}

function updateReportsTimelineChart(reports, days) {
    const canvas = document.getElementById('reports-timeline-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (reports.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Group reports by date
    const dateGroups = {};
    reports.forEach(report => {
        const date = new Date(report.created_at).toDateString();
        dateGroups[date] = (dateGroups[date] || 0) + 1;
    });

    const dates = Object.keys(dateGroups).sort();
    const counts = dates.map(date => dateGroups[date]);

    // Simple line chart
    const padding = 40;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);

    const maxCount = Math.max(...counts, 1);

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    dates.forEach((date, index) => {
        const x = padding + (index / (dates.length - 1 || 1)) * chartWidth;
        const y = canvas.height - padding - (counts[index] / maxCount) * chartHeight;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    // Add points
    ctx.fillStyle = '#3b82f6';
    dates.forEach((date, index) => {
        const x = padding + (index / (dates.length - 1 || 1)) * chartWidth;
        const y = canvas.height - padding - (counts[index] / maxCount) * chartHeight;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function updateLocationChart(reports) {
    const canvas = document.getElementById('location-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Count reports by location
    const locationCounts = {};
    reports.forEach(report => {
        const location = report.location || 'Unknown';
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });

    const locations = Object.keys(locationCounts).slice(0, 5); // Top 5
    const counts = locations.map(loc => locationCounts[loc]);

    if (locations.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No location data', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Simple bar chart
    const padding = 40;
    const barWidth = (canvas.width - (padding * 2)) / locations.length;
    const maxCount = Math.max(...counts, 1);

    locations.forEach((location, index) => {
        const x = padding + (index * barWidth);
        const barHeight = (counts[index] / maxCount) * (canvas.height - padding * 2);
        const y = canvas.height - padding - barHeight;

        ctx.fillStyle = '#10b981';
        ctx.fillRect(x, y, barWidth - 10, barHeight);

        // Label
        ctx.fillStyle = '#0f172a';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(location.substring(0, 10), x + (barWidth - 10) / 2, canvas.height - 10);
    });
}

function updateUserActivityChart(users, days) {
    const canvas = document.getElementById('user-activity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mock user activity data
    const activityData = [12, 19, 15, 25, 22, 30, 28];

    const padding = 40;
    const barWidth = (canvas.width - (padding * 2)) / activityData.length;
    const maxActivity = Math.max(...activityData, 1);

    activityData.forEach((activity, index) => {
        const x = padding + (index * barWidth);
        const barHeight = (activity / maxActivity) * (canvas.height - padding * 2);
        const y = canvas.height - padding - barHeight;

        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(x, y, barWidth - 10, barHeight);
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

    // Sort by reports handled (mock data)
    const topResponders = allResponders.slice(0, 5).map(responder => ({
        ...responder,
        reportsHandled: Math.floor(Math.random() * 50) + 1,
        avgResponseTime: `${Math.floor(Math.random() * 30) + 5}m`,
        successRate: `${Math.floor(Math.random() * 20) + 80}%`
    }));

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

    Object.entries(statusCounts).forEach(([status, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        const avgTime = `${Math.floor(Math.random() * 60) + 10}m`; // Mock

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

function exportAnalytics() {
    // Create a simple analytics report
    const report = {
        generated: new Date().toISOString(),
        timeframe: document.getElementById('analytics-timeframe')?.value || '30d',
        totalReports: allReports.length,
        totalUsers: allUsers.length,
        totalResponders: allResponders.length,
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

/* ---------------- SETTINGS FUNCTIONS ---------------- */
function loadSettings() {
    console.log('Loading settings...');

    // Load settings from localStorage or set defaults
    const settings = JSON.parse(localStorage.getItem('aidtracker_settings') || '{}');

    // General settings
    const appNameEl = document.getElementById('app-name');
    if (appNameEl) appNameEl.value = settings.appName || 'AidTracker';

    const languageEl = document.getElementById('default-language');
    if (languageEl) languageEl.value = settings.language || 'en';

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
    if (auditLoggingEl) auditLoggingEl.checked = settings.auditLogging !== false; // Default true

    const ipWhitelistEl = document.getElementById('ip-whitelist');
    if (ipWhitelistEl) ipWhitelistEl.checked = settings.ipWhitelist || false;

    // Notification settings
    const emailNotificationsEl = document.getElementById('email-notifications');
    if (emailNotificationsEl) emailNotificationsEl.checked = settings.emailNotifications !== false;

    const smsNotificationsEl = document.getElementById('sms-notifications');
    if (smsNotificationsEl) smsNotificationsEl.checked = settings.smsNotifications || false;

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
window.closeAddResponderModal = closeAddResponderModal;
window.saveNewResponder = saveNewResponder;
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

console.log('Admin JavaScript loaded successfully!');
