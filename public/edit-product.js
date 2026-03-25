// Auto-detect API URL
const API_URL = (() => {
    if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        // In production, use same host as frontend
        // In development (localhost), use port 5000
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return `${protocol}//${hostname}:5000/api`;
        }
        return `${protocol}//${hostname}${port ? ':' + port : ''}/api`;
    }
    return 'http://localhost:5000/api';
})();

const PUBLIC_APP_BASE_URL = (() => {
    if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return `${protocol}//${hostname}:5000`;
        }
        return `${protocol}//${hostname}${port ? ':' + port : ''}`;
    }
    return 'http://localhost:5000';
})();

// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

let currentProduct = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    if (!productId) {
        showMessage('No product ID provided', 'error');
        setTimeout(() => window.location.href = 'dashboard.html', 2000);
        return;
    }

    await loadProduct();
    await loadSuppliers();
    setupEventListeners();
});

// Load product data
async function loadProduct() {
    try {
        const response = await fetch(`${API_URL}/items/${productId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load product');
        }

        currentProduct = await response.json();
        populateForm(currentProduct);
        updatePreviewLink();
        showMessage('Product loaded successfully', 'success');
        setTimeout(() => hideMessage(), 2000);
    } catch (error) {
        console.error('Error loading product:', error);
        showMessage('Error loading product: ' + error.message, 'error');
    }
}

// Populate form with product data
function populateForm(product) {
    document.getElementById('name').value = product.name || '';
    document.getElementById('barcode').value = product.barcode || '';
    document.getElementById('category').value = product.category || '';
    document.getElementById('price').value = product.price || 0;
    document.getElementById('quantity').value = product.quantity || 0;
    document.getElementById('reorderLevel').value = product.reorderLevel || 0;
    document.getElementById('unit').value = product.unit || '';
    document.getElementById('description').value = product.description || '';
    document.getElementById('specifications').value = product.specifications || '';
    document.getElementById('notes').value = product.notes || '';
    document.getElementById('tags').value = product.tags ? product.tags.join(', ') : '';
    document.getElementById('isEcommerceEnabled').checked = product.isEcommerceEnabled || false;
    document.getElementById('ecommerceVisibility').value = product.ecommerceVisibility || 'public';

    if (product.supplier) {
        document.getElementById('supplier').value = product.supplier._id || product.supplier;
    }

    // Load images
    loadImages(product.images || []);
}

// Load product images
function loadImages(images) {
    const gallery = document.getElementById('imageGallery');
    gallery.innerHTML = '';

    if (!images || images.length === 0) {
        gallery.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#999;">No images uploaded yet</p>';
        return;
    }

    images.forEach((image, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';
        if (index === 0) imageItem.classList.add('primary');

        imageItem.innerHTML = `
            <img src="${image}" alt="Product image ${index + 1}" onerror="this.src='/placeholder.jpg'">
            ${index === 0 ? '<div class="image-badge">Primary</div>' : ''}
            <div class="image-actions">
                ${index !== 0 ? `<button type="button" onclick="setPrimaryImage(${index})">★</button>` : ''}
                <button type="button" onclick="removeImage(${index})">×</button>
            </div>
        `;

        gallery.appendChild(imageItem);
    });
}

// Load suppliers for dropdown
async function loadSuppliers() {
    try {
        const response = await fetch(`${API_URL}/suppliers`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const suppliers = await response.json();
            const supplierSelect = document.getElementById('supplier');

            suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier._id;
                option.textContent = supplier.name;
                supplierSelect.appendChild(option);
            });

            // Set current supplier if exists
            if (currentProduct && currentProduct.supplier) {
                supplierSelect.value = currentProduct.supplier._id || currentProduct.supplier;
            }
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', saveProduct);

    // Image upload area
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');

    uploadArea.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', (e) => {
        handleImageUpload(e.target.files);
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleImageUpload(e.dataTransfer.files);
    });
}

// Handle image upload
async function handleImageUpload(files) {
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(file => {
        if (!file.type.startsWith('image/')) {
            showMessage(`${file.name} is not an image file`, 'error');
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            showMessage(`${file.name} is too large (max 5MB)`, 'error');
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) return;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Uploading...';

    try {
        const uploadedUrls = [];

        for (const file of validFiles) {
            const base64 = await fileToBase64(file);
            uploadedUrls.push(base64);
        }

        // Add to current images
        currentProduct.images = currentProduct.images || [];
        currentProduct.images.push(...uploadedUrls);

        loadImages(currentProduct.images);
        showMessage(`${validFiles.length} image(s) uploaded successfully`, 'success');
    } catch (error) {
        console.error('Error uploading images:', error);
        showMessage('Error uploading images: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="btn-text">Save Changes</span>';
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Set primary image
function setPrimaryImage(index) {
    if (!currentProduct.images || index >= currentProduct.images.length) return;

    const images = [...currentProduct.images];
    const [primaryImage] = images.splice(index, 1);
    images.unshift(primaryImage);

    currentProduct.images = images;
    loadImages(images);
    showMessage('Primary image updated', 'info');
}

// Remove image
function removeImage(index) {
    if (!confirm('Are you sure you want to remove this image?')) return;

    if (!currentProduct.images || index >= currentProduct.images.length) return;

    currentProduct.images.splice(index, 1);
    loadImages(currentProduct.images);
    showMessage('Image removed', 'info');
}

// Save product
async function saveProduct(e) {
    e.preventDefault();

    const form = document.getElementById('editForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        const formData = {
            name: document.getElementById('name').value.trim(),
            barcode: document.getElementById('barcode').value.trim(),
            category: document.getElementById('category').value.trim(),
            supplier: document.getElementById('supplier').value || null,
            price: parseFloat(document.getElementById('price').value),
            quantity: parseInt(document.getElementById('quantity').value),
            reorderLevel: parseInt(document.getElementById('reorderLevel').value) || 0,
            unit: document.getElementById('unit').value.trim(),
            description: document.getElementById('description').value.trim(),
            specifications: document.getElementById('specifications').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            tags: document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
            isEcommerceEnabled: document.getElementById('isEcommerceEnabled').checked,
            ecommerceVisibility: document.getElementById('ecommerceVisibility').value,
            images: currentProduct.images || []
        };

        const response = await fetch(`${API_URL}/items/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update product');
        }

        const updatedProduct = await response.json();
        currentProduct = updatedProduct;

        showMessage('Product updated successfully!', 'success');
        updatePreviewLink();

        // Optionally redirect back after 2 seconds
        setTimeout(() => {
            if (confirm('Product saved! Go back to dashboard?')) {
                window.location.href = 'dashboard.html';
            }
        }, 1500);

    } catch (error) {
        console.error('Error saving product:', error);
        showMessage('Error saving product: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="btn-text">Save Changes</span>';
    }
}

// Update preview link
function updatePreviewLink() {
    const previewLink = document.getElementById('previewLink');
    if (currentProduct) {
        const slug = slugifyProductName(currentProduct.name);
        const url = `${PUBLIC_APP_BASE_URL}/product.html?id=${currentProduct._id}&slug=${slug}`;
        previewLink.href = url;
        previewLink.style.display = 'inline-flex';
    }
}

// Slugify product name
function slugifyProductName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Show message
function showMessage(text, type = 'info') {
    const messageEl = document.getElementById('statusMessage');
    messageEl.textContent = text;
    messageEl.className = `message ${type} show`;
}

// Hide message
function hideMessage() {
    const messageEl = document.getElementById('statusMessage');
    messageEl.classList.remove('show');
}
