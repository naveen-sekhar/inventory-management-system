// Modern Inventory Dashboard Application
const API_URL = (() => {
    // Auto-detect API URL - works for both local development and production
    if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol || 'http:';
        const hostname = window.location.hostname || 'localhost';
        const port = window.location.port;
        
        // In production, use same host as frontend (no separate port)
        // In development (localhost), use port 5000
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return `${protocol}//${hostname}:5000/api`;
        }
        return `${protocol}//${hostname}${port ? ':' + port : ''}/api`;
    }
    return 'http://localhost:5000/api';
})();

const PUBLIC_APP_BASE_URL = (() => {
    if (typeof window === 'undefined') return '';

    const configured = typeof window.APP_PUBLIC_BASE_URL === 'string'
        ? window.APP_PUBLIC_BASE_URL.trim()
        : '';

    const origin = window.location && typeof window.location.origin === 'string'
        ? window.location.origin
        : '';

    const base = configured || origin;
    return base ? base.replace(/\/+$/, '') : '';
})();

// State
let currentUser = {
    token: localStorage.getItem('token') || null,
    role: localStorage.getItem('role') || null,
    username: localStorage.getItem('username') || null
};

let currentPage = 'overview';
let items = [];
let suppliers = [];
let sales = [];
let users = [];
let activityLogs = [];
let notificationFeed = [];
let salesSummaryChart = null;
let inventoryBreakdownChart = null;
let topProductsChart = null;
let activeStaffInterval = null; // AJAX interval for active staff updates
let inventoryCategoryPieChart = null;
let inventoryCategoryDoughnutChart = null;
let inventoryCategoryPolarChart = null;
let inventoryCategoryRadarChart = null;
let inventoryScatterChart = null;
let inventoryBubbleChart = null;
let customReportChart = null;
const salesSummaryCache = new Map();

const CUSTOM_DEFAULT_ALLOWED_TYPES = ['bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar'];

const CUSTOM_METRICS = {
    inventory: [
        {
            value: 'inventory_value',
            label: 'Inventory Value (₹)',
            requiresGroup: true,
            format: 'currency',
            allowedTypes: ['bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar']
        },
        {
            value: 'inventory_quantity',
            label: 'Quantity On Hand',
            requiresGroup: true,
            format: 'number',
            allowedTypes: ['bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar']
        },
        {
            value: 'reorder_gap',
            label: 'Reorder Gap',
            requiresGroup: true,
            format: 'number',
            allowedTypes: ['bar', 'line', 'radar']
        },
        {
            value: 'price_vs_quantity',
            label: 'Price vs Quantity (Per Item)',
            requiresGroup: false,
            format: 'scatter',
            allowedTypes: ['scatter', 'bubble']
        }
    ],
    sales: [
        {
            value: 'sales_revenue',
            label: 'Sales Revenue (₹)',
            requiresGroup: false,
            format: 'currency',
            allowedTypes: ['bar', 'line', 'pie', 'doughnut', 'polarArea']
        },
        {
            value: 'sales_units',
            label: 'Units Sold',
            requiresGroup: false,
            format: 'number',
            allowedTypes: ['bar', 'line', 'pie', 'doughnut', 'polarArea']
        }
    ]
};

const CUSTOM_GROUPS = {
    inventory: [
        { value: 'category', label: 'Category' },
        { value: 'supplier', label: 'Supplier' },
        { value: 'low_stock', label: 'Stock Status' }
    ],
    sales: []
};

const SAMPLE_SUPPLIERS = [
    {
        name: 'ABC Traders',
        contact: '+91 99888 3301',
        email: 'hello@abctraders.in',
        products: ['Groceries', 'Household Staples'],
        lastDelivery: '2025-10-18T10:15:00Z'
    },
    {
        name: 'Elite Supplies',
        contact: '+91 98765 4422',
        email: 'support@elitesupplies.co',
        products: ['Premium Grocery', 'Organic Produce'],
        lastDelivery: '2025-10-12T14:20:00Z'
    },
    {
        name: 'UrbanMart',
        contact: '+91 90345 7788',
        email: 'partners@urbanmart.in',
        products: ['Convenience Goods', 'Ready Meals'],
        lastDelivery: '2025-10-20T08:45:00Z'
    },
    {
        name: 'Bright Distributors',
        contact: '+91 91234 5566',
        email: 'sales@brightdist.com',
        products: ['Electronics', 'Appliances'],
        lastDelivery: '2025-09-28T16:10:00Z'
    },
    {
        name: 'TechWorld',
        contact: '+91 99880 1122',
        email: 'orders@techworld.co',
        products: ['Computers', 'Accessories'],
        lastDelivery: '2025-10-07T11:00:00Z'
    },
    {
        name: 'MediCare Ltd',
        contact: '+91 93450 7788',
        email: 'care@medicare.co.in',
        products: ['Pharmaceuticals', 'Wellness'],
        lastDelivery: '2025-10-22T09:05:00Z'
    },
    {
        name: 'PaperPlus',
        contact: '+91 90123 6677',
        email: 'orders@paperplus.in',
        products: ['Stationery', 'Office Supplies'],
        lastDelivery: '2025-10-15T13:30:00Z'
    },
    {
        name: 'FixIt Hardware',
        contact: '+91 94567 3344',
        email: 'service@fixithardware.com',
        products: ['Tools', 'Building Materials'],
        lastDelivery: '2025-10-11T15:45:00Z'
    },
    {
        name: 'DailyNeeds Pvt Ltd',
        contact: '+91 95555 8888',
        email: 'info@dailyneeds.co',
        products: ['FMCG', 'Personal Care'],
        lastDelivery: '2025-10-19T07:55:00Z'
    }
];

const LABEL_SIZE_PRESETS = {
    small: { label: 'Small (50mm x 30mm)', width: 50, height: 30, fontScale: 0.85, barcodeHeight: 24 },
    medium: { label: 'Medium (70mm x 40mm)', width: 70, height: 40, fontScale: 1, barcodeHeight: 32 },
    large: { label: 'Large (100mm x 60mm)', width: 100, height: 60, fontScale: 1.1, barcodeHeight: 42 }
};

const MM_TO_PX = 3.7795275591;
const MAX_LABEL_COPIES = 50;

function getDisplaySuppliers() {
    return Array.isArray(suppliers) && suppliers.length ? suppliers : SAMPLE_SUPPLIERS;
}

const NOTIFICATION_STORAGE_KEY = 'notificationSettings';
let notificationSettings = loadNotificationPreferences();
let lastNotificationSnapshot = { lowStockCount: null };

// Navigation Configuration — uses Lucide icon names
const navigationConfig = {
    admin: [
        { id: 'overview', icon: 'layout-dashboard', label: 'Dashboard', page: 'renderAdminOverview' },
        { id: 'users', icon: 'users', label: 'Manage Users', page: 'renderManageUsers' },
        { id: 'products', icon: 'package', label: 'Manage Products', page: 'renderManageProducts' },
        { id: 'suppliers', icon: 'building-2', label: 'Supplier Management', page: 'renderSupplierManagement' },
        { id: 'restock', icon: 'refresh-cw', label: 'Restock', page: 'renderRestockPage' },
        { id: 'staff-reports', icon: 'bar-chart-3', label: 'Staff Reports', page: 'renderStaffReports' },
        { id: 'audit-logs', icon: 'clipboard-list', label: 'Audit Logs', page: 'renderAuditLogs' },
        { id: 'notifications', icon: 'bell', label: 'Notifications', page: 'renderNotifications' },
        { id: 'email-recipients', icon: 'mail', label: 'Email Recipients', page: 'renderEmailRecipients' },
        { id: 'reports', icon: 'trending-up', label: 'Reports', page: 'renderReports' },
        { id: 'settings', icon: 'settings', label: 'Settings', page: 'renderSettings' }
    ],
    manager: [
        { id: 'overview', icon: 'layout-dashboard', label: 'Dashboard', page: 'renderManagerOverview' },
        { id: 'inventory', icon: 'clipboard-list', label: 'Inventory Summary', page: 'renderInventorySummary' },
        { id: 'suppliers', icon: 'building-2', label: 'Supplier Management', page: 'renderSupplierManagement' },
        { id: 'restock', icon: 'refresh-cw', label: 'Restock', page: 'renderRestockPage' },
        { id: 'staff-reports', icon: 'bar-chart-3', label: 'Staff Reports', page: 'renderStaffReports' },
        { id: 'notifications', icon: 'bell', label: 'Notifications', page: 'renderNotifications' },
        { id: 'reports', icon: 'trending-up', label: 'Reports', page: 'renderManagerReports' }
    ],
    staff: [
        { id: 'overview', icon: 'layout-dashboard', label: 'Dashboard', page: 'renderStaffOverview' },
        { id: 'stock', icon: 'plus-circle', label: 'Add/Update Stock', page: 'renderStockManagement' },
        { id: 'sales', icon: 'indian-rupee', label: 'Sales Entry', page: 'renderSalesEntry' },
        { id: 'search', icon: 'search', label: 'Product Search', page: 'renderProductSearch' }
    ]
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    if (currentUser.token) {
        showDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('dashboardPage').classList.remove('active');

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Check DB status on login page
    checkDatabaseStatus();
    // Check DB status every 5 seconds
    setInterval(checkDatabaseStatus, 5000);
}

// Check database connection status
async function checkDatabaseStatus() {
    const statusElement = document.getElementById('dbStatus');
    if (!statusElement) return;

    try {
        const response = await fetch(`${API_URL}/auth/health`);
        const data = await response.json();

        if (data.database.connected) {
            statusElement.className = 'db-status connected';
            statusElement.innerHTML = `
                <span class="status-dot"></span>
                <span class="status-text">Database Connected</span>
                <span class="status-ping">${data.database.ping}ms</span>
            `;
        } else {
            statusElement.className = 'db-status disconnected';
            statusElement.innerHTML = `
                <span class="status-dot"></span>
                <span class="status-text">Database Disconnected</span>
                <span class="status-ping">--</span>
            `;
        }
    } catch (error) {
        statusElement.className = 'db-status disconnected';
        statusElement.innerHTML = `
            <span class="status-dot"></span>
            <span class="status-text">Connection Error</span>
            <span class="status-ping">--</span>
        `;
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = {
                token: data.token,
                role: data.role,
                username
            };

            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('username', username);

            showMessage('loginMessage', 'Login successful!', 'success');
            setTimeout(() => {
                showDashboard();
            }, 500);
        } else {
            showMessage('loginMessage', data.message || 'Invalid credentials', 'error');
        }
    } catch (error) {
        showMessage('loginMessage', 'Network error. Please try again.', 'error');
    }
}

function showDashboard() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('dashboardPage').classList.add('active');

    initializeDashboard();
}

function initializeDashboard() {
    // Update user info
    document.getElementById('sidebarUserName').textContent = currentUser.username;
    document.getElementById('sidebarUserRole').textContent = capitalizeFirst(currentUser.role);

    // Build navigation
    buildNavigation();

    // Set up logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Set up sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', handleNotificationButtonClick);
    }

    updateNotificationBadge();

    // Load initial page
    navigateToPage('overview');

    // Fetch initial data
    fetchAllData();
}

function buildNavigation() {
    const nav = document.getElementById('sidebarNav');
    const items = navigationConfig[currentUser.role] || [];

    nav.innerHTML = items.map(item => `
        <div class="nav-item" data-page="${item.id}">
            <span class="nav-icon"><i data-lucide="${item.icon}"></i></span>
            <span class="nav-text">${item.label}</span>
        </div>
    `).join('');

    // Re-initialize Lucide icons for the new nav elements
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Add click handlers
    nav.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.dataset.page;
            navigateToPage(pageId);
        });
    });
}

function navigateToPage(pageId) {
    currentPage = pageId;

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });

    // Find page config
    const navItem = navigationConfig[currentUser.role].find(item => item.id === pageId);
    if (!navItem) return;

    // Update page title
    document.getElementById('pageTitle').textContent = navItem.label;

    // Render page content
    const renderFunction = window[navItem.page];
    if (typeof renderFunction === 'function') {
        renderFunction();
    }
}

// ===== ADMIN PAGES =====

function renderAdminOverview() {
    const quickActions = [
        currentUser.role === 'admin' && {
            icon: '<i data-lucide="user-plus"></i>',
            title: 'Add User',
            subtitle: 'Create a new team account',
            action: 'showAddUserModal()'
        },
        {
            icon: '<i data-lucide="package-plus"></i>',
            title: 'Add Product',
            subtitle: 'Register inventory items',
            action: 'showAddProductModal()'
        },
        {
            icon: '<i data-lucide="building-2"></i>',
            title: 'Add Supplier',
            subtitle: 'Onboard supply partners',
            action: 'showAddSupplierModal()'
        },
        {
            icon: '<i data-lucide="refresh-cw"></i>',
            title: 'Restock Planner',
            subtitle: 'Review low stock items',
            action: "navigateToPage('restock')"
        }
    ].filter(Boolean);

    const quickActionsSection = quickActions.length
        ? `<div class="quick-actions-grid">${quickActions.map(entry => `
            <button type="button" class="quick-action-card" onclick="${entry.action}">
                <span class="quick-action-icon">${entry.icon}</span>
                <div class="quick-action-content">
                    <h3>${entry.title}</h3>
                    <p>${entry.subtitle}</p>
                </div>
            </button>
        `).join('')}</div>`
        : '';

    const content = `
        ${quickActionsSection}

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Total Products</span>
                    <div class="stat-icon primary"><i data-lucide="package"></i></div>
                </div>
                <div class="stat-value" id="totalProducts">0</div>
                <div class="stat-trend">+12% from last month</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Active Suppliers</span>
                    <div class="stat-icon success"><i data-lucide="building-2"></i></div>
                </div>
                <div class="stat-value" id="totalSuppliers">0</div>
                <div class="stat-trend">+5% from last month</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Registered Users</span>
                    <div class="stat-icon warning"><i data-lucide="users"></i></div>
                </div>
                <div class="stat-value" id="totalUsers">0</div>
                <div class="stat-trend">No change</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Low Stock Alerts</span>
                    <div class="stat-icon danger"><i data-lucide="alert-triangle"></i></div>
                </div>
                <div class="stat-value" id="lowStockCount">0</div>
                <div class="stat-trend negative">Requires attention</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
            <div class="data-table-wrapper">
                <div class="table-header">
                    <h3 class="table-title">
                        Active Staff
                        <span class="live-indicator" id="activeStaffIndicator">
                            <span class="live-dot"></span>
                            <span class="live-text">Live</span>
                        </span>
                    </h3>
                    <span class="table-summary" id="activeStaffCount">0 online</span>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Staff Member</th>
                            <th>Login Time</th>
                            <th>Time Worked</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="activeStaffTable">
                        <tr><td colspan="4" style="text-align:center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="data-table-wrapper">
                <div class="table-header">
                    <h3 class="table-title">Recent Activity</h3>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Action</th>
                            <th>User</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody id="activityTable">
                        <tr><td colspan="3" style="text-align:center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    renderContent(content);
    loadRecentActivity();
    updateOverviewStats();
    loadActiveStaff();
}

function renderManageUsers() {
    const content = `
        <div class="page-actions">
            <button class="btn btn-primary" onclick="showAddUserModal()">
                Add User
            </button>
            <div class="page-actions__search">
                <input type="text" id="userSearchInput" class="input-search" placeholder="Search users...">
            </div>
        </div>
        <div id="userFeedback" class="message" style="display:none;"></div>

        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">System Users</h3>
                <span class="table-summary" id="userSummary"></span>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="usersTable">
                    <tr><td colspan="5" style="text-align:center;">Loading users...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    initializeUserManagement();
}

function renderManageProducts() {
    const content = `
        <div class="page-actions">
            <button class="btn btn-primary" onclick="showAddProductModal()">
                Add Product
            </button>
            <button class="btn btn-secondary" onclick="showImportProductsModal()" ${currentUser.role !== 'admin' ? 'disabled' : ''}>
                Import CSV
            </button>
            <button class="btn btn-secondary" onclick="handleExportProducts()">
                Export CSV
            </button>
        </div>
        <div id="productFeedback" class="message" style="display:none;"></div>
        
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">Product Inventory</h3>
                <input type="text" placeholder="Search products..." class="input-search" onkeyup="filterProducts(this.value)">
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Stock</th>
                        <th>Reorder Level</th>
                        <th>Price</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="productsTable">
                    <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    loadProducts();
    fetchAllData().then(() => {
        if (currentPage === 'products' || currentPage === 'inventory') {
            loadProducts();
        }
    });
}

function renderRestockPage() {
    const lowStockItems = items.filter(isItemLowStock);
    const totalUnitsNeeded = lowStockItems.reduce((sum, item) => {
        const gap = Math.max((item.reorderLevel ?? 0) - (item.quantity ?? 0), 0);
        return sum + gap;
    }, 0);
    const supplierCount = new Set(lowStockItems.map(item => item.supplierId?.name).filter(Boolean)).size;
    const latestRestockDate = items.reduce((latest, item) => {
        if (!item.lastRestocked) return latest;
        const current = new Date(item.lastRestocked);
        if (Number.isNaN(current.getTime())) return latest;
        if (!latest || current > latest) return current;
        return latest;
    }, null);
    const latestRestockDisplay = latestRestockDate ? formatDateTime(latestRestockDate.toISOString()) : '—';

    const content = `
        <div class="page-actions">
            <div class="restock-summary">
                <div class="restock-card">
                    <span class="restock-card__label">Low Stock Items</span>
                    <span class="restock-card__value" id="restockLowCount">${lowStockItems.length}</span>
                </div>
                <div class="restock-card">
                    <span class="restock-card__label">Units Needed</span>
                    <span class="restock-card__value" id="restockUnitsNeeded">${totalUnitsNeeded}</span>
                </div>
                <div class="restock-card">
                    <span class="restock-card__label">Suppliers Impacted</span>
                    <span class="restock-card__value" id="restockSupplierCount">${supplierCount}</span>
                </div>
                <div class="restock-card">
                    <span class="restock-card__label">Last Restock</span>
                    <span class="restock-card__value" id="restockLastRestocked">${escapeHtml(latestRestockDisplay)}</span>
                </div>
            </div>
            <div class="page-actions__search">
                <input type="text" id="restockSearch" class="input-search" placeholder="Search products...">
            </div>
        </div>
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">Restock Queue</h3>
                <span class="table-summary" id="restockSummaryLabel"></span>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Current Stock</th>
                        <th>Reorder Level</th>
                        <th>Supplier</th>
                        <th>Last Restocked</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="restockTable">
                    <tr><td colspan="6" style="text-align:center;">Loading restock data...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    initializeRestockPage();
}

function initializeUserManagement() {
    const searchInput = document.getElementById('userSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (event) => handleUserSearch(event.target.value));
    }

    if (users.length > 0) {
        loadUsers();
    }
    fetchUsers();
}

function getRoleBadge(role) {
    const roleMap = {
        admin: { label: 'Admin', className: 'role-admin' },
        manager: { label: 'Manager', className: 'role-manager' },
        staff: { label: 'Staff', className: 'role-staff' }
    };

    const entry = roleMap[role] || roleMap.staff;
    return `<span class="user-role-badge ${entry.className}">${entry.label}</span>`;
}

function getStatusBadge(isActive) {
    return `<span class="status-chip ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>`;
}

function formatDateTime(dateString) {
    if (!dateString) return '—';
    try {
        return new Date(dateString).toLocaleString();
    } catch (error) {
        return '—';
    }
}

function formatCurrency(amount) {
    const numeric = Number(amount || 0);
    return `₹${numeric.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function loadUsers(list = users) {
    const tbody = document.getElementById('usersTable');
    const summary = document.getElementById('userSummary');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No users found</td></tr>';
        if (summary) summary.textContent = '0 users';
        return;
    }

    tbody.innerHTML = list.map(user => {
        const disableToggle = user.username === currentUser.username;
        const actionLabel = user.isActive ? 'Deactivate' : 'Activate';
        const actionClass = user.isActive ? 'btn-danger' : 'btn-success';
        const created = formatDateTime(user.createdAt);

        return `
            <tr>
                <td>${user.username}</td>
                <td>${getRoleBadge(user.role)}</td>
                <td>${getStatusBadge(user.isActive)}</td>
                <td>${created}</td>
                <td class="table-actions">
                    <button class="btn btn-sm btn-secondary edit-user" data-id="${user._id}">Edit</button>
                    <button class="btn btn-sm ${actionClass} toggle-user" data-id="${user._id}" data-active="${user.isActive}" data-username="${user.username}" ${disableToggle ? 'disabled' : ''}>${actionLabel}</button>
                </td>
            </tr>
        `;
    }).join('');

    if (summary) {
        summary.textContent = `${list.length} ${list.length === 1 ? 'user' : 'users'}`;
    }

    tbody.querySelectorAll('.edit-user').forEach(button => {
        button.addEventListener('click', () => showEditUserModal(button.dataset.id));
    });

    tbody.querySelectorAll('.toggle-user').forEach(button => {
        button.addEventListener('click', () => {
            const { id, active, username } = button.dataset;
            toggleUserStatus(id, active === 'true', username);
        });
    });
}

function handleUserSearch(query) {
    const term = (query || '').trim().toLowerCase();
    if (!term) {
        loadUsers();
        return;
    }

    const filtered = users.filter(user => {
        return (
            (user.username || '').toLowerCase().includes(term) ||
            (user.role || '').toLowerCase().includes(term)
        );
    });

    loadUsers(filtered);
}

// ===== AUDIT LOGS =====

function renderAuditLogs() {
    const content = `
        <div class="audit-log-header">
            <h2>🔍 Audit Logs</h2>
            <p class="audit-log-subtitle">Monitor all system activities including logins, restocks, sales, and changes</p>
        </div>

        <div class="audit-filters">
            <div class="filter-group">
                <label>Action Type</label>
                <select id="actionFilter" class="input-field">
                    <option value="">All Actions</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                    <option value="stock_updated">Stock Update/Restock</option>
                    <option value="sale_recorded">Sale Recorded</option>
                    <option value="item_created">Product Created</option>
                    <option value="item_updated">Product Updated</option>
                    <option value="item_deleted">Product Deleted</option>
                    <option value="user_created">User Created</option>
                    <option value="user_updated">User Updated</option>
                    <option value="user_deleted">User Deleted</option>
                    <option value="supplier_created">Supplier Created</option>
                    <option value="supplier_updated">Supplier Updated</option>
                    <option value="csv_import">CSV Import</option>
                    <option value="csv_export">CSV Export</option>
                </select>
            </div>

            <div class="filter-group">
                <label>Resource Type</label>
                <select id="resourceFilter" class="input-field">
                    <option value="">All Resources</option>
                    <option value="user">User</option>
                    <option value="item">Product/Item</option>
                    <option value="sale">Sale</option>
                    <option value="supplier">Supplier</option>
                    <option value="system">System</option>
                </select>
            </div>

            <div class="filter-group">
                <label>Date Range</label>
                <select id="dateFilter" class="input-field">
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="all">All Time</option>
                </select>
            </div>

            <div class="filter-group">
                <label>Search User</label>
                <input type="text" id="userFilter" class="input-field" placeholder="Search by username...">
            </div>

            <button class="btn btn-secondary" onclick="applyAuditFilters()">Apply Filters</button>
            <button class="btn btn-outline" onclick="clearAuditFilters()">Clear</button>
            <button class="btn btn-primary" onclick="refreshAuditLogs()">🔄 Refresh</button>
        </div>

        <div class="audit-stats" id="auditStats">
            <div class="stat-card">
                <div class="stat-value" id="totalLogs">-</div>
                <div class="stat-label">Total Activities</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="todayLogs">-</div>
                <div class="stat-label">Today</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="uniqueUsers">-</div>
                <div class="stat-label">Active Users</div>
            </div>
        </div>

        <div class="audit-insights">
            <div class="insight-card">
                <h4>Top Actions</h4>
                <ul class="insight-list" id="topActionBreakdown">
                    <li class="insight-empty">No activity yet</li>
                </ul>
            </div>
            <div class="insight-card">
                <h4>Most Active Users</h4>
                <ul class="insight-list" id="activeUserBreakdown">
                    <li class="insight-empty">No user activity recorded</li>
                </ul>
            </div>
        </div>

        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">Activity Log</h3>
                <span class="table-summary" id="logSummary">Loading...</span>
            </div>
            <table class="data-table audit-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Resource</th>
                        <th>Description</th>
                        <th>IP Address</th>
                    </tr>
                </thead>
                <tbody id="auditLogsTable">
                    <tr><td colspan="6" style="text-align:center;">Loading audit logs...</td></tr>
                </tbody>
            </table>
        </div>

        <div class="pagination" id="auditPagination"></div>
    `;

    renderContent(content);
    initializeAuditLogs();
}

let currentAuditPage = 1;
let auditFilters = {
    action: '',
    resourceType: '',
    dateRange: 'month',
    username: ''
};

async function initializeAuditLogs() {
    await loadAuditLogs();
    await loadAuditStats();

    // Setup filter event listeners
    document.getElementById('actionFilter')?.addEventListener('change', (e) => {
        auditFilters.action = e.target.value;
    });

    document.getElementById('resourceFilter')?.addEventListener('change', (e) => {
        auditFilters.resourceType = e.target.value;
    });

    document.getElementById('dateFilter')?.addEventListener('change', (e) => {
        auditFilters.dateRange = e.target.value;
    });

    document.getElementById('userFilter')?.addEventListener('input', (e) => {
        auditFilters.username = e.target.value;
    });
}

async function loadAuditLogs(page = 1) {
    try {
        const params = new URLSearchParams({
            page: page,
            limit: 50,
            ...auditFilters
        });

        const response = await fetch(`/api/logs?${params}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch audit logs');

        const data = await response.json();
        currentAuditPage = data.page || page;
        displayAuditLogs(data.logs, data.total, data.page, data.totalPages);
    } catch (error) {
        console.error('Error loading audit logs:', error);
        document.getElementById('auditLogsTable').innerHTML = `
            <tr><td colspan="6" style="text-align:center;color:#ef4444;">Error loading logs: ${error.message}</td></tr>
        `;
    }
}

async function changeAuditPage(page) {
    await loadAuditLogs(page);
    loadAuditStats();
}

