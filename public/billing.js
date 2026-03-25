// Billing System JavaScript
// Professional Point of Sale Application

// Configuration
const API_URL = window.location.origin + '/api';
const NOTIFICATION_STORAGE_KEY = 'notificationSettings';

// State
let cart = [];
let products = [];
let currentDiscount = 0;
let invoiceCounter = 1;

// Authentication
const token = localStorage.getItem('token');
const username = localStorage.getItem('username') || 'User';
const role = localStorage.getItem('role');

if (!token) {
    window.location.href = 'dashboard.html';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeBilling();
});

async function initializeBilling() {
    // Set initial data
    document.getElementById('staffName').textContent = username;
    document.getElementById('invoiceDate').textContent = new Date().toLocaleString();
    generateInvoiceNumber();

    // Load products
    await loadProducts();

    // Setup event listeners
    setupEventListeners();
}

function generateInvoiceNumber() {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0');
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    document.getElementById('invoiceNumber').textContent = `INV-${dateStr}-${randomNum}`;
}

async function loadProducts() {
    try {
        const response = await fetch(`${API_URL}/items`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load products');

        products = await response.json();
        console.log(`Loaded ${products.length} products`);
    } catch (error) {
        console.error('Error loading products:', error);
        showNotification('Failed to load products', 'error');
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('productSearch');

    // Product search with autocomplete
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        if (searchTerm.length < 2) {
            document.getElementById('productSuggestions').style.display = 'none';
            return;
        }

        const matches = products.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            (p.sku && p.sku.toLowerCase().includes(searchTerm)) ||
            p.category.toLowerCase().includes(searchTerm)
        ).slice(0, 10);

        displaySuggestions(matches);
    });

    // Enter key to add product
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addProductToCart();
        }
    });

    // Quantity input enter key
    document.getElementById('productQuantity').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addProductToCart();
        }
    });
}

function displaySuggestions(matches) {
    const suggestionsDiv = document.getElementById('productSuggestions');

    if (matches.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }

    const html = matches.map(product => `
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;" 
             onmouseover="this.style.background='#f0f0f0'" 
             onmouseout="this.style.background='white'"
             onclick="selectProduct('${product._id}')">
            <strong>${product.name}</strong> 
            <span style="color: #666; font-size: 12px;">(${product.category})</span>
            <br>
            <span style="color: #28a745; font-weight: bold;">₹${product.price}</span>
            <span style="color: #999; font-size: 12px; margin-left: 10px;">Stock: ${product.quantity}</span>
        </div>
    `).join('');

    suggestionsDiv.innerHTML = html;
    suggestionsDiv.style.display = 'block';
}

function selectProduct(productId) {
    const product = products.find(p => p._id === productId);
    if (!product) return;

    document.getElementById('productSearch').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productSuggestions').style.display = 'none';
    document.getElementById('productQuantity').focus();

    // Store selected product ID
    document.getElementById('productSearch').dataset.productId = productId;
}

function addProductToCart() {
    const productId = document.getElementById('productSearch').dataset.productId;
    const quantity = parseInt(document.getElementById('productQuantity').value);

    if (!productId) {
        showNotification('Please select a product first', 'error');
        return;
    }

    if (!quantity || quantity < 1) {
        showNotification('Please enter a valid quantity', 'error');
        return;
    }

    const product = products.find(p => p._id === productId);
    if (!product) {
        showNotification('Product not found', 'error');
        return;
    }

    // Check stock availability
    const existingItem = cart.find(item => item.productId === productId);
    const totalQuantity = (existingItem ? existingItem.quantity : 0) + quantity;

    if (totalQuantity > product.quantity) {
        showNotification(`Insufficient stock! Available: ${product.quantity}`, 'error');
        return;
    }

    // Add to cart
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            productId: product._id,
            name: product.name,
            price: product.price,
            quantity: quantity,
            availableStock: product.quantity
        });
    }

    // Clear inputs
    document.getElementById('productSearch').value = '';
    document.getElementById('productSearch').dataset.productId = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productQuantity').value = '1';

    // Update display
    renderCart();
    calculateTotals();

    showNotification(`Added ${product.name} to cart`, 'success');
}

