const API_URL = (() => {
	// Auto-detect API URL - works for both local development and production
	if (typeof window !== 'undefined' && window.location) {
		const protocol = window.location.protocol || 'http:';
		const hostname = window.location.hostname || 'localhost';
		const port = window.location.port;
		
		// In production, use same host as frontend (no port needed)
		// In development, use port 5000
		if (hostname === 'localhost' || hostname === '127.0.0.1') {
			return `${protocol}//${hostname}:5000/api`;
		}
		return `${protocol}//${hostname}${port ? ':' + port : ''}/api`;
	}
	return 'http://localhost:5000/api';
})();

let currentUser = {
	token: localStorage.getItem('token') || null,
	role: localStorage.getItem('role') || null,
	username: localStorage.getItem('username') || null
};

let masterItems = [];
let items = [];
let suppliers = [];
let sales = [];
let itemFilters = { search: '', lowStockOnly: false, category: '', supplierId: '' };
let saleFilters = { from: '', to: '' };
let editingItemId = null;
let editingSupplierId = null;
let latestSalesSummary = [];
let latestRevenueSummary = null;
let salesTrendChart;
let categoryStockChart;

const messageTimers = new Map();
const currencyFormatter = new Intl.NumberFormat('en-IN', {
	style: 'currency',
	currency: 'INR',
	minimumFractionDigits: 2
});

// Core DOM references
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const logoutBtn = document.getElementById('logoutBtn');
const adminPanel = document.getElementById('adminPanel');
const userDisplay = document.getElementById('userDisplay');
const userInfo = document.getElementById('userInfo');
const tabButtons = document.querySelectorAll('.tab-btn');
const dashboardSections = document.querySelectorAll('.dashboard-section');
const overviewMetrics = document.getElementById('overviewMetrics');
const refreshOverviewBtn = document.getElementById('refreshOverviewBtn');
const refreshAlertsBtn = document.getElementById('refreshAlertsBtn');
const lowStockList = document.getElementById('lowStockList');
const lowStockEmptyState = document.getElementById('lowStockEmptyState');
const dbStatusElement = document.getElementById('dbStatus');

// Inventory DOM references
const itemSearchInput = document.getElementById('itemSearch');
const lowStockToggle = document.getElementById('lowStockToggle');
const itemSearchBtn = document.getElementById('itemSearchBtn');
const itemResetBtn = document.getElementById('itemResetBtn');
const itemsTableBody = document.getElementById('itemsTableBody');
const itemsEmptyState = document.getElementById('itemsEmptyState');
const itemMessage = document.getElementById('itemMessage');
const itemFormPanel = document.getElementById('itemFormPanel');
const itemForm = document.getElementById('itemForm');
const itemFormTitle = document.getElementById('itemFormTitle');
const itemFormMessage = document.getElementById('itemFormMessage');
const itemCancelEdit = document.getElementById('itemCancelEdit');
const itemIdInput = document.getElementById('itemId');
const itemNameInput = document.getElementById('itemName');
const itemCategoryInput = document.getElementById('itemCategory');
const itemSupplierSelect = document.getElementById('itemSupplier');
const itemQuantityInput = document.getElementById('itemQuantity');
const itemReorderInput = document.getElementById('itemReorderLevel');
const itemPriceInput = document.getElementById('itemPrice');
const itemCategoryFilter = document.getElementById('itemCategoryFilter');
const itemSupplierFilter = document.getElementById('itemSupplierFilter');
const stockAdjustForm = document.getElementById('stockAdjustForm');
const stockAdjustItemSelect = document.getElementById('stockAdjustItem');
const stockAdjustAmountInput = document.getElementById('stockAdjustAmount');
const stockAdjustOperationSelect = document.getElementById('stockAdjustOperation');
const stockAdjustResetBtn = document.getElementById('stockAdjustReset');
const stockAdjustMessage = document.getElementById('stockAdjustMessage');

// Supplier DOM references
const suppliersTableBody = document.getElementById('suppliersTableBody');
const suppliersEmptyState = document.getElementById('suppliersEmptyState');
const supplierMessage = document.getElementById('supplierMessage');
const supplierFormPanel = document.getElementById('supplierFormPanel');
const supplierForm = document.getElementById('supplierForm');
const supplierFormTitle = document.getElementById('supplierFormTitle');
const supplierFormMessage = document.getElementById('supplierFormMessage');
const supplierCancelEdit = document.getElementById('supplierCancelEdit');
const supplierIdInput = document.getElementById('supplierId');
const supplierNameInput = document.getElementById('supplierName');
const supplierContactInput = document.getElementById('supplierContact');
const supplierEmailInput = document.getElementById('supplierEmail');
const supplierAddressInput = document.getElementById('supplierAddress');
const supplierProductsInput = document.getElementById('supplierProducts');
const refreshSuppliersBtn = document.getElementById('refreshSuppliersBtn');

// Sales DOM references
const saleForm = document.getElementById('saleForm');
const saleFormMessage = document.getElementById('saleFormMessage');
const saleItemSelect = document.getElementById('saleItem');
const saleQuantityInput = document.getElementById('saleQuantity');
const saleDateInput = document.getElementById('saleDate');
const saleTotalDisplay = document.getElementById('saleTotalDisplay');
const saleFormResetBtn = document.getElementById('saleFormReset');
const salesTablePanel = document.getElementById('salesTablePanel');
const salesTableBody = document.getElementById('salesTableBody');
const salesEmptyState = document.getElementById('salesEmptyState');
const salesTableMessage = document.getElementById('salesTableMessage');
const salesFilterFromInput = document.getElementById('salesFilterFrom');
const salesFilterToInput = document.getElementById('salesFilterTo');
const salesFilterBtn = document.getElementById('salesFilterBtn');
const salesResetBtn = document.getElementById('salesResetBtn');

// Reports DOM references
const salesSummaryPeriodSelect = document.getElementById('salesSummaryPeriod');
const salesSummaryFromInput = document.getElementById('salesSummaryFrom');
const salesSummaryToInput = document.getElementById('salesSummaryTo');
const refreshSalesSummaryBtn = document.getElementById('refreshSalesSummaryBtn');
const exportSalesCsvBtn = document.getElementById('exportSalesCsvBtn');
const refreshCategoryChartBtn = document.getElementById('refreshCategoryChartBtn');
const revenueFromInput = document.getElementById('revenueFrom');
const revenueToInput = document.getElementById('revenueTo');
const refreshRevenueBtn = document.getElementById('refreshRevenueBtn');
const exportRevenueCsvBtn = document.getElementById('exportRevenueCsvBtn');
const revenueSummaryBox = document.getElementById('revenueSummary');
const salesTrendCanvas = document.getElementById('salesTrendChart');
const categoryStockCanvas = document.getElementById('categoryStockChart');
const reportsMessage = document.getElementById('reportsMessage');

const restrictedSections = document.querySelectorAll('.restricted');
const roleAccessMap = {
	admin: 'Full access',
	manager: 'Inventory & supplier management',
	staff: 'Read-only access'
};

bindEventListeners();
initializeApp();

function initializeApp() {
	if (currentUser.token) {
		showDashboard();
	} else {
		showLogin();
	}
}

function handleTabClick(event) {
	const sectionId = event.currentTarget?.dataset?.section;
	if (!sectionId) return;
	setActiveSection(sectionId);
}