function displayAuditLogs(logs, total, page, totalPages) {
    const tableBody = document.getElementById('auditLogsTable');

    if (!logs || logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No audit logs found</td></tr>';
        document.getElementById('logSummary').textContent = 'No results';
        return;
    }

    const html = logs.map(log => `
        <tr class="audit-log-row">
            <td>
                <div class="log-timestamp">${formatDateTime(log.createdAt)}</div>
                <div class="log-time-ago">${formatTimeAgo(log.createdAt)}</div>
            </td>
            <td>
                <div class="log-username">${escapeHtml(log.username)}</div>
            </td>
            <td>
                <span class="action-badge action-${log.action}">${formatActionName(log.action)}</span>
            </td>
            <td>
                <span class="resource-badge resource-${log.resourceType}">${log.resourceType}</span>
            </td>
            <td>
                <div class="log-description">${escapeHtml(log.description)}</div>
                ${log.metadata ? `<div class="log-metadata">${formatMetadata(log.metadata)}</div>` : ''}
            </td>
            <td>
                <span class="log-ip">${log.ipAddress || 'N/A'}</span>
            </td>
        </tr>
    `).join('');

    tableBody.innerHTML = html;
    document.getElementById('logSummary').textContent = `Showing ${logs.length} of ${total} logs`;

    // Update pagination
    displayAuditPagination(page, totalPages);
}

function displayAuditPagination(page, totalPages) {
    const paginationContainer = document.getElementById('auditPagination');
    if (!paginationContainer || totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let html = '<div class="pagination-controls">';

    // Previous button
    html += `<button class="btn btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="changeAuditPage(${page - 1})">Previous</button>`;

    // Page numbers
    html += `<span class="pagination-info">Page ${page} of ${totalPages}</span>`;

    // Next button
    html += `<button class="btn btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="changeAuditPage(${page + 1})">Next</button>`;

    html += '</div>';
    paginationContainer.innerHTML = html;
}

function formatActionName(action) {
    const actionNames = {
        'login': 'Login',
        'logout': 'Logout',
        'user_created': 'User Created',
        'user_updated': 'User Updated',
        'user_deleted': 'User Deleted',
        'user_activated': 'User Activated',
        'user_deactivated': 'User Deactivated',
        'item_created': 'Product Created',
        'item_updated': 'Product Updated',
        'item_deleted': 'Product Deleted',
        'stock_updated': 'Stock Updated',
        'sale_recorded': 'Sale Recorded',
        'sale_deleted': 'Sale Deleted',
        'supplier_created': 'Supplier Created',
        'supplier_updated': 'Supplier Updated',
        'supplier_deleted': 'Supplier Deleted',
        'csv_import': 'CSV Import',
        'csv_export': 'CSV Export',
        'report_generated': 'Report Generated',
        'password_changed': 'Password Changed'
    };
    return actionNames[action] || action;
}

function formatMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return '';

    const keys = Object.keys(metadata);
    if (keys.length === 0) return '';

    const items = keys.slice(0, 3).map(key => {
        let value = metadata[key];
        if (typeof value === 'object') value = JSON.stringify(value);
        return `<span class="metadata-item"><strong>${key}:</strong> ${escapeHtml(String(value))}</span>`;
    });

    return items.join(' • ');
}

function formatTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDateOnly(timestamp);
}

function applyAuditFilters() {
    currentAuditPage = 1;
    loadAuditLogs(currentAuditPage);
    loadAuditStats();
}

function clearAuditFilters() {
    auditFilters = {
        action: '',
        resourceType: '',
        dateRange: 'month',
        username: ''
    };

    document.getElementById('actionFilter').value = '';
    document.getElementById('resourceFilter').value = '';
    document.getElementById('dateFilter').value = 'month';
    document.getElementById('userFilter').value = '';

    loadAuditLogs(1);
    loadAuditStats();
}

