'use strict';

(function () {
    const statusEl = document.getElementById('productStatus');
    const cardEl = document.getElementById('productCard');
    const primaryImageEl = document.getElementById('productPrimaryImage');
    const galleryEl = document.getElementById('productGallery');
    const nameEl = document.getElementById('productName');
    const priceEl = document.getElementById('productPrice');
    const stockEl = document.getElementById('productStock');
    const descriptionEl = document.getElementById('productDescription');
    const tagsEl = document.getElementById('productTags');
    const metaEl = document.getElementById('productMeta');
    const copyLinkBtn = document.getElementById('copyLinkBtn');

    const searchParams = new URLSearchParams(window.location.search);
    const productId = (searchParams.get('id') || '').trim();

    const SHOP_API_BASE_URL = (function deriveShopApiBase() {
        if (typeof window === 'undefined') return '';

        const configured = typeof window.APP_SHOP_API_BASE_URL === 'string'
            ? window.APP_SHOP_API_BASE_URL.trim()
            : '';

        const origin = window.location && typeof window.location.origin === 'string'
            ? window.location.origin.replace(/\/+$/, '')
            : '';

        const fallback = origin ? origin + '/api/shop' : '';
        const base = configured || fallback;
        return base ? base.replace(/\/+$/, '') : '';
    })();

    const PLACEHOLDER_IMAGE = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><rect width="600" height="750" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#94a3b8">No Image</text></svg>');

    if (!productId) {
        showStatus('Product id is missing. Please scan the latest QR label.', { tone: 'error' });
        return;
    }

    if (!SHOP_API_BASE_URL) {
        showStatus('Shop API base URL is not available.', { tone: 'error' });
        return;
    }

    showStatus('Loading product details...');
    loadProduct(productId).catch(function (error) {
        console.error('Failed to load product:', error);
        showStatus('We could not load this product right now. Please try again later.', { tone: 'error' });
    });

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', handleCopyLinkClick);
    }

    function showStatus(message, options) {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.add('is-visible');

        if (options && options.tone === 'error') {
            statusEl.classList.add('is-error');
        } else {
            statusEl.classList.remove('is-error');
        }

        if (options && options.autoHide) {
            const delay = typeof options.autoHide === 'number' ? options.autoHide : 2500;
            window.setTimeout(hideStatus, delay);
        }
    }

    function hideStatus() {
        if (!statusEl) return;
        statusEl.classList.remove('is-visible');
        statusEl.classList.remove('is-error');
    }

    async function loadProduct(id) {
        const response = await fetch(SHOP_API_BASE_URL + '/products/' + encodeURIComponent(id));

        if (response.status === 404) {
            showStatus('This product is not available in the storefront.', { tone: 'error' });
            return;
        }

        if (!response.ok) {
            throw new Error('Unexpected response ' + response.status);
        }

        const product = await response.json();
        renderProduct(product);
        hideStatus();
    }

    function renderProduct(product) {
        if (!cardEl) return;

        const primaryImage = resolvePrimaryImage(product.images);
        primaryImageEl.src = primaryImage;
        primaryImageEl.alt = product.name ? product.name + ' image' : 'Product image';

        renderGallery(product.images, primaryImage);
        nameEl.textContent = product.name || 'Product';
        document.title = product.name ? product.name + ' | Product' : 'Product';

        const priceValue = Number(product.price);
        if (!Number.isNaN(priceValue)) {
            priceEl.textContent = formatCurrency(priceValue);
        } else {
            priceEl.textContent = '';
        }

        const quantityValue = Number(product.quantity);
        const quantity = Number.isNaN(quantityValue) ? null : quantityValue;
        if (quantity !== null && quantity > 0) {
            stockEl.textContent = 'In stock: ' + quantity;
            stockEl.classList.add('is-available');
            stockEl.classList.remove('is-unavailable');
        } else {
            stockEl.textContent = 'Out of stock';
            stockEl.classList.add('is-unavailable');
            stockEl.classList.remove('is-available');
        }

        descriptionEl.textContent = product.description && product.description.trim()
            ? product.description.trim()
            : 'No detailed description is available for this product yet.';

        renderTags(product.ecommerceTags);
        renderMeta(product);
        ensureSlugInUrl(product);

        cardEl.dataset.hidden = 'false';
    }

    function renderGallery(images, activeImage) {
        if (!galleryEl) return;

        galleryEl.innerHTML = '';
        const list = Array.isArray(images) ? images.filter(Boolean) : [];

        list.forEach(function (source) {
            const thumb = document.createElement('img');
            thumb.src = source;
            thumb.alt = 'Product preview';
            if (source === activeImage) {
                thumb.classList.add('is-active');
            }

            thumb.addEventListener('click', function () {
                primaryImageEl.src = source;
                Array.from(galleryEl.children).forEach(function (child) {
                    child.classList.remove('is-active');
                });
                thumb.classList.add('is-active');
            });

            galleryEl.appendChild(thumb);
        });
    }

    function renderTags(tags) {
        if (!tagsEl) return;
        tagsEl.innerHTML = '';

        if (!Array.isArray(tags) || tags.length === 0) {
            return;
        }

        tags.slice(0, 8).forEach(function (tag) {
            if (!tag) return;
            const badge = document.createElement('span');
            badge.className = 'product-tag';
            badge.textContent = tag;
            tagsEl.appendChild(badge);
        });
    }

    function renderMeta(product) {
        if (!metaEl) return;
        metaEl.innerHTML = '';

        const entries = [];

        if (product.sku) {
            entries.push(['SKU', product.sku]);
        }

        if (product.category) {
            entries.push(['Category', product.category]);
        }

        const priceValue = Number(product.price);
        if (!Number.isNaN(priceValue)) {
            entries.push(['Unit price', formatCurrency(priceValue)]);
        }

        const quantityValue = Number(product.quantity);
        if (!Number.isNaN(quantityValue)) {
            entries.push(['Available quantity', String(quantityValue)]);
        }

        entries.forEach(function (entry) {
            const row = document.createElement('div');
            row.textContent = entry[0] + ': ' + entry[1];
            metaEl.appendChild(row);
        });
    }

    function resolvePrimaryImage(images) {
        if (Array.isArray(images)) {
            for (let index = 0; index < images.length; index += 1) {
                const source = images[index];
                if (typeof source === 'string' && source.trim()) {
                    return source.trim();
                }
            }
        }
        return PLACEHOLDER_IMAGE;
    }

    function formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
            }).format(amount);
        } catch (error) {
            return '₹' + Number(amount || 0).toFixed(2);
        }
    }

    function slugify(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }

        return input
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
    }

    function ensureSlugInUrl(product) {
        const existingSlug = (searchParams.get('slug') || '').trim();
        const computedSlug = slugify(product.name || product.sku || '');

        if (!computedSlug) {
            return;
        }

        if (existingSlug === computedSlug) {
            return;
        }

        searchParams.set('slug', computedSlug);
        searchParams.set('id', productId);
        const newUrl = window.location.pathname + '?' + searchParams.toString();
        window.history.replaceState({}, document.title, newUrl);
    }

    function handleCopyLinkClick() {
        const link = window.location.href;

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(link).then(function () {
                showStatus('Product link copied.', { autoHide: 2200 });
            }).catch(function () {
                fallbackCopy(link);
            });
        } else {
            fallbackCopy(link);
        }
    }

    function fallbackCopy(value) {
        try {
            const helper = document.createElement('textarea');
            helper.value = value;
            helper.setAttribute('readonly', 'true');
            helper.style.position = 'absolute';
            helper.style.left = '-9999px';
            document.body.appendChild(helper);
            helper.select();
            document.execCommand('copy');
            document.body.removeChild(helper);
            showStatus('Product link copied.', { autoHide: 2200 });
        } catch (error) {
            console.warn('Copy fallback failed:', error);
            showStatus('Copy to clipboard is not supported on this device.', { tone: 'error' });
        }
    }
})();