function setActiveSection(sectionId) {
	tabButtons.forEach((button) => {
		button.classList.toggle('active', button.dataset.section === sectionId);
	});

	dashboardSections.forEach((section) => {
		section.classList.toggle('active', section.id === sectionId);
	});
}

function bindEventListeners() {
	tabButtons.forEach((button) => {
		button.addEventListener('click', handleTabClick);
	});

	if (loginForm) {
		loginForm.addEventListener('submit', handleLogin);
	}

	if (registerForm) {
		registerForm.addEventListener('submit', handleRegister);
	}

	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => performLogout({ showNotice: true }));
	}

	if (itemSearchBtn) {
		itemSearchBtn.addEventListener('click', applyItemFilters);
	}

	if (itemResetBtn) {
		itemResetBtn.addEventListener('click', resetItemFilters);
	}

	if (itemCategoryFilter) {
		itemCategoryFilter.addEventListener('change', handleItemCategoryFilter);
	}

	if (itemSupplierFilter) {
		itemSupplierFilter.addEventListener('change', handleItemSupplierFilter);
	}

	if (itemSearchInput) {
		itemSearchInput.addEventListener('keypress', handleItemSearchKeyPress);
	}

	if (lowStockToggle) {
		lowStockToggle.addEventListener('change', handleLowStockToggle);
	}

	if (itemForm) {
		itemForm.addEventListener('submit', handleItemSubmit);
	}

	if (itemCancelEdit) {
		itemCancelEdit.addEventListener('click', resetItemForm);
	}

	if (itemsTableBody) {
		itemsTableBody.addEventListener('click', handleItemsTableClick);
	}

	if (stockAdjustForm) {
		stockAdjustForm.addEventListener('submit', handleStockAdjustSubmit);
	}

	if (stockAdjustResetBtn) {
		stockAdjustResetBtn.addEventListener('click', (event) => {
			event.preventDefault();
			resetStockAdjustForm();
		});
	}

	if (supplierForm) {
		supplierForm.addEventListener('submit', handleSupplierSubmit);
	}

	if (supplierCancelEdit) {
		supplierCancelEdit.addEventListener('click', resetSupplierForm);
	}

	if (suppliersTableBody) {
		suppliersTableBody.addEventListener('click', handleSuppliersTableClick);
	}

	if (refreshSuppliersBtn) {
		refreshSuppliersBtn.addEventListener('click', fetchSuppliers);
	}

	if (refreshOverviewBtn) {
		refreshOverviewBtn.addEventListener('click', handleRefreshOverview);
	}

	if (refreshAlertsBtn) {
		refreshAlertsBtn.addEventListener('click', loadLowStockAlerts);
	}

	if (saleForm) {
		saleForm.addEventListener('submit', handleSaleSubmit);
	}

	if (saleFormResetBtn) {
		saleFormResetBtn.addEventListener('click', (event) => {
			event.preventDefault();
			resetSaleForm();
		});
	}

	if (saleItemSelect) {
		saleItemSelect.addEventListener('change', updateSaleTotalPreview);
	}

	if (saleQuantityInput) {
		saleQuantityInput.addEventListener('input', updateSaleTotalPreview);
	}

	if (salesFilterBtn) {
		salesFilterBtn.addEventListener('click', applySalesFilters);
	}

	if (salesResetBtn) {
		salesResetBtn.addEventListener('click', resetSalesFilters);
	}

	if (refreshSalesSummaryBtn) {
		refreshSalesSummaryBtn.addEventListener('click', loadSalesSummary);
	}

	if (salesSummaryPeriodSelect) {
		salesSummaryPeriodSelect.addEventListener('change', loadSalesSummary);
	}

	if (refreshCategoryChartBtn) {
		refreshCategoryChartBtn.addEventListener('click', renderCategoryChart);
	}

	if (refreshRevenueBtn) {
		refreshRevenueBtn.addEventListener('click', loadRevenueSummary);
	}

	if (exportSalesCsvBtn) {
		exportSalesCsvBtn.addEventListener('click', exportSalesSummaryCsv);
	}

	if (exportRevenueCsvBtn) {
		exportRevenueCsvBtn.addEventListener('click', exportRevenueCsv);
	}
}

async function handleLogin(event) {
	event.preventDefault();
	clearMessage('loginMessage');

	const usernameInput = document.getElementById('loginUsername');
	const passwordInput = document.getElementById('loginPassword');
	const username = usernameInput ? usernameInput.value.trim() : '';
	const password = passwordInput ? passwordInput.value : '';

	if (!username || !password) {
		showMessage('loginMessage', 'Please provide both username and password.', 'error');
		return;
	}

	try {
		const response = await apiFetch('/auth/login', {
			method: 'POST',
			body: JSON.stringify({ username, password })
		});

		const data = await parseJson(response);

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
			}, 600);
		} else {
			showMessage('loginMessage', data.message || 'Invalid credentials.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Login error:', error);
		showMessage('loginMessage', 'Network error. Please try again.', 'error');
	}
}