async function loadAuditStats() {
    try {
        const params = new URLSearchParams();

        if (auditFilters.action) params.set('action', auditFilters.action);
        if (auditFilters.resourceType) params.set('resourceType', auditFilters.resourceType);
        if (auditFilters.username) params.set('username', auditFilters.username.trim());
        if (auditFilters.dateRange && auditFilters.dateRange !== 'all') {
            params.set('dateRange', auditFilters.dateRange);
        }

        const queryString = params.toString();
        const response = await fetch(`/api/logs/stats${queryString ? `?${queryString}` : ''}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch stats');

        const stats = await response.json();

        document.getElementById('totalLogs').textContent = stats.total ?? 0;
        document.getElementById('todayLogs').textContent = stats.today ?? 0;
        document.getElementById('uniqueUsers').textContent = stats.uniqueUsers ?? 0;

        updateAuditInsights(stats);
    } catch (error) {
        console.error('Error loading audit stats:', error);
    }
}

function refreshAuditLogs() {
    loadAuditLogs(currentAuditPage);
    loadAuditStats();
    showToast('Audit logs refreshed', 'success');
}

function updateAuditInsights(stats) {
    const statsContainer = document.getElementById('auditStats');
    if (!statsContainer) return;

    const hasActivity = (stats.total || 0) > 0;
    statsContainer.classList.toggle('audit-stats--empty', !hasActivity);

    const topActionsList = document.getElementById('topActionBreakdown');
    if (topActionsList && Array.isArray(stats.actionStats)) {
        const topThree = stats.actionStats.slice(0, 3);
        topActionsList.innerHTML = topThree.map(action => `
            <li>
                <span class="insight-label">${action._id ? formatActionName(action._id) : 'Other'}</span>
                <span class="insight-value">${action.count}</span>
            </li>
        `).join('');
        if (!topThree.length) {
            topActionsList.innerHTML = '<li class="insight-empty">No activity yet</li>';
        }
    }

    const activeUsersList = document.getElementById('activeUserBreakdown');
    if (activeUsersList && Array.isArray(stats.topUsers)) {
        const topUsers = stats.topUsers.slice(0, 5);
        activeUsersList.innerHTML = topUsers.map(user => `
            <li>
                <span class="insight-label">${escapeHtml(user.username || 'Unknown')}</span>
                <span class="insight-value">${user.count}</span>
            </li>
        `).join('');
        if (!topUsers.length) {
            activeUsersList.innerHTML = '<li class="insight-empty">No user activity recorded</li>';
        }
    }
}

// ===== STAFF REPORTS =====

function renderStaffReports() {
    const content = `
        <div class="staff-reports-header">
            <h2>👔 Staff Performance Reports</h2>
            <p class="staff-reports-subtitle">Track staff working hours, attendance, sales performance, and productivity metrics</p>
        </div>
        <div class="report-controls">
            <div class="control-group">
                <label>Select Staff Member</label>
                <select id="staffSelect" class="input-field">
                    <option value="">All Staff</option>
                </select>
            </div>

            <div class="control-group">
                <label>Report Period</label>
                <select id="periodSelect" class="input-field">
                    <option value="today">Today</option>
                    <option value="week" selected>This Week</option>
                    <option value="month">This Month</option>
                    <option value="custom">Custom Range</option>
                </select>
            </div>

            <div class="control-group custom-date-range" id="customDateRange" style="display:none;">
                <label>From Date</label>
                <input type="date" id="startDate" class="input-field">
            </div>

            <div class="control-group custom-date-range" id="customDateRange2" style="display:none;">
                <label>To Date</label>
                <input type="date" id="endDate" class="input-field">
            </div>

            <div class="control-group">
                <button class="btn btn-primary" onclick="loadStaffReportData()">Generate Report</button>
                <button class="btn btn-secondary" onclick="exportStaffReport()">📥 Export CSV</button>
            </div>
        </div>

        <div class="staff-summary-cards" id="staffSummaryCards">
            <div class="summary-card">
                <div class="summary-icon">⏰</div>
                <div class="summary-content">
                    <div class="summary-value" id="totalHours">-</div>
                    <div class="summary-label">Total Hours Worked</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">💰</div>
                <div class="summary-content">
                    <div class="summary-value" id="totalSales">-</div>
                    <div class="summary-label">Sales Completed</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">📊</div>
                <div class="summary-content">
                    <div class="summary-value" id="avgPerformance">-</div>
                    <div class="summary-label">Avg Performance</div>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon">📅</div>
                <div class="summary-content">
                    <div class="summary-value" id="attendanceRate">-</div>
                    <div class="summary-label">Attendance Rate</div>
                </div>
            </div>
        </div>

        <div class="report-tabs">
            <button class="tab-btn active" onclick="switchReportTab('overview')">Overview</button>
            <button class="tab-btn" onclick="switchReportTab('attendance')">Attendance & Hours</button>
            <button class="tab-btn" onclick="switchReportTab('sales')">Sales Performance</button>
            <button class="tab-btn" onclick="switchReportTab('activity')">Activity Log</button>
        </div>

        <div class="report-content">
            <!-- Overview Tab -->
            <div class="report-tab active" id="overviewTab">
                <div class="chart-grid">
                    <div class="chart-container">
                        <h3>Working Hours Distribution</h3>
                        <canvas id="hoursChart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Sales Performance Trend</h3>
                        <canvas id="salesChart"></canvas>
                    </div>
                </div>
                <div class="chart-container full-width">
                    <h3>Staff Comparison</h3>
                    <canvas id="comparisonChart"></canvas>
                </div>
            </div>

            <!-- Attendance Tab -->
            <div class="report-tab" id="attendanceTab">
                <div class="chart-grid">
                    <div class="chart-container">
                        <h3>Login/Logout Timeline</h3>
                        <canvas id="attendanceChart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Daily Hours Breakdown</h3>
                        <canvas id="dailyHoursChart"></canvas>
                    </div>
                </div>
                <div class="data-table-wrapper">
                    <div class="table-header">
                        <h3 class="table-title">Attendance Details</h3>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Login Time</th>
                                <th>Logout Time</th>
                                <th>Hours Worked</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="attendanceTable">
                            <tr><td colspan="5" style="text-align:center;">Select a staff member and date range</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Sales Tab -->
            <div class="report-tab" id="salesTab">
                <div class="chart-container full-width">
                    <h3>Sales by Day</h3>
                    <canvas id="salesByDayChart"></canvas>
                </div>
                <div class="data-table-wrapper">
                    <div class="table-header">
                        <h3 class="table-title">Sales Details</h3>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Transaction Count</th>
                                <th>Total Revenue</th>
                                <th>Avg Transaction</th>
                            </tr>
                        </thead>
                        <tbody id="salesTable">
                            <tr><td colspan="4" style="text-align:center;">No sales data available</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Activity Tab -->
            <div class="report-tab" id="activityTab">
                <div class="data-table-wrapper">
                    <div class="table-header">
                        <h3 class="table-title">Staff Activity Log</h3>
                    </div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Action</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody id="activityTable">
                            <tr><td colspan="3" style="text-align:center;">Loading activity...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    renderContent(content);
    initializeStaffReports();
}

let staffReportData = null;
let staffCharts = {};
let currentReportTab = 'overview';

async function initializeStaffReports() {
    // Load staff members for dropdown
    await loadStaffMembers();

    // Setup event listeners
    document.getElementById('periodSelect')?.addEventListener('change', (e) => {
        const customRanges = document.querySelectorAll('.custom-date-range');
        if (e.target.value === 'custom') {
            customRanges.forEach(el => el.style.display = 'block');
        } else {
            customRanges.forEach(el => el.style.display = 'none');
        }
    });

    // Set default dates
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    if (document.getElementById('startDate')) {
        document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    }
    if (document.getElementById('endDate')) {
        document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    }

    // Load initial data for current week
    await loadStaffReportData();
}

async function loadStaffMembers() {
    try {
        const response = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch users');

        const users = await response.json();
        const staffSelect = document.getElementById('staffSelect');

        if (staffSelect) {
            const staffUsers = users.filter(u => ['staff', 'manager'].includes(u.role));
            staffSelect.innerHTML = '<option value="">All Staff</option>' +
                staffUsers.map(u => `<option value="${u._id}">${u.username} (${u.role})</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading staff members:', error);
    }
}

async function loadStaffReportData() {
    const staffId = document.getElementById('staffSelect')?.value || '';
    const period = document.getElementById('periodSelect')?.value || 'week';

    let startDate, endDate;

    if (period === 'custom') {
        startDate = document.getElementById('startDate')?.value;
        endDate = document.getElementById('endDate')?.value;
    } else {
        endDate = new Date().toISOString().split('T')[0];
        const start = new Date();

        switch (period) {
            case 'today':
                startDate = endDate;
                break;
            case 'week':
                start.setDate(start.getDate() - 7);
                startDate = start.toISOString().split('T')[0];
                break;
            case 'month':
                start.setDate(start.getDate() - 30);
                startDate = start.toISOString().split('T')[0];
                break;
        }
    }

    try {
        // Fetch activity logs for attendance tracking
        const params = new URLSearchParams({
            startDate,
            endDate,
            userId: staffId,
            action: 'login,logout'
        });

        const logsResponse = await fetch(`/api/logs?${params}&limit=1000`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!logsResponse.ok) throw new Error('Failed to fetch logs');
        const logsData = await logsResponse.json();

        // Fetch sales data
        const salesParams = new URLSearchParams({ startDate, endDate });
        const salesResponse = await fetch(`/api/sales?${salesParams}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        const salesData = salesResponse.ok ? await salesResponse.json() : [];

        // Process and display data
        staffReportData = processStaffData(logsData.logs, salesData, staffId, startDate, endDate);
        displayStaffSummary(staffReportData);
        renderStaffCharts(staffReportData);

        // Update tab contents
        updateAttendanceTable(staffReportData);
        updateSalesTable(staffReportData);
        updateActivityTable(logsData.logs);

    } catch (error) {
        console.error('Error loading staff report data:', error);
        showToast('Failed to load staff report data', 'error');
    }
}

function processStaffData(logs, sales, staffId, startDate, endDate) {
    // Group logs by user and date
    const loginLogouts = {};
    const dailyHours = {};
    const userDetails = {}; // Store user info

    logs.forEach(log => {
        const date = new Date(log.createdAt).toISOString().split('T')[0];
        const userId = log.userId || 'unknown';

        // Store user details
        if (!userDetails[userId]) {
            userDetails[userId] = {
                username: log.username || 'Unknown User',
                totalHours: 0,
                daysWorked: new Set(),
                totalLogins: 0
            };
        }

        if (!loginLogouts[userId]) {
            loginLogouts[userId] = {};
        }
        if (!loginLogouts[userId][date]) {
            loginLogouts[userId][date] = {
                logins: [],
                logouts: [],
                sessions: [] // Track individual work sessions
            };
        }

        if (log.action === 'login') {
            loginLogouts[userId][date].logins.push({
                time: new Date(log.createdAt),
                timestamp: log.createdAt
            });
            userDetails[userId].totalLogins++;
        } else if (log.action === 'logout') {
            loginLogouts[userId][date].logouts.push({
                time: new Date(log.createdAt),
                timestamp: log.createdAt
            });
        }
    });

    // Calculate hours worked per day with detailed session tracking
    let totalHours = 0;
    const hoursPerDay = [];
    const detailedSessions = [];

    Object.keys(loginLogouts).forEach(userId => {
        Object.keys(loginLogouts[userId]).forEach(date => {
            const { logins, logouts } = loginLogouts[userId][date];
            let dayHours = 0;
            const sessions = [];

            // Sort by time
            logins.sort((a, b) => a.time - b.time);
            logouts.sort((a, b) => a.time - b.time);

            // Match login/logout pairs
            for (let i = 0; i < logins.length; i++) {
                const login = logins[i];
                const logout = logouts[i] || null;

                if (logout) {
                    // Calculate session duration
                    const sessionHours = (logout.time - login.time) / (1000 * 60 * 60);
                    const sessionMinutes = Math.round(((logout.time - login.time) / (1000 * 60)) % 60);

                    // Validate session (ignore sessions longer than 24 hours or negative)
                    if (sessionHours > 0 && sessionHours <= 24) {
                        dayHours += sessionHours;

                        sessions.push({
                            loginTime: login.time,
                            logoutTime: logout.time,
                            duration: sessionHours,
                            durationFormatted: `${Math.floor(sessionHours)}h ${sessionMinutes}m`
                        });

                        detailedSessions.push({
                            userId,
                            username: userDetails[userId]?.username,
                            date,
                            loginTime: login.time.toLocaleTimeString(),
                            logoutTime: logout.time.toLocaleTimeString(),
                            hours: sessionHours.toFixed(2),
                            formatted: `${Math.floor(sessionHours)}h ${sessionMinutes}m`
                        });
                    }
                } else if (i === logins.length - 1) {
                    // Handle case where user is still logged in (no logout yet)
                    // Use current time or end of day as logout
                    const now = new Date();
                    const endOfDay = new Date(date + 'T23:59:59');
                    const estimatedLogout = now < endOfDay ? now : endOfDay;

                    const sessionHours = (estimatedLogout - login.time) / (1000 * 60 * 60);

                    if (sessionHours > 0 && sessionHours <= 24) {
                        dayHours += sessionHours;
                        sessions.push({
                            loginTime: login.time,
                            logoutTime: estimatedLogout,
                            duration: sessionHours,
                            durationFormatted: `${Math.floor(sessionHours)}h (ongoing)`,
                            ongoing: true
                        });
                    }
                }
            }

            // Store session details
            loginLogouts[userId][date].sessions = sessions;

            if (dayHours > 0) {
                totalHours += dayHours;
                hoursPerDay.push({
                    date,
                    hours: dayHours,
                    userId,
                    username: userDetails[userId]?.username,
                    sessions: sessions.length
                });
                userDetails[userId].daysWorked.add(date);
                userDetails[userId].totalHours += dayHours;
            }
        });
    });

    // Calculate average hours per day
    const daysWithData = new Set(hoursPerDay.map(h => h.date)).size;
    const avgHoursPerDay = daysWithData > 0 ? (totalHours / daysWithData).toFixed(1) : 0;

    // Calculate sales metrics
    const totalSalesCount = sales.length || 0;
    const totalRevenue = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    // Calculate sales by user
    const salesByUser = {};
    sales.forEach(sale => {
        const userId = sale.userId || 'unknown';
        if (!salesByUser[userId]) {
            salesByUser[userId] = { count: 0, revenue: 0 };
        }
        salesByUser[userId].count++;
        salesByUser[userId].revenue += (sale.totalAmount || 0);
    });

    // Calculate productivity metrics
    const totalDaysWorked = Object.values(userDetails).reduce((sum, u) => sum + u.daysWorked.size, 0);
    const avgSessionsPerDay = totalDaysWorked > 0 ? (detailedSessions.length / totalDaysWorked).toFixed(1) : 0;

    return {
        totalHours: totalHours.toFixed(1),
        avgHoursPerDay,
        totalSales: totalSalesCount,
        totalRevenue,
        avgPerformance: totalSalesCount > 0 ? (totalRevenue / totalSalesCount).toFixed(2) : 0,
        attendanceRate: calculateAttendanceRate(loginLogouts, startDate, endDate),
        hoursPerDay,
        loginLogouts,
        sales,
        userDetails,
        detailedSessions,
        salesByUser,
        avgSessionsPerDay,
        daysWithData
    };
}
function calculateAttendanceRate(loginLogouts, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const uniqueDays = new Set();
    Object.keys(loginLogouts).forEach(userId => {
        Object.keys(loginLogouts[userId]).forEach(date => {
            uniqueDays.add(date);
        });
    });

    return totalDays > 0 ? ((uniqueDays.size / totalDays) * 100).toFixed(0) : 0;
}

function displayStaffSummary(data) {
    document.getElementById('totalHours').textContent = `${data.totalHours}h`;
    document.getElementById('totalSales').textContent = data.totalSales;
    document.getElementById('avgPerformance').textContent = formatCurrency(data.avgPerformance);
    document.getElementById('attendanceRate').textContent = `${data.attendanceRate}%`;
}

function renderStaffCharts(data) {
    // Destroy existing charts
    Object.values(staffCharts).forEach(chart => chart?.destroy());
    staffCharts = {};

    // Hours Chart (Pie/Doughnut)
    const hoursCtx = document.getElementById('hoursChart');
    if (hoursCtx) {
        const hoursData = data.hoursPerDay.reduce((acc, item) => {
            const day = new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' });
            acc[day] = (acc[day] || 0) + item.hours;
            return acc;
        }, {});

        staffCharts.hours = new Chart(hoursCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(hoursData),
                datasets: [{
                    data: Object.values(hoursData),
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                        '#9966FF', '#FF9F40', '#FF6384'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // Sales Chart (Line)
    const salesCtx = document.getElementById('salesChart');
    if (salesCtx && data.sales) {
        const salesByDate = data.sales.reduce((acc, sale) => {
            const date = new Date(sale.createdAt).toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + (sale.totalAmount || 0);
            return acc;
        }, {});

        const sortedDates = Object.keys(salesByDate).sort();

        staffCharts.sales = new Chart(salesCtx, {
            type: 'line',
            data: {
                labels: sortedDates.map(d => new Date(d).toLocaleDateString()),
                datasets: [{
                    label: 'Revenue',
                    data: sortedDates.map(d => salesByDate[d]),
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    // Comparison Chart (Bar)
    const comparisonCtx = document.getElementById('comparisonChart');
    if (comparisonCtx) {
        const userStats = {};

        // Aggregate by user
        data.hoursPerDay.forEach(item => {
            if (!userStats[item.userId]) {
                userStats[item.userId] = { hours: 0, sales: 0 };
            }
            userStats[item.userId].hours += item.hours;
        });

        data.sales.forEach(sale => {
            const userId = sale.userId;
            if (userId && userStats[userId]) {
                userStats[userId].sales++;
            }
        });

        staffCharts.comparison = new Chart(comparisonCtx, {
            type: 'bar',
            data: {
                labels: Object.keys(userStats).map(id => `Staff ${id.slice(-4)}`),
                datasets: [
                    {
                        label: 'Hours Worked',
                        data: Object.values(userStats).map(s => s.hours.toFixed(1)),
                        backgroundColor: '#4BC0C0'
                    },
                    {
                        label: 'Sales Count',
                        data: Object.values(userStats).map(s => s.sales),
                        backgroundColor: '#FF6384'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    // Attendance Chart
    renderAttendanceChart(data);
    renderDailyHoursChart(data);
    renderSalesByDayChart(data);
}

function renderAttendanceChart(data) {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;

    const dates = [...new Set(data.hoursPerDay.map(d => d.date))].sort();
    const loginTimes = [];
    const logoutTimes = [];

    dates.forEach(date => {
        const dayData = Object.values(data.loginLogouts).flatMap(user => {
            const userData = user[date];
            if (!userData) return [];
            return {
                login: userData.logins[0],
                logout: userData.logouts[0]
            };
        }).filter(d => d.login);

        if (dayData.length > 0) {
            const avgLogin = dayData.reduce((sum, d) => sum + d.login.getHours() + d.login.getMinutes() / 60, 0) / dayData.length;
            const avgLogout = dayData.reduce((sum, d) => sum + (d.logout?.getHours() || 17) + (d.logout?.getMinutes() || 0) / 60, 0) / dayData.length;
            loginTimes.push(avgLogin);
            logoutTimes.push(avgLogout);
        }
    });

    staffCharts.attendance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => new Date(d).toLocaleDateString()),
            datasets: [
                {
                    label: 'Avg Login Time',
                    data: loginTimes,
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Avg Logout Time',
                    data: logoutTimes,
                    borderColor: '#FF6384',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 0,
                    max: 24,
                    ticks: {
                        callback: (value) => `${Math.floor(value)}:${((value % 1) * 60).toFixed(0).padStart(2, '0')}`
                    }
                }
            }
        }
    });
}

function renderDailyHoursChart(data) {
    const ctx = document.getElementById('dailyHoursChart');
    if (!ctx) return;

    const hoursByDate = {};
    data.hoursPerDay.forEach(item => {
        hoursByDate[item.date] = (hoursByDate[item.date] || 0) + item.hours;
    });

    const sortedDates = Object.keys(hoursByDate).sort();

    staffCharts.dailyHours = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates.map(d => new Date(d).toLocaleDateString()),
            datasets: [{
                label: 'Hours',
                data: sortedDates.map(d => hoursByDate[d].toFixed(1)),
                backgroundColor: '#9966FF'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderSalesByDayChart(data) {
    const ctx = document.getElementById('salesByDayChart');
    if (!ctx || !data.sales) return;

    const salesByDate = {};
    data.sales.forEach(sale => {
        const date = new Date(sale.createdAt).toISOString().split('T')[0];
        if (!salesByDate[date]) {
            salesByDate[date] = { count: 0, revenue: 0 };
        }
        salesByDate[date].count++;
        salesByDate[date].revenue += (sale.totalAmount || 0);
    });

    const sortedDates = Object.keys(salesByDate).sort();

    staffCharts.salesByDay = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates.map(d => new Date(d).toLocaleDateString()),
            datasets: [
                {
                    label: 'Transaction Count',
                    data: sortedDates.map(d => salesByDate[d].count),
                    backgroundColor: '#FF9F40',
                    yAxisID: 'y'
                },
                {
                    label: 'Revenue',
                    data: sortedDates.map(d => salesByDate[d].revenue),
                    backgroundColor: '#4BC0C0',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function updateAttendanceTable(data) {
    const tbody = document.getElementById('attendanceTable');
    if (!tbody) return;

    const rows = [];

    // Use detailed sessions data if available
    if (data.detailedSessions && data.detailedSessions.length > 0) {
        data.detailedSessions.forEach(session => {
            const hours = parseFloat(session.hours);
            const status = hours >= 8 ? 'Full Day' : hours >= 4 ? 'Half Day' : 'Partial';
            const statusClass = hours >= 8 ? 'status-success' : hours >= 4 ? 'status-warning' : 'status-danger';

            rows.push({
                date: session.date,
                username: session.username,
                loginTime: session.loginTime,
                logoutTime: session.logoutTime,
                hours: session.hours,
                formatted: session.formatted,
                status,
                statusClass
            });
        });
    } else {
        // Fallback to old method
        Object.keys(data.loginLogouts).forEach(userId => {
            const username = data.userDetails?.[userId]?.username || 'Unknown';

            Object.keys(data.loginLogouts[userId]).forEach(date => {
                const dayData = data.loginLogouts[userId][date];
                const sessions = dayData.sessions || [];

                if (sessions.length > 0) {
                    // Show all sessions for this day
                    sessions.forEach((session, idx) => {
                        const hours = session.duration;
                        const status = hours >= 8 ? 'Full Day' : hours >= 4 ? 'Half Day' : session.ongoing ? 'Active' : 'Partial';
                        const statusClass = hours >= 8 ? 'status-success' : hours >= 4 ? 'status-warning' : session.ongoing ? 'status-info' : 'status-danger';

                        rows.push({
                            date,
                            username,
                            loginTime: session.loginTime.toLocaleTimeString(),
                            logoutTime: session.logoutTime.toLocaleTimeString(),
                            hours: hours.toFixed(1),
                            formatted: session.durationFormatted,
                            status,
                            statusClass,
                            sessionNumber: sessions.length > 1 ? `(Session ${idx + 1})` : ''
                        });
                    });
                }
            });
        });
    }

    rows.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No attendance data available</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>
                <div>${new Date(row.date).toLocaleDateString()}</div>
                ${row.username ? `<small style="color:#6b7280;">${row.username} ${row.sessionNumber || ''}</small>` : ''}
            </td>
            <td><strong>${row.loginTime}</strong></td>
            <td><strong>${row.logoutTime}</strong></td>
            <td>
                <div style="font-weight:600;">${row.hours}h</div>
                ${row.formatted ? `<small style="color:#6b7280;">${row.formatted}</small>` : ''}
            </td>
            <td><span class="status-badge ${row.statusClass}">${row.status}</span></td>
        </tr>
    `).join('');
}
function updateSalesTable(data) {
    const tbody = document.getElementById('salesTable');
    if (!tbody || !data.sales) return;

    const salesByDate = {};
    data.sales.forEach(sale => {
        const date = new Date(sale.createdAt).toISOString().split('T')[0];
        if (!salesByDate[date]) {
            salesByDate[date] = { count: 0, revenue: 0 };
        }
        salesByDate[date].count++;
        salesByDate[date].revenue += (sale.totalAmount || 0);
    });

    const sortedDates = Object.keys(salesByDate).sort().reverse();

    if (sortedDates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No sales data available</td></tr>';
        return;
    }

    tbody.innerHTML = sortedDates.map(date => {
        const { count, revenue } = salesByDate[date];
        const avg = (revenue / count).toFixed(2);
        return `
            <tr>
                <td>${new Date(date).toLocaleDateString()}</td>
                <td>${count}</td>
                <td><strong>${formatCurrency(revenue)}</strong></td>
                <td>${formatCurrency(avg)}</td>
            </tr>
        `;
    }).join('');
}

function updateActivityTable(logs) {
    const tbody = document.getElementById('activityTable');
    if (!tbody) return;

    const recentLogs = logs.slice(0, 50);

    if (recentLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No activity data available</td></tr>';
        return;
    }

    tbody.innerHTML = recentLogs.map(log => `
        <tr>
            <td>${formatDateTime(log.createdAt)}</td>
            <td><span class="action-badge action-${log.action}">${formatActionName(log.action)}</span></td>
            <td>${escapeHtml(log.description)}</td>
        </tr>
    `).join('');
}

function switchReportTab(tabName) {
    // Remove active class from all tabs and buttons
    document.querySelectorAll('.report-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Add active class to selected tab and button
    const selectedTab = document.getElementById(`${tabName}Tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    const buttons = document.querySelectorAll('.tab-btn');
    const tabIndex = ['overview', 'attendance', 'sales', 'activity'].indexOf(tabName);
    if (buttons[tabIndex]) {
        buttons[tabIndex].classList.add('active');
    }

    currentReportTab = tabName;
}

function exportStaffReport() {
    if (!staffReportData) {
        showToast('No data to export', 'warning');
        return;
    }

    const staffId = document.getElementById('staffSelect')?.value || 'all';
    const period = document.getElementById('periodSelect')?.value || 'week';

    let csv = 'Staff Performance Report\n\n';
    csv += `Period: ${period}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;

    csv += 'Summary\n';
    csv += `Total Hours,${staffReportData.totalHours}\n`;
    csv += `Total Sales,${staffReportData.totalSales}\n`;
    csv += `Total Revenue,${staffReportData.totalRevenue}\n`;
    csv += `Attendance Rate,${staffReportData.attendanceRate}%\n\n`;

    csv += 'Daily Hours\n';
    csv += 'Date,Hours Worked\n';
    staffReportData.hoursPerDay.forEach(item => {
        csv += `${item.date},${item.hours.toFixed(1)}\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast('Report exported successfully', 'success');
}

async function fetchUsers() {
    if (currentUser.role !== 'admin') return;

    const tbody = document.getElementById('usersTable');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading users...</td></tr>';
    }

    try {
        const response = await fetch(`${API_URL}/users`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json().catch(() => []);

        if (!response.ok) {
            throw new Error(data.message || 'Unable to load users');
        }

        users = Array.isArray(data)
            ? data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            : [];

        loadUsers();
        updateOverviewStats();
    } catch (error) {
        console.error(error);
        showMessage('userFeedback', error.message, 'error');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--danger);">${error.message}</td></tr>`;
        }
    }
}

function showAddUserModal() {
    showUserModal({ mode: 'create' });
}

function showEditUserModal(userId) {
    const user = users.find(u => u._id === userId);
    if (!user) {
        showToast('User not found', 'error');
        return;
    }
    showUserModal({ mode: 'edit', user });
}

function showUserModal({ mode, user = {} }) {
    const isEdit = mode === 'edit';

    const modal = openModal(
        `${isEdit ? 'Edit' : 'Add'} User`,
        `
        <form id="userForm" class="modal-form">
            <div class="modal-grid">
                <div class="form-group">
                    <label for="userUsername">Username</label>
                    <input type="text" id="userUsername" name="username" placeholder="e.g. john.doe" required value="${user.username || ''}">
                </div>
                <div class="form-group">
                    <label for="userRole">Role</label>
                    <select id="userRole" name="role" required>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                        <option value="staff" ${user.role === 'staff' || !user.role ? 'selected' : ''}>Staff</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="userPassword">${isEdit ? 'New Password (optional)' : 'Password'}</label>
                    <input type="password" id="userPassword" name="password" ${isEdit ? '' : 'required'} minlength="6" placeholder="${isEdit ? 'Leave blank to keep current password' : 'Enter password'}">
                </div>
                <div class="form-group">
                    <label for="userConfirmPassword">${isEdit ? 'Confirm New Password' : 'Confirm Password'}</label>
                    <input type="password" id="userConfirmPassword" name="confirmPassword" ${isEdit ? '' : 'required'} minlength="6" placeholder="Re-enter password">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create User'}</button>
            </div>
            <div id="userModalMessage" class="message" style="display:none; margin-top:16px;"></div>
        </form>
        `
    );

    const form = modal.querySelector('#userForm');
    form.addEventListener('submit', (event) => handleUserFormSubmit(event, { mode, userId: user._id }));
}

async function handleUserFormSubmit(event, { mode, userId }) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const username = formData.get('username').trim();
    const role = formData.get('role');
    const password = (formData.get('password') || '').trim();
    const confirmPassword = (formData.get('confirmPassword') || '').trim();

    if (!username || !role) {
        showInlineModalMessage('userModalMessage', 'Username and role are required.', 'error');
        return;
    }

    if (mode === 'create') {
        if (!password || !confirmPassword) {
            showInlineModalMessage('userModalMessage', 'Password and confirmation are required.', 'error');
            return;
        }

        if (password.length < 6) {
            showInlineModalMessage('userModalMessage', 'Password must be at least 6 characters long.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showInlineModalMessage('userModalMessage', 'Passwords do not match.', 'error');
            return;
        }
    } else if (password || confirmPassword) {
        if (password.length < 6) {
            showInlineModalMessage('userModalMessage', 'New password must be at least 6 characters long.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showInlineModalMessage('userModalMessage', 'New password and confirmation do not match.', 'error');
            return;
        }
    }

    const payload = { username, role };
    if (mode === 'create') {
        payload.password = password;
    } else if (password) {
        payload.password = password;
    }

    try {
        const endpoint = mode === 'create'
            ? `${API_URL}/auth/register`
            : `${API_URL}/users/${userId}`;

        const method = mode === 'create' ? 'POST' : 'PUT';

        const response = await fetch(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Unable to save user');
        }

        showToast(data.message || `User ${mode === 'create' ? 'created' : 'updated'} successfully`, 'success');
        closeModal();
        await fetchUsers();
    } catch (error) {
        console.error(error);
        showInlineModalMessage('userModalMessage', error.message, 'error');
    }
}

async function toggleUserStatus(userId, isActive, username) {
    if (!userId) return;

    if (isActive) {
        const confirmed = window.confirm(`Deactivate ${username}? They will be unable to log in until reactivated.`);
        if (!confirmed) return;
    }

    try {
        const response = await fetch(`${API_URL}/users/${userId}/toggle-active`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Failed to update user status');
        }

        showToast(data.message || 'User status updated', 'success');
        await fetchUsers();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

// ===== PRODUCT MANAGEMENT HELPERS =====

let modalOverlay = null;
let toastTimer = null;

function showAddProductModal() {
    if (!['admin', 'manager'].includes(currentUser.role)) {
        showToast('You do not have permission to add products', 'error');
        return;
    }
    showProductModal({ mode: 'create' });
}

function showEditProductModal(productId) {
    if (!['admin', 'manager'].includes(currentUser.role)) {
        showToast('You do not have permission to edit products', 'error');
        return;
    }
    const product = items.find(item => item._id === productId);
    if (!product) {
        showToast('Product not found', 'error');
        return;
    }
    // Redirect to dedicated edit page
    window.location.href = `edit-product.html?id=${productId}`;
}

function showProductModal({ mode, product = {} }) {
    const isEdit = mode === 'edit';
    const supplierOptions = [`<option value="">-- No Supplier --</option>`]
        .concat((suppliers || []).map(s => `<option value="${s._id}" ${product.supplierId && (product.supplierId._id || product.supplierId) === s._id ? 'selected' : ''}>${s.name}</option>`))
        .join('');

    const modal = openModal(
        `${isEdit ? 'Edit' : 'Add'} Product`,
        `
        <form id="productForm" class="modal-form">
            <div class="modal-grid">
                <div class="form-group">
                    <label for="productName">Product Name</label>
                    <input type="text" id="productName" name="name" placeholder="e.g. Premium Coffee Beans" required value="${product.name || ''}">
                </div>
                <div class="form-group">
                    <label for="productCategory">Category</label>
                    <input type="text" id="productCategory" name="category" placeholder="e.g. Beverages" required value="${product.category || ''}">
                </div>
                <div class="form-group">
                    <label for="productQuantity">Quantity In Stock</label>
                    <input type="number" id="productQuantity" name="quantity" min="0" required value="${product.quantity ?? 0}">
                </div>
                <div class="form-group">
                    <label for="productReorder">Reorder Level</label>
                    <input type="number" id="productReorder" name="reorderLevel" min="0" required value="${product.reorderLevel ?? 0}">
                </div>
                <div class="form-group">
                    <label for="productPrice">Unit Price (₹)</label>
                    <input type="number" id="productPrice" name="price" min="0" step="0.01" required value="${product.price ?? 0}">
                </div>
                <div class="form-group">
                    <label for="productSupplier">Supplier</label>
                    <select id="productSupplier" name="supplierId">${supplierOptions}</select>
                </div>
                <div class="form-group">
                    <label for="productSku">SKU</label>
                    <input type="text" id="productSku" name="sku" placeholder="Optional unique SKU" value="${product.sku || ''}">
                </div>
                <div class="form-group">
                    <label for="productExpiry">Expiry Date</label>
                    <input type="date" id="productExpiry" name="expiryDate" value="${product.expiryDate ? product.expiryDate.substring(0, 10) : ''}">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Product'}</button>
            </div>
            <div id="productModalMessage" class="message" style="display:none; margin-top:16px;"></div>
        </form>
        `
    );

    const form = modal.querySelector('#productForm');
    form.addEventListener('submit', (event) => handleProductFormSubmit(event, { mode, productId: product._id }));
}

async function handleProductFormSubmit(event, { mode, productId }) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const supplierValue = formData.get('supplierId');
    const rawSkuValue = formData.get('sku');
    const skuValue = rawSkuValue ? rawSkuValue.trim() : '';
    const expiryValue = formData.get('expiryDate') || '';
    const payload = {
        name: formData.get('name').trim(),
        category: formData.get('category').trim(),
        quantity: Number(formData.get('quantity')),
        reorderLevel: Number(formData.get('reorderLevel')),
        price: Number(formData.get('price'))
    };

    if (mode === 'create') {
        if (supplierValue) payload.supplierId = supplierValue;
        if (skuValue) payload.sku = skuValue;
        if (expiryValue) payload.expiryDate = expiryValue;
    } else {
        payload.supplierId = supplierValue === null ? '' : supplierValue;
        payload.sku = skuValue;
        payload.expiryDate = expiryValue;
    }

    if (!payload.name || !payload.category) {
        showInlineModalMessage('productModalMessage', 'Please fill in all required fields', 'error');
        return;
    }

    const numericFields = [payload.quantity, payload.reorderLevel, payload.price];
    if (numericFields.some(value => Number.isNaN(value))) {
        showInlineModalMessage('productModalMessage', 'Please enter valid numbers for quantity, reorder level, and price', 'error');
        return;
    }

    if (payload.quantity < 0 || payload.reorderLevel < 0 || payload.price < 0) {
        showInlineModalMessage('productModalMessage', 'Numeric values must be zero or greater', 'error');
        return;
    }

    try {
        const url = mode === 'edit' ? `${API_URL}/items/${productId}` : `${API_URL}/items`;
        const method = mode === 'edit' ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Unable to save product');
        }

        showToast(`Product ${mode === 'edit' ? 'updated' : 'created'} successfully`, 'success');
        closeModal();
        await fetchAllData();
        loadProducts();
    } catch (error) {
        console.error(error);
        showInlineModalMessage('productModalMessage', error.message, 'error');
    }
}

function showInlineModalMessage(elementId, message, type = 'error') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `message ${type}`;
    el.style.display = 'block';
}

async function deleteProduct(productId) {
    if (currentUser.role !== 'admin') {
        showToast('Only administrators can delete products', 'error');
        return;
    }
    if (!productId) return;
    const confirmDelete = window.confirm('Are you sure you want to delete this product? This action cannot be undone.');
    if (!confirmDelete) return;

    try {
        const response = await fetch(`${API_URL}/items/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Failed to delete product');
        }

        showToast('Product deleted successfully', 'success');
        await fetchAllData();
        loadProducts();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

function filterProducts(query) {
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed) {
        loadProducts();
        return;
    }

    const filtered = items.filter(item => {
        const name = (item.name || '').toLowerCase();
        const category = (item.category || '').toLowerCase();
        const supplierName = item.supplierId && item.supplierId.name ? item.supplierId.name.toLowerCase() : '';
        const sku = (item.sku || '').toLowerCase();
        return name.includes(trimmed) || category.includes(trimmed) || supplierName.includes(trimmed) || sku.includes(trimmed);
    });

    loadProducts(filtered);
}

function initializeRestockPage() {
    const searchInput = document.getElementById('restockSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            populateRestockTable(event.target.value);
        });
    }

    const initialQuery = searchInput ? searchInput.value : '';
    populateRestockTable(initialQuery);
}

function populateRestockTable(query = '') {
    const tbody = document.getElementById('restockTable');
    const summaryLabel = document.getElementById('restockSummaryLabel');
    if (!tbody) return;

    const trimmed = (query || '').trim().toLowerCase();
    let dataset = items.filter(isItemLowStock);

    if (trimmed) {
        dataset = dataset.filter(item => {
            const name = (item.name || '').toLowerCase();
            const category = (item.category || '').toLowerCase();
            const sku = (item.sku || '').toLowerCase();
            const supplierName = (item.supplierId?.name || '').toLowerCase();
            return name.includes(trimmed) || category.includes(trimmed) || sku.includes(trimmed) || supplierName.includes(trimmed);
        });
    }

    if (!dataset.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No items match your filters</td></tr>';
        if (summaryLabel) {
            summaryLabel.textContent = trimmed ? 'No matches found' : 'All caught up';
        }
        updateRestockSummary();
        return;
    }

    if (summaryLabel) {
        summaryLabel.textContent = trimmed
            ? `${dataset.length} match${dataset.length === 1 ? '' : 'es'} found`
            : `${dataset.length} item${dataset.length === 1 ? '' : 's'} queued`;
    }

    tbody.innerHTML = dataset.map(item => {
        const quantity = item.quantity ?? 0;
        const reorderLevel = item.reorderLevel ?? 0;
        const recommended = Math.max(reorderLevel - quantity, 1);
        const supplierName = item.supplierId?.name || '—';
        const lastRestocked = item.lastRestocked ? formatDateTime(item.lastRestocked) : '';
        const stockClass = isItemLowStock(item) ? 'low' : 'ok';

        const skuMeta = item.sku ? `<span class="restock-product__meta">SKU: ${escapeHtml(item.sku)}</span>` : '';
        const categoryMeta = item.category ? `<span class="restock-product__meta">${escapeHtml(item.category)}</span>` : '';

        return `
            <tr>
                <td>
                    <div class="restock-product">
                        <span class="restock-product__name">${escapeHtml(item.name || '—')}</span>
                        ${categoryMeta}
                        ${skuMeta}
                    </div>
                </td>
                <td><span class="stock-pill ${stockClass}">${quantity}</span></td>
                <td>${reorderLevel}</td>
                <td>${escapeHtml(supplierName)}</td>
                <td>${escapeHtml(lastRestocked || '—')}</td>
                <td>
                    <div class="restock-actions">
                        <input type="number" class="restock-input" data-id="${item._id}" min="1" value="${recommended}">
                        <button class="btn btn-sm btn-primary restock-btn" data-id="${item._id}" data-name="${escapeHtml(item.name || 'Item')}">Restock</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.restock-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const itemId = button.dataset.id;
            const itemName = button.dataset.name || 'Item';
            const input = tbody.querySelector(`.restock-input[data-id="${itemId}"]`);
            const amount = input ? Number(input.value) : NaN;
            await handleRestockSubmit({ itemId, itemName, amount, button, input });
        });
    });

    updateRestockSummary();
}

function updateRestockSummary() {
    const lowStockItems = items.filter(isItemLowStock);
    const unitsNeeded = lowStockItems.reduce((sum, item) => {
        const gap = Math.max((item.reorderLevel ?? 0) - (item.quantity ?? 0), 0);
        return sum + gap;
    }, 0);
    const supplierCount = new Set(lowStockItems.map(item => item.supplierId?.name).filter(Boolean)).size;
    const latestRestock = items.reduce((latest, item) => {
        if (!item.lastRestocked) return latest;
        const current = new Date(item.lastRestocked);
        if (Number.isNaN(current.getTime())) return latest;
        if (!latest || current > latest) return current;
        return latest;
    }, null);

    const lowCountEl = document.getElementById('restockLowCount');
    const unitsEl = document.getElementById('restockUnitsNeeded');
    const suppliersEl = document.getElementById('restockSupplierCount');
    const summaryLabel = document.getElementById('restockSummaryLabel');
    const searchValue = document.getElementById('restockSearch')?.value || '';

    if (lowCountEl) lowCountEl.textContent = lowStockItems.length;
    if (unitsEl) unitsEl.textContent = unitsNeeded;
    if (suppliersEl) suppliersEl.textContent = supplierCount;
    if (summaryLabel && !searchValue.trim()) {
        summaryLabel.textContent = `${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'} queued`;
    }

    const lastRestockedLabel = document.getElementById('restockLastRestocked');
    if (lastRestockedLabel) {
        lastRestockedLabel.textContent = latestRestock ? formatDateTime(latestRestock.toISOString()) : '—';
    }
}

async function handleRestockSubmit({ itemId, itemName, amount, button, input }) {
    if (!itemId) return;

    if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Enter a restock quantity greater than zero', 'error');
        if (input) input.focus();
        return;
    }

    const payload = {
        amount: Math.floor(amount),
        operation: 'increase'
    };

    try {
        if (button) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = 'Updating...';
        }

        const response = await fetch(`${API_URL}/items/${itemId}/adjust-stock`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Unable to restock item');
        }

        showToast(`${itemName} restocked by ${payload.amount}`, 'success');

        await fetchAllData();

        const searchValue = document.getElementById('restockSearch')?.value || '';
        populateRestockTable(searchValue);
    } catch (error) {
        console.error('Restock failed:', error);
        showToast(error.message || 'Unable to restock item', 'error');
    } finally {
        if (button) {
            const originalText = button.dataset.originalText || 'Restock';
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

function isItemLowStock(item) {
    if (!item) return false;
    if (item.lowStock !== undefined) {
        return !!item.lowStock;
    }
    const quantity = Number(item.quantity ?? 0);
    const reorderLevel = Number(item.reorderLevel ?? 0);
    return reorderLevel > 0 && quantity < reorderLevel;
}

function openModal(title, bodyHtml) {
    closeModal();

    modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${title}</h3>
                <button type="button" class="modal-close" aria-label="Close" onclick="closeModal()">✖</button>
            </div>
            <div class="modal-body">${bodyHtml}</div>
        </div>
    `;

    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            closeModal();
        }
    });

    document.body.appendChild(modalOverlay);
    requestAnimationFrame(() => modalOverlay.classList.add('visible'));
    return modalOverlay;
}

function closeModal() {
    if (!modalOverlay) return;

    modalOverlay.classList.remove('visible');
    setTimeout(() => {
        if (modalOverlay && modalOverlay.parentNode) {
            modalOverlay.parentNode.removeChild(modalOverlay);
        }
        modalOverlay = null;
    }, 150);
}

function showToast(message, type = 'info') {
    if (!message) return;

    clearTimeout(toastTimer);

    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    container.textContent = message;
    container.className = `toast toast-${type}`;

    requestAnimationFrame(() => {
        container.classList.add('show');
    });

    toastTimer = setTimeout(() => {
        container.classList.remove('show');
    }, 3500);
}

function showImportProductsModal() {
    if (currentUser.role !== 'admin') {
        showToast('Only administrators can import products', 'error');
        return;
    }

    const modal = openModal(
        'Import Products from CSV',
        `
        <form id="importForm" class="modal-form">
            <div class="form-group">
                <label for="csvFile">Select CSV File</label>
                <input type="file" id="csvFile" name="csvFile" accept=".csv" required>
            </div>
            <p class="modal-hint">Expected columns: name, category, quantity, reorderLevel, price, supplier, sku, expiryDate</p>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Import</button>
            </div>
            <div id="importMessage" class="message" style="display:none; margin-top:16px;"></div>
        </form>
        `
    );

    modal.querySelector('#importForm').addEventListener('submit', handleImportProducts);
}

async function handleImportProducts(event) {
    event.preventDefault();

    const fileInput = event.target.querySelector('#csvFile');
    if (!fileInput.files.length) {
        showInlineModalMessage('importMessage', 'Please select a CSV file to import', 'error');
        return;
    }

    const file = fileInput.files[0];

    try {
        const text = await file.text();
        const response = await fetch(`${API_URL}/items/import/csv`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/csv',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: text
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Import failed');
        }

        showToast(`Import completed. ${data.results?.success || 0} rows processed.`, 'success');
        closeModal();
        await fetchAllData();
        loadProducts();
    } catch (error) {
        console.error(error);
        showInlineModalMessage('importMessage', error.message, 'error');
    }
}

async function handleExportProducts() {
    try {
        const response = await fetch(`${API_URL}/items/export/csv`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'Failed to export products');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showToast('Inventory exported successfully', 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

function renderReports() {
    const totalProducts = items.length;
    const totalValue = items.reduce((sum, item) => {
        return sum + ((item.quantity || 0) * (item.price || 0));
    }, 0);
    const lowStockCount = items.filter(item => item.lowStock).length;

    const content = `
        <div class="reports-overview">
            <div class="reports-stat">
                <div class="reports-stat__icon">📊</div>
                <div class="reports-stat__content">
                    <span class="reports-stat__label">Total Products</span>
                    <span class="reports-stat__value">${totalProducts}</span>
                </div>
            </div>
            <div class="reports-stat">
                <div class="reports-stat__icon">💰</div>
                <div class="reports-stat__content">
                    <span class="reports-stat__label">Inventory Value</span>
                    <span class="reports-stat__value">₹${totalValue.toLocaleString()}</span>
                </div>
            </div>
            <div class="reports-stat">
                <div class="reports-stat__icon">⚠️</div>
                <div class="reports-stat__content">
                    <span class="reports-stat__label">Low Stock Items</span>
                    <span class="reports-stat__value">${lowStockCount}</span>
                </div>
            </div>
        </div>
        
        <div class="chart-grid">
            <div class="chart-card">
                <div class="chart-card__header">
                    <div>
                        <h3>📈 Sales Trend Analysis</h3>
                        <p>Revenue and units sold over time</p>
                    </div>
                    <select id="salesSummaryPeriodSelect" class="chart-card__select">
                        <option value="daily">Last 7 Days</option>
                        <option value="weekly">Last 8 Weeks</option>
                        <option value="monthly" selected>Last 12 Months</option>
                    </select>
                </div>
                <div class="chart-card__body">
                    <canvas id="salesSummaryChart"></canvas>
                    <div class="chart-empty" id="salesSummaryEmpty">
                        <div class="chart-empty__icon">📊</div>
                        <div class="chart-empty__text">Loading sales data...</div>
                    </div>
                </div>
            </div>

            <div class="chart-card">
                <div class="chart-card__header">
                    <div>
                        <h3>📦 Inventory Distribution</h3>
                        <p>Stock value breakdown by category</p>
                    </div>
                    <button class="btn btn-sm btn-secondary" id="reportsInventoryRefresh">🔄 Refresh</button>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryBreakdownChart"></canvas>
                    <div class="chart-empty" id="inventoryBreakdownEmpty">
                        <div class="chart-empty__icon">📦</div>
                        <div class="chart-empty__text">Loading inventory data...</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-grid" style="margin-top: 24px;">
            <div class="chart-card">
                <div class="chart-card__header">
                    <div>
                        <h3>📉 Stock Level Trends</h3>
                        <p>Monitor inventory levels over time</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="stockLevelChart"></canvas>
                    <div class="chart-empty" id="stockLevelEmpty">
                        <div class="chart-empty__icon">📉</div>
                        <div class="chart-empty__text">Stock level tracking coming soon</div>
                    </div>
                </div>
            </div>

            <div class="chart-card">
                <div class="chart-card__header">
                    <div>
                        <h3>🏆 Top Products</h3>
                        <p>Highest value items in inventory</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="topProductsChart"></canvas>
                    <div class="chart-empty hidden" id="topProductsEmpty">
                        <div class="chart-empty__icon">🏆</div>
                        <div class="chart-empty__text">Loading top products...</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-grid chart-grid--compact">
            <div class="chart-card chart-card--compact">
                <div class="chart-card__header">
                    <div>
                        <h3>🥧 Category Share (Pie)</h3>
                        <p>Proportion of inventory value by category</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryCategoryPieChart"></canvas>
                    <div class="chart-empty hidden" id="inventoryCategoryPieEmpty">
                        <div class="chart-empty__icon">🥧</div>
                        <div class="chart-empty__text">Awaiting inventory data</div>
                        <div class="chart-empty__hint">Add products to visualise category share</div>
                    </div>
                </div>
            </div>

            <div class="chart-card chart-card--compact">
                <div class="chart-card__header">
                    <div>
                        <h3>🟠 Category Share (Doughnut)</h3>
                        <p>Quantity distribution across categories</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryCategoryDoughnutChart"></canvas>
                    <div class="chart-empty hidden" id="inventoryCategoryDoughnutEmpty">
                        <div class="chart-empty__icon">🟠</div>
                        <div class="chart-empty__text">Awaiting inventory data</div>
                        <div class="chart-empty__hint">Add products to visualise quantity share</div>
                    </div>
                </div>
            </div>

            <div class="chart-card chart-card--compact">
                <div class="chart-card__header">
                    <div>
                        <h3>🧭 Category Spread (Polar)</h3>
                        <p>Relative weight of categories</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryCategoryPolarChart"></canvas>
                    <div class="chart-empty hidden" id="inventoryCategoryPolarEmpty">
                        <div class="chart-empty__icon">🧭</div>
                        <div class="chart-empty__text">Awaiting inventory data</div>
                        <div class="chart-empty__hint">Add products to compare category intensity</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-grid chart-grid--compact">
            <div class="chart-card chart-card--compact">
                <div class="chart-card__header">
                    <div>
                        <h3>🛡️ Stock vs Reorder (Radar)</h3>
                        <p>Quantity on hand compared with reorder thresholds</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryCategoryRadarChart"></canvas>
                    <div class="chart-empty hidden" id="inventoryCategoryRadarEmpty">
                        <div class="chart-empty__icon">🛡️</div>
                        <div class="chart-empty__text">Awaiting inventory data</div>
                        <div class="chart-empty__hint">Add products to analyse reorder readiness</div>
                    </div>
                </div>
            </div>

            <div class="chart-card chart-card--compact">
                <div class="chart-card__header">
                    <div>
                        <h3>📈 Price vs Quantity (Scatter)</h3>
                        <p>Identify outliers in inventory value</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryScatterChart"></canvas>
                    <div class="chart-empty hidden" id="inventoryScatterEmpty">
                        <div class="chart-empty__icon">📈</div>
                        <div class="chart-empty__text">Awaiting inventory data</div>
                        <div class="chart-empty__hint">Add products with price and quantity</div>
                    </div>
                </div>
            </div>

            <div class="chart-card chart-card--compact">
                <div class="chart-card__header">
                    <div>
                        <h3>🫧 Inventory Bubble Map</h3>
                        <p>Bubble size reflects total stock value</p>
                    </div>
                </div>
                <div class="chart-card__body">
                    <canvas id="inventoryBubbleChart"></canvas>
                    <div class="chart-empty hidden" id="inventoryBubbleEmpty">
                        <div class="chart-empty__icon">🫧</div>
                        <div class="chart-empty__text">Awaiting inventory data</div>
                        <div class="chart-empty__hint">Add products with quantity, price, and reorder levels</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="chart-card custom-chart-card">
            <div class="chart-card__header">
                <div>
                    <h3>🛠️ Custom Analytics Builder</h3>
                    <p>Generate ad-hoc graphs from inventory or sales metrics</p>
                </div>
            </div>
            <div class="chart-card__body custom-chart-body">
                <form id="customChartForm" class="custom-chart-form">
                    <div class="custom-chart-controls">
                        <label class="custom-chart-control">
                            <span>Data Source</span>
                            <select id="customChartSource">
                                <option value="inventory" selected>Inventory</option>
                                <option value="sales">Sales</option>
                            </select>
                        </label>
                        <label class="custom-chart-control">
                            <span>Metric</span>
                            <select id="customChartMetric"></select>
                        </label>
                        <label class="custom-chart-control" id="customChartGroupWrapper">
                            <span>Group By</span>
                            <select id="customChartGroupBy"></select>
                        </label>
                        <label class="custom-chart-control" id="customChartPeriodWrapper" hidden>
                            <span>Sales Period</span>
                            <select id="customChartPeriod">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly" selected>Monthly</option>
                            </select>
                        </label>
                        <label class="custom-chart-control">
                            <span>Chart Type</span>
                            <select id="customChartType">
                                <option value="bar" selected>Bar</option>
                                <option value="line">Line</option>
                                <option value="pie">Pie</option>
                                <option value="doughnut">Doughnut</option>
                                <option value="polarArea">Polar Area</option>
                                <option value="radar">Radar</option>
                                <option value="scatter">Scatter</option>
                                <option value="bubble">Bubble</option>
                            </select>
                        </label>
                    </div>
                    <div class="custom-chart-actions">
                        <button type="submit" class="btn btn-primary" id="customChartGenerate">
                            🔍 Generate Graph
                        </button>
                        <button type="button" class="btn btn-secondary" id="customChartReset">
                            ♻️ Reset
                        </button>
                    </div>
                </form>
                <div class="custom-chart-preview">
                    <canvas id="customAnalyticsChart"></canvas>
                    <div class="chart-empty" id="customChartEmpty">
                        <div class="chart-empty__icon">✨</div>
                        <div class="chart-empty__text">Build a custom chart</div>
                        <div class="chart-empty__hint">Choose a data source, metric, and chart type, then click Generate</div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="reports-actions">
            <h3>🔔 Alert Triggers</h3>
            <div class="reports-export-grid" style="margin-bottom: 20px;">
                <button class="btn btn-warning" id="triggerLowStockBtn">
                    <span>⚠️</span>
                    <span>Trigger Low Stock Alert</span>
                </button>
                <button class="btn btn-info" id="triggerDailyReportBtn">
                    <span>📅</span>
                    <span>Trigger Daily Report</span>
                </button>
            </div>

            <h3>📊 Advanced Reports</h3>
            <div class="reports-export-grid" style="margin-bottom: 20px;">
                <button class="btn btn-primary" id="viewCategorySalesBtn">
                    <span>📊</span>
                    <span>Category Sales Report</span>
                </button>
                <button class="btn btn-primary" id="viewDetailedSummaryBtn">
                    <span>📈</span>
                    <span>Detailed Summary</span>
                </button>
                <button class="btn btn-primary" id="viewProductPerformanceBtn">
                    <span>🏆</span>
                    <span>Product Performance</span>
                </button>
                <button class="btn btn-secondary" id="exportCategorySalesBtn">
                    <span>💾</span>
                    <span>Export Category Sales</span>
                </button>
            </div>
            
            <h3>📥 Export Reports</h3>
            <div class="reports-export-grid">
                <button class="btn btn-primary" id="exportLowStockBtn">
                    <span>⚠️</span>
                    <span>Low Stock Report</span>
                </button>
                <button class="btn btn-primary" id="exportInventoryBtn">
                    <span>📦</span>
                    <span>Full Inventory</span>
                </button>
                <button class="btn btn-primary" id="exportSalesBtn" ${items.length === 0 ? 'disabled' : ''}>
                    <span>💰</span>
                    <span>Sales Report</span>
                </button>
                <button class="btn btn-secondary" disabled>
                    <span>🏢</span>
                    <span>Supplier Report</span>
                </button>
            </div>
        </div>
    `;

    renderContent(content);
    initializeReportsPage();
}

function initializeReportsPage() {
    const periodSelect = document.getElementById('salesSummaryPeriodSelect');
    const inventoryRefreshBtn = document.getElementById('reportsInventoryRefresh');
    const exportLowStockBtn = document.getElementById('exportLowStockBtn');
    const exportInventoryBtn = document.getElementById('exportInventoryBtn');
    const exportSalesBtn = document.getElementById('exportSalesBtn');

    // New advanced report buttons
    const triggerLowStockBtn = document.getElementById('triggerLowStockBtn');
    const triggerDailyReportBtn = document.getElementById('triggerDailyReportBtn');
    const viewCategorySalesBtn = document.getElementById('viewCategorySalesBtn');
    const viewDetailedSummaryBtn = document.getElementById('viewDetailedSummaryBtn');
    const viewProductPerformanceBtn = document.getElementById('viewProductPerformanceBtn');
    const exportCategorySalesBtn = document.getElementById('exportCategorySalesBtn');

    const defaultPeriod = periodSelect?.value || 'monthly';

    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            const period = periodSelect.value;
            loadSalesSummaryChart(period);
        });
    }

    if (inventoryRefreshBtn) {
        inventoryRefreshBtn.addEventListener('click', () => {
            renderInventoryBreakdownChart();
        });
    }

    if (exportLowStockBtn) {
        exportLowStockBtn.addEventListener('click', exportLowStockReport);
    }

    if (exportInventoryBtn) {
        exportInventoryBtn.addEventListener('click', handleExportProducts);
    }

    if (exportSalesBtn) {
        exportSalesBtn.addEventListener('click', exportSalesReport);
    }

    if (triggerLowStockBtn) {
        triggerLowStockBtn.addEventListener('click', triggerLowStockAlert);
    }

    if (triggerDailyReportBtn) {
        triggerDailyReportBtn.addEventListener('click', triggerDailyReport);
    }

    // Advanced report handlers
    if (viewCategorySalesBtn) {
        viewCategorySalesBtn.addEventListener('click', showCategorySalesReport);
    }

    if (viewDetailedSummaryBtn) {
        viewDetailedSummaryBtn.addEventListener('click', showDetailedSummaryReport);
    }

    if (viewProductPerformanceBtn) {
        viewProductPerformanceBtn.addEventListener('click', showProductPerformanceReport);
    }

    if (exportCategorySalesBtn) {
        exportCategorySalesBtn.addEventListener('click', exportCategorySalesReport);
    }

    loadSalesSummaryChart(defaultPeriod);
    renderInventoryBreakdownChart();
    renderTopProductsChart();
    renderInventoryCategoryCharts();
    renderStockRadarChart();
    renderInventoryScatterChart();
    renderInventoryBubbleChart();
    setupCustomChartControls();
}

async function triggerLowStockAlert() {
    try {
        const response = await fetch(`${API_URL}/reports/trigger-low-stock-alert`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await response.json();
        if (response.ok) {
            showToast(data.message, 'success');
        } else {
            showToast(data.message || 'Failed to trigger alert', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error triggering alert', 'error');
    }
}

async function triggerDailyReport() {
    try {
        const response = await fetch(`${API_URL}/reports/trigger-daily-report`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const data = await response.json();
        if (response.ok) {
            showToast(data.message, 'success');
        } else {
            showToast(data.message || 'Failed to trigger report', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error triggering report', 'error');
    }
}

async function fetchSalesSummaryData(period, { force = false } = {}) {
    if (!force && salesSummaryCache.has(period)) {
        return salesSummaryCache.get(period);
    }

    const response = await fetch(`${API_URL}/reports/sales-summary?period=${encodeURIComponent(period)}`, {
        headers: {
            'Authorization': `Bearer ${currentUser.token}`
        }
    });

    const payload = await response.json().catch(() => []);

    if (!response.ok) {
        const error = new Error(payload?.message || 'Unable to load sales summary');
        error.data = payload;
        throw error;
    }

    const normalized = Array.isArray(payload) ? payload : [];
    salesSummaryCache.set(period, normalized);
    return normalized;
}

async function loadSalesSummaryChart(period = 'monthly') {
    const canvas = document.getElementById('salesSummaryChart');
    const emptyState = document.getElementById('salesSummaryEmpty');

    if (!canvas) return;

    if (emptyState) {
        emptyState.innerHTML = `
            <div class="chart-empty__icon">📊</div>
            <div class="chart-empty__text">Loading sales data...</div>
        `;
        emptyState.classList.remove('hidden');
    }

    if (salesSummaryChart) {
        salesSummaryChart.destroy();
        salesSummaryChart = null;
    }

    try {
        const payload = await fetchSalesSummaryData(period, { force: true });

        console.log('Sales Summary Data:', payload); // Debug log

        if (!Array.isArray(payload) || payload.length === 0) {
            if (emptyState) {
                emptyState.innerHTML = `
                    <div class="chart-empty__icon">📊</div>
                    <div class="chart-empty__text">No sales recorded yet</div>
                    <div class="chart-empty__hint">Sales data will appear here once transactions are recorded</div>
                `;
                emptyState.classList.remove('hidden');
            }
            return;
        }

        const labels = payload.map(entry => entry.period || '');
        const totals = payload.map(entry => Number(entry.totalAmount || 0));
        const quantities = payload.map(entry => Number(entry.totalQuantity || 0));

        console.log('Chart Data:', { labels, totals, quantities }); // Debug log

        const context = canvas.getContext('2d');
        salesSummaryChart = new Chart(context, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue (₹)',
                        data: totals,
                        backgroundColor: 'rgba(67, 97, 238, 0.8)',
                        borderColor: '#4361ee',
                        borderWidth: 2,
                        borderRadius: 6,
                        borderSkipped: false,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Units Sold',
                        data: quantities,
                        type: 'line',
                        borderColor: '#00b894',
                        backgroundColor: 'rgba(0, 184, 148, 0.1)',
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1',
                        borderWidth: 3,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#00b894',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 13,
                                weight: '500'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        padding: 14,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        bodySpacing: 6,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y || 0;
                                if (context.dataset.label === 'Revenue (₹)') {
                                    return `  💰 Revenue: ₹${Number(value).toLocaleString()}`;
                                } else {
                                    return `  📦 Units: ${Number(value).toLocaleString()}`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Revenue (₹)',
                            font: { size: 12, weight: 'bold' },
                            color: '#4361ee'
                        },
                        ticks: {
                            callback: (val) => `₹${Number(val).toLocaleString()}`,
                            font: { size: 11 }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.06)',
                            drawBorder: false
                        }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Units Sold',
                            font: { size: 12, weight: 'bold' },
                            color: '#00b894'
                        },
                        ticks: {
                            font: { size: 11 }
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: { size: 11 },
                            maxRotation: 45,
                            minRotation: 0
                        }
                    }
                }
            }
        });

        if (emptyState) {
            emptyState.classList.add('hidden');
        }
    } catch (error) {
        console.error('Failed to load sales summary:', error);
        if (emptyState) {
            emptyState.innerHTML = `
                <div class="chart-empty__icon">⚠️</div>
                <div class="chart-empty__text">Unable to load sales data</div>
                <div class="chart-empty__hint">${escapeHtml(error.message)}</div>
            `;
            emptyState.classList.remove('hidden');
        }
    }
}

function renderInventoryBreakdownChart() {
    const canvas = document.getElementById('inventoryBreakdownChart');
    const emptyState = document.getElementById('inventoryBreakdownEmpty');

    if (!canvas) return;

    showChartEmpty(emptyState, '📦', 'Calculating inventory value...', 'Preparing category totals');

    destroyChart(inventoryBreakdownChart);
    inventoryBreakdownChart = null;

    const aggregates = buildInventoryCategoryAggregates();

    if (!aggregates.length) {
        showChartEmpty(emptyState, '📦', 'No inventory data available', 'Add products to see the breakdown');
        return;
    }

    const labels = aggregates.map(entry => entry.category);
    const values = aggregates.map(entry => Number(entry.value || 0));
    const colors = getCategoryPalette(labels.length);

    const context = canvas.getContext('2d');
    inventoryBreakdownChart = new Chart(context, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Inventory Value (₹)',
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    padding: 12,
                    callbacks: {
                        label: (context) => ` ${context.label}: ₹${Number(context.parsed.y || 0).toLocaleString()}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 12 } }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => `₹${Number(value).toLocaleString()}`
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.2)' }
                }
            }
        }
    });

    hideChartEmpty(emptyState);
}

function destroyChart(instance) {
    if (instance && typeof instance.destroy === 'function') {
        instance.destroy();
    }
}

function buildInventoryCategoryAggregates() {
    if (!Array.isArray(items)) return [];

    const aggregates = new Map();

    items.forEach(item => {
        const category = (item.category || 'Uncategorised').trim() || 'Uncategorised';
        const entry = aggregates.get(category) || { quantity: 0, value: 0, reorder: 0 };

        entry.quantity += Number(item.quantity) || 0;
        entry.value += (Number(item.quantity) || 0) * (Number(item.price) || 0);
        entry.reorder += Number(item.reorderLevel) || 0;

        aggregates.set(category, entry);
    });

    return Array.from(aggregates.entries()).map(([category, metrics]) => ({
        category,
        ...metrics
    }));
}

function getCategoryPalette(count) {
    const palette = [
        '#475569', '#2563eb', '#0ea5e9', '#10b981', '#f97316', '#ec4899',
        '#a855f7', '#eab308', '#6366f1', '#ef4444', '#14b8a6', '#f59e0b'
    ];

    if (count <= palette.length) return palette.slice(0, count);

    const extended = [];
    for (let index = 0; index < count; index += 1) {
        const base = palette[index % palette.length];
        const shade = 1 - Math.floor(index / palette.length) * 0.12;
        extended.push(applyShade(base, shade));
    }
    return extended;
}

function applyShade(hex, factor) {
    const value = hex.replace('#', '');
    const bigint = parseInt(value, 16);
    const r = Math.min(255, Math.max(0, Math.round(((bigint >> 16) & 255) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((bigint >> 8) & 255) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((bigint & 255) * factor)));
    return `rgb(${r}, ${g}, ${b})`;
}

function renderInventoryCategoryCharts() {
    const data = buildInventoryCategoryAggregates();
    const pieCanvas = document.getElementById('inventoryCategoryPieChart');
    const pieEmpty = document.getElementById('inventoryCategoryPieEmpty');
    const doughnutCanvas = document.getElementById('inventoryCategoryDoughnutChart');
    const doughnutEmpty = document.getElementById('inventoryCategoryDoughnutEmpty');
    const polarCanvas = document.getElementById('inventoryCategoryPolarChart');
    const polarEmpty = document.getElementById('inventoryCategoryPolarEmpty');

    destroyChart(inventoryCategoryPieChart);
    destroyChart(inventoryCategoryDoughnutChart);
    destroyChart(inventoryCategoryPolarChart);

    inventoryCategoryPieChart = null;
    inventoryCategoryDoughnutChart = null;
    inventoryCategoryPolarChart = null;

    if (!data.length) {
        showChartEmpty(pieEmpty, '🥧', 'No category data available', 'Add products to see category share');
        showChartEmpty(doughnutEmpty, '🟠', 'No category data available', 'Add products to see quantity share');
        showChartEmpty(polarEmpty, '🧭', 'No category data available', 'Add products to compare categories');
        return;
    }

    const labels = data.map(entry => entry.category);
    const values = data.map(entry => Number(entry.value || 0));
    const quantities = data.map(entry => entry.quantity);
    const colors = getCategoryPalette(labels.length);

    if (pieCanvas) {
        inventoryCategoryPieChart = new Chart(pieCanvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 1,
                    borderColor: '#ffffff'
                }]
            },
            options: getPieChartOptions('Inventory Value Share', labels)
        });
        hideChartEmpty(pieEmpty);
    }

    if (doughnutCanvas) {
        inventoryCategoryDoughnutChart = new Chart(doughnutCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: quantities,
                    backgroundColor: colors,
                    borderWidth: 1,
                    borderColor: '#ffffff'
                }]
            },
            options: getPieChartOptions('Inventory Quantity Share', labels, true)
        });
        hideChartEmpty(doughnutEmpty);
    }

    if (polarCanvas) {
        inventoryCategoryPolarChart = new Chart(polarCanvas.getContext('2d'), {
            type: 'polarArea',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        ticks: { display: false },
                        grid: { color: 'rgba(148, 163, 184, 0.2)' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 14 }
                    }
                }
            }
        });
        hideChartEmpty(polarEmpty);
    }
}

function getPieChartOptions(title, labels, isDoughnut = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: isDoughnut ? '55%' : '0%',
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    usePointStyle: true,
                    boxWidth: 12,
                    padding: 14,
                    font: { size: 12 },
                    generateLabels: chart => {
                        const dataset = chart.data.datasets[0];
                        if (!dataset) return [];
                        const total = dataset.data.reduce((sum, value) => sum + value, 0) || 1;
                        return chart.data.labels.map((label, index) => {
                            const value = dataset.data[index] || 0;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return {
                                text: `${label} — ${percentage}%`,
                                fillStyle: dataset.backgroundColor[index],
                                strokeStyle: dataset.backgroundColor[index],
                                lineWidth: 1,
                                hidden: false
                            };
                        });
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: context => {
                        const dataset = context.dataset.data;
                        const total = dataset.reduce((sum, value) => sum + value, 0) || 1;
                        const value = context.parsed;
                        const percentage = ((value / total) * 100).toFixed(1);
                        const label = context.label || '';
                        return ` ${label}: ${value.toLocaleString()} (${percentage}%)`;
                    }
                }
            }
        }
    };
}

