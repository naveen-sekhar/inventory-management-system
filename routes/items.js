const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const Supplier = require('../models/Supplier');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const parseNumber = (value, fieldName) => {
    if (value === undefined || value === null || value === '') {
        return { error: `${fieldName} is required` };
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        return { error: `${fieldName} must be a number` };
    }

    return { value: parsed };
};

// Create item (admin & manager)
router.post('/', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { name, category, supplierId, quantity, reorderLevel, price, sku, expiryDate } = req.body;

        if (!name || !category || quantity === undefined || reorderLevel === undefined || price === undefined) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const trimmedName = name.trim();
        const trimmedCategory = category.trim();

        if (!trimmedName) {
            return res.status(400).json({ message: 'Item name is required' });
        }

        if (!trimmedCategory) {
            return res.status(400).json({ message: 'Category is required' });
        }

        const numericQuantity = parseNumber(quantity, 'Quantity');
        const numericReorder = parseNumber(reorderLevel, 'Reorder level');
        const numericPrice = parseNumber(price, 'Price');

        if (numericQuantity.error || numericReorder.error || numericPrice.error) {
            return res.status(400).json({ message: numericQuantity.error || numericReorder.error || numericPrice.error });
        }

        if (numericQuantity.value < 0 || numericReorder.value < 0 || numericPrice.value < 0) {
            return res.status(400).json({ message: 'Quantity, reorder level, and price must be zero or greater' });
        }

        const existing = await Item.findOne({ name: trimmedName });
        if (existing) {
            return res.status(409).json({ message: 'Item name already exists' });
        }

        let validatedSupplier;
        if (supplierId) {
            if (!mongoose.Types.ObjectId.isValid(supplierId)) {
                return res.status(400).json({ message: 'Invalid supplier ID' });
            }

            validatedSupplier = await Supplier.findById(supplierId);
            if (!validatedSupplier) {
                return res.status(404).json({ message: 'Supplier not found' });
            }
        }

        const itemData = {
            name: trimmedName,
            category: trimmedCategory,
            supplierId: validatedSupplier ? supplierId : undefined,
            quantity: numericQuantity.value,
            reorderLevel: numericReorder.value,
            price: numericPrice.value
        };

        if (sku && sku.trim()) {
            const trimmedSku = sku.trim();
            const existingSku = await Item.findOne({ sku: trimmedSku });
            if (existingSku) {
                return res.status(409).json({ message: 'SKU already exists' });
            }
            itemData.sku = trimmedSku;
        }

        if (expiryDate) {
            const parsedExpiry = new Date(expiryDate);
            if (Number.isNaN(parsedExpiry.getTime())) {
                return res.status(400).json({ message: 'Invalid expiry date' });
            }
            itemData.expiryDate = parsedExpiry;
        }

        const item = new Item(itemData);

        await item.save();
        if (validatedSupplier) await item.populate('supplierId', 'name contact email');

        res.status(201).json(item.toObject({ virtuals: true }));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all items (any authenticated user)
router.get('/', auth(), async (req, res) => {
    try {
        const { search, supplierId, lowStock, category } = req.query;
        const filter = {};

        if (search) {
            const term = search.trim();
            const regex = new RegExp(term, 'i');
            filter.$or = [{ name: regex }, { category: regex }];
        }

        if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
            filter.supplierId = supplierId;
        }

        if (category) {
            const trimmedCategory = category.trim();
            if (trimmedCategory) {
                filter.category = new RegExp(`^${trimmedCategory}$`, 'i');
            }
        }

        if (lowStock === 'true') {
            filter.$expr = { $lt: ['$quantity', '$reorderLevel'] };
        }

        const items = await Item.find(filter)
            .populate('supplierId', 'name contact email')
            .sort({ createdAt: -1 });

        const payload = items.map((item) => item.toObject({ virtuals: true }));
        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get single item
router.get('/:id', auth(), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const item = await Item.findById(id).populate('supplierId', 'name contact email');
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        res.json(item.toObject({ virtuals: true }));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update item
router.put('/:id', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const item = await Item.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const {
            name, category, supplierId, quantity, reorderLevel, price, sku, expiryDate,
            barcode, unit, description, specifications, notes, tags, images,
            isEcommerceEnabled, ecommerceVisibility, supplier
        } = req.body;

        // Use supplier if supplierId not provided (for compatibility)
        const supplierIdToUse = supplierId !== undefined ? supplierId : supplier;

        if (name !== undefined) {
            const trimmedName = name.trim();
            if (!trimmedName) {
                return res.status(400).json({ message: 'Item name is required' });
            }

            if (trimmedName !== item.name) {
                const existing = await Item.findOne({ name: trimmedName, _id: { $ne: id } });
                if (existing) {
                    return res.status(409).json({ message: 'Item name already exists' });
                }
                item.name = trimmedName;
            }
        }

        if (category !== undefined) {
            const trimmedCategory = category.trim();
            if (!trimmedCategory) {
                return res.status(400).json({ message: 'Category is required' });
            }
            item.category = trimmedCategory;
        }

        if (supplierIdToUse !== undefined) {
            if (supplierIdToUse === '' || supplierIdToUse === null) {
                item.supplierId = undefined;
            } else {
                if (!mongoose.Types.ObjectId.isValid(supplierIdToUse)) {
                    return res.status(400).json({ message: 'Invalid supplier ID' });
                }
                const supplierDoc = await Supplier.findById(supplierIdToUse);
                if (!supplierDoc) {
                    return res.status(404).json({ message: 'Supplier not found' });
                }
                item.supplierId = supplierIdToUse;
            }
        }

        if (quantity !== undefined) {
            const numericQuantity = parseNumber(quantity, 'Quantity');
            if (numericQuantity.error) return res.status(400).json({ message: numericQuantity.error });
            if (numericQuantity.value < 0) {
                return res.status(400).json({ message: 'Quantity must be zero or greater' });
            }
            item.quantity = numericQuantity.value;
        }

        if (reorderLevel !== undefined) {
            const numericReorder = parseNumber(reorderLevel, 'Reorder level');
            if (numericReorder.error) return res.status(400).json({ message: numericReorder.error });
            if (numericReorder.value < 0) {
                return res.status(400).json({ message: 'Reorder level must be zero or greater' });
            }
            item.reorderLevel = numericReorder.value;
        }

        if (price !== undefined) {
            const numericPrice = parseNumber(price, 'Price');
            if (numericPrice.error) return res.status(400).json({ message: numericPrice.error });
            if (numericPrice.value < 0) {
                return res.status(400).json({ message: 'Price must be zero or greater' });
            }
            item.price = numericPrice.value;
        }

        if (sku !== undefined) {
            if (!sku) {
                item.sku = undefined;
            } else {
                const trimmedSku = sku.trim();
                if (!trimmedSku) {
                    item.sku = undefined;
                } else {
                    const existingSku = await Item.findOne({ sku: trimmedSku, _id: { $ne: id } });
                    if (existingSku) {
                        return res.status(409).json({ message: 'SKU already exists' });
                    }
                    item.sku = trimmedSku;
                }
            }
        }

        if (expiryDate !== undefined) {
            if (!expiryDate) {
                item.expiryDate = undefined;
            } else {
                const parsedExpiry = new Date(expiryDate);
                if (Number.isNaN(parsedExpiry.getTime())) {
                    return res.status(400).json({ message: 'Invalid expiry date' });
                }
                item.expiryDate = parsedExpiry;
            }
        }

        // Handle new fields
        if (barcode !== undefined) {
            item.barcode = barcode ? barcode.trim() : undefined;
        }

        if (unit !== undefined) {
            item.unit = unit ? unit.trim() : undefined;
        }

        if (description !== undefined) {
            item.description = description ? description.trim() : undefined;
        }

        if (specifications !== undefined) {
            item.specifications = specifications ? specifications.trim() : undefined;
        }

        if (notes !== undefined) {
            item.notes = notes ? notes.trim() : undefined;
        }

        if (tags !== undefined) {
            if (Array.isArray(tags)) {
                item.tags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim());
            } else {
                item.tags = [];
            }
        }

        if (images !== undefined) {
            if (Array.isArray(images)) {
                item.images = images;
            } else {
                item.images = [];
            }
        }

        if (isEcommerceEnabled !== undefined) {
            item.isEcommerceEnabled = Boolean(isEcommerceEnabled);
        }

        if (ecommerceVisibility !== undefined) {
            if (['public', 'limited', 'internal'].includes(ecommerceVisibility)) {
                item.ecommerceVisibility = ecommerceVisibility;
            }
        }

        await item.save();
        await item.populate('supplierId', 'name contact email');

        res.json(item.toObject({ virtuals: true }));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Adjust stock quantity (admin & manager)
router.patch('/:id/adjust-stock', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const { amount, operation = 'increase' } = req.body;
        const parsedAmount = parseNumber(amount, 'Adjustment amount');
        if (parsedAmount.error) {
            return res.status(400).json({ message: parsedAmount.error });
        }

        const item = await Item.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const adjustment = Math.floor(parsedAmount.value);

        if (operation === 'decrease') {
            if (adjustment <= 0) {
                return res.status(400).json({ message: 'Adjustment amount must be at least 1' });
            }
            if (item.quantity < adjustment) {
                return res.status(400).json({ message: 'Cannot decrease below zero stock' });
            }
            item.quantity -= adjustment;
        } else if (operation === 'increase') {
            if (adjustment <= 0) {
                return res.status(400).json({ message: 'Adjustment amount must be at least 1' });
            }
            item.quantity += adjustment;
        } else if (operation === 'set') {
            if (adjustment < 0) {
                return res.status(400).json({ message: 'Quantity must be zero or greater' });
            }
            item.quantity = adjustment;
        } else {
            return res.status(400).json({ message: 'Invalid operation. Use increase, decrease, or set.' });
        }

        await item.save();
        await item.populate('supplierId', 'name contact email');

        res.json(item.toObject({ virtuals: true }));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete item (admin only)
router.delete('/:id', auth('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const item = await Item.findByIdAndDelete(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper function to log activities
async function logActivity(userId, username, action, resourceType, description, resourceId = null, metadata = null, ipAddress = null) {
    try {
        await ActivityLog.create({
            userId,
            username,
            action,
            resourceType,
            resourceId,
            description,
            metadata,
            ipAddress
        });
    } catch (err) {
        console.error('Failed to log activity:', err);
    }
}

// Helper function to convert data to CSV
function convertToCSV(data, headers) {
    if (!data || data.length === 0) return '';

    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => {
        return headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
}

// Helper function to parse CSV
function parseCSV(csvString) {
    const lines = csvString.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { error: 'Empty CSV file' };

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        data.push(row);
    }

    return { headers, data };
}

// Export items as CSV (Admin & Manager)
router.get('/export/csv', auth(['admin', 'manager']), async (req, res) => {
    try {
        const items = await Item.find()
            .populate('supplierId', 'name')
            .sort({ name: 1 });

        const data = items.map(item => ({
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            reorderLevel: item.reorderLevel,
            price: item.price,
            supplier: item.supplierId?.name || '',
            sku: item.sku || '',
            expiryDate: item.expiryDate ? item.expiryDate.toISOString().split('T')[0] : ''
        }));

        const csv = convertToCSV(data, ['name', 'category', 'quantity', 'reorderLevel', 'price', 'supplier', 'sku', 'expiryDate']);

        const user = await User.findById(req.user.id);
        await logActivity(
            req.user.id,
            user.username,
            'csv_export',
            'item',
            `Exported ${items.length} items to CSV`,
            null,
            { itemCount: items.length },
            req.clientIp
        );

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Import items from CSV (Admin only)
router.post('/import/csv', auth('admin'), express.text({ type: 'text/csv', limit: '10mb' }), async (req, res) => {
    try {
        const csvData = req.body;
        const { headers, data, error } = parseCSV(csvData);

        if (error) return res.status(400).json({ message: error });

        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        // Get all suppliers for mapping
        const suppliers = await Supplier.find();
        const supplierMap = {};
        suppliers.forEach(s => {
            supplierMap[s.name.toLowerCase()] = s._id;
        });

        for (const row of data) {
            try {
                const itemData = {
                    name: row.name?.trim(),
                    category: row.category?.trim(),
                    quantity: parseFloat(row.quantity) || 0,
                    reorderLevel: parseFloat(row.reorderLevel) || 0,
                    price: parseFloat(row.price) || 0
                };

                if (!itemData.name || !itemData.category) {
                    results.failed++;
                    results.errors.push(`Row skipped: missing name or category`);
                    continue;
                }

                // Map supplier if provided
                if (row.supplier && row.supplier.trim()) {
                    const supplierId = supplierMap[row.supplier.toLowerCase()];
                    if (supplierId) {
                        itemData.supplierId = supplierId;
                    }
                }

                // Add optional fields
                if (row.sku) itemData.sku = row.sku.trim();
                if (row.expiryDate) {
                    const expiry = new Date(row.expiryDate);
                    if (!isNaN(expiry.getTime())) {
                        itemData.expiryDate = expiry;
                    }
                }

                // Check if item exists
                const existing = await Item.findOne({ name: itemData.name });
                if (existing) {
                    // Update existing item
                    await Item.findByIdAndUpdate(existing._id, itemData);
                } else {
                    // Create new item
                    await Item.create(itemData);
                }

                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`Error processing row: ${err.message}`);
            }
        }

        const user = await User.findById(req.user.id);
        await logActivity(
            req.user.id,
            user.username,
            'csv_import',
            'item',
            `Imported CSV: ${results.success} succeeded, ${results.failed} failed`,
            null,
            { results },
            req.clientIp
        );

        res.json({
            message: 'CSV import completed',
            results
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