async function handleRegister(event) {
	event.preventDefault();
	clearMessage('registerMessage');

	if (!currentUser.token) {
		showMessage('registerMessage', 'You must be logged in.', 'error');
		return;
	}

	const username = document.getElementById('regUsername')?.value.trim();
	const password = document.getElementById('regPassword')?.value;
	const role = document.getElementById('regRole')?.value;

	if (!username || !password) {
		showMessage('registerMessage', 'Username and password are required.', 'error');
		return;
	}

	try {
		const response = await apiFetch('/auth/register', {
			method: 'POST',
			body: JSON.stringify({ username, password, role })
		});
		const data = await parseJson(response);

		if (response.ok) {
			showMessage('registerMessage', 'User created successfully!', 'success');
			registerForm?.reset();
		} else {
			showMessage('registerMessage', data.message || 'Registration failed.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Register error:', error);
		showMessage('registerMessage', 'Network error. Please try again.', 'error');
	}
}

function performLogout({ showNotice = false } = {}) {
	currentUser = { token: null, role: null, username: null };
	localStorage.removeItem('token');
	localStorage.removeItem('role');
	localStorage.removeItem('username');

	resetDashboardState();
	showLogin();

	if (showNotice) {
		showMessage('loginMessage', 'You have been logged out.', 'success');
	}
}

function forceLogout(message) {
	performLogout();
	if (message) {
		showMessage('loginMessage', message, 'error');
	}
}

function showLogin() {
	loginPage?.classList.add('active');
	dashboardPage?.classList.remove('active');
	loginForm?.reset();
	clearMessage('loginMessage');
	clearMessage('registerMessage');
}

async function showDashboard() {
	loginPage?.classList.remove('active');
	dashboardPage?.classList.add('active');

	updateHeader();
	updateRoleVisibility();
	setActiveSection('overviewSection');
	setDefaultSaleDate();
	updateUserInfo();

	try {
		await Promise.all([fetchSuppliers(), fetchItems()]);
		renderOverviewMetrics();
		await loadLowStockAlerts();
		if (canViewSalesData()) {
			await fetchSales();
			await loadSalesSummary();
			await loadRevenueSummary();
		}
		renderCategoryChart();
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Dashboard load error:', error);
	}
}

function updateHeader() {
	if (!userDisplay) return;
	if (!currentUser.username) {
		userDisplay.textContent = '';
		return;
	}

	userDisplay.textContent = `${currentUser.username} (${formatRole(currentUser.role)})`;
}

function updateRoleVisibility() {
	const isAdmin = currentUser.role === 'admin';
	const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

	if (adminPanel) {
		adminPanel.classList.toggle('hidden', !isAdmin);
	}

	restrictedSections.forEach((section) => {
		section.classList.toggle('hidden', !canManage);
	});

	if (salesTablePanel) {
		salesTablePanel.classList.toggle('hidden', !canManage);
	}
}

function updateUserInfo() {
	if (!userInfo) return;

	const accessText = roleAccessMap[currentUser.role] || 'Limited access';
	const inventory = masterItems.length ? masterItems : items;
	const lowStockCount = inventory.filter((item) => item.lowStock).length;

	userInfo.innerHTML = `
		<p><strong>Username:</strong> ${currentUser.username || '—'}</p>
		<p><strong>Role:</strong> ${formatRole(currentUser.role)}</p>
		<p><strong>Access Level:</strong> ${accessText}</p>
		<p><strong>Inventory Items:</strong> ${inventory.length}</p>
		<p><strong>Low Stock Alerts:</strong> ${lowStockCount}</p>
		<p><strong>Suppliers:</strong> ${suppliers.length}</p>
	`;
}

function handleRefreshOverview() {
	if (reportsMessage) clearMessage(reportsMessage);
	renderOverviewMetrics();
	loadLowStockAlerts();
	if (canViewSalesData()) {
		loadRevenueSummary();
	}
	renderCategoryChart();
}

function renderOverviewMetrics() {
	if (!overviewMetrics) return;
	const inventory = masterItems.length ? masterItems : items;
	const totalStock = inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
	const lowStockCount = inventory.filter((item) => item.lowStock).length;
	const categoryCount = new Set(inventory.map((item) => item.category).filter(Boolean)).size;

	const metrics = [
		{ label: 'Inventory Items', value: inventory.length.toLocaleString() },
		{ label: 'Categories', value: categoryCount.toLocaleString() },
		{ label: 'Stock On Hand', value: totalStock.toLocaleString() },
		{ label: 'Low Stock Items', value: lowStockCount.toLocaleString() },
		{ label: 'Suppliers', value: suppliers.length.toLocaleString() }
	];

	if (canViewSalesData() && latestRevenueSummary) {
		metrics.push({ label: 'Revenue (Period)', value: formatCurrency(latestRevenueSummary.totalRevenue) });
	}

	overviewMetrics.innerHTML = metrics
		.map((metric) => `<div class="metrics-card"><h4>${metric.label}</h4><span>${metric.value}</span></div>`)
		.join('');
}

async function loadLowStockAlerts() {
	if (!lowStockList || !lowStockEmptyState) return;
	const fallbackInventory = (masterItems.length ? masterItems : items).filter((item) => item.lowStock);

	if (!canViewSalesData()) {
		renderLowStockList(fallbackInventory);
		return;
	}

	try {
		const response = await apiFetch('/reports/low-stock');
		const data = await parseJson(response);
		if (response.ok) {
			renderLowStockList(Array.isArray(data) ? data : []);
		} else {
			renderLowStockList(fallbackInventory);
		}
	} catch (error) {
		if (error.message !== 'Unauthorized') {
			console.error('Low stock alert error:', error);
		}
		renderLowStockList(fallbackInventory);
	}
}

function renderLowStockList(records) {
	if (!lowStockList || !lowStockEmptyState) return;
	lowStockList.innerHTML = '';

	const entries = (records || []).filter(Boolean);
	if (!entries.length) {
		lowStockList.classList.add('hidden');
		lowStockEmptyState.classList.remove('hidden');
		return;
	}

	lowStockList.classList.remove('hidden');
	lowStockEmptyState.classList.add('hidden');

	entries.slice(0, 10).forEach((item) => {
		const supplierName = item.supplierId?.name || 'No supplier linked';
		const li = document.createElement('li');
		li.innerHTML = `
			<strong>${item.name || 'Unnamed item'}</strong>
			<span>Qty: ${Number(item.quantity) || 0}</span>
			<span>Reorder Level: ${Number(item.reorderLevel) || 0}</span>
			<span>Supplier: ${supplierName}</span>
		`;
		lowStockList.appendChild(li);
	});
}

async function fetchItems() {
	if (!currentUser.token) return;

	try {
		clearMessage(itemMessage);
		const params = new URLSearchParams();
		if (itemFilters.search) params.set('search', itemFilters.search);
		if (itemFilters.lowStockOnly) params.set('lowStock', 'true');
		if (itemFilters.category) params.set('category', itemFilters.category);
		if (itemFilters.supplierId) params.set('supplierId', itemFilters.supplierId);

		const query = params.toString();
		const response = await apiFetch(`/items${query ? `?${query}` : ''}`);
		const data = await parseJson(response);

		if (response.ok) {
			items = Array.isArray(data) ? data : [];
			const isBaseFetch = !itemFilters.search && !itemFilters.lowStockOnly && !itemFilters.category && !itemFilters.supplierId;
			if (isBaseFetch) {
				masterItems = [...items];
				updateCategoryFilterOptions();
				populateSaleItemOptions();
			}
			renderItems();
			populateStockAdjustOptions();
			renderOverviewMetrics();
			renderCategoryChart();
			updateSaleTotalPreview();
			updateUserInfo();
		} else {
			showMessage(itemMessage, data.message || 'Failed to load items.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Fetch items error:', error);
		showMessage(itemMessage, 'Failed to load items.', 'error');
	}
}

async function fetchSuppliers() {
	if (!currentUser.token) return;

	try {
		clearMessage(supplierMessage);
		const response = await apiFetch('/suppliers');
		const data = await parseJson(response);

		if (response.ok) {
			suppliers = Array.isArray(data) ? data : [];
			renderSuppliers();
			populateSupplierOptions();
			updateUserInfo();
			renderOverviewMetrics();
		} else {
			showMessage(supplierMessage, data.message || 'Failed to load suppliers.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Fetch suppliers error:', error);
		showMessage(supplierMessage, 'Failed to load suppliers.', 'error');
	}
}

function renderItems() {
	if (!itemsTableBody || !itemsEmptyState) return;

	itemsTableBody.innerHTML = '';

	if (!items.length) {
		itemsEmptyState.classList.remove('hidden');
		return;
	}

	itemsEmptyState.classList.add('hidden');

	const canEdit = currentUser.role === 'admin' || currentUser.role === 'manager';
	const canDelete = currentUser.role === 'admin';

	items.forEach((item) => {
		const row = document.createElement('tr');
		if (item.lowStock) row.classList.add('low-stock-row');

		const supplierName = item.supplierId && item.supplierId.name ? item.supplierId.name : '—';
		const actions = [];

		if (canEdit) {
			actions.push(`<button class="table-action edit" data-action="edit-item" data-id="${item._id}">Edit</button>`);
		}

		if (canDelete) {
			actions.push(`<button class="table-action delete" data-action="delete-item" data-id="${item._id}">Delete</button>`);
		}

		row.innerHTML = `
			<td>${item.name || '—'}</td>
			<td>${item.category || '—'}</td>
			<td>${supplierName}</td>
			<td><span class="badge ${item.lowStock ? 'badge-danger' : 'badge-success'}">${item.quantity ?? 0}</span></td>
			<td>${item.reorderLevel ?? 0}</td>
			<td>${formatCurrency(item.price)}</td>
			<td><span class="status ${item.lowStock ? 'status-danger' : 'status-success'}">${item.lowStock ? 'Low Stock' : 'In Stock'}</span></td>
			<td>${actions.length ? `<div class="table-actions">${actions.join('')}</div>` : '—'}</td>
		`;

		itemsTableBody.appendChild(row);
	});
}

function renderSuppliers() {
	if (!suppliersTableBody || !suppliersEmptyState) return;

	suppliersTableBody.innerHTML = '';

	if (!suppliers.length) {
		suppliersEmptyState.classList.remove('hidden');
		return;
	}

	suppliersEmptyState.classList.add('hidden');

	const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';
	const canDelete = currentUser.role === 'admin';

	suppliers.forEach((supplier) => {
		const row = document.createElement('tr');
		const actions = [];

		if (canManage) {
			actions.push(`<button class="table-action edit" data-action="edit-supplier" data-id="${supplier._id}">Edit</button>`);
		}

		if (canDelete) {
			actions.push(`<button class="table-action delete" data-action="delete-supplier" data-id="${supplier._id}">Delete</button>`);
		}

		const products = Array.isArray(supplier.products) && supplier.products.length
			? supplier.products.join(', ')
			: '—';

		row.innerHTML = `
			<td>${supplier.name || '—'}</td>
			<td>${supplier.contact || '—'}</td>
			<td>${supplier.email || '—'}</td>
			<td>${products}</td>
			<td>${actions.length ? `<div class="table-actions">${actions.join('')}</div>` : '—'}</td>
		`;

		suppliersTableBody.appendChild(row);
	});
}

function populateSupplierOptions() {
	if (itemSupplierSelect) {
		const selected = itemSupplierSelect.value;
		itemSupplierSelect.innerHTML = '<option value="">Select supplier (optional)</option>';

		suppliers.forEach((supplier) => {
			const option = document.createElement('option');
			option.value = supplier._id;
			option.textContent = supplier.name;
			itemSupplierSelect.appendChild(option);
		});

		if (selected && suppliers.some((supplier) => supplier._id === selected)) {
			itemSupplierSelect.value = selected;
		}
	}

	if (itemSupplierFilter) {
		const previousValue = itemSupplierFilter.value;
		itemSupplierFilter.innerHTML = '<option value="">All Suppliers</option>';

		suppliers.forEach((supplier) => {
			const option = document.createElement('option');
			option.value = supplier._id;
			option.textContent = supplier.name;
			itemSupplierFilter.appendChild(option);
		});

		if (previousValue && suppliers.some((supplier) => supplier._id === previousValue)) {
			itemSupplierFilter.value = previousValue;
		} else {
			itemSupplierFilter.value = '';
			itemFilters.supplierId = '';
		}
	}
}

function updateCategoryFilterOptions() {
	if (!itemCategoryFilter) return;
	const dataset = masterItems.length ? masterItems : items;
	const previousValue = itemCategoryFilter.value;
	const categories = Array.from(
		new Set(
			dataset
				.map((item) => (item.category || '').trim())
				.filter((category) => category.length)
		)
	)
		.sort((a, b) => a.localeCompare(b));

	itemCategoryFilter.innerHTML = '<option value="">All Categories</option>';
	categories.forEach((category) => {
		const option = document.createElement('option');
		option.value = category;
		option.textContent = category;
		itemCategoryFilter.appendChild(option);
	});

	if (previousValue && categories.includes(previousValue)) {
		itemCategoryFilter.value = previousValue;
	} else {
		itemCategoryFilter.value = '';
		itemFilters.category = '';
	}
}

function populateSaleItemOptions() {
	if (!saleItemSelect) return;
	const combined = new Map();
	masterItems.forEach((item) => {
		if (item && item._id) combined.set(item._id, item);
	});
	items.forEach((item) => {
		if (item && item._id) combined.set(item._id, item);
	});
	const dataset = Array.from(combined.values()).filter((item) => (Number(item?.quantity) || 0) > 0);
	const previousValue = saleItemSelect.value;
	saleItemSelect.innerHTML = '<option value="">Select item</option>';

	dataset
		.slice()
		.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
		.forEach((item) => {
			const option = document.createElement('option');
			option.value = item._id;
			const unitPrice = Number(item.price) || 0;
			option.textContent = `${item.name} (${formatCurrency(unitPrice)})`;
			saleItemSelect.appendChild(option);
		});

	if (previousValue && dataset.some((item) => item._id === previousValue)) {
		saleItemSelect.value = previousValue;
	} else {
		saleItemSelect.value = '';
	}

	updateSaleTotalPreview();
}

function populateStockAdjustOptions() {
	if (!stockAdjustItemSelect) return;
	const combined = new Map();
	masterItems.forEach((item) => {
		if (item && item._id) combined.set(item._id, item);
	});
	items.forEach((item) => {
		if (item && item._id) combined.set(item._id, item);
	});

	const dataset = Array.from(combined.values());
	const previousValue = stockAdjustItemSelect.value;
	stockAdjustItemSelect.innerHTML = '<option value="">Select item</option>';

	dataset
		.slice()
		.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
		.forEach((item) => {
			const option = document.createElement('option');
			option.value = item._id;
			const quantity = Number(item.quantity) || 0;
			option.textContent = `${item.name} (Qty: ${quantity})`;
			stockAdjustItemSelect.appendChild(option);
		});

	if (previousValue && dataset.some((item) => item._id === previousValue)) {
		stockAdjustItemSelect.value = previousValue;
	} else {
		stockAdjustItemSelect.value = '';
	}
}

async function handleStockAdjustSubmit(event) {
	event.preventDefault();
	clearMessage(stockAdjustMessage);

	if (!stockAdjustItemSelect || !stockAdjustAmountInput || !stockAdjustOperationSelect) {
		return;
	}

	if (!canManageInventory()) {
		showMessage(stockAdjustMessage, 'You do not have permission to adjust stock.', 'error');
		return;
	}

	const itemId = stockAdjustItemSelect.value;
	const operation = stockAdjustOperationSelect.value || 'increase';
	const amountValue = Number(stockAdjustAmountInput.value);

	if (!itemId) {
		showMessage(stockAdjustMessage, 'Please choose an item to adjust.', 'error');
		return;
	}

	const allowZero = operation === 'set';
	if (Number.isNaN(amountValue) || amountValue < 0 || (!allowZero && amountValue === 0)) {
		showMessage(stockAdjustMessage, 'Provide a valid adjustment amount.', 'error');
		return;
	}

	const payload = {
		amount: amountValue,
		operation
	};

	try {
		const response = await apiFetch(`/items/${itemId}/adjust-stock`, {
			method: 'PATCH',
			body: JSON.stringify(payload)
		});
		const data = await parseJson(response);

		if (response.ok) {
			if (data && data._id) {
				masterItems = mergeInventoryRecord(masterItems, data);
			}
			showMessage(stockAdjustMessage, 'Stock updated successfully.', 'success');
			await fetchItems();
			await loadLowStockAlerts();
			renderOverviewMetrics();
			populateSaleItemOptions();
			populateStockAdjustOptions();
			if (stockAdjustAmountInput) stockAdjustAmountInput.value = '';
			if (stockAdjustOperationSelect) stockAdjustOperationSelect.value = 'increase';
		} else {
			showMessage(stockAdjustMessage, data.message || 'Unable to adjust stock.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Adjust stock error:', error);
		showMessage(stockAdjustMessage, 'Unable to adjust stock.', 'error');
	}
}

function resetStockAdjustForm() {
	if (!stockAdjustForm) return;
	stockAdjustForm.reset();
	if (stockAdjustItemSelect) stockAdjustItemSelect.value = '';
	if (stockAdjustOperationSelect) stockAdjustOperationSelect.value = 'increase';
	if (stockAdjustAmountInput) stockAdjustAmountInput.value = '';
	clearMessage(stockAdjustMessage);
}

function setDefaultSaleDate() {
	if (!saleDateInput) return;
	saleDateInput.value = formatDateForInput(new Date());
}

function updateSaleTotalPreview() {
	if (!saleTotalDisplay) return;
	const quantity = Number(saleQuantityInput?.value);
	const itemId = saleItemSelect?.value;
	const dataset = masterItems.length ? masterItems : items;
	const match = dataset.find((record) => record._id === itemId);
	const unitPrice = Number(match?.price) || 0;
	const validQuantity = !Number.isNaN(quantity) && quantity > 0 ? quantity : 0;
	const total = unitPrice * validQuantity;
	saleTotalDisplay.textContent = formatCurrency(total);
}

async function handleSaleSubmit(event) {
	event.preventDefault();
	clearMessage(saleFormMessage);

	if (!saleForm || !saleItemSelect || !saleQuantityInput) return;

	const itemId = saleItemSelect.value;
	const quantity = Number(saleQuantityInput.value);
	const saleDate = saleDateInput?.value;

	if (!itemId) {
		showMessage(saleFormMessage, 'Please select an item to sell.', 'error');
		return;
	}

	if (Number.isNaN(quantity) || quantity <= 0) {
		showMessage(saleFormMessage, 'Quantity must be at least 1.', 'error');
		return;
	}

	const payload = {
		itemId,
		quantitySold: quantity
	};

	if (saleDate) {
		payload.date = saleDate;
	}

	try {
		const response = await apiFetch('/sales', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		const data = await parseJson(response);

		if (response.ok) {
			showMessage(saleFormMessage, 'Sale recorded successfully!', 'success');
			resetSaleForm();
			await fetchItems();
			await loadLowStockAlerts();
			if (canViewSalesData()) {
				await fetchSales();
				await loadSalesSummary();
				await loadRevenueSummary();
			}
			renderOverviewMetrics();
		} else {
			showMessage(saleFormMessage, data.message || 'Unable to record sale.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Record sale error:', error);
		showMessage(saleFormMessage, 'Unable to record sale.', 'error');
	}
}

function resetSaleForm() {
	saleForm?.reset();
	setDefaultSaleDate();
	updateSaleTotalPreview();
	clearMessage(saleFormMessage);
}

function applySalesFilters() {
	if (!canViewSalesData()) return;
	const from = salesFilterFromInput?.value || '';
	const to = salesFilterToInput?.value || '';

	if (from && to && new Date(from) > new Date(to)) {
		showMessage(salesTableMessage, 'From date cannot be after to date.', 'error');
		return;
	}

	saleFilters = { from, to };
	fetchSales();
}

function resetSalesFilters() {
	if (!canViewSalesData()) return;
	saleFilters = { from: '', to: '' };
	if (salesFilterFromInput) salesFilterFromInput.value = '';
	if (salesFilterToInput) salesFilterToInput.value = '';
	fetchSales();
}

async function fetchSales() {
	if (!canViewSalesData()) return;

	try {
		clearMessage(salesTableMessage);
		const params = new URLSearchParams();
		if (saleFilters.from) params.set('from', saleFilters.from);
		if (saleFilters.to) params.set('to', saleFilters.to);
		const query = params.toString();
		const response = await apiFetch(`/sales${query ? `?${query}` : ''}`);
		const data = await parseJson(response);

		if (response.ok) {
			sales = Array.isArray(data) ? data : [];
			renderSalesTable();
		} else {
			sales = [];
			renderSalesTable();
			showMessage(salesTableMessage, data.message || 'Failed to load sales.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Fetch sales error:', error);
		showMessage(salesTableMessage, 'Failed to load sales.', 'error');
	}
}

function renderSalesTable() {
	if (!salesTableBody || !salesEmptyState) return;
	salesTableBody.innerHTML = '';

	if (!sales.length) {
		salesEmptyState.classList.remove('hidden');
		return;
	}

	salesEmptyState.classList.add('hidden');

	sales.forEach((sale) => {
		const row = document.createElement('tr');
		const saleDate = formatDate(sale.date);
		const itemName = sale.itemId?.name || '—';
		const soldBy = sale.soldBy?.username || '—';
		row.innerHTML = `
			<td>${saleDate}</td>
			<td>${itemName}</td>
			<td>${Number(sale.quantitySold) || 0}</td>
			<td>${formatCurrency(sale.totalAmount)}</td>
			<td>${soldBy}</td>
		`;
		salesTableBody.appendChild(row);
	});
}

async function loadSalesSummary() {
	if (!canViewSalesData()) return;
	if (reportsMessage) clearMessage(reportsMessage);

	try {
		const params = new URLSearchParams();
		if (salesSummaryPeriodSelect) {
			params.set('period', salesSummaryPeriodSelect.value || 'daily');
		}
		if (salesSummaryFromInput?.value) params.set('from', salesSummaryFromInput.value);
		if (salesSummaryToInput?.value) params.set('to', salesSummaryToInput.value);

		const query = params.toString();
		const response = await apiFetch(`/reports/sales-summary${query ? `?${query}` : ''}`);
		const data = await parseJson(response);

		if (response.ok) {
			latestSalesSummary = Array.isArray(data) ? data : [];
			renderSalesTrendChart();
		} else {
			latestSalesSummary = [];
			renderSalesTrendChart();
			if (reportsMessage) {
				showMessage(reportsMessage, data.message || 'Unable to load sales summary.', 'error');
			}
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Sales summary fetch error:', error);
		if (reportsMessage) {
			showMessage(reportsMessage, 'Unable to load sales summary.', 'error');
		}
	}
}

function renderSalesTrendChart() {
	if (!salesTrendCanvas || typeof Chart === 'undefined') return;

	if (salesTrendChart) {
		salesTrendChart.destroy();
		salesTrendChart = undefined;
	}

	if (!latestSalesSummary.length) {
		const context = salesTrendCanvas.getContext('2d');
		context?.clearRect(0, 0, salesTrendCanvas.width, salesTrendCanvas.height);
		return;
	}

	const labels = latestSalesSummary.map((entry) => entry.period);
	const revenueData = latestSalesSummary.map((entry) => Number(entry.totalAmount) || 0);
	const quantityData = latestSalesSummary.map((entry) => Number(entry.totalQuantity) || 0);

	salesTrendChart = new Chart(salesTrendCanvas, {
		type: 'line',
		data: {
			labels,
			datasets: [
				{
					label: 'Revenue',
					data: revenueData,
					borderColor: '#667eea',
					backgroundColor: 'rgba(102, 126, 234, 0.2)',
					tension: 0.35,
					fill: true,
					yAxisID: 'y'
				},
				{
					label: 'Units Sold',
					data: quantityData,
					type: 'bar',
					backgroundColor: 'rgba(231, 76, 60, 0.35)',
					borderColor: '#e74c3c',
					borderWidth: 1,
					yAxisID: 'y1'
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
			scales: {
				y: {
					type: 'linear',
					position: 'left',
					beginAtZero: true,
					ticks: {
						callback: (value) => formatCurrency(value)
					}
				},
				y1: {
					type: 'linear',
					position: 'right',
					beginAtZero: true,
					grid: { drawOnChartArea: false }
				}
			},
			plugins: {
				legend: { position: 'bottom' },
				tooltip: {
					callbacks: {
						label(context) {
							const label = context.dataset.label || '';
							const value = context.parsed.y;
							if (label === 'Revenue') {
								return `${label}: ${formatCurrency(value)}`;
							}
							return `${label}: ${value?.toLocaleString()}`;
						}
					}
				}
			}
		}
	});
}

function renderCategoryChart() {
	if (!categoryStockCanvas || typeof Chart === 'undefined') return;

	if (categoryStockChart) {
		categoryStockChart.destroy();
		categoryStockChart = undefined;
	}

	const dataset = masterItems.length ? masterItems : items;
	const aggregated = dataset.reduce((acc, item) => {
		const category = item.category || 'Uncategorised';
		const quantity = Number(item.quantity) || 0;
		acc[category] = (acc[category] || 0) + quantity;
		return acc;
	}, {});

	const labels = Object.keys(aggregated);
	const values = Object.values(aggregated);

	if (!labels.length) {
		const context = categoryStockCanvas.getContext('2d');
		context?.clearRect(0, 0, categoryStockCanvas.width, categoryStockCanvas.height);
		return;
	}

	const colors = labels.map((_, index) => {
		const baseHue = (index * 47) % 360;
		return `hsla(${baseHue}, 65%, 60%, 0.6)`;
	});

	categoryStockChart = new Chart(categoryStockCanvas, {
		type: 'bar',
		data: {
			labels,
			datasets: [
				{
					label: 'Units In Stock',
					data: values,
					backgroundColor: colors,
					borderColor: '#667eea',
					borderWidth: 1
				}
			]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: {
					beginAtZero: true
				}
			},
			plugins: {
				legend: { display: false }
			}
		}
	});
}

async function loadRevenueSummary() {
	if (!canViewSalesData() || !revenueSummaryBox) return;
	if (reportsMessage) clearMessage(reportsMessage);

	try {
		const params = new URLSearchParams();
		if (revenueFromInput?.value) params.set('from', revenueFromInput.value);
		if (revenueToInput?.value) params.set('to', revenueToInput.value);
		const query = params.toString();
		const response = await apiFetch(`/reports/revenue${query ? `?${query}` : ''}`);
		const data = await parseJson(response);

		if (response.ok) {
			latestRevenueSummary = data;
			renderRevenueSummary();
			renderOverviewMetrics();
		} else {
			latestRevenueSummary = null;
			renderRevenueSummary('No revenue data available.');
			if (reportsMessage) {
				showMessage(reportsMessage, data.message || 'Unable to load revenue summary.', 'error');
			}
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Revenue summary error:', error);
		latestRevenueSummary = null;
		renderRevenueSummary('Unable to load revenue summary.');
		if (reportsMessage) {
			showMessage(reportsMessage, 'Unable to load revenue summary.', 'error');
		}
	}
}

function renderRevenueSummary(fallbackMessage) {
	if (!revenueSummaryBox) return;

	if (!latestRevenueSummary) {
		revenueSummaryBox.innerHTML = `<p>${fallbackMessage || 'No revenue data to display.'}</p>`;
		return;
	}

	const { from, to, totalRevenue, totalQuantity, orderCount, averageOrderValue } = latestRevenueSummary;
	const periodText = `${formatDate(from)} - ${formatDate(to)}`;
	const content = `
		<p><strong>Period:</strong> ${periodText}</p>
		<p><strong>Total Revenue:</strong> ${formatCurrency(totalRevenue)}</p>
		<p><strong>Units Sold:</strong> ${Number(totalQuantity || 0).toLocaleString()}</p>
		<p><strong>Orders:</strong> ${Number(orderCount || 0).toLocaleString()}</p>
		<p><strong>Average Order Value:</strong> ${formatCurrency(averageOrderValue)}</p>
	`;
	revenueSummaryBox.innerHTML = content;
}

function exportSalesSummaryCsv() {
	if (!latestSalesSummary.length) {
		if (reportsMessage) {
			showMessage(reportsMessage, 'No sales summary to export.', 'error');
		}
		return;
	}

	const rows = [['Period', 'Units Sold', 'Revenue']];
	latestSalesSummary.forEach((entry) => {
		rows.push([entry.period, entry.totalQuantity, Number(entry.totalAmount || 0).toFixed(2)]);
	});

	downloadCsv('sales-summary.csv', rows);
}

function exportRevenueCsv() {
	if (!latestRevenueSummary) {
		if (reportsMessage) {
			showMessage(reportsMessage, 'No revenue summary to export.', 'error');
		}
		return;
	}

	const rows = [
		['From', 'To', 'Total Revenue', 'Units Sold', 'Orders', 'Average Order Value'],
		[
			formatDateForInput(new Date(latestRevenueSummary.from || Date.now())),
			formatDateForInput(new Date(latestRevenueSummary.to || Date.now())),
			Number(latestRevenueSummary.totalRevenue || 0).toFixed(2),
			latestRevenueSummary.totalQuantity || 0,
			latestRevenueSummary.orderCount || 0,
			Number(latestRevenueSummary.averageOrderValue || 0).toFixed(2)
		]
	];

	downloadCsv('revenue-summary.csv', rows);
}

function applyItemFilters() {
	if (itemSearchInput) {
		itemFilters.search = itemSearchInput.value.trim();
	}

	if (lowStockToggle) {
		itemFilters.lowStockOnly = !!lowStockToggle.checked;
	}

	if (itemCategoryFilter) {
		itemFilters.category = itemCategoryFilter.value;
	}

	if (itemSupplierFilter) {
		itemFilters.supplierId = itemSupplierFilter.value;
	}

	fetchItems();
}

function resetItemFilters() {
	itemFilters = { search: '', lowStockOnly: false, category: '', supplierId: '' };
	if (itemSearchInput) itemSearchInput.value = '';
	if (lowStockToggle) lowStockToggle.checked = false;
	if (itemCategoryFilter) itemCategoryFilter.value = '';
	if (itemSupplierFilter) itemSupplierFilter.value = '';
	fetchItems();
}

function handleItemSearchKeyPress(event) {
	if (event.key === 'Enter') {
		event.preventDefault();
		applyItemFilters();
	}
}

function handleLowStockToggle() {
	if (!lowStockToggle) return;
	itemFilters.lowStockOnly = !!lowStockToggle.checked;
	applyItemFilters();
}

function handleItemCategoryFilter() {
	applyItemFilters();
}

function handleItemSupplierFilter() {
	applyItemFilters();
}

function handleItemsTableClick(event) {
	const button = event.target.closest('.table-action');
	if (!button) return;

	const { action, id } = button.dataset;
	if (!id) return;

	if (action === 'edit-item') {
		handleEditItem(id);
	}

	if (action === 'delete-item') {
		handleDeleteItem(id);
	}
}

function handleSuppliersTableClick(event) {
	const button = event.target.closest('.table-action');
	if (!button) return;

	const { action, id } = button.dataset;
	if (!id) return;

	if (action === 'edit-supplier') {
		handleEditSupplier(id);
	}

	if (action === 'delete-supplier') {
		handleDeleteSupplier(id);
	}
}

function handleEditItem(id) {
	if (!['admin', 'manager'].includes(currentUser.role)) return;
	const item = items.find((record) => record._id === id);
	if (!item) return;

	editingItemId = id;
	if (itemIdInput) itemIdInput.value = id;
	if (itemFormTitle) itemFormTitle.textContent = 'Edit Item';
	if (itemNameInput) itemNameInput.value = item.name || '';
	if (itemCategoryInput) itemCategoryInput.value = item.category || '';
	if (itemSupplierSelect) itemSupplierSelect.value = item.supplierId?._id || '';
	if (itemQuantityInput) itemQuantityInput.value = item.quantity ?? 0;
	if (itemReorderInput) itemReorderInput.value = item.reorderLevel ?? 0;
	if (itemPriceInput) itemPriceInput.value = item.price ?? 0;
	if (itemCancelEdit) itemCancelEdit.classList.remove('hidden');
	clearMessage(itemFormMessage);
	itemFormPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleDeleteItem(id) {
	if (currentUser.role !== 'admin') return;
	const confirmed = window.confirm('Are you sure you want to delete this item?');
	if (!confirmed) return;

	try {
		const response = await apiFetch(`/items/${id}`, { method: 'DELETE' });
		const data = await parseJson(response);

		if (response.ok) {
			if (editingItemId === id) {
				resetItemForm();
			}
			await fetchItems();
			showMessage(itemMessage, data.message || 'Item deleted successfully.', 'success');
		} else {
			showMessage(itemMessage, data.message || 'Unable to delete item.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Delete item error:', error);
		showMessage(itemMessage, 'Unable to delete item.', 'error');
	}
}

async function handleItemSubmit(event) {
	event.preventDefault();
	clearMessage(itemFormMessage);

	if (!['admin', 'manager'].includes(currentUser.role)) {
		showMessage(itemFormMessage, 'You do not have permission to modify items.', 'error');
		return;
	}

	const name = itemNameInput?.value.trim();
	const category = itemCategoryInput?.value.trim();
	const supplierId = itemSupplierSelect?.value;
	const quantity = Number(itemQuantityInput?.value);
	const reorderLevel = Number(itemReorderInput?.value);
	const price = Number(itemPriceInput?.value);

	if (!name || !category) {
		showMessage(itemFormMessage, 'Name and category are required.', 'error');
		return;
	}

	if ([quantity, reorderLevel, price].some((value) => Number.isNaN(value))) {
		showMessage(itemFormMessage, 'Quantity, reorder level, and price must be valid numbers.', 'error');
		return;
	}

	if (quantity < 0 || reorderLevel < 0 || price < 0) {
		showMessage(itemFormMessage, 'Values cannot be negative.', 'error');
		return;
	}

	const payload = {
		name,
		category,
		quantity,
		reorderLevel,
		price
	};

	if (supplierId) {
		payload.supplierId = supplierId;
	}

	const isEdit = Boolean(editingItemId);
	const endpoint = isEdit ? `/items/${editingItemId}` : '/items';
	const method = isEdit ? 'PUT' : 'POST';

	try {
		const response = await apiFetch(endpoint, {
			method,
			body: JSON.stringify(payload)
		});
		const data = await parseJson(response);

		if (response.ok) {
			await fetchItems();
			showMessage(itemFormMessage, isEdit ? 'Item updated successfully!' : 'Item added successfully!', 'success');
			if (isEdit) {
				resetItemForm();
			} else {
				itemForm?.reset();
				if (itemSupplierSelect) itemSupplierSelect.value = '';
			}
		} else {
			showMessage(itemFormMessage, data.message || 'Unable to save item.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Save item error:', error);
		showMessage(itemFormMessage, 'Unable to save item. Please try again.', 'error');
	}
}

function resetItemForm() {
	editingItemId = null;
	itemForm?.reset();
	if (itemSupplierSelect) itemSupplierSelect.value = '';
	if (itemIdInput) itemIdInput.value = '';
	if (itemFormTitle) itemFormTitle.textContent = 'Add Item';
	if (itemCancelEdit) itemCancelEdit.classList.add('hidden');
	clearMessage(itemFormMessage);
}

function handleEditSupplier(id) {
	if (!['admin', 'manager'].includes(currentUser.role)) return;
	const supplier = suppliers.find((record) => record._id === id);
	if (!supplier) return;

	editingSupplierId = id;
	if (supplierIdInput) supplierIdInput.value = id;
	if (supplierFormTitle) supplierFormTitle.textContent = 'Edit Supplier';
	if (supplierNameInput) supplierNameInput.value = supplier.name || '';
	if (supplierContactInput) supplierContactInput.value = supplier.contact || '';
	if (supplierEmailInput) supplierEmailInput.value = supplier.email || '';
	if (supplierAddressInput) supplierAddressInput.value = supplier.address || '';
	if (supplierProductsInput) supplierProductsInput.value = Array.isArray(supplier.products) ? supplier.products.join(', ') : '';
	if (supplierCancelEdit) supplierCancelEdit.classList.remove('hidden');
	clearMessage(supplierFormMessage);
	supplierFormPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleDeleteSupplier(id) {
	if (currentUser.role !== 'admin') return;
	const confirmed = window.confirm('Are you sure you want to delete this supplier?');
	if (!confirmed) return;

	try {
		const response = await apiFetch(`/suppliers/${id}`, { method: 'DELETE' });
		const data = await parseJson(response);

		if (response.ok) {
			if (editingSupplierId === id) {
				resetSupplierForm();
			}
			await fetchSuppliers();
			await fetchItems();
			showMessage(supplierMessage, data.message || 'Supplier deleted successfully.', 'success');
		} else {
			showMessage(supplierMessage, data.message || 'Unable to delete supplier.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Delete supplier error:', error);
		showMessage(supplierMessage, 'Unable to delete supplier.', 'error');
	}
}

async function handleSupplierSubmit(event) {
	event.preventDefault();
	clearMessage(supplierFormMessage);

	if (!['admin', 'manager'].includes(currentUser.role)) {
		showMessage(supplierFormMessage, 'You do not have permission to modify suppliers.', 'error');
		return;
	}

	const name = supplierNameInput?.value.trim();
	if (!name) {
		showMessage(supplierFormMessage, 'Supplier name is required.', 'error');
		return;
	}

	const payload = {
		name,
		contact: supplierContactInput?.value.trim() || undefined,
		email: supplierEmailInput?.value.trim() || undefined,
		address: supplierAddressInput?.value.trim() || undefined,
		products: serialiseProducts(supplierProductsInput?.value)
	};

	const isEdit = Boolean(editingSupplierId);
	const endpoint = isEdit ? `/suppliers/${editingSupplierId}` : '/suppliers';
	const method = isEdit ? 'PUT' : 'POST';

	try {
		const response = await apiFetch(endpoint, {
			method,
			body: JSON.stringify(payload)
		});
		const data = await parseJson(response);

		if (response.ok) {
			await fetchSuppliers();
			await fetchItems();
			showMessage(supplierFormMessage, isEdit ? 'Supplier updated successfully!' : 'Supplier added successfully!', 'success');
			resetSupplierForm();
		} else {
			showMessage(supplierFormMessage, data.message || 'Unable to save supplier.', 'error');
		}
	} catch (error) {
		if (error.message === 'Unauthorized') {
			return;
		}
		console.error('Save supplier error:', error);
		showMessage(supplierFormMessage, 'Unable to save supplier. Please try again.', 'error');
	}
}

function resetSupplierForm() {
	editingSupplierId = null;
	supplierForm?.reset();
	if (supplierIdInput) supplierIdInput.value = '';
	if (supplierFormTitle) supplierFormTitle.textContent = 'Add Supplier';
	if (supplierProductsInput) supplierProductsInput.value = '';
	if (supplierCancelEdit) supplierCancelEdit.classList.add('hidden');
	clearMessage(supplierFormMessage);
}

async function apiFetch(path, options = {}) {
	const headers = options.headers ? { ...options.headers } : {};

	if (currentUser.token) {
		headers.Authorization = `Bearer ${currentUser.token}`;
	}

	if (options.body && !headers['Content-Type']) {
		headers['Content-Type'] = 'application/json';
	}

	const response = await fetch(`${API_URL}${path}`, { ...options, headers });

	if (response.status === 401) {
		handleUnauthorized();
		throw new Error('Unauthorized');
	}

	return response;
}

function handleUnauthorized() {
	forceLogout('Session expired. Please log in again.');
}

async function parseJson(response) {
	try {
		const text = await response.text();
		return text ? JSON.parse(text) : {};
	} catch (error) {
		return {};
	}
}

function serialiseProducts(value) {
	if (!value) return [];
	return value
		.split(',')
		.map((token) => token.trim())
		.filter((token) => token.length);
}

function formatCurrency(value) {
	const numberValue = Number(value);
	if (Number.isNaN(numberValue)) {
		return currencyFormatter.format(0);
	}
	return currencyFormatter.format(numberValue);
}

function formatRole(role) {
	if (!role) return 'Guest';
	return role.charAt(0).toUpperCase() + role.slice(1);
}

function resetDashboardState() {
	masterItems = [];
	items = [];
	suppliers = [];
	sales = [];
	itemFilters = { search: '', lowStockOnly: false, category: '', supplierId: '' };
	saleFilters = { from: '', to: '' };
	editingItemId = null;
	editingSupplierId = null;
	latestSalesSummary = [];
	latestRevenueSummary = null;

	if (itemSearchInput) itemSearchInput.value = '';
	if (lowStockToggle) lowStockToggle.checked = false;
	if (itemCategoryFilter) itemCategoryFilter.value = '';
	if (itemSupplierFilter) itemSupplierFilter.value = '';
	if (salesFilterFromInput) salesFilterFromInput.value = '';
	if (salesFilterToInput) salesFilterToInput.value = '';
	if (salesSummaryFromInput) salesSummaryFromInput.value = '';
	if (salesSummaryToInput) salesSummaryToInput.value = '';
	if (salesSummaryPeriodSelect) salesSummaryPeriodSelect.value = 'daily';
	if (revenueFromInput) revenueFromInput.value = '';
	if (revenueToInput) revenueToInput.value = '';
	setDefaultSaleDate();

	destroyCharts();
	if (lowStockList) lowStockList.innerHTML = '';
	if (lowStockList) lowStockList.classList.add('hidden');
	if (lowStockEmptyState) lowStockEmptyState.classList.add('hidden');
	if (overviewMetrics) overviewMetrics.innerHTML = '';
	if (revenueSummaryBox) revenueSummaryBox.innerHTML = '';

	clearMessage(itemMessage);
	clearMessage(supplierMessage);
	clearMessage(saleFormMessage);
	clearMessage(salesTableMessage);
	clearMessage(reportsMessage);

	renderItems();
	renderSuppliers();
	resetItemForm();
	resetSupplierForm();
	resetSaleForm();
	resetStockAdjustForm();
	updateHeader();
	updateUserInfo();
}

function canViewSalesData() {
	return currentUser.role === 'admin' || currentUser.role === 'manager';
}

function canManageInventory() {
	return currentUser.role === 'admin' || currentUser.role === 'manager';
}

function destroyCharts() {
	if (salesTrendChart) {
		salesTrendChart.destroy();
		salesTrendChart = undefined;
	}

	if (categoryStockChart) {
		categoryStockChart.destroy();
		categoryStockChart = undefined;
	}
}

function downloadCsv(filename, rows) {
	if (!Array.isArray(rows) || !rows.length) return;
	const csvContent = rows
		.map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
		.join('\n');

	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.href = url;
	link.download = filename;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
	if (value === null || value === undefined) return '';
	const stringValue = String(value).replace(/"/g, '""');
	if (/[",\n]/.test(stringValue)) {
		return `"${stringValue}"`;
	}
	return stringValue;
}

function mergeInventoryRecord(list, record) {
	if (!record || !record._id) return list;
	const index = list.findIndex((item) => item._id === record._id);
	if (index === -1) {
		return [...list, record];
	}
	const next = [...list];
	next[index] = { ...list[index], ...record };
	return next;
}

function formatDate(input) {
	if (!input) return '—';
	const date = input instanceof Date ? input : new Date(input);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

function formatDateForInput(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function showMessage(target, message, type = 'success') {
	const element = typeof target === 'string' ? document.getElementById(target) : target;
	if (!element) return;

	element.textContent = message;
	element.className = `message ${type}`;
	element.style.display = 'block';

	if (messageTimers.has(element)) {
		clearTimeout(messageTimers.get(element));
	}

	const timer = setTimeout(() => {
		element.style.display = 'none';
	}, 4000);

	messageTimers.set(element, timer);
}

function clearMessage(target) {
	const element = typeof target === 'string' ? document.getElementById(target) : target;
	if (!element) return;

	element.style.display = 'none';
	element.textContent = '';

	if (messageTimers.has(element)) {
		clearTimeout(messageTimers.get(element));
		messageTimers.delete(element);
	}
}

// Database Status Check
async function checkDatabaseStatus() {
	if (!dbStatusElement) return;

	try {
		const response = await fetch(`${API_URL}/health`);
		const data = await response.json();

		const statusText = dbStatusElement.querySelector('.status-text');
		
		// Remove all status classes
		dbStatusElement.classList.remove('connected', 'disconnected', 'connecting');
		
		if (data.database === 'connected') {
			dbStatusElement.classList.add('connected');
			statusText.textContent = 'Database Connected';
		} else if (data.database === 'connecting') {
			dbStatusElement.classList.add('connecting');
			statusText.textContent = 'Database Connecting...';
		} else {
			dbStatusElement.classList.add('disconnected');
			statusText.textContent = 'Database Disconnected';
		}
	} catch (error) {
		const statusText = dbStatusElement.querySelector('.status-text');
		dbStatusElement.classList.remove('connected', 'disconnected', 'connecting');
		dbStatusElement.classList.add('disconnected');
		statusText.textContent = 'Server Unreachable';
	}
}

// Check database status on page load and every 10 seconds
if (dbStatusElement) {
	checkDatabaseStatus();
	setInterval(checkDatabaseStatus, 10000);
}