function hideChartEmpty(element) {
    if (element) {
        element.classList.add('hidden');
    }
}

function showChartEmpty(element, icon, title, hint) {
    if (!element) return;
    element.innerHTML = `
        <div class="chart-empty__icon">${icon}</div>
        <div class="chart-empty__text">${title}</div>
        ${hint ? `<div class="chart-empty__hint">${hint}</div>` : ''}
    `;
    element.classList.remove('hidden');
}

function showChartError(element, message) {
    showChartEmpty(element, '⚠️', 'Unable to load data', message || 'Something went wrong');
}

function renderStockRadarChart() {
    const canvas = document.getElementById('inventoryCategoryRadarChart');
    const emptyState = document.getElementById('inventoryCategoryRadarEmpty');

    destroyChart(inventoryCategoryRadarChart);
    inventoryCategoryRadarChart = null;

    const data = buildInventoryCategoryAggregates();

    if (!data.length) {
        showChartEmpty(emptyState, '🛡️', 'No category data available', 'Add inventory to view stock readiness');
        return;
    }

    const labels = data.map(entry => entry.category);
    const quantities = data.map(entry => entry.quantity);
    const reorderLevels = data.map(entry => entry.reorder);

    if (!canvas) return;

    inventoryCategoryRadarChart = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels,
            datasets: [
                {
                    label: 'On Hand Quantity',
                    data: quantities,
                    backgroundColor: 'rgba(71, 85, 105, 0.2)',
                    borderColor: '#475569',
                    pointBackgroundColor: '#475569'
                },
                {
                    label: 'Reorder Level',
                    data: reorderLevels,
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderColor: '#10b981',
                    pointBackgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(148, 163, 184, 0.25)' },
                    grid: { color: 'rgba(148, 163, 184, 0.15)' },
                    suggestedMax: Math.max(...quantities.concat(reorderLevels)) * 1.1
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });

    hideChartEmpty(emptyState);
}

function renderInventoryScatterChart() {
    const canvas = document.getElementById('inventoryScatterChart');
    const emptyState = document.getElementById('inventoryScatterEmpty');

    destroyChart(inventoryScatterChart);
    inventoryScatterChart = null;

    const scatterData = (items || [])
        .filter(item => Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.quantity)))
        .map(item => ({
            x: Number(item.price),
            y: Number(item.quantity),
            name: item.name || 'Unnamed Item'
        }));

    if (!scatterData.length) {
        showChartEmpty(emptyState, '📈', 'Insufficient data', 'Add products with price and quantity');
        return;
    }

    if (!canvas) return;

    inventoryScatterChart = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Product Distribution',
                data: scatterData,
                backgroundColor: 'rgba(37, 99, 235, 0.7)',
                borderColor: '#1d4ed8',
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Unit Price (₹)' },
                    grid: { color: 'rgba(148, 163, 184, 0.2)' }
                },
                y: {
                    title: { display: true, text: 'Quantity on Hand' },
                    grid: { color: 'rgba(148, 163, 184, 0.2)' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => {
                            const entry = context.raw || {};
                            return ` ${entry.name}: ₹${context.parsed.x.toLocaleString()} × ${context.parsed.y}`;
                        }
                    }
                }
            }
        }
    });

    hideChartEmpty(emptyState);
}

function renderInventoryBubbleChart() {
    const canvas = document.getElementById('inventoryBubbleChart');
    const emptyState = document.getElementById('inventoryBubbleEmpty');

    destroyChart(inventoryBubbleChart);
    inventoryBubbleChart = null;

    const bubbleData = (items || [])
        .filter(item => Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.reorderLevel)))
        .map(item => {
            const quantity = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            return {
                x: price,
                y: quantity,
                r: Math.max(4, Math.sqrt(quantity * price) / 12),
                name: item.name || 'Unnamed Item',
                lowStock: Boolean(item.lowStock)
            };
        });

    if (!bubbleData.length) {
        showChartEmpty(emptyState, '🫧', 'Insufficient data', 'Add products with price, quantity, and reorder level');
        return;
    }

    if (!canvas) return;

    inventoryBubbleChart = new Chart(canvas.getContext('2d'), {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Inventory Bubble Map',
                data: bubbleData,
                backgroundColor: bubbleData.map(entry => entry.lowStock ? 'rgba(239, 68, 68, 0.6)' : 'rgba(59, 130, 246, 0.6)'),
                borderColor: bubbleData.map(entry => entry.lowStock ? '#b91c1c' : '#1d4ed8'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Unit Price (₹)' } },
                y: { title: { display: true, text: 'Quantity on Hand' } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => {
                            const entry = context.raw || {};
                            const totalValue = (context.parsed.x * context.parsed.y).toLocaleString();
                            return ` ${entry.name}: ₹${context.parsed.x.toLocaleString()} × ${context.parsed.y} (₹${totalValue})`;
                        }
                    }
                }
            }
        }
    });

    hideChartEmpty(emptyState);
}

function getMetricMeta(source, metric) {
    return (CUSTOM_METRICS[source] || []).find(option => option.value === metric) || null;
}