function renderCart() {
    const tbody = document.getElementById('cartTableBody');

    if (cart.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cart">
                    <div style="font-size: 48px; margin-bottom: 10px;">🛒</div>
                    <p>No products added yet. Start by searching and adding products above.</p>
                </td>
            </tr>
        `;
        return;
    }

    const html = cart.map((item, index) => {
        const total = item.price * item.quantity;
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${item.productId.substring(0, 8)}...</td>
                <td><strong>${item.name}</strong></td>
                <td>₹${item.price.toFixed(2)}</td>
                <td>
                    <input type="number" class="qty-input" value="${item.quantity}" 
                           min="1" max="${item.availableStock}"
                           onchange="updateQuantity(${index}, this.value)">
                    <small style="color:#999; display:block; font-size:11px;">Max: ${item.availableStock}</small>
                </td>
                <td><strong>₹${total.toFixed(2)}</strong></td>
                <td>
                    <button class="remove-btn" onclick="removeFromCart(${index})">🗑️ Remove</button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
}

function updateQuantity(index, newQuantity) {
    const quantity = parseInt(newQuantity);

    if (quantity < 1) {
        showNotification('Quantity must be at least 1', 'error');
        renderCart();
        return;
    }

    if (quantity > cart[index].availableStock) {
        showNotification(`Maximum available: ${cart[index].availableStock}`, 'error');
        renderCart();
        return;
    }

    cart[index].quantity = quantity;
    renderCart();
    calculateTotals();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
    calculateTotals();
    showNotification('Item removed from cart', 'info');
}

function getNotificationSettings() {
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
        console.warn('Failed to read notification settings:', error);
    }

    return { lowStock: true, sales: true };
}

function showNotification(message, type = 'success') {
    const normalizedType = type || 'success';
    if ((normalizedType === 'success' || normalizedType === 'info') && !getNotificationSettings().sales) {
        return;
    }

    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${normalizedType} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gst = subtotal * 0.18; // 18% GST
    const discountAmount = subtotal * (currentDiscount / 100);
    const grandTotal = subtotal + gst - discountAmount;

    document.getElementById('subtotal').textContent = subtotal.toFixed(2);
    document.getElementById('gst').textContent = gst.toFixed(2);
    document.getElementById('discountAmount').textContent = discountAmount.toFixed(2);
    document.getElementById('grandTotal').textContent = grandTotal.toFixed(2);
}

function applyDiscount(percent) {
    currentDiscount = parseFloat(percent) || 0;
    document.getElementById('discountPercent').textContent = currentDiscount;
    document.getElementById('customDiscount').value = currentDiscount;

    // Update button states
    document.querySelectorAll('.discount-options button').forEach(btn => {
        btn.classList.remove('active');
    });

    calculateTotals();
}

async function saveBill() {
    if (cart.length === 0) {
        showNotification('Cart is empty! Add products first.', 'error');
        return;
    }

    const customerName = document.getElementById('customerName').value.trim();

    if (!customerName) {
        showNotification('Please enter customer name', 'error');
        return;
    }

    try {
        // Record each sale
        for (const item of cart) {
            const saleData = {
                itemId: item.productId,
                quantitySold: item.quantity,
                unitPrice: item.price,
                date: new Date().toISOString()
            };

            const response = await fetch(`${API_URL}/sales`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(saleData)
            });

            if (!response.ok) {
                throw new Error(`Failed to record sale for ${item.name}`);
            }
        }

        showNotification('✅ Bill saved successfully! Stock updated.', 'success');

        // Wait a moment then clear
        setTimeout(() => {
            clearBill();
        }, 2000);

    } catch (error) {
        console.error('Error saving bill:', error);
        showNotification('❌ Error saving bill: ' + error.message, 'error');
    }
}

function printReceipt() {
    if (cart.length === 0) {
        showNotification('Cart is empty! Nothing to print.', 'error');
        return;
    }

    window.print();
}

async function saveAndPrint() {
    if (cart.length === 0) {
        showNotification('Cart is empty!', 'error');
        return;
    }

    await saveBill();
    setTimeout(() => {
        printReceipt();
    }, 1000);
}

function clearBill() {
    if (cart.length > 0) {
        if (!confirm('Are you sure you want to clear all items?')) {
            return;
        }
    }

    cart = [];
    currentDiscount = 0;

    document.getElementById('customerName').value = '';
    document.getElementById('customerContact').value = '';
    document.getElementById('customerId').value = '';
    document.getElementById('productSearch').value = '';
    document.getElementById('productQuantity').value = '1';
    document.getElementById('productPrice').value = '';
    document.getElementById('customDiscount').value = '0';

    renderCart();
    calculateTotals();
    generateInvoiceNumber();

    showNotification('Bill cleared', 'success');
}

// Barcode scanner simulation (can be replaced with actual scanner)
document.querySelector('.scan-icon')?.addEventListener('click', () => {
    showNotification('📷 Barcode scanner activated. Focus on search field and scan...', 'info');
    document.getElementById('productSearch').focus();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // F9 to save bill
    if (e.key === 'F9') {
        e.preventDefault();
        saveBill();
    }

    // F10 to print
    if (e.key === 'F10') {
        e.preventDefault();
        printReceipt();
    }

    // ESC to clear
    if (e.key === 'Escape') {
        clearBill();
    }
});

// Initialize
calculateTotals();
