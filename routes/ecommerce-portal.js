const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const auth = require('../middleware/auth');

const ALLOWED_ROLES = ['admin', 'manager', 'ecommerce'];

function buildVisibilityFilter(rawVisibility) {
    if (!rawVisibility || rawVisibility === 'limited') {
        return { $in: ['limited'] };
    }

    if (rawVisibility === 'all') {
        return { $in: ['public', 'limited', 'internal'] };
    }

    if (['public', 'limited', 'internal'].includes(rawVisibility)) {
        return rawVisibility;
    }

    return { $in: ['limited'] };
}

function sanitizeImages(images) {
    if (!Array.isArray(images)) return [];
    return images
        .map((url) => String(url || '').trim())
        .filter(Boolean)
        .slice(0, 10);
}

function sanitizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 20);
}

// GET /api/ecommerce/catalog
// Fetch ecommerce catalogue with visibility controls
router.get('/catalog', auth(ALLOWED_ROLES), async (req, res) => {
    try {
        const {
            visibility = 'limited',
            search,
            category,
            inStock,
            tags,
            includeDisabled
        } = req.query;

        const query = {
            ecommerceVisibility: buildVisibilityFilter(visibility)
        };

        if (includeDisabled !== 'true') {
            query.isEcommerceEnabled = true;
        }

        if (inStock === 'true') {
            query.quantity = { $gt: 0 };
        }

        if (category && category !== 'all') {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }

        if (tags) {
            const tagList = Array.isArray(tags) ? tags : String(tags).split(',');
            query.ecommerceTags = { $in: tagList.map((tag) => tag.trim()).filter(Boolean) };
        }

        const products = await Item.find(query)
            .select('name category price quantity sku description images isEcommerceEnabled ecommerceVisibility ecommerceTags updatedAt lastModifiedAt')
            .sort({ updatedAt: -1 });

        res.json(products);
    } catch (error) {
        console.error('Ecommerce catalog fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch ecommerce catalogue', error: error.message });
    }
});

// GET /api/ecommerce/catalog/:id
// Fetch single product with ecommerce metadata
router.get('/catalog/:id', auth(ALLOWED_ROLES), async (req, res) => {
    try {
        const product = await Item.findById(req.params.id)
            .select('name category price quantity sku description images isEcommerceEnabled ecommerceVisibility ecommerceTags lastModifiedBy lastModifiedAt');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch product', error: error.message });
    }
});

// PUT /api/ecommerce/catalog/:id
// Update ecommerce-specific product fields
router.put('/catalog/:id', auth(ALLOWED_ROLES), async (req, res) => {
    try {
        const allowedFields = [
            'name',
            'description',
            'price',
            'isEcommerceEnabled',
            'ecommerceVisibility',
            'ecommerceTags',
            'images'
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updates[field] = req.body[field];
            }
        }

        if (updates.price !== undefined) {
            const priceValue = Number(updates.price);
            if (Number.isNaN(priceValue) || priceValue < 0) {
                return res.status(400).json({ message: 'Price must be a non-negative number' });
            }
            updates.price = priceValue;
        }

        if (updates.name !== undefined) {
            const trimmedName = String(updates.name).trim();
            if (!trimmedName) {
                return res.status(400).json({ message: 'Product name cannot be empty' });
            }
            updates.name = trimmedName;
        }

        if (updates.description !== undefined) {
            updates.description = String(updates.description || '').trim();
        }

        if (updates.ecommerceVisibility !== undefined) {
            const validVisibility = ['public', 'limited', 'internal'];
            if (!validVisibility.includes(updates.ecommerceVisibility)) {
                return res.status(400).json({ message: 'Invalid ecommerce visibility value' });
            }
        }

        if (updates.ecommerceTags !== undefined) {
            updates.ecommerceTags = sanitizeTags(updates.ecommerceTags);
        }

        if (updates.images !== undefined) {
            updates.images = sanitizeImages(updates.images);
        }

        updates.lastModifiedBy = req.user.id;
        updates.lastModifiedAt = new Date();

        const product = await Item.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('name category price quantity sku description images isEcommerceEnabled ecommerceVisibility ecommerceTags lastModifiedBy lastModifiedAt');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({ message: 'Product updated successfully', product });
    } catch (error) {
        console.error('Ecommerce update error:', error);
        res.status(500).json({ message: 'Failed to update product', error: error.message });
    }
});

// PATCH /api/ecommerce/catalog/:id/visibility
// Quickly update ecommerce visibility
router.patch('/catalog/:id/visibility', auth(ALLOWED_ROLES), async (req, res) => {
    try {
        const { ecommerceVisibility } = req.body;
        const validVisibility = ['public', 'limited', 'internal'];

        if (!validVisibility.includes(ecommerceVisibility)) {
            return res.status(400).json({ message: 'Invalid ecommerce visibility value' });
        }

        const product = await Item.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    ecommerceVisibility,
                    lastModifiedBy: req.user.id,
                    lastModifiedAt: new Date()
                }
            },
            { new: true }
        ).select('name category price quantity sku ecommerceVisibility isEcommerceEnabled lastModifiedAt');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({ message: 'Visibility updated successfully', product });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update visibility', error: error.message });
    }
});

module.exports = router;