function setupCustomChartControls() {
    const sourceSelect = document.getElementById('customChartSource');
    const metricSelect = document.getElementById('customChartMetric');
    const groupSelect = document.getElementById('customChartGroupBy');
    const periodWrapper = document.getElementById('customChartPeriodWrapper');
    const groupWrapper = document.getElementById('customChartGroupWrapper');
    const form = document.getElementById('customChartForm');
    const resetBtn = document.getElementById('customChartReset');

    if (!sourceSelect || !metricSelect || !groupSelect || !form) {
        return;
    }

    const handleSourceChange = () => {
        populateCustomMetricOptions(sourceSelect, metricSelect);
        populateCustomGroupOptions(sourceSelect, metricSelect, groupSelect, groupWrapper);
        periodWrapper.hidden = sourceSelect.value !== 'sales';
    };

    const handleMetricChange = () => {
        populateCustomGroupOptions(sourceSelect, metricSelect, groupSelect, groupWrapper);
        ensureValidCustomChartType(metricSelect);
    };

    sourceSelect.addEventListener('change', () => {
        handleSourceChange();
        ensureValidCustomChartType(metricSelect);
    });

    metricSelect.addEventListener('change', handleMetricChange);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await renderCustomAnalyticsChart();
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetCustomChart(sourceSelect, metricSelect, groupSelect, groupWrapper, periodWrapper);
        });
    }

    handleSourceChange();
    ensureValidCustomChartType(metricSelect);
}

function populateCustomMetricOptions(sourceSelect, metricSelect) {
    const source = sourceSelect.value;
    const options = CUSTOM_METRICS[source] || [];
    const previousValue = metricSelect.value;

    metricSelect.innerHTML = options.map(option => `
        <option value="${option.value}">${option.label}</option>
    `).join('');

    const hasPrevious = options.some(option => option.value === previousValue);
    metricSelect.value = hasPrevious ? previousValue : options[0]?.value || '';
}

function populateCustomGroupOptions(sourceSelect, metricSelect, groupSelect, groupWrapper) {
    const source = sourceSelect.value;
    const metricMeta = getMetricMeta(source, metricSelect.value);
    const requiresGroup = Boolean(metricMeta?.requiresGroup);

    const groups = CUSTOM_GROUPS[source] || [];
    groupWrapper.hidden = !requiresGroup;

    if (!requiresGroup) {
        groupSelect.innerHTML = '';
        return;
    }

    const previousValue = groupSelect.value;
    groupSelect.innerHTML = groups.map(option => `
        <option value="${option.value}">${option.label}</option>
    `).join('');

    const hasPrevious = groups.some(option => option.value === previousValue);
    groupSelect.value = hasPrevious ? previousValue : groups[0]?.value || '';
}

function ensureValidCustomChartType(metricSelect) {
    const chartTypeSelect = document.getElementById('customChartType');
    const sourceSelect = document.getElementById('customChartSource');
    if (!chartTypeSelect || !metricSelect || !sourceSelect) return;

    const metricMeta = getMetricMeta(sourceSelect.value, metricSelect.value);
    if (!metricMeta) return;

    const allowedTypes = metricMeta.allowedTypes || CUSTOM_DEFAULT_ALLOWED_TYPES;
    if (!allowedTypes.includes(chartTypeSelect.value)) {
        chartTypeSelect.value = allowedTypes[0] || 'bar';
    }

    Array.from(chartTypeSelect.options).forEach(option => {
        option.disabled = !allowedTypes.includes(option.value);
    });
}

async function renderCustomAnalyticsChart() {
    const canvas = document.getElementById('customAnalyticsChart');
    const emptyState = document.getElementById('customChartEmpty');
    const source = document.getElementById('customChartSource')?.value || 'inventory';
    const metric = document.getElementById('customChartMetric')?.value;
    const groupBy = document.getElementById('customChartGroupBy')?.value || 'category';
    const chartType = document.getElementById('customChartType')?.value || 'bar';
    const period = document.getElementById('customChartPeriod')?.value || 'monthly';

    if (!canvas || !metric) return;

    showChartEmpty(emptyState, '⏳', 'Generating chart...', 'Processing your selections');

    destroyChart(customReportChart);
    customReportChart = null;

    try {
        const metricMeta = getMetricMeta(source, metric);
        if (!metricMeta) {
            showChartEmpty(emptyState, '⚠️', 'Unsupported metric selected', 'Please pick another metric');
            return;
        }

        const allowedTypes = metricMeta.allowedTypes || CUSTOM_DEFAULT_ALLOWED_TYPES;
        if (!allowedTypes.includes(chartType)) {
            showChartEmpty(emptyState, '⚠️', 'Chart type not supported', `Choose one of: ${allowedTypes.join(', ')}`);
            return;
        }

        const dataset = source === 'inventory'
            ? buildInventoryCustomDataset(metric, chartType, groupBy)
            : await buildSalesCustomDataset(metric, chartType, period);

        if (!dataset || (Array.isArray(dataset.labels) && dataset.labels.length === 0)) {
            showChartEmpty(emptyState, '📭', 'No data for the selected filters', 'Try updating your filters or adding more records');
            return;
        }

        if (dataset.type === 'scatter' && chartType === 'bubble') {
            dataset.type = 'bubble';
        }

        const chartConfig = composeCustomChartConfig(chartType, dataset, metricMeta);

        if (!chartConfig) {
            showChartEmpty(emptyState, '⚠️', 'Unable to build chart configuration', 'Adjust your selections and try again');
            return;
        }

        customReportChart = new Chart(canvas.getContext('2d'), chartConfig);
        hideChartEmpty(emptyState);
    } catch (error) {
        console.error('Failed to render custom analytics chart:', error);
        showChartError(emptyState, error.message || 'Unexpected error occurred');
    }
}

function resetCustomChart(sourceSelect, metricSelect, groupSelect, groupWrapper, periodWrapper) {
    if (!sourceSelect || !metricSelect) return;

    sourceSelect.value = 'inventory';
    periodWrapper.hidden = true;
    const periodSelect = document.getElementById('customChartPeriod');
    if (periodSelect) periodSelect.value = 'monthly';
    const chartTypeSelect = document.getElementById('customChartType');
    if (chartTypeSelect) chartTypeSelect.value = 'bar';
    populateCustomMetricOptions(sourceSelect, metricSelect);
    populateCustomGroupOptions(sourceSelect, metricSelect, groupSelect, groupWrapper);
    ensureValidCustomChartType(metricSelect);

    destroyChart(customReportChart);
    customReportChart = null;

    showChartEmpty(
        document.getElementById('customChartEmpty'),
        '✨',
        'Build a custom chart',
        'Choose a data source, metric, and chart type, then click Generate'
    );
}

function buildInventoryCustomDataset(metric, chartType, groupBy) {
    const itemsList = Array.isArray(items) ? items : [];

    if (metric === 'price_vs_quantity') {
        const scatterPoints = itemsList
            .filter(item => Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.quantity)))
            .map(item => ({
                x: Number(item.price),
                y: Number(item.quantity),
                r: Math.max(4, Math.sqrt((Number(item.quantity) || 0) * (Number(item.price) || 0)) / 12),
                label: item.name || 'Unnamed Item'
            }));

        return {
            type: chartType === 'bubble' ? 'bubble' : 'scatter',
            datasets: [{
                label: 'Price vs Quantity',
                data: scatterPoints,
                backgroundColor: scatterPoints.map(point => point.y === 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(37, 99, 235, 0.6)'),
                borderColor: scatterPoints.map(point => point.y === 0 ? '#b91c1c' : '#1d4ed8')
            }]
        };
    }

    const metricMeta = getMetricMeta('inventory', metric);
    if (!metricMeta) return null;

    const groups = new Map();
    const getKey = (item) => {
        if (groupBy === 'supplier') {
            return item.supplierId?.name || item.supplierName || item.supplier || 'Unknown Supplier';
        }
        if (groupBy === 'low_stock') {
            const isLow = item.lowStock ?? ((item.quantity || 0) <= (item.reorderLevel || 0));
            return isLow ? 'Low Stock' : 'Healthy Stock';
        }
        return item.category || 'Uncategorised';
    };

    itemsList.forEach(item => {
        const key = getKey(item);
        const entry = groups.get(key) || 0;
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const reorder = Number(item.reorderLevel) || 0;

        let valueToAdd = 0;
        switch (metric) {
            case 'inventory_value':
                valueToAdd = quantity * price;
                break;
            case 'inventory_quantity':
                valueToAdd = quantity;
                break;
            case 'reorder_gap':
                valueToAdd = Math.max(reorder - quantity, 0);
                break;
            default:
                valueToAdd = 0;
        }

        groups.set(key, entry + valueToAdd);
    });

    const labels = Array.from(groups.keys());
    const values = labels.map(label => groups.get(label));
    const palette = getCategoryPalette(labels.length);

    return {
        labels,
        datasets: [{
            label: metricMeta.label,
            data: values,
            backgroundColor: chartType === 'line'
                ? 'rgba(59, 130, 246, 0.1)'
                : palette,
            borderColor: chartType === 'line'
                ? '#2563eb'
                : palette,
            fill: chartType === 'line' || chartType === 'radar'
        }],
        format: metricMeta.format
    };
}

async function buildSalesCustomDataset(metric, chartType, period) {
    const entries = await fetchSalesSummaryData(period, { force: false });

    if (!Array.isArray(entries) || !entries.length) {
        return null;
    }

    const metricMeta = getMetricMeta('sales', metric);
    if (!metricMeta) return null;

    const labels = entries.map(entry => entry.period || '—');
    const values = entries.map(entry => metric === 'sales_revenue'
        ? Number(entry.totalAmount || 0)
        : Number(entry.totalQuantity || 0));

    return {
        labels,
        datasets: [{
            label: metricMeta.label,
            data: values,
            backgroundColor: chartType === 'line'
                ? 'rgba(16, 185, 129, 0.15)'
                : getCategoryPalette(labels.length),
            borderColor: chartType === 'line'
                ? '#10b981'
                : getCategoryPalette(labels.length),
            tension: 0.35,
            fill: chartType === 'line'
        }],
        format: metricMeta.format
    };
}

function composeCustomChartConfig(chartType, dataset, metricMeta) {
    if (!dataset) return null;

    if (dataset.type === 'scatter' || chartType === 'scatter' || chartType === 'bubble') {
        return {
            type: dataset.type || chartType,
            data: {
                datasets: dataset.datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: 'Unit Price (₹)' } },
                    y: { title: { display: true, text: 'Quantity on Hand' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const point = context.raw || {};
                                const price = Number(context.parsed.x || 0).toLocaleString();
                                const qty = Number(context.parsed.y || 0).toLocaleString();
                                return ` ${point.label || 'Item'}: ₹${price} × ${qty}`;
                            }
                        }
                    }
                }
            }
        };
    }

    const palette = getCategoryPalette(dataset.labels?.length || 1);
    const dataConfig = {
        labels: dataset.labels,
        datasets: dataset.datasets.map((entry, index) => ({
            ...entry,
            backgroundColor: Array.isArray(entry.backgroundColor)
                ? entry.backgroundColor
                : (['pie', 'doughnut', 'polarArea'].includes(chartType) ? palette : entry.backgroundColor || palette[0]),
            borderColor: Array.isArray(entry.borderColor)
                ? entry.borderColor
                : (chartType === 'line' ? entry.borderColor || '#2563eb' : 'rgba(255,255,255,0.9)'),
            borderWidth: chartType === 'line' ? 2 : 1
        }))
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: ['pie', 'doughnut', 'polarArea', 'radar'].includes(chartType) ? 'right' : 'top'
            },
            tooltip: {
                callbacks: {
                    label: context => formatCustomMetricValue(context, metricMeta)
                }
            }
        },
        scales: {}
    };

    if (chartType === 'bar') {
        options.scales = {
            x: { grid: { display: false } },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: value => formatValueByType(value, metricMeta)
                }
            }
        };
    } else if (chartType === 'line') {
        options.scales = {
            x: { grid: { color: 'rgba(148, 163, 184, 0.2)' } },
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(148, 163, 184, 0.2)' },
                ticks: {
                    callback: value => formatValueByType(value, metricMeta)
                }
            }
        };
    } else if (chartType === 'radar') {
        options.scales = {
            r: {
                beginAtZero: true,
                angleLines: { color: 'rgba(148, 163, 184, 0.25)' },
                grid: { color: 'rgba(148, 163, 184, 0.15)' },
                ticks: { callback: value => formatValueByType(value, metricMeta) }
            }
        };
    } else {
        delete options.scales;
    }

    return {
        type: chartType,
        data: dataConfig,
        options
    };
}

function formatCustomMetricValue(context, metricMeta) {
    if (!metricMeta) return `${context.label ?? ''}: ${context.formattedValue}`;

    if (metricMeta.format === 'currency') {
        const value = context.parsed.y ?? context.parsed;
        return ` ${context.label || metricMeta.label}: ₹${Number(value || 0).toLocaleString()}`;
    }

    const value = context.parsed.y ?? context.parsed;
    return ` ${context.label || metricMeta.label}: ${Number(value || 0).toLocaleString()}`;
}

function formatValueByType(value, metricMeta) {
    if (metricMeta?.format === 'currency') {
        return `₹${Number(value || 0).toLocaleString()}`;
    }
    return Number(value || 0).toLocaleString();
}

function renderTopProductsChart() {
    const canvas = document.getElementById('topProductsChart');
    const emptyState = document.getElementById('topProductsEmpty');

    if (!canvas) return;

    destroyChart(topProductsChart);
    topProductsChart = null;

    const sourceItems = Array.isArray(items) ? items : [];

    const topProducts = sourceItems
        .map(item => ({
            name: item.name || 'Unknown',
            value: (item.quantity || 0) * (item.price || 0)
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    if (!topProducts.length) {
        showChartEmpty(emptyState, '🏆', 'No product data', 'Add inventory to view product value ranking');
        return;
    }

    const labels = topProducts.map(p => p.name);
    const values = topProducts.map(p => p.value);

    const context = canvas.getContext('2d');
    topProductsChart = new Chart(context, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Inventory Value',
                data: values,
                backgroundColor: '#4361ee',
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: (context) => `  Value: ₹${Number(context.parsed.x).toLocaleString()}`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: (val) => `₹${Number(val).toLocaleString()}`
                    },
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

    hideChartEmpty(emptyState);
}

async function exportLowStockReport() {
    try {
        const response = await fetch(`${API_URL}/reports/low-stock/export`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'Failed to export low stock report');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `low-stock-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showToast('Low stock report exported successfully', 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

async function exportSalesReport() {
    try {
        const response = await fetch(`${API_URL}/reports/sales/export`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'Failed to export sales report');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sales-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showToast('Sales report exported successfully', 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

function renderNotifications() {
    const lowStockCount = items.filter(item => item.lowStock).length;
    const activeChannels = Object.values(notificationSettings).filter(Boolean).length;
    const totalChannels = Object.keys(notificationSettings).length;
    const canViewFeed = ['admin', 'manager'].includes(currentUser.role);

    const content = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Low Stock Alerts</span>
                    <div class="stat-icon danger">⚠️</div>
                </div>
                <div class="stat-value" id="notifLowStockCount">${lowStockCount}</div>
                <div class="stat-trend" id="notifLowStockTrend">Monitoring critical items</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Active Channels</span>
                    <div class="stat-icon primary">🔔</div>
                </div>
                <div class="stat-value" id="notifActiveChannels">${activeChannels}/${totalChannels}</div>
                <div class="stat-trend">Personalised alert preferences</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Last Alert</span>
                    <div class="stat-icon success">⏱️</div>
                </div>
                <div class="stat-value" style="font-size:18px;" id="notifLastEvent">—</div>
                <div class="stat-trend">Most recent notification</div>
            </div>
        </div>

        <div class="notification-grid">
            <div class="data-table-wrapper">
                <div class="table-header">
                    <h3 class="table-title">Notification Preferences</h3>
                </div>
                <div class="notification-preferences">
                    <div class="notification-toggle">
                        <div>
                            <h4>Low Stock Alerts</h4>
                            <p>Receive alerts when inventory drops below reorder levels.</p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="notifPageLowStock">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="notification-toggle">
                        <div>
                            <h4>Sales Updates</h4>
                            <p>Get confirmation and reminders for completed sales.</p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="notifPageSales">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="data-table-wrapper">
                <div class="table-header">
                    <h3 class="table-title">Low Stock Watchlist</h3>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Stock</th>
                            <th>Reorder Level</th>
                            <th>Supplier</th>
                        </tr>
                    </thead>
                    <tbody id="notificationLowStockTable">
                        <tr><td colspan="4" style="text-align:center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="data-table-wrapper">
                <div class="table-header">
                    <h3 class="table-title">Recent Alerts</h3>
                </div>
                ${canViewFeed ? `
                    <table class="data-table notification-feed">
                        <thead>
                            <tr>
                                <th>Alert</th>
                                <th>User</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody id="notificationFeedTable">
                            <tr><td colspan="3" style="text-align:center;">Loading...</td></tr>
                        </tbody>
                    </table>
                ` : `
                    <div class="empty-state">
                        <h4>System alerts require elevated access</h4>
                        <p>Contact an administrator if you need visibility into organisation-wide notifications.</p>
                    </div>
                `}
            </div>
        </div>
    `;

    renderContent(content);
    initializeNotificationPage(canViewFeed);
}

function renderSettings() {
    const content = `
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">⚙️ System Settings</h3>
            </div>
            <div style="padding: 24px;">
                <form id="passwordForm" class="form-vertical">
                    <div class="form-group">
                        <label for="currentPassword">Current Password</label>
                        <input type="password" id="currentPassword" placeholder="Enter current password" required autocomplete="current-password">
                    </div>
                    <div class="form-group">
                        <label for="newPassword">New Password</label>
                        <input type="password" id="newPassword" placeholder="Enter new password" required minlength="6" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label for="confirmPassword">Confirm New Password</label>
                        <input type="password" id="confirmPassword" placeholder="Confirm new password" required autocomplete="new-password">
                    </div>
                    <button type="submit" class="btn btn-primary">Update Password</button>
                    <div id="passwordMessage" class="message" style="display:none; margin-top:16px;"></div>
                </form>
                
                <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
                
                <h3 style="margin-bottom: 16px;">🔔 Notification Settings</h3>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <input type="checkbox" id="lowStockNotif" checked>
                    <label for="lowStockNotif">Low Stock Alerts</label>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <input type="checkbox" id="salesNotif" checked>
                    <label for="salesNotif">Sales Notifications</label>
                </div>
                
                <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border);">
                
                <h3 style="margin-bottom: 16px;">💾 Backup Data</h3>
                <button class="btn btn-success">Download Backup</button>
            </div>
        </div>
    `;

    renderContent(content);
    setupSettingsPage();
}

function setupSettingsPage() {
    const form = document.getElementById('passwordForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value.trim();
        const newPassword = document.getElementById('newPassword').value.trim();
        const confirmPassword = document.getElementById('confirmPassword').value.trim();

        if (!currentPassword || !newPassword || !confirmPassword) {
            showMessage('passwordMessage', 'All password fields are required.', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showMessage('passwordMessage', 'New password must be at least 6 characters long.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage('passwordMessage', 'New password and confirmation do not match.', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentUser.token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update password');
            }

            form.reset();
            showMessage('passwordMessage', data.message || 'Password updated successfully.', 'success');
        } catch (error) {
            showMessage('passwordMessage', error.message, 'error');
        }
    });

    initializeNotificationToggle('lowStockNotif', 'lowStock', {
        enabledMessage: 'Low stock notifications enabled',
        disabledMessage: 'Low stock notifications disabled',
        onChange: () => updateNotificationOverview()
    });

    initializeNotificationToggle('salesNotif', 'sales', {
        enabledMessage: 'Sales notifications enabled',
        disabledMessage: 'Sales notifications disabled',
        onChange: () => updateNotificationOverview()
    });
}

function initializeNotificationPage(canViewFeed) {
    initializeNotificationToggle('notifPageLowStock', 'lowStock', {
        enabledMessage: 'Low stock alerts enabled',
        disabledMessage: 'Low stock alerts disabled',
        onChange: () => updateNotificationOverview()
    });

    initializeNotificationToggle('notifPageSales', 'sales', {
        enabledMessage: 'Sales updates enabled',
        disabledMessage: 'Sales updates disabled',
        onChange: () => updateNotificationOverview()
    });

    populateLowStockTable();
    updateNotificationOverview();

    if (canViewFeed) {
        loadNotificationFeed();
    }
}

function populateLowStockTable() {
    const tbody = document.getElementById('notificationLowStockTable');
    if (!tbody) return;

    const lowStockItems = items
        .filter(item => item.lowStock)
        .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));

    if (lowStockItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">All inventory levels are healthy 🎉</td></tr>';
        return;
    }

    tbody.innerHTML = lowStockItems.map(item => `
        <tr>
            <td>${item.name || '—'}</td>
            <td><span class="stock-pill low">${item.quantity ?? 0}</span></td>
            <td>${item.reorderLevel ?? 0}</td>
            <td>${item.supplierId?.name || '—'}</td>
        </tr>
    `).join('');
}

async function loadNotificationFeed(limit = 15) {
    const tbody = document.getElementById('notificationFeedTable');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading recent alerts...</td></tr>';
    }

    const { data, error } = await fetchNotificationFeed(limit);

    if (!tbody) {
        updateNotificationOverview();
        return;
    }

    if (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--danger);">${escapeHtml(error.message || 'Unable to load alerts')}</td></tr>`;
        updateNotificationOverview();
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No recent alerts logged</td></tr>';
        updateNotificationOverview();
        return;
    }

    tbody.innerHTML = data.map(entry => `
        <tr>
            <td>${escapeHtml(entry.description || entry.action || 'Notification')}</td>
            <td>${escapeHtml(entry.username || entry.userId?.username || 'System')}</td>
            <td>${escapeHtml(formatDateTime(entry.createdAt))}</td>
        </tr>
    `).join('');

    updateNotificationOverview();
}

// ===== MANAGER PAGES =====

function renderManagerOverview() {
    renderAdminOverview(); // Similar to admin overview
}

function renderInventorySummary() {
    renderManageProducts(); // Similar to products page
}

function renderSupplierManagement() {
    const content = `
        <div class="page-actions">
            <button class="btn btn-primary" onclick="showAddSupplierModal()">
                ➕ Add Supplier
            </button>
            <button class="btn btn-secondary" onclick="showImportSuppliersModal()">
                📥 Import Suppliers (CSV)
            </button>
        </div>
        
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">Supplier Directory</h3>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Products Supplied</th>
                        <th>Last Delivery</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="suppliersTable">
                    <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    loadSuppliers();
}

function showAddSupplierModal() {
    if (!['admin', 'manager'].includes(currentUser.role)) {
        showToast('Only administrators or managers can add suppliers', 'error');
        return;
    }

    openSupplierModal({ mode: 'create' });
}

function showEditSupplierModal(supplierId) {
    if (!supplierId) return;

    if (!['admin', 'manager'].includes(currentUser.role)) {
        showToast('You do not have permission to edit suppliers', 'error');
        return;
    }

    const supplier = suppliers.find(entry => entry._id === supplierId);
    if (!supplier) {
        showToast('Supplier not found or already removed', 'error');
        return;
    }

    openSupplierModal({ mode: 'edit', supplier });
}

function openSupplierModal({ mode, supplier = {} }) {
    const isEdit = mode === 'edit';
    const supplierIdAttr = isEdit && supplier._id ? ` data-id="${supplier._id}"` : '';
    const productsValue = Array.isArray(supplier.products) ? supplier.products.join(', ') : (supplier.products || '');

    const modal = openModal(
        `${isEdit ? 'Edit' : 'Add'} Supplier`,
        `
        <form id="supplierForm" class="modal-form" data-mode="${isEdit ? 'edit' : 'create'}"${supplierIdAttr}>
            <div class="form-group">
                <label for="supplierName">Supplier Name <span class="required">*</span></label>
                <input type="text" id="supplierName" name="name" placeholder="e.g. Sunrise Distributors" value="${escapeHtml(supplier.name || '')}" required>
            </div>
            <div class="form-group">
                <label for="supplierContact">Primary Contact</label>
                <input type="text" id="supplierContact" name="contact" placeholder="Phone or contact person" value="${escapeHtml(supplier.contact || '')}">
            </div>
            <div class="form-group">
                <label for="supplierEmail">Email</label>
                <input type="email" id="supplierEmail" name="email" placeholder="contact@supplier.com" value="${escapeHtml(supplier.email || '')}">
            </div>
            <div class="form-group">
                <label for="supplierAddress">Address</label>
                <textarea id="supplierAddress" name="address" rows="3" placeholder="Street, City, State, PIN">${escapeHtml(supplier.address || '')}</textarea>
            </div>
            <div class="form-group">
                <label for="supplierProducts">Products Supplied</label>
                <input type="text" id="supplierProducts" name="products" placeholder="Separate with commas" value="${escapeHtml(productsValue)}">
                <p class="modal-hint">Example: Dairy, Bakery, Beverages</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Supplier'}</button>
            </div>
            <div id="supplierModalMessage" class="message" style="display:none; margin-top:16px;"></div>
        </form>
        `
    );

    const form = modal.querySelector('#supplierForm');
    if (!form) return;

    const submitHandler = isEdit ? handleUpdateSupplier : handleCreateSupplier;
    form.addEventListener('submit', submitHandler);
}

async function handleCreateSupplier(event) {
    event.preventDefault();
    const form = event.target;
    const payload = collectSupplierFormData(form);

    if (!payload.name) {
        showInlineModalMessage('supplierModalMessage', 'Supplier name is required.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/suppliers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Unable to create supplier');
        }

        showToast('Supplier created successfully', 'success');
        closeModal();
        await fetchAllData();
        if (currentPage === 'suppliers') {
            loadSuppliers();
        }
    } catch (error) {
        console.error(error);
        showInlineModalMessage('supplierModalMessage', error.message, 'error');
    }
}

async function handleUpdateSupplier(event) {
    event.preventDefault();
    const form = event.target;
    const supplierId = form.dataset.id;

    if (!supplierId) {
        showInlineModalMessage('supplierModalMessage', 'Unable to determine supplier to update.', 'error');
        return;
    }

    const payload = collectSupplierFormData(form);

    if (!payload.name) {
        showInlineModalMessage('supplierModalMessage', 'Supplier name is required.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/suppliers/${supplierId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Unable to update supplier');
        }

        showToast('Supplier updated successfully', 'success');
        closeModal();
        await fetchAllData();
        if (currentPage === 'suppliers') {
            loadSuppliers();
        }
    } catch (error) {
        console.error(error);
        showInlineModalMessage('supplierModalMessage', error.message, 'error');
    }
}

function collectSupplierFormData(form) {
    const formData = new FormData(form);

    const productsRaw = (formData.get('products') || '').toString();
    const productList = productsRaw
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry.length);

    const payload = {
        name: (formData.get('name') || '').toString().trim(),
        contact: (formData.get('contact') || '').toString().trim(),
        email: (formData.get('email') || '').toString().trim(),
        address: (formData.get('address') || '').toString().trim(),
        products: productList
    };

    if (!payload.contact) delete payload.contact;
    if (!payload.email) delete payload.email;
    if (!payload.address) delete payload.address;
    if (!payload.products.length) delete payload.products;

    return payload;
}

async function handleDeleteSupplier(supplierId, supplierName) {
    if (currentUser.role !== 'admin') {
        showToast('Only administrators can delete suppliers', 'error');
        return;
    }

    if (!supplierId) return;

    const confirmed = window.confirm(`Delete supplier "${supplierName || 'Unknown'}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/suppliers/${supplierId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Unable to delete supplier');
        }

        showToast('Supplier deleted successfully', 'success');
        await fetchAllData();
        if (currentPage === 'suppliers') {
            loadSuppliers();
        }
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

function showImportSuppliersModal() {
    if (!['admin', 'manager'].includes(currentUser.role)) {
        showToast('You do not have permission to import suppliers', 'error');
        return;
    }

    const modal = openModal(
        'Import Suppliers from CSV',
        `
        <form id="supplierImportForm" class="modal-form">
            <div class="form-group">
                <label for="supplierCsvFile">Select CSV File</label>
                <input type="file" id="supplierCsvFile" name="csvFile" accept=".csv" required>
            </div>
            <p class="modal-hint">Expected columns: name, contact, email, address, products</p>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Import</button>
            </div>
            <div id="supplierImportMessage" class="message" style="display:none; margin-top:16px;"></div>
        </form>
        `
    );

    const form = modal.querySelector('#supplierImportForm');
    if (form) {
        form.addEventListener('submit', handleImportSuppliers);
    }
}

async function handleImportSuppliers(event) {
    event.preventDefault();

    const form = event.target;
    const fileInput = form.querySelector('#supplierCsvFile');
    if (!fileInput || !fileInput.files.length) {
        showInlineModalMessage('supplierImportMessage', 'Please select a CSV file to import.', 'error');
        return;
    }

    const file = fileInput.files[0];

    try {
        const text = await file.text();
        const response = await fetch(`${API_URL}/suppliers/import/csv`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/csv',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: text
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || 'Failed to import suppliers');
        }

        await fetchAllData();
        if (currentPage === 'suppliers') {
            loadSuppliers();
        }

        const results = data.results || {};
        if (Array.isArray(results.errors) && results.errors.length) {
            const sampleError = results.errors[0];
            showInlineModalMessage(
                'supplierImportMessage',
                `Import completed with ${results.errors.length} issue(s). First issue: ${sampleError}`,
                'warning'
            );
            return;
        }

        showToast(`Suppliers imported: created ${results.created || 0}, updated ${results.updated || 0}`, 'success');
        closeModal();
    } catch (error) {
        console.error(error);
        showInlineModalMessage('supplierImportMessage', error.message, 'error');
    }
}

function renderManagerReports() {
    renderReports(); // Same as admin reports
}

// ===== STAFF PAGES =====

function renderStaffOverview() {
    const content = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Today's Sales</span>
                    <div class="stat-icon success">💰</div>
                </div>
                <div class="stat-value" id="staffTodaySales">₹0.00</div>
                <div class="stat-trend" id="staffTodayTransactions">Loading...</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Units Sold Today</span>
                    <div class="stat-icon primary">📦</div>
                </div>
                <div class="stat-value" id="staffUnitsSold">0</div>
                <div class="stat-trend" id="staffUniqueProducts">—</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <span class="stat-label">Month-to-Date Sales</span>
                    <div class="stat-icon warning">📈</div>
                </div>
                <div class="stat-value" id="staffMonthSales">₹0.00</div>
                <div class="stat-trend" id="staffMonthTransactions">Loading...</div>
            </div>
        </div>
        
        <div style="margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div class="stat-card" onclick="navigateToPage('stock')" style="cursor: pointer;">
                <div style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">➕</div>
                    <h3>Add Stock</h3>
                </div>
            </div>
            <div class="stat-card" onclick="navigateToPage('sales')" style="cursor: pointer;">
                <div style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">💰</div>
                    <h3>Record Sale</h3>
                </div>
            </div>
            <div class="stat-card" onclick="navigateToPage('search')" style="cursor: pointer;">
                <div style="text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                    <h3>Search Product</h3>
                </div>
            </div>
        </div>

        <div class="data-table-wrapper" style="margin-top: 24px;">
            <div class="table-header">
                <h3 class="table-title">Recent Sales</h3>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Quantity</th>
                        <th>Total</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody id="staffRecentSales">
                    <tr><td colspan="5" style="text-align:center;">Loading recent sales...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    loadStaffOverviewMetrics();
}

async function loadStaffOverviewMetrics() {
    const salesValueEl = document.getElementById('staffTodaySales');
    if (!salesValueEl || !currentUser?.token) return;

    const transactionsEl = document.getElementById('staffTodayTransactions');
    const unitsSoldEl = document.getElementById('staffUnitsSold');
    const uniqueProductsEl = document.getElementById('staffUniqueProducts');
    const monthSalesEl = document.getElementById('staffMonthSales');
    const monthTransactionsEl = document.getElementById('staffMonthTransactions');
    const recentSalesBody = document.getElementById('staffRecentSales');

    if (transactionsEl) transactionsEl.textContent = 'Loading...';
    if (monthTransactionsEl) monthTransactionsEl.textContent = 'Loading...';
    if (recentSalesBody) {
        recentSalesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading recent sales...</td></tr>';
    }

    try {
        const response = await fetch(`${API_URL}/sales/summary/me`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload?.message || 'Unable to load sales data');
        }

        const today = payload.today || {};
        const month = payload.monthToDate || {};
        const recentSales = Array.isArray(payload.recentSales) ? payload.recentSales : [];

        salesValueEl.textContent = formatCurrency(today.totalAmount);
        if (transactionsEl) {
            const tx = today.transactions || 0;
            transactionsEl.textContent = tx
                ? `${tx} transaction${tx === 1 ? '' : 's'}`
                : 'No transactions yet';
        }

        if (unitsSoldEl) {
            unitsSoldEl.textContent = Number(today.totalQuantity || 0).toLocaleString('en-IN');
        }

        if (uniqueProductsEl) {
            const uniqueProducts = today.uniqueProducts || 0;
            uniqueProductsEl.textContent = uniqueProducts
                ? `${uniqueProducts} unique product${uniqueProducts === 1 ? '' : 's'}`
                : 'No products sold yet';
        }

        if (monthSalesEl) {
            monthSalesEl.textContent = formatCurrency(month.totalAmount);
        }

        if (monthTransactionsEl) {
            const monthTx = month.transactions || 0;
            monthTransactionsEl.textContent = monthTx
                ? `${monthTx} transaction${monthTx === 1 ? '' : 's'}`
                : 'No sales recorded this month';
        }

        if (recentSalesBody) {
            if (!recentSales.length) {
                recentSalesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No sales recorded yet</td></tr>';
            } else {
                recentSalesBody.innerHTML = recentSales.map((sale) => `
                    <tr>
                        <td>${escapeHtml(sale.itemName || '—')}</td>
                        <td>${escapeHtml(sale.category || '—')}</td>
                        <td>${Number(sale.quantity || 0).toLocaleString('en-IN')}</td>
                        <td>${formatCurrency(sale.totalAmount)}</td>
                        <td>${formatDateTime(sale.date)}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Failed to load staff sales overview:', error);
        if (transactionsEl) transactionsEl.textContent = 'Unable to load data';
        if (unitsSoldEl) unitsSoldEl.textContent = '0';
        if (uniqueProductsEl) uniqueProductsEl.textContent = '—';
        if (monthSalesEl) monthSalesEl.textContent = formatCurrency(0);
        if (monthTransactionsEl) monthTransactionsEl.textContent = 'Unable to load data';
        if (recentSalesBody) {
            recentSalesBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--danger);">${escapeHtml(error.message)}</td></tr>`;
        }
        showToast(error.message, 'error');
    }
}

function renderStockManagement() {
    const content = `
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">➕ Add / Update Stock</h3>
            </div>
            <div style="padding: 24px;">
                <form id="stockForm" style="max-width: 600px;">
                    <div class="form-group">
                        <label>Product Name</label>
                        <input type="text" id="stockProductName" placeholder="Enter product name" required>
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <input type="text" id="stockCategory" placeholder="Enter category" required>
                    </div>
                    <div class="form-group">
                        <label>Quantity</label>
                        <input type="number" id="stockQuantity" min="0" placeholder="Enter quantity" required>
                    </div>
                    <div class="form-group">
                        <label>Supplier</label>
                        <select id="stockSupplier">
                            <option value="">Select supplier</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Unit Price</label>
                        <input type="number" id="stockPrice" min="0" step="0.01" placeholder="Enter price" required>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button type="submit" class="btn btn-primary">✅ Submit</button>
                        <button type="reset" class="btn btn-secondary">🗑️ Clear</button>
                    </div>
                </form>
                <div id="stockMessage" class="message" style="margin-top: 16px;"></div>
            </div>
        </div>
    `;

    renderContent(content);
}

function renderSalesEntry() {
    // Redirect to professional billing page
    window.location.href = 'billing.html';
}

function renderProductSearch() {
    const content = `
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">🔍 Product Search</h3>
                <div class="table-filters">
                    <input type="text" id="productSearchInput" class="input-search" placeholder="Search name, SKU, supplier..." autocomplete="off">
                    <select id="productCategoryFilter" class="table-filter__select">
                        <option value="">All categories</option>
                    </select>
                </div>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Product Name</th>
                        <th>Category</th>
                        <th>Stock</th>
                        <th>Supplier</th>
                        <th>Price</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="searchResultsTable">
                    <tr><td colspan="6" style="text-align:center;">Enter search term...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    initializeProductSearch();
}

function initializeProductSearch() {
    const searchInput = document.getElementById('productSearchInput');
    const categorySelect = document.getElementById('productCategoryFilter');

    populateProductCategoryFilter();

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            searchProducts(event.target.value);
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            const term = searchInput ? searchInput.value : '';
            searchProducts(term);
        });
    }

    const initialTerm = searchInput?.value || '';
    const initialCategory = categorySelect?.value || '';
    if (initialTerm || initialCategory) {
        searchProducts(initialTerm);
    }
}

function populateProductCategoryFilter() {
    const categorySelect = document.getElementById('productCategoryFilter');
    if (!categorySelect) return;

    const categories = getUniqueCategories();
    const previousValue = categorySelect.value;

    const options = ['<option value="">All categories</option>']
        .concat(categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`))
        .join('');

    categorySelect.innerHTML = options;

    if (previousValue && categories.some(category => category.toLowerCase() === previousValue.toLowerCase())) {
        categorySelect.value = previousValue;
    }
}

function getUniqueCategories(list = items) {
    if (!Array.isArray(list)) return [];

    const categoryMap = new Map();
    list.forEach(item => {
        const rawCategory = (item.category || '').trim();
        if (!rawCategory) return;
        const key = rawCategory.toLowerCase();
        if (!categoryMap.has(key)) {
            categoryMap.set(key, rawCategory);
        }
    });

    return Array.from(categoryMap.values()).sort((a, b) => a.localeCompare(b));
}

// ===== HELPER FUNCTIONS =====

function renderContent(html) {
    document.getElementById('contentWrapper').innerHTML = html;
    // Re-initialize Lucide SVG icons for dynamically rendered content
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function handleLogout() {
    // Log the logout action before clearing credentials
    try {
        if (currentUser.token) {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentUser.token}`,
                    'Content-Type': 'application/json'
                }
            }).catch(err => console.error('Logout logging failed:', err));
        }
    } catch (err) {
        console.error('Error during logout:', err);
    }

    currentUser = { token: null, role: null, username: null };
    localStorage.clear();
    showLogin();
}

async function fetchAllData() {
    try {
        const headers = { 'Authorization': `Bearer ${currentUser.token}` };

        const requests = [
            fetch(`${API_URL}/items`, { headers }),
            fetch(`${API_URL}/suppliers`, { headers })
        ];

        if (currentUser.role === 'admin') {
            requests.push(fetch(`${API_URL}/users`, { headers }));
        }

        const [itemsRes, suppliersRes, usersRes] = await Promise.all(requests);

        if (itemsRes.ok) items = await itemsRes.json();
        if (suppliersRes.ok) suppliers = await suppliersRes.json();
        if (usersRes && usersRes.ok) {
            const data = await usersRes.json();
            users = Array.isArray(data)
                ? data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                : [];
        }

        updateOverviewStats();

        if (currentPage === 'notifications') {
            populateLowStockTable();
            if (['admin', 'manager'].includes(currentUser.role)) {
                loadNotificationFeed();
            }
        }

        if (currentPage === 'restock') {
            const searchValue = document.getElementById('restockSearch')?.value || '';
            populateRestockTable(searchValue);
            updateRestockSummary();
        }

        if (currentPage === 'reports') {
            const period = document.getElementById('salesSummaryPeriodSelect')?.value || 'monthly';
            loadSalesSummaryChart(period);
            renderInventoryBreakdownChart();
            renderInventoryCategoryCharts();
            renderStockRadarChart();
            renderInventoryScatterChart();
            renderInventoryBubbleChart();
            renderTopProductsChart();
            if (customReportChart) {
                await renderCustomAnalyticsChart();
            }
        }

        if (currentPage === 'suppliers') {
            loadSuppliers();
        }

        if (currentUser.role === 'staff' && currentPage === 'overview') {
            loadStaffOverviewMetrics();
        }

        if (currentPage === 'search') {
            populateProductCategoryFilter();
            const term = document.getElementById('productSearchInput')?.value || '';
            searchProducts(term);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function updateOverviewStats() {
    const totalProductsEl = document.getElementById('totalProducts');
    const totalSuppliersEl = document.getElementById('totalSuppliers');
    const totalUsersEl = document.getElementById('totalUsers');
    const lowStockEl = document.getElementById('lowStockCount');

    const suppliersForDisplay = getDisplaySuppliers();

    if (totalProductsEl) totalProductsEl.textContent = items.length;
    if (totalSuppliersEl) totalSuppliersEl.textContent = suppliersForDisplay.length;
    if (totalUsersEl) totalUsersEl.textContent = users.length;
    if (lowStockEl) {
        const lowStockItems = items.filter(item => item.lowStock);
        lowStockEl.textContent = lowStockItems.length;
        handleLowStockNotification(lowStockItems.length);
    }

    updateNotificationBadge();
}

function loadProducts(list = items) {
    const tbody = document.getElementById('productsTable');
    if (!tbody) return;

    const canEdit = ['admin', 'manager'].includes(currentUser.role);
    const canDelete = currentUser.role === 'admin';

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No products found</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(item => {
        const indexRef = items.indexOf(item);
        const buttonAttrs = [
            item && item._id ? `data-id="${item._id}"` : '',
            indexRef >= 0 ? `data-index="${indexRef}"` : ''
        ].filter(Boolean).join(' ');

        const actionButtons = [
            `<button class="btn btn-sm btn-secondary print-product-label" ${buttonAttrs}>🖨️ Print</button>`
        ];

        if (canEdit) {
            actionButtons.push(`<button class="btn btn-sm btn-secondary edit-product" data-id="${item._id}">Edit</button>`);
        }

        if (canDelete) {
            actionButtons.push(`<button class="btn btn-sm btn-danger delete-product" data-id="${item._id}">🗑️ Delete</button>`);
        }

        return `
            <tr>
                <td>${item.name || '—'}</td>
                <td>${item.category || '—'}</td>
                <td><span class="stock-pill ${item.lowStock ? 'low' : 'ok'}">${item.quantity ?? 0}</span></td>
                <td>${item.reorderLevel ?? 0}</td>
                <td>₹${Number(item.price ?? 0).toFixed(2)}</td>
                <td class="table-actions">${actionButtons.join(' ')}</td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.edit-product').forEach(btn => {
        btn.addEventListener('click', () => showEditProductModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-product').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });

    tbody.querySelectorAll('.print-product-label').forEach(btn => {
        btn.addEventListener('click', () => {
            const product = resolveProductForButton(btn, list);
            if (!product) {
                showToast('Product details not available right now', 'error');
                return;
            }
            showPrintLabelModal(product);
        });
    });
}

function loadSuppliers() {
    const tbody = document.getElementById('suppliersTable');
    if (!tbody) return;

    const data = getDisplaySuppliers();
    const canManage = ['admin', 'manager'].includes(currentUser.role);
    const canDelete = currentUser.role === 'admin';

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No suppliers found</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(supplier => {
        const hasId = Boolean(supplier._id);
        const productsLabel = Array.isArray(supplier.products)
            ? supplier.products.join(', ')
            : (supplier.products || '');
        const lastDeliverySource = supplier.lastDelivery || supplier.updatedAt || supplier.createdAt;
        const lastDeliveryLabel = lastDeliverySource
            ? escapeHtml(formatDateTime(lastDeliverySource))
            : '—';

        const actionButtons = [];
        if (hasId && canManage) {
            actionButtons.push(`<button class="btn btn-sm btn-secondary edit-supplier" data-id="${supplier._id}">Edit</button>`);
        }
        if (hasId && canDelete) {
            const encodedName = supplier.name ? encodeURIComponent(supplier.name) : '';
            actionButtons.push(`<button class="btn btn-sm btn-danger delete-supplier" data-id="${supplier._id}" data-name="${encodedName}">🗑️ Delete</button>`);
        }

        const actions = actionButtons.length
            ? actionButtons.join(' ')
            : '<span style="color: var(--text-light);">Demo supplier</span>';

        return `
            <tr>
                <td>${escapeHtml(supplier.name || '—')}</td>
                <td>${escapeHtml(supplier.contact || '—')}</td>
                <td>${escapeHtml(supplier.email || '—')}</td>
                <td>${escapeHtml(productsLabel || '—')}</td>
                <td>${lastDeliveryLabel}</td>
                <td class="table-actions">${actions}</td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.edit-supplier').forEach(button => {
        button.addEventListener('click', () => showEditSupplierModal(button.dataset.id));
    });

    tbody.querySelectorAll('.delete-supplier').forEach(button => {
        button.addEventListener('click', () => {
            let supplierName = '';
            try {
                supplierName = decodeURIComponent(button.dataset.name || '');
            } catch (error) {
                supplierName = button.dataset.name || '';
            }
            handleDeleteSupplier(button.dataset.id, supplierName);
        });
    });
}

async function loadRecentActivity(limit = 8) {
    const table = document.getElementById('activityTable');
    if (!table || !['admin', 'manager'].includes(currentUser.role)) return;

    try {
        const response = await fetch(`${API_URL}/logs/recent?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        if (response.status === 403) {
            table.innerHTML = '<tr><td colspan="3" style="text-align:center;">Access denied</td></tr>';
            return;
        }

        const data = await response.json().catch(() => []);

        if (!response.ok) {
            throw new Error(data.message || 'Unable to load activity logs');
        }

        activityLogs = Array.isArray(data) ? data : [];

        if (activityLogs.length === 0) {
            table.innerHTML = '<tr><td colspan="3" style="text-align:center;">No recent activity</td></tr>';
            return;
        }

        table.innerHTML = activityLogs.map(log => {
            const user = log.username || log.userId?.username || 'System';
            const time = formatDateTime(log.createdAt);
            return `
                <tr>
                    <td>${log.description || log.action}</td>
                    <td>${user}</td>
                    <td>${time}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error(error);
        table.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--danger);">${error.message}</td></tr>`;
    }
}

async function loadActiveStaff() {
    const table = document.getElementById('activeStaffTable');
    const countEl = document.getElementById('activeStaffCount');
    if (!table || !['admin', 'manager'].includes(currentUser.role)) return;

    // Clear any existing interval
    if (activeStaffInterval) {
        clearInterval(activeStaffInterval);
        activeStaffInterval = null;
    }

    // Function to fetch and update active staff data
    const fetchActiveStaffData = async () => {
        try {
            // Fetch recent login/logout activities from today using AJAX
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const response = await fetch(`${API_URL}/logs?startDate=${today.toISOString()}&limit=1000`, {
                headers: {
                    'Authorization': `Bearer ${currentUser.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Unable to load active staff');
            }

            const data = await response.json();
            const allLogs = data.logs || data || [];

            // Filter login and logout actions
            const loginLogoutLogs = allLogs.filter(log =>
                log.action === 'login' || log.action === 'logout'
            );

            // Process logs to find active sessions (login without logout)
            const activeStaff = new Map();
            const userSessions = new Map();

            // Group logs by user
            loginLogoutLogs.forEach(log => {
                const userId = log.userId?._id || log.userId;
                if (!userId) return;

                if (!userSessions.has(userId)) {
                    userSessions.set(userId, {
                        username: log.username || log.userId?.username || 'Unknown',
                        role: log.userId?.role || 'staff',
                        logs: []
                    });
                }
                userSessions.get(userId).logs.push(log);
            });

            // Check each user's session status
            userSessions.forEach((session, userId) => {
                // Sort logs by time (newest first)
                session.logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                // Check the most recent action
                const mostRecent = session.logs[0];

                if (mostRecent.action === 'login') {
                    // User's last action was login, so they're still active
                    const loginTime = new Date(mostRecent.createdAt);
                    const now = new Date();
                    const hoursWorked = (now - loginTime) / (1000 * 60 * 60);

                    activeStaff.set(userId, {
                        username: session.username,
                        loginTime: loginTime,
                        hoursWorked: hoursWorked,
                        role: session.role
                    });
                }
            });

            // Update count
            if (countEl) {
                countEl.textContent = `${activeStaff.size} online`;
            }

            // Render table
            if (activeStaff.size === 0) {
                table.innerHTML = '<tr><td colspan="4" style="text-align:center;">No staff currently active</td></tr>';
                return;
            }

            // Convert to array and sort by login time (most recent first)
            const activeStaffArray = Array.from(activeStaff.values()).sort((a, b) =>
                b.loginTime - a.loginTime
            );

            table.innerHTML = activeStaffArray.map(staff => {
                const hours = Math.floor(staff.hoursWorked);
                const minutes = Math.floor((staff.hoursWorked - hours) * 60);
                const timeWorked = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

                const statusClass = staff.hoursWorked >= 8 ? 'status-success' :
                    staff.hoursWorked >= 4 ? 'status-warning' :
                        'status-info';

                return `
                    <tr>
                        <td>
                            <strong>${staff.username}</strong>
                            <br><small style="color:#6b7280;">${staff.role}</small>
                        </td>
                        <td>${staff.loginTime.toLocaleTimeString()}</td>
                        <td><strong>${timeWorked}</strong></td>
                        <td><span class="status-badge ${statusClass}">Active</span></td>
                    </tr>
                `;
            }).join('');

        } catch (error) {
            console.error(error);
            table.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--danger);">${error.message}</td></tr>`;
            if (countEl) {
                countEl.textContent = '0 online';
            }
        }
    };

    // Initial fetch
    await fetchActiveStaffData();

    // Set up AJAX polling - update every 3 seconds for real-time updates
    activeStaffInterval = setInterval(() => {
        if (currentPage === 'overview' && ['admin', 'manager'].includes(currentUser.role)) {
            fetchActiveStaffData();
        } else {
            // Stop polling if user navigated away
            clearInterval(activeStaffInterval);
            activeStaffInterval = null;
        }
    }, 3000); // 3 seconds for real-time updates
}

function searchProducts(query) {
    const tbody = document.getElementById('searchResultsTable');
    if (!tbody) return;

    const term = (query || '').trim().toLowerCase();
    const categorySelect = document.getElementById('productCategoryFilter');
    const selectedCategory = (categorySelect?.value || '').trim();
    const normalizedCategory = selectedCategory.toLowerCase();

    if (!Array.isArray(items) || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Inventory data is still loading. Try again in a moment.</td></tr>';
        return;
    }

    const filtered = items.filter(item => {
        const name = (item.name || '').toLowerCase();
        const category = (item.category || '').toLowerCase();
        const sku = (item.sku || '').toLowerCase();
        const supplierName = getSupplierName(item).toLowerCase();
        const matchesTerm = term
            ? (name.includes(term) || category.includes(term) || sku.includes(term) || supplierName.includes(term))
            : true;
        const matchesCategory = normalizedCategory
            ? category === normalizedCategory
            : true;
        return matchesTerm && matchesCategory;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No results found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const supplierName = resolveSupplierName(item);
        const price = Number(item.price ?? 0).toFixed(2);
        const indexRef = items.indexOf(item);
        const dataAttrs = [
            indexRef >= 0 ? `data-index="${indexRef}"` : ''
        ];

        if (item._id) {
            dataAttrs.push(`data-id="${item._id}"`);
        }

        const attrString = dataAttrs.filter(Boolean).join(' ');

        const disableDetails = indexRef < 0 && !item._id;

        return `
            <tr>
                <td>${escapeHtml(item.name || '—')}</td>
                <td>${escapeHtml(item.category || '—')}</td>
                <td>${escapeHtml(String(item.quantity ?? 0))}</td>
                <td>${escapeHtml(supplierName)}</td>
                <td>₹${escapeHtml(price)}</td>
                <td class="table-actions">
                    ${disableDetails
                ? '<span style="color: var(--text-light);">Unavailable</span>'
                : `
                        <button class="btn btn-sm btn-primary view-product-detail" ${attrString}>👁️ View</button>
                        <button class="btn btn-sm btn-secondary print-product-label" ${attrString}>🖨️ Print</button>
                    `}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.view-product-detail').forEach(button => {
        button.addEventListener('click', () => {
            const productId = button.dataset.id;
            let product = productId ? items.find(item => item._id === productId) : null;

            if (!product) {
                const rawIndex = button.dataset.index;
                const parsedIndex = rawIndex !== undefined ? Number(rawIndex) : NaN;
                if (!Number.isNaN(parsedIndex)) {
                    product = items[parsedIndex];
                }
            }

            if (!product) {
                showToast('Product details not available right now', 'error');
                return;
            }

            showProductDetailsModal(product);
        });
    });

    tbody.querySelectorAll('.print-product-label').forEach(button => {
        button.addEventListener('click', () => {
            const product = resolveProductForButton(button, filtered);
            if (!product) {
                showToast('Product details not available right now', 'error');
                return;
            }
            showPrintLabelModal(product);
        });
    });
}

function showProductDetailsModal(product) {
    if (!product) {
        showToast('Product data is unavailable', 'error');
        return;
    }

    const quantity = Number(product.quantity ?? 0);
    const reorderLevel = Number(product.reorderLevel ?? 0);
    const isLowStock = product.lowStock ?? (reorderLevel > 0 && quantity <= reorderLevel);
    const supplierName = resolveSupplierName(product);
    const price = Number(product.price ?? 0).toFixed(2);
    const expiry = formatDateOnly(product.expiryDate);
    const timestampSource = product.updatedAt || product.createdAt;
    const lastUpdated = timestampSource ? formatDateTime(timestampSource) : '';

    const details = [
        { label: 'Product Name', value: product.name || '—' },
        { label: 'Category', value: product.category || '—' },
        { label: 'Supplier', value: supplierName },
        { label: 'Quantity In Stock', value: `${quantity}` },
        { label: 'Reorder Level', value: `${reorderLevel}` },
        { label: 'Unit Price', value: `₹${price}` },
        { label: 'SKU', value: product.sku || '—' },
        { label: 'Expiry Date', value: expiry }
    ];

    const detailMarkup = details.map(detail => `
        <div class="modal-details__item">
            <span class="modal-details__label">${escapeHtml(detail.label)}</span>
            <span class="modal-details__value">${escapeHtml(detail.value)}</span>
        </div>
    `).join('');

    const statusHtml = `
        <div class="modal-details__status ${isLowStock ? 'low' : 'ok'}">
            ${isLowStock ? '⚠️ Low stock alert' : '✅ Stock levels healthy'}
        </div>
    `;

    const descriptionHtml = product.description
        ? `<div class="modal-details__note"><strong>Notes</strong><p>${escapeHtml(product.description).replace(/\n/g, '<br>')}</p></div>`
        : '';

    const metaParts = [
        lastUpdated ? `Last updated: ${lastUpdated}` : null,
        product._id ? `Item ID: ${product._id}` : null,
        product.barcode ? `Barcode: ${product.barcode}` : null
    ].filter(Boolean).map(entry => `<span>${escapeHtml(entry)}</span>`).join('');

    const metaHtml = metaParts
        ? `<div class="modal-details__meta">${metaParts}</div>`
        : '';

    const modal = openModal('Product Details', `
        ${statusHtml}
        <div class="modal-details">
            ${detailMarkup}
        </div>
        ${descriptionHtml}
        ${metaHtml}
        <div class="modal-details__actions">
            <button type="button" class="btn btn-primary" id="printLabelFromDetails">🖨️ Print Label</button>
        </div>
    `);

    const printButton = modal?.querySelector('#printLabelFromDetails');
    if (printButton) {
        printButton.addEventListener('click', () => {
            closeModal();
            showPrintLabelModal(product);
        });
    }
}

function resolveProductForButton(button, fallbackList = items) {
    if (!button) return null;

    const { id, index } = button.dataset || {};

    if (id) {
        const byId = items.find(entry => entry._id === id)
            || (Array.isArray(fallbackList) ? fallbackList.find(entry => entry._id === id) : null);
        if (byId) return byId;
    }

    if (index !== undefined) {
        const parsed = Number.parseInt(index, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
            if (items[parsed]) return items[parsed];
            if (Array.isArray(fallbackList) && fallbackList[parsed]) return fallbackList[parsed];
        }
    }

    return null;
}

function showPrintLabelModal(product) {
    if (!product) {
        showToast('Product details are not available right now', 'error');
        return;
    }

    const defaultType = product.barcode || product.sku ? 'barcode' : 'qr';
    const hasPrice = Number.isFinite(Number(product.price));
    const hasSku = Boolean(product.barcode || product.sku);
    const supplierName = resolveSupplierName(product, '').trim();
    const hasSupplier = supplierName.length > 0;
    const hasExpiry = Boolean(product.expiryDate);

    const sizeOptions = Object.entries(LABEL_SIZE_PRESETS)
        .map(([key, entry]) => `<option value="${key}">${escapeHtml(entry.label)}</option>`)
        .join('');

    const modal = openModal(
        'Print Product Label',
        `
        <div class="label-modal">
            <form id="printLabelForm" class="modal-form label-modal__form">
                <div class="label-modal__grid">
                    <div class="form-group">
                        <label for="labelTypeSelect">Label Type</label>
                        <select id="labelTypeSelect" name="labelType">
                            <option value="barcode" ${defaultType === 'barcode' ? 'selected' : ''}>Barcode</option>
                            <option value="qr" ${defaultType === 'qr' ? 'selected' : ''}>QR Code</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="labelSizeSelect">Label Size</label>
                        <select id="labelSizeSelect" name="labelSize">${sizeOptions}</select>
                    </div>
                    <div class="form-group">
                        <label for="labelCopies">Copies</label>
                        <input type="number" id="labelCopies" name="labelCopies" min="1" max="${MAX_LABEL_COPIES}" value="1">
                        <p class="modal-hint">Max ${MAX_LABEL_COPIES} copies per print</p>
                    </div>
                </div>
                <div class="label-modal__options">
                    <label class="checkbox">
                        <input type="checkbox" id="labelIncludeName" name="includeName" checked>
                        <span>Include product name</span>
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" id="labelIncludePrice" name="includePrice" ${hasPrice ? 'checked' : ''}>
                        <span>Include price</span>
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" id="labelIncludeSku" name="includeSku" ${hasSku ? 'checked' : ''}>
                        <span>Include SKU / code</span>
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" id="labelIncludeSupplier" name="includeSupplier" ${hasSupplier ? 'checked' : ''}>
                        <span>Include supplier</span>
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" id="labelIncludeExpiry" name="includeExpiry" ${hasExpiry ? 'checked' : ''}>
                        <span>Include expiry date</span>
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" id="labelShowCodeValue" name="showCodeValue" ${defaultType === 'barcode' ? 'checked' : ''}>
                        <span>Show code text below symbol</span>
                    </label>
                </div>
                <div class="form-group">
                    <label for="labelCustomNote">Custom note (optional)</label>
                    <input type="text" id="labelCustomNote" name="customNote" maxlength="60" placeholder="e.g. Rack A3 / Store 12">
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Print Labels</button>
                </div>
                <div id="printLabelMessage" class="message" style="display:none; margin-top:16px;"></div>
            </form>
            <div class="label-preview-panel">
                <h4 class="label-preview-title">Preview</h4>
                <div id="labelPreviewArea" class="label-preview-area">
                    <div class="label-preview-placeholder">Preview updates as you adjust settings</div>
                </div>
            </div>
        </div>
        `
    );

    if (!modal) return;

    const form = modal.querySelector('#printLabelForm');
    const previewArea = modal.querySelector('#labelPreviewArea');
    const messageEl = modal.querySelector('#printLabelMessage');
    const typeSelect = modal.querySelector('#labelTypeSelect');
    const sizeSelect = modal.querySelector('#labelSizeSelect');
    const showCodeCheckbox = modal.querySelector('#labelShowCodeValue');

    if (sizeSelect) {
        const defaultSizeKey = LABEL_SIZE_PRESETS.medium ? 'medium' : Object.keys(LABEL_SIZE_PRESETS)[0];
        sizeSelect.value = defaultSizeKey;
    }

    const clearMessage = () => {
        if (!messageEl) return;
        messageEl.style.display = 'none';
        messageEl.textContent = '';
    };

    const showMessageInline = (text, type = 'error') => {
        if (!messageEl) return;
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
    };

    let renderToken = 0;

    const refreshShowCodeState = () => {
        if (!showCodeCheckbox || !typeSelect) return;
        const isBarcode = typeSelect.value === 'barcode';
        showCodeCheckbox.disabled = !isBarcode;
        if (!isBarcode) {
            showCodeCheckbox.checked = false;
        }
    };

    const renderPreview = async () => {
        if (!form || !previewArea) return;
        const token = ++renderToken;
        clearMessage();
        previewArea.innerHTML = '<div class="label-preview-placeholder">Generating preview...</div>';

        try {
            const config = getLabelFormConfig(form);
            const labelNode = await createLabelElement(product, config);
            if (renderToken !== token) {
                return;
            }
            previewArea.innerHTML = '';
            previewArea.appendChild(labelNode);
        } catch (error) {
            console.error('Label preview failed:', error);
            if (renderToken !== token) {
                return;
            }
            previewArea.innerHTML = `<div class="label-preview-error">${escapeHtml(error.message || 'Unable to render preview')}</div>`;
            showMessageInline(error.message || 'Unable to render preview');
        }
    };

    if (form) {
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(input => {
            const handler = () => {
                if (input.name === 'labelCopies') {
                    const sanitized = sanitizeLabelCopies(input.value);
                    input.value = sanitized;
                }
                refreshShowCodeState();
                renderPreview();
            };

            input.addEventListener('change', handler);
            if (input.tagName.toLowerCase() === 'input') {
                input.addEventListener('input', handler);
            }
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearMessage();

            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.dataset.originalText = submitButton.textContent;
                submitButton.textContent = 'Preparing...';
            }

            try {
                const config = getLabelFormConfig(form);
                const size = config?.size || LABEL_SIZE_PRESETS.medium || Object.values(LABEL_SIZE_PRESETS)[0];
                const widthPx = Math.round(((size?.width) || 70) * MM_TO_PX);
                const heightPx = Math.round(((size?.height) || 40) * MM_TO_PX);

                // Generate label element
                const labelNode = await createLabelElement(product, config);
                const labelMarkup = prepareLabelMarkupForPrint(labelNode);

                // Get copies count (ensure it's exactly what user specified)
                const copies = config.copies || 1;

                // Generate exact number of label copies
                let markup = '';
                for (let i = 0; i < copies; i++) {
                    markup += labelMarkup;
                }

                // Create inline print overlay
                const printOverlay = document.createElement('div');
                printOverlay.id = 'printLabelOverlay';
                printOverlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: #ffffff;
                    z-index: 999999;
                    overflow: auto;
                `;

                const printStyles = `
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    #printLabelOverlay {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
                    }
                    #printLabelOverlay .print-label-shell {
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        background: #f8f9fa;
                    }
                    #printLabelOverlay .print-label-sheet {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 20px;
                        padding: 32px;
                        box-sizing: border-box;
                        width: 100%;
                        justify-content: center;
                        align-items: center;
                    }
                    #printLabelOverlay .print-label {
                        background: #ffffff;
                        border: 1px solid #e5e7eb;
                        border-radius: 4px;
                        padding: 16px;
                        box-sizing: border-box;
                        width: ${widthPx}px;
                        height: ${heightPx}px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    }
                    #printLabelOverlay .label-preview-text {
                        text-align: center;
                    }
                    #printLabelOverlay .label-preview-name {
                        font-weight: 600;
                        font-size: 13px;
                        color: #111827;
                        letter-spacing: -0.01em;
                        margin-bottom: 6px;
                        line-height: 1.3;
                    }
                    #printLabelOverlay .label-preview-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        justify-content: center;
                    }
                    #printLabelOverlay .label-preview-chip {
                        background: #f3f4f6;
                        border: 1px solid #e5e7eb;
                        border-radius: 3px;
                        padding: 3px 8px;
                        font-size: 10px;
                        font-weight: 500;
                        color: #374151;
                        letter-spacing: 0.02em;
                    }
                    #printLabelOverlay .label-preview-code {
                        display: inline-flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 0;
                        background: #fafafa;
                        border-radius: 3px;
                        padding: 8px;
                        align-self: center;
                    }
                    #printLabelOverlay .label-preview-code--barcode {
                        padding: 6px 10px;
                    }
                    #printLabelOverlay .label-preview-code--qr {
                        padding: 10px;
                    }
                    #printLabelOverlay .label-preview-code img,
                    #printLabelOverlay .label-preview-code canvas {
                        max-width: 100%;
                        height: auto;
                        display: block;
                    }
                    #printLabelOverlay .label-preview-code--barcode img,
                    #printLabelOverlay .label-preview-code--barcode canvas {
                        object-fit: contain;
                    }
                    #printLabelOverlay .label-preview-code--qr img,
                    #printLabelOverlay .label-preview-code--qr canvas {
                        max-width: 85%;
                        max-height: 85%;
                        object-fit: contain;
                    }
                    #printLabelOverlay .label-preview-info {
                        font-size: 9px;
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                        color: #6b7280;
                        text-align: center;
                        line-height: 1.4;
                    }
                    #printLabelOverlay .label-preview-info span {
                        font-weight: 400;
                    }
                    #printLabelOverlay .label-preview-code-caption {
                        margin-top: 6px;
                        font-size: 9px;
                        color: #6b7280;
                        font-weight: 500;
                        letter-spacing: 0.03em;
                    }
                    @media print {
                        #printLabelOverlay .print-label-shell {
                            background: #ffffff;
                        }
                        #printLabelOverlay .print-label-sheet {
                            gap: 8px;
                            padding: 8px;
                        }
                    }
                `;

                // Inject styles
                let styleEl = document.getElementById('printLabelOverlayStyles');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'printLabelOverlayStyles';
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = printStyles;

                printOverlay.innerHTML = `
                    <div class="print-label-shell">
                        <div class="print-label-sheet">${markup}</div>
                    </div>
                `;

                document.body.appendChild(printOverlay);

                // Close modal
                if (typeof closeAllModals === 'function') {
                    closeAllModals();
                }

                // Trigger print after a short delay
                setTimeout(() => {
                    try {
                        window.print();
                    } catch (printError) {
                        console.error('Print dialog failed:', printError);
                        alert('Unable to open the print dialog. Please try again.');
                    } finally {
                        // Clean up overlay after print dialog closes
                        const cleanup = () => {
                            if (printOverlay && printOverlay.parentNode) {
                                printOverlay.parentNode.removeChild(printOverlay);
                            }
                        };

                        // Try to detect when print dialog closes
                        if (window.matchMedia) {
                            const mediaQueryList = window.matchMedia('print');
                            mediaQueryList.addListener(function (mql) {
                                if (!mql.matches) {
                                    cleanup();
                                }
                            });
                        }

                        // Fallback cleanup after delay
                        setTimeout(cleanup, 1000);

                        // Also listen for afterprint event
                        window.addEventListener('afterprint', cleanup, { once: true });
                    }
                }, 250);
            } catch (error) {
                console.error('Print preparation failed:', error);
                showMessageInline(error.message || 'Unable to prepare labels for printing', 'error');
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = submitButton.dataset.originalText || 'Print Labels';
                }
            }
        });
    }

    refreshShowCodeState();
    renderPreview();
}

function sanitizeLabelCopies(value) {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return '1';
    }
    if (numeric > MAX_LABEL_COPIES) {
        return String(MAX_LABEL_COPIES);
    }
    return String(numeric);
}

function getLabelFormConfig(form) {
    const formData = new FormData(form);

    const rawType = (formData.get('labelType') || '').toString();
    const labelType = rawType === 'qr' ? 'qr' : 'barcode';

    let sizeKey = (formData.get('labelSize') || '').toString();
    if (!Object.prototype.hasOwnProperty.call(LABEL_SIZE_PRESETS, sizeKey)) {
        sizeKey = 'medium';
    }

    const size = LABEL_SIZE_PRESETS[sizeKey] || LABEL_SIZE_PRESETS.medium || Object.values(LABEL_SIZE_PRESETS)[0];
    if (!size) {
        throw new Error('Label sizes are not configured.');
    }

    const copiesValue = sanitizeLabelCopies(formData.get('labelCopies'));
    const copies = Number.parseInt(copiesValue, 10) || 1;

    return {
        labelType,
        sizeKey,
        size,
        copies,
        includeName: formData.has('includeName'),
        includePrice: formData.has('includePrice'),
        includeSku: formData.has('includeSku'),
        includeSupplier: formData.has('includeSupplier'),
        includeExpiry: formData.has('includeExpiry'),
        showCodeValue: labelType === 'barcode' && formData.has('showCodeValue'),
        customNote: (formData.get('customNote') || '').toString().trim()
    };
}

async function createLabelElement(product, config) {
    if (!product) {
        throw new Error('Product data unavailable.');
    }

    const size = config.size || LABEL_SIZE_PRESETS.medium || Object.values(LABEL_SIZE_PRESETS)[0];
    if (!size) {
        throw new Error('Label size is not defined.');
    }

    const widthPx = Math.round(size.width * MM_TO_PX);
    const heightPx = Math.round(size.height * MM_TO_PX);
    const fontScale = size.fontScale || 1;

    const labelRoot = document.createElement('div');
    labelRoot.className = 'label-preview-item print-label';
    labelRoot.style.width = `${widthPx}px`;
    labelRoot.style.height = `${heightPx}px`;
    labelRoot.style.fontSize = `${Math.round(12 * fontScale)}px`;
    labelRoot.dataset.sizeKey = config.sizeKey || '';
    labelRoot.dataset.labelType = config.labelType;

    const nameSection = document.createElement('div');
    nameSection.className = 'label-preview-text';
    if (config.includeName) {
        const nameEl = document.createElement('div');
        nameEl.className = 'label-preview-name';
        nameEl.textContent = product.name || 'Unnamed Product';
        nameSection.appendChild(nameEl);
    }

    const chipContainer = document.createElement('div');
    chipContainer.className = 'label-preview-chips';

    if (config.includePrice && Number.isFinite(Number(product.price))) {
        const priceChip = document.createElement('span');
        priceChip.className = 'label-preview-chip';
        priceChip.textContent = formatCurrency(product.price);
        chipContainer.appendChild(priceChip);
    }

    const codeValue = resolveProductCodeValue(product);
    if (config.includeSku && codeValue) {
        const skuChip = document.createElement('span');
        skuChip.className = 'label-preview-chip';
        skuChip.textContent = codeValue;
        chipContainer.appendChild(skuChip);
    }

    if (chipContainer.children.length > 0) {
        nameSection.appendChild(chipContainer);
    }

    if (nameSection.children.length > 0) {
        labelRoot.appendChild(nameSection);
    }

    const codeWrapper = document.createElement('div');
    codeWrapper.className = `label-preview-code label-preview-code--${config.labelType}`;
    const codeCanvas = document.createElement('canvas');
    codeCanvas.className = 'label-preview-canvas';
    codeWrapper.appendChild(codeCanvas);
    labelRoot.appendChild(codeWrapper);

    const infoEntries = [];
    if (config.includeSupplier) {
        const supplier = resolveSupplierName(product, '').trim();
        if (supplier) {
            infoEntries.push(`Supplier: ${supplier}`);
        }
    }

    if (config.includeExpiry && product.expiryDate) {
        infoEntries.push(`Expiry: ${formatDateOnly(product.expiryDate)}`);
    }

    if (config.customNote) {
        infoEntries.push(config.customNote);
    }

    if (infoEntries.length > 0) {
        const infoBlock = document.createElement('div');
        infoBlock.className = 'label-preview-info';
        infoEntries.forEach(entry => {
            const span = document.createElement('span');
            span.textContent = entry;
            infoBlock.appendChild(span);
        });
        labelRoot.appendChild(infoBlock);
    }

    if (config.labelType === 'barcode') {
        await renderProductBarcode(codeCanvas, codeValue, config, size);
    } else {
        await renderProductQrCode(codeCanvas, product, config, size);
    }

    return labelRoot;
}

function resolveProductCodeValue(product) {
    if (!product) return '';
    if (product.barcode) return String(product.barcode).trim();
    if (product.sku) return String(product.sku).trim();
    if (product._id) return String(product._id).trim();
    return '';
}

async function renderProductBarcode(canvas, value, config, size) {
    if (!value) {
        throw new Error('No barcode or SKU is available for this product.');
    }

    if (typeof JsBarcode !== 'function') {
        throw new Error('Barcode library failed to load. Refresh the page and try again.');
    }

    // Calculate optimal dimensions for minimal professional barcode
    const availableWidth = Math.round(size.width * MM_TO_PX) - 32;
    const targetHeight = Math.max(35, Math.round((size.barcodeHeight || size.height * 0.45) * MM_TO_PX));

    canvas.width = Math.max(160, availableWidth);
    canvas.height = targetHeight;

    try {
        JsBarcode(canvas, value, {
            format: 'CODE128',
            displayValue: !!config.showCodeValue,
            fontSize: Math.round(9 * (size.fontScale || 1)),
            fontOptions: '500',
            lineColor: '#000000',
            background: '#00000000',
            margin: 2,
            height: Math.max(28, targetHeight - 16),
            width: 2,
            textMargin: 3
        });
    } catch (error) {
        console.error('Barcode rendering failed:', error);
        throw new Error('Unable to generate barcode for this product.');
    }
}

async function renderProductQrCode(canvas, product, config, size) {
    if (!window.QRCode || typeof window.QRCode.toCanvas !== 'function') {
        throw new Error('QR code library failed to load. Refresh the page and try again.');
    }

    const payload = buildQrPayload(product);
    if (!payload) {
        throw new Error('Unable to derive QR code data for this product.');
    }

    // Calculate optimal QR code size - make it fill available space better
    const availableWidth = Math.round(size.width * MM_TO_PX) - 32;
    const availableHeight = Math.round(size.height * MM_TO_PX) - 32;
    const targetSize = Math.min(
        Math.max(140, availableWidth),
        Math.max(140, availableHeight)
    );

    canvas.width = targetSize;
    canvas.height = targetSize;

    await new Promise((resolve, reject) => {
        window.QRCode.toCanvas(canvas, payload, {
            width: targetSize,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: {
                dark: '#000000',
                light: '#00000000'
            }
        }, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    }).catch(error => {
        console.error('QR code rendering failed:', error);
        throw new Error('Unable to generate QR code for this product.');
    });

    if (canvas?.parentElement) {
        canvas.parentElement.dataset.shareUrl = payload;
    }

    if (config.showCodeValue && resolveProductCodeValue(product)) {
        const codeWrapper = canvas.parentElement;
        if (codeWrapper) {
            let caption = codeWrapper.querySelector('.label-preview-code-caption');
            if (!caption) {
                caption = document.createElement('div');
                caption.className = 'label-preview-code-caption';
                codeWrapper.appendChild(caption);
            }
            caption.textContent = resolveProductCodeValue(product);
        }
    }
}

function buildQrPayload(product) {
    const shareUrl = buildProductShareUrl(product);
    if (shareUrl) {
        return shareUrl;
    }

    if (!product) return '';

    const fallbackPayload = {
        id: product._id || undefined,
        name: product.name || undefined,
        sku: product.sku || product.barcode || undefined,
        price: Number.isFinite(Number(product.price)) ? Number(product.price) : undefined,
        quantity: Number.isFinite(Number(product.quantity)) ? Number(product.quantity) : undefined,
        updatedAt: product.updatedAt || product.createdAt || undefined
    };

    return JSON.stringify(
        fallbackPayload,
        (key, value) => (value === undefined || value === null || value === '' ? undefined : value)
    );
}

function buildProductShareUrl(product) {
    if (!product || !product._id) {
        return '';
    }

    if (!PUBLIC_APP_BASE_URL) {
        return '';
    }

    const slug = slugifyProductName(product.name || product.sku || '');
    const query = new URLSearchParams({ id: product._id });
    if (slug) {
        query.set('slug', slug);
    }

    return `${PUBLIC_APP_BASE_URL}/product.html?${query.toString()}`;
}

function slugifyProductName(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }

    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function prepareLabelMarkupForPrint(labelNode) {
    if (!labelNode) {
        return '';
    }

    const sourceCanvases = labelNode.querySelectorAll('canvas');
    const dataUrls = Array.from(sourceCanvases).map(canvas => {
        try {
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.warn('Failed to capture canvas for printing:', error);
            return null;
        }
    });

    const clone = labelNode.cloneNode(true);
    const cloneCanvases = clone.querySelectorAll('canvas');

    cloneCanvases.forEach((canvas, index) => {
        const dataUrl = dataUrls[index];
        if (!dataUrl) return;
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'Label code';
        img.className = canvas.className || '';
        img.style.cssText = canvas.getAttribute('style') || '';
        canvas.replaceWith(img);
    });

    clone.classList.add('print-label');

    return clone.outerHTML;
}

function openPrintWindowShell(config) {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!printWindow) {
        return null;
    }

    const size = config?.size || LABEL_SIZE_PRESETS.medium || Object.values(LABEL_SIZE_PRESETS)[0];
    const widthPx = Math.round(((size?.width) || 70) * MM_TO_PX);
    const heightPx = Math.round(((size?.height) || 40) * MM_TO_PX);

    const printStyles = `
        body { margin: 0; font-family: 'Inter', sans-serif; background: #f5f5f5; }
        .print-label-shell { min-height: 100vh; display: flex; justify-content: center; }
        .print-label-sheet { display: flex; flex-wrap: wrap; gap: 16px; padding: 24px; box-sizing: border-box; width: 100%; justify-content: center; }
        .print-label { background: #ffffff; border: 1px solid #cccccc; border-radius: 8px; padding: 12px; box-sizing: border-box; width: ${widthPx}px; height: ${heightPx}px; display: flex; flex-direction: column; justify-content: space-between; }
        .print-label-placeholder { font-size: 14px; color: #64748b; padding: 24px; text-align: center; }
        .label-preview-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .label-preview-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
        .label-preview-chip { background: #1f293733; border-radius: 4px; padding: 2px 6px; font-size: 11px; }
        .label-preview-code { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; }
        .label-preview-code img { max-width: 100%; height: auto; }
        .label-preview-info { font-size: 11px; display: grid; gap: 2px; margin-top: 8px; }
        .label-preview-code-caption { margin-top: 4px; font-size: 11px; }
        @media print {
            body { background: #ffffff; }
            .print-label-sheet { gap: 12px; padding: 12px; }
        }
    `;

    const doc = printWindow.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><title>Print Labels</title>');
    doc.write(`<style>${printStyles}</style>`);
    doc.write('</head><body>');
    doc.write('<div class="print-label-shell"><div id="printLabelSheet" class="print-label-sheet"><div class="print-label-placeholder">Preparing labels...</div></div></div>');
    doc.write('</body></html>');
    doc.close();

    return printWindow;
}

function renderLabelsInPrintWindow(printWindow, labelMarkup, config) {
    if (!printWindow || !printWindow.document) {
        return false;
    }

    const doc = printWindow.document;
    const sheet = doc.getElementById('printLabelSheet');
    if (!sheet) {
        return false;
    }

    const copies = Math.max(1, Number.parseInt(config.copies, 10) || 1);
    const markup = Array.from({ length: copies }, () => labelMarkup).join('');
    sheet.innerHTML = markup;
    return true;
}

function schedulePrintWindowPrint(printWindow, onError) {
    if (!printWindow) return;

    setTimeout(() => {
        try {
            printWindow.focus();
            printWindow.print();
        } catch (error) {
            console.error('Print dialog failed:', error);
            if (typeof onError === 'function') {
                onError('Unable to open the print dialog automatically. Use the browser print option.', 'warning');
            }
        }
    }, 250);
}

function getSupplierName(product) {
    if (!product) return '';

    if (product.supplierName) {
        return product.supplierName;
    }

    const supplierFromId = product.supplierId;
    if (supplierFromId && typeof supplierFromId === 'object' && supplierFromId !== null) {
        return supplierFromId.name || supplierFromId.company || '';
    }

    if (product.supplier && typeof product.supplier === 'object' && product.supplier !== null) {
        return product.supplier.name || product.supplier.company || '';
    }

    return '';
}

function resolveSupplierName(product, fallback = '—') {
    const name = getSupplierName(product);
    if (name && name.trim().length) {
        return name;
    }
    return fallback;
}

function formatDateOnly(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString();
    } catch (error) {
        return '—';
    }
}

function loadNotificationPreferences() {
    try {
        const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                lowStock: parsed.lowStock !== undefined ? parsed.lowStock : true,
                sales: parsed.sales !== undefined ? parsed.sales : true
            };
        }
    } catch (error) {
        console.warn('Failed to load notification settings:', error);
    }

    return { lowStock: true, sales: true };
}

function saveNotificationPreferences() {
    try {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notificationSettings));
    } catch (error) {
        console.warn('Failed to save notification settings:', error);
    }
}

async function handleNotificationButtonClick(event) {
    if (event) {
        event.preventDefault();
    }

    if (!currentUser || !currentUser.token) {
        return;
    }

    await showNotificationCenter();

    // Mark notifications as read and reset the badge count
    markNotificationsAsRead();
}

async function showNotificationCenter() {
    const canViewFeed = ['admin', 'manager'].includes(currentUser.role);
    let feedError = null;

    if (canViewFeed) {
        const { error } = await fetchNotificationFeed(10);
        feedError = error;
    }

    const lowStockItems = items.filter(item => item.lowStock);
    const activeChannels = Object.values(notificationSettings).filter(Boolean).length;
    const totalChannels = Object.keys(notificationSettings).length;
    const latestAlert = notificationFeed.length ? formatDateTime(notificationFeed[0].createdAt) : '—';

    const lowStockList = lowStockItems.slice(0, 6).map(item => `
        <li>
            <div class="notification-modal__item-primary">${escapeHtml(item.name || '—')}</div>
            <div class="notification-modal__item-meta">
                <span>Stock: <strong>${escapeHtml(String(item.quantity ?? 0))}</strong></span>
                <span>Reorder: ${escapeHtml(String(item.reorderLevel ?? 0))}</span>
            </div>
        </li>
    `).join('');

    let feedSection;
    if (!canViewFeed) {
        feedSection = '<div class="notification-modal__empty">System alerts are visible to managers and administrators only.</div>';
    } else if (feedError) {
        feedSection = `<div class="notification-modal__empty" style="color: var(--danger);">${escapeHtml(feedError.message || 'Unable to load alerts')}</div>`;
    } else if (!notificationFeed.length) {
        feedSection = '<div class="notification-modal__empty">No recent alerts logged.</div>';
    } else {
        const feedItems = notificationFeed.slice(0, 8).map(entry => `
            <li>
                <div class="notification-modal__item-primary">${escapeHtml(entry.description || entry.action || 'Notification')}</div>
                <div class="notification-modal__item-meta">
                    <span>${escapeHtml(entry.username || entry.userId?.username || 'System')}</span>
                    <span>${escapeHtml(formatDateTime(entry.createdAt))}</span>
                </div>
            </li>
        `).join('');
        feedSection = `<ul class="notification-modal__list">${feedItems}</ul>`;
    }

    const modalContent = `
        <div class="notification-modal">
            <section>
                <h4 class="notification-modal__heading">Overview</h4>
                <div class="notification-modal__stats">
                    <div class="notification-modal__stat">
                        <span class="notification-modal__stat-label">Low Stock Alerts</span>
                        <span class="notification-modal__stat-value">${lowStockItems.length}</span>
                    </div>
                    <div class="notification-modal__stat">
                        <span class="notification-modal__stat-label">Active Channels</span>
                        <span class="notification-modal__stat-value">${activeChannels}/${totalChannels}</span>
                    </div>
                    <div class="notification-modal__stat">
                        <span class="notification-modal__stat-label">Last Alert</span>
                        <span class="notification-modal__stat-value">${escapeHtml(latestAlert)}</span>
                    </div>
                </div>
            </section>
            <section>
                <h4 class="notification-modal__heading">Low Stock Watchlist</h4>
                ${lowStockItems.length ? `<ul class="notification-modal__list">${lowStockList}</ul>` : '<div class="notification-modal__empty">All inventory levels are healthy 🎉</div>'}
            </section>
            <section>
                <h4 class="notification-modal__heading">Recent Alerts</h4>
                ${feedSection}
            </section>
        </div>
    `;

    openModal('Notification Center', modalContent);
}

async function fetchNotificationFeed(limit = 15) {
    try {
        const response = await fetch(`${API_URL}/logs/recent?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}`
            }
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            const message = response.status === 403
                ? 'You do not have permission to view alerts.'
                : (errorPayload.message || 'Unable to load alerts');
            throw new Error(message);
        }

        const data = await response.json().catch(() => []);
        notificationFeed = Array.isArray(data) ? data : [];
        updateNotificationBadge();
        return { data: notificationFeed, error: null };
    } catch (error) {
        console.error('Failed to fetch notification feed:', error);
        notificationFeed = [];
        updateNotificationBadge();
        return { data: [], error };
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    const lowStockCount = items.filter(item => item.lowStock).length;
    const feedCount = notificationFeed.length;
    const total = Math.min(99, lowStockCount + feedCount);

    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.classList.remove('badge-hidden');
    } else {
        badge.textContent = '';
        badge.classList.add('badge-hidden');
    }
}

function markNotificationsAsRead() {
    // Clear the notification feed and reset the badge
    notificationFeed = [];

    // Reset the badge to only show low stock items
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    const lowStockCount = items.filter(item => item.lowStock).length;

    if (lowStockCount > 0) {
        badge.textContent = lowStockCount > 99 ? '99+' : String(lowStockCount);
        badge.classList.remove('badge-hidden');
    } else {
        badge.textContent = '';
        badge.classList.add('badge-hidden');
    }

    // Store the last read time in localStorage
    localStorage.setItem('lastNotificationRead', new Date().toISOString());
}

function handleLowStockNotification(count) {
    if (!notificationSettings.lowStock) {
        lastNotificationSnapshot.lowStockCount = count;
        updateNotificationOverview();
        return;
    }

    if (count <= 0) {
        if (lastNotificationSnapshot.lowStockCount > 0) {
            showToast('Inventory levels recovered. All items are above reorder thresholds.', 'success');
        }
        lastNotificationSnapshot.lowStockCount = count;
        updateNotificationOverview();
        return;
    }

    if (lastNotificationSnapshot.lowStockCount === null || count > lastNotificationSnapshot.lowStockCount) {
        showToast(`⚠️ ${count} product${count === 1 ? '' : 's'} below reorder level`, 'warning');
    }

    lastNotificationSnapshot.lowStockCount = count;
    updateNotificationOverview();
}

function initializeNotificationToggle(elementId, key, { enabledMessage, disabledMessage, onChange } = {}) {
    const toggle = document.getElementById(elementId);
    if (!toggle) return;

    toggle.checked = !!notificationSettings[key];
    toggle.addEventListener('change', (event) => {
        const checked = event.target.checked;
        notificationSettings[key] = checked;
        saveNotificationPreferences();

        if (key === 'lowStock') {
            lastNotificationSnapshot.lowStockCount = null;
            const lowStockItems = items.filter(item => item.lowStock);
            handleLowStockNotification(lowStockItems.length);
        }

        if (typeof onChange === 'function') {
            onChange(checked);
        }

        const message = checked ? enabledMessage : disabledMessage;
        if (message) {
            showToast(message, 'info');
        }
    });
}

function updateNotificationOverview() {
    const lowStockCount = items.filter(item => item.lowStock).length;
    const activeChannels = Object.values(notificationSettings).filter(Boolean).length;
    const totalChannels = Object.keys(notificationSettings).length;

    const lowStockCountEl = document.getElementById('notifLowStockCount');
    if (lowStockCountEl) {
        lowStockCountEl.textContent = lowStockCount;
    }

    const lowStockTrendEl = document.getElementById('notifLowStockTrend');
    if (lowStockTrendEl) {
        if (lowStockCount > 0) {
            lowStockTrendEl.textContent = `${lowStockCount} item${lowStockCount === 1 ? '' : 's'} need restocking`;
            lowStockTrendEl.classList.add('negative');
        } else {
            lowStockTrendEl.textContent = 'Inventory looks healthy';
            lowStockTrendEl.classList.remove('negative');
        }
    }

    const activeChannelsEl = document.getElementById('notifActiveChannels');
    if (activeChannelsEl) {
        activeChannelsEl.textContent = `${activeChannels}/${totalChannels}`;
    }

    const lastEventEl = document.getElementById('notifLastEvent');
    if (lastEventEl) {
        const latestEntry = notificationFeed.length ? notificationFeed[0] : activityLogs.length ? activityLogs[0] : null;
        lastEventEl.textContent = latestEntry ? formatDateTime(latestEntry.createdAt) : '—';
    }

    updateNotificationBadge();
}

function escapeHtml(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============= ADVANCED REPORTS =============

async function showCategorySalesReport() {
    try {
        const from = prompt('Start date (YYYY-MM-DD) - Leave blank for last 30 days:');
        const to = prompt('End date (YYYY-MM-DD) - Leave blank for today:');

        let url = `${API_URL}/reports/sales-by-category`;
        const params = new URLSearchParams();
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to load category sales report');

        const data = await response.json();
        displayCategorySalesModal(data);
    } catch (error) {
        showToast('Error loading category sales report: ' + error.message, 'error');
    }
}

function displayCategorySalesModal(data) {
    const categories = data.categories || [];
    const dateFrom = new Date(data.dateRange.from).toLocaleDateString();
    const dateTo = new Date(data.dateRange.to).toLocaleDateString();

    const modalContent = `
        <div style="max-height: 70vh; overflow-y: auto;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0;">📅 Period: ${dateFrom} to ${dateTo}</h4>
                <p style="margin: 0; color: #666;">Total Categories: ${data.totalCategories}</p>
            </div>
            
            ${categories.map((cat, idx) => `
                <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; margin-bottom: 15px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0; color: #333;">${idx + 1}. ${cat.category}</h3>
                        <span style="background: #28a745; color: white; padding: 5px 12px; border-radius: 16px; font-weight: bold;">
                            ₹${cat.totalRevenue.toLocaleString()}
                        </span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 15px;">
                        <div>
                            <div style="font-size: 12px; color: #666;">Total Sales</div>
                            <div style="font-size: 18px; font-weight: bold;">${cat.salesCount}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #666;">Units Sold</div>
                            <div style="font-size: 18px; font-weight: bold;">${cat.totalQuantity}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #666;">Avg Order</div>
                            <div style="font-size: 18px; font-weight: bold;">₹${cat.averageOrderValue.toLocaleString()}</div>
                        </div>
                    </div>
                    
                    ${cat.topProducts && cat.topProducts.length > 0 ? `
                        <div>
                            <h4 style="margin: 10px 0; color: #666; font-size: 14px;">🏆 Top Products:</h4>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${cat.topProducts.slice(0, 3).map((prod, pidx) => `
                                    <div style="display: flex; justify-content: space-between; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                                        <span>${pidx + 1}. ${prod.name}</span>
                                        <span style="font-weight: bold; color: #28a745;">₹${prod.revenue.toLocaleString()} (${prod.quantity} units)</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
            
            ${categories.length === 0 ? '<p style="text-align: center; color: #999; padding: 40px;">No sales data available for this period</p>' : ''}
        </div>
    `;

    openModal('📊 Category-wise Sales Report', modalContent);
}

async function showDetailedSummaryReport() {
    try {
        const from = prompt('Start date (YYYY-MM-DD) - Leave blank for last 30 days:');
        const to = prompt('End date (YYYY-MM-DD) - Leave blank for today:');

        let url = `${API_URL}/reports/detailed-summary`;
        const params = new URLSearchParams();
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to load detailed summary');

        const data = await response.json();
        displayDetailedSummaryModal(data);
    } catch (error) {
        showToast('Error loading detailed summary: ' + error.message, 'error');
    }
}

function displayDetailedSummaryModal(data) {
    const dateFrom = new Date(data.dateRange.from).toLocaleDateString();
    const dateTo = new Date(data.dateRange.to).toLocaleDateString();
    const metrics = data.salesMetrics || {};
    const inventory = data.inventoryStatus || {};

    const modalContent = `
        <div style="max-height: 70vh; overflow-y: auto;">
            <!-- Summary Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0;">📊 Comprehensive Business Summary</h3>
                <p style="margin: 0; opacity: 0.9;">Period: ${dateFrom} to ${dateTo} (${data.dateRange.days} days)</p>
            </div>
            
            <!-- Sales Metrics -->
            <div style="border: 2px solid #28a745; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #28a745;">💰 Sales Performance</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total Revenue</div>
                        <div style="font-size: 24px; font-weight: bold; color: #28a745;">₹${metrics.totalRevenue?.toLocaleString() || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total Sales</div>
                        <div style="font-size: 24px; font-weight: bold; color: #007bff;">${metrics.salesCount || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Units Sold</div>
                        <div style="font-size: 24px; font-weight: bold; color: #6c757d;">${metrics.totalQuantity || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Avg Order Value</div>
                        <div style="font-size: 24px; font-weight: bold; color: #fd7e14;">₹${metrics.averageOrderValue?.toLocaleString() || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Min Order</div>
                        <div style="font-size: 20px; font-weight: bold;">₹${metrics.minOrderValue?.toLocaleString() || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Max Order</div>
                        <div style="font-size: 20px; font-weight: bold;">₹${metrics.maxOrderValue?.toLocaleString() || 0}</div>
                    </div>
                </div>
            </div>
            
            <!-- Inventory Status -->
            <div style="border: 2px solid #007bff; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; color: #007bff;">📦 Inventory Status</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total Products</div>
                        <div style="font-size: 24px; font-weight: bold;">${inventory.totalProducts || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Stock Value</div>
                        <div style="font-size: 24px; font-weight: bold; color: #28a745;">₹${inventory.totalStockValue?.toLocaleString() || 0}</div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total Units</div>
                        <div style="font-size: 24px; font-weight: bold;">${inventory.totalQuantity || 0}</div>
                    </div>
                    <div style="background: #fff3cd; padding: 15px; border-radius: 6px; border: 1px solid #ffc107;">
                        <div style="font-size: 12px; color: #856404; margin-bottom: 5px;">⚠️ Low Stock</div>
                        <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${inventory.lowStockItems || 0}</div>
                    </div>
                    <div style="background: #f8d7da; padding: 15px; border-radius: 6px; border: 1px solid #dc3545;">
                        <div style="font-size: 12px; color: #721c24; margin-bottom: 5px;">❌ Out of Stock</div>
                        <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${inventory.outOfStockItems || 0}</div>
                    </div>
                </div>
            </div>
            
            <!-- Top Products -->
            ${data.topProducts && data.topProducts.length > 0 ? `
                <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0;">🏆 Top 10 Best Sellers</h3>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 10px; text-align: left;">#</th>
                                    <th style="padding: 10px; text-align: left;">Product</th>
                                    <th style="padding: 10px; text-align: left;">Category</th>
                                    <th style="padding: 10px; text-align: right;">Revenue</th>
                                    <th style="padding: 10px; text-align: right;">Qty Sold</th>
                                    <th style="padding: 10px; text-align: right;">Sales</th>
                                    <th style="padding: 10px; text-align: right;">Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.topProducts.map((p, idx) => `
                                    <tr style="border-bottom: 1px solid #e0e0e0;">
                                        <td style="padding: 10px;">${idx + 1}</td>
                                        <td style="padding: 10px; font-weight: 600;">${p.name}</td>
                                        <td style="padding: 10px;">${p.category}</td>
                                        <td style="padding: 10px; text-align: right; color: #28a745; font-weight: bold;">₹${p.totalRevenue.toLocaleString()}</td>
                                        <td style="padding: 10px; text-align: right;">${p.totalQuantity}</td>
                                        <td style="padding: 10px; text-align: right;">${p.salesCount}</td>
                                        <td style="padding: 10px; text-align: right;">${p.currentStock}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
            
            <!-- Category Breakdown -->
            ${data.categoryBreakdown && data.categoryBreakdown.length > 0 ? `
                <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0;">📊 Category Performance</h3>
                    ${data.categoryBreakdown.map((cat, idx) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: ${idx % 2 === 0 ? '#f8f9fa' : 'white'}; border-radius: 4px; margin-bottom: 5px;">
                            <div>
                                <strong>${cat.category}</strong>
                                <small style="color: #666; margin-left: 10px;">${cat.salesCount} sales • ${cat.quantity} units</small>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: #28a745;">₹${cat.revenue.toLocaleString()}</div>
                                <small style="color: #666;">Avg: ₹${cat.averageValue.toLocaleString()}</small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    openModal('📈 Detailed Business Summary', modalContent, { wide: true });
}

async function showProductPerformanceReport() {
    try {
        const category = prompt('Category (leave blank for all categories):');
        const from = prompt('Start date (YYYY-MM-DD) - Leave blank for last 30 days:');
        const to = prompt('End date (YYYY-MM-DD) - Leave blank for today:');

        let url = `${API_URL}/reports/product-performance`;
        const params = new URLSearchParams();
        if (category) params.append('category', category);
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to load product performance');

        const data = await response.json();
        displayProductPerformanceModal(data);
    } catch (error) {
        showToast('Error loading product performance: ' + error.message, 'error');
    }
}

function displayProductPerformanceModal(data) {
    const dateFrom = new Date(data.dateRange.from).toLocaleDateString();
    const dateTo = new Date(data.dateRange.to).toLocaleDateString();
    const products = data.products || [];

    const modalContent = `
        <div style="max-height: 70vh; overflow-y: auto;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0;">📅 Period: ${dateFrom} to ${dateTo}</h4>
                <p style="margin: 0; color: #666;">Category: ${data.category} • Total Products: ${data.totalProducts}</p>
            </div>
            
            ${products.length > 0 ? `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 10px; text-align: left;">Product</th>
                                <th style="padding: 10px; text-align: left;">Category</th>
                                <th style="padding: 10px; text-align: right;">Revenue</th>
                                <th style="padding: 10px; text-align: right;">Qty Sold</th>
                                <th style="padding: 10px; text-align: right;">Sales</th>
                                <th style="padding: 10px; text-align: right;">Avg Sale</th>
                                <th style="padding: 10px; text-align: right;">Stock</th>
                                <th style="padding: 10px; text-align: right;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${products.map((p, idx) => `
                                <tr style="border-bottom: 1px solid #e0e0e0; background: ${idx % 2 === 0 ? 'white' : '#fafafa'};">
                                    <td style="padding: 10px; font-weight: 600;">${p.name}</td>
                                    <td style="padding: 10px;">${p.category}</td>
                                    <td style="padding: 10px; text-align: right; color: #28a745; font-weight: bold;">₹${p.totalRevenue.toLocaleString()}</td>
                                    <td style="padding: 10px; text-align: right;">${p.totalQuantitySold}</td>
                                    <td style="padding: 10px; text-align: right;">${p.salesCount}</td>
                                    <td style="padding: 10px; text-align: right;">₹${p.averageSaleValue.toLocaleString()}</td>
                                    <td style="padding: 10px; text-align: right;">${p.currentStock}</td>
                                    <td style="padding: 10px; text-align: right;">
                                        ${p.isLowStock ? '<span style="color: #dc3545; font-weight: bold;">⚠️ Low</span>' : '<span style="color: #28a745;">✓ OK</span>'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p style="text-align: center; color: #999; padding: 40px;">No product sales data available for this period</p>'}
        </div>
    `;

    openModal('🏆 Product Performance Report', modalContent, { wide: true });
}

async function exportCategorySalesReport() {
    try {
        const from = prompt('Start date (YYYY-MM-DD) - Leave blank for last 30 days:');
        const to = prompt('End date (YYYY-MM-DD) - Leave blank for today:');

        let url = `${API_URL}/reports/sales-by-category/export`;
        const params = new URLSearchParams();
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to export category sales');

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `category-sales-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        showToast('Category sales report exported successfully!', 'success');
    } catch (error) {
        showToast('Error exporting report: ' + error.message, 'error');
    }
}

// ===== EMAIL RECIPIENTS MANAGEMENT =====

let recipients = [];

async function renderEmailRecipients() {
    const content = `
        <div class="page-actions">
            <button class="btn btn-primary" onclick="showAddRecipientModal()">
                ➕ Add Recipient
            </button>
        </div>
        
        <div class="data-table-wrapper">
            <div class="table-header">
                <h3 class="table-title">Email Recipients</h3>
                <p style="color: #6b7280; margin-top: 8px;">Manage who receives email alerts and reports</p>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Alert Types</th>
                        <th>Status</th>
                        <th>Added</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="recipientsTable">
                    <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    renderContent(content);
    await fetchRecipients();
}

async function fetchRecipients() {
    const tbody = document.getElementById('recipientsTable');
    if (!tbody) return;

    try {
        const response = await fetch(`${API_URL}/recipients`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        if (!response.ok) throw new Error('Failed to fetch recipients');

        recipients = await response.json();
        loadRecipients();
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger);">${error.message}</td></tr>`;
    }
}

function loadRecipients() {
    const tbody = document.getElementById('recipientsTable');
    if (!tbody) return;

    if (recipients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No recipients configured</td></tr>';
        return;
    }

    tbody.innerHTML = recipients.map(recipient => {
        const alertTypes = recipient.types.map(type => {
            const labels = {
                'low_stock': '⚠️ Low Stock',
                'daily_report': '📊 Daily Report'
            };
            return labels[type] || type;
        }).join(', ');

        const statusClass = recipient.isActive ? 'active' : 'inactive';
        const statusLabel = recipient.isActive ? 'Active' : 'Inactive';

        return `
            <tr>
                <td><strong>${escapeHtml(recipient.name)}</strong></td>
                <td>${escapeHtml(recipient.email)}</td>
                <td>${alertTypes}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${formatDateTime(recipient.createdAt)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="showEditRecipientModal('${recipient._id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRecipient('${recipient._id}', '${escapeHtml(recipient.name)}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddRecipientModal() {
    showRecipientModal({ mode: 'create' });
}

function showEditRecipientModal(recipientId) {
    const recipient = recipients.find(r => r._id === recipientId);
    if (!recipient) {
        showToast('Recipient not found', 'error');
        return;
    }
    showRecipientModal({ mode: 'edit', recipient });
}

function showRecipientModal({ mode, recipient = {} }) {
    const isEdit = mode === 'edit';
    const lowStockChecked = recipient.types?.includes('low_stock') ? 'checked' : '';
    const dailyReportChecked = recipient.types?.includes('daily_report') ? 'checked' : '';

    const modal = openModal(
        `${isEdit ? 'Edit' : 'Add'} Email Recipient`,
        `
        <form id="recipientForm" class="modal-form">
            <div class="form-group">
                <label for="recipientName">Name <span class="required">*</span></label>
                <input type="text" id="recipientName" name="name" placeholder="e.g. John Doe" value="${escapeHtml(recipient.name || '')}" required>
            </div>
            <div class="form-group">
                <label for="recipientEmail">Email <span class="required">*</span></label>
                <input type="email" id="recipientEmail" name="email" placeholder="e.g. john@example.com" value="${escapeHtml(recipient.email || '')}" required>
            </div>
            <div class="form-group">
                <label>Alert Types <span class="required">*</span></label>
                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" name="types" value="low_stock" ${lowStockChecked}>
                        <span>⚠️ Low Stock Alerts</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" name="types" value="daily_report" ${dailyReportChecked}>
                        <span>📊 Daily Inventory Reports</span>
                    </label>
                </div>
            </div>
            ${isEdit ? `
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="recipientActive" name="isActive" ${recipient.isActive ? 'checked' : ''}>
                    <span>Active (receives emails)</span>
                </label>
            </div>
            ` : ''}
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Recipient'}</button>
            </div>
            <div id="recipientModalMessage" class="message" style="display:none; margin-top:16px;"></div>
        </form>
        `
    );

    const form = modal.querySelector('#recipientForm');
    form.addEventListener('submit', (event) => handleRecipientFormSubmit(event, { mode, recipientId: recipient._id }));
}

async function handleRecipientFormSubmit(event, { mode, recipientId }) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const name = formData.get('name').trim();
    const email = formData.get('email').trim();
    const types = formData.getAll('types');
    const isActive = formData.get('isActive') === 'on';

    if (!name || !email) {
        showInlineModalMessage('recipientModalMessage', 'Name and email are required.', 'error');
        return;
    }

    if (types.length === 0) {
        showInlineModalMessage('recipientModalMessage', 'Please select at least one alert type.', 'error');
        return;
    }

    const payload = { name, email, types };
    if (mode === 'edit') {
        payload.isActive = isActive;
    }

    try {
        const url = mode === 'edit' ? `${API_URL}/recipients/${recipientId}` : `${API_URL}/recipients`;
        const method = mode === 'edit' ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Unable to save recipient');
        }

        showToast(`Recipient ${mode === 'edit' ? 'updated' : 'added'} successfully`, 'success');
        closeModal();
        await fetchRecipients();
    } catch (error) {
        console.error(error);
        showInlineModalMessage('recipientModalMessage', error.message, 'error');
    }
}

async function deleteRecipient(recipientId, name) {
    if (!recipientId) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${name}? They will no longer receive email alerts.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/recipients/${recipientId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to delete recipient');
        }

        showToast('Recipient deleted successfully', 'success');
        await fetchRecipients();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

