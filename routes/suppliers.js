const express = require('express');
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const Item = require('../models/Item');
const auth = require('../middleware/auth');

const router = express.Router();

const normaliseProducts = (products) => {
    if (!products) return [];
    if (Array.isArray(products)) {
        return products
            .map((product) => (typeof product === 'string' ? product.trim() : product))
            .filter((product) => !!product);
    }

    if (typeof products === 'string') {
        return products
            .split(',')
            .map((product) => product.trim())
            .filter((product) => !!product);
    }

    return [];
};

// Create supplier (admin & manager)
router.post('/', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { name, contact, email, address, products } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Supplier name is required' });
        }

        const trimmedName = name.trim();

        const existing = await Supplier.findOne({ name: trimmedName });
        if (existing) {
            return res.status(409).json({ message: 'Supplier name already exists' });
        }

        const supplier = new Supplier({
            name: trimmedName,
            contact: contact ? contact.trim() : undefined,
            email: email ? email.trim() : undefined,
            address: address ? address.trim() : undefined,
            products: normaliseProducts(products)
        });

        await supplier.save();

        res.status(201).json(supplier.toObject());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// List suppliers (any authenticated user)
router.get('/', auth(), async (_req, res) => {
    try {
        const suppliers = await Supplier.find().sort({ createdAt: -1 });
        res.json(suppliers.map((supplier) => supplier.toObject()));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper function to parse CSV
function parseCSV(csvString) {
    const lines = csvString.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { error: 'Empty CSV file' };

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }

    return { headers, data };
}

// Import suppliers from CSV (Admin & Manager)
router.post('/import/csv', auth(['admin', 'manager']), express.text({ type: 'text/csv', limit: '10mb' }), async (req, res) => {
    try {
        const csvData = req.body;
        const { headers, data, error } = parseCSV(csvData);

        if (error) return res.status(400).json({ message: error });

        const results = {
            created: 0,
            updated: 0,
            failed: 0,
            errors: []
        };

        for (const row of data) {
            try {
                const supplierData = {
                    name: (row.name || '').trim(),
                    contact: (row.contact || '').trim(),
                    email: (row.email || '').trim(),
                    address: (row.address || '').trim()
                };

                if (!supplierData.name) {
                    results.failed++;
                    results.errors.push('Row skipped: missing supplier name');
                    continue;
                }

                // Parse products if provided
                if (row.products && row.products.trim()) {
                    supplierData.products = normaliseProducts(row.products);
                }

                // Check if supplier exists
                const existing = await Supplier.findOne({ name: supplierData.name });
                if (existing) {
                    // Update existing supplier
                    Object.assign(existing, supplierData);
                    await existing.save();
                    results.updated++;
                } else {
                    // Create new supplier
                    await Supplier.create(supplierData);
                    results.created++;
                }
            } catch (err) {
                results.failed++;
                results.errors.push(`Error processing row: ${err.message}`);
            }
        }

        res.json({
            message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.failed} failed`,
            results
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update supplier (admin & manager)
router.put('/:id', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid supplier ID' });
        }

        const supplier = await Supplier.findById(id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        const { name, contact, email, address, products } = req.body;

        if (name !== undefined) {
            const trimmedName = name.trim();
            if (!trimmedName) {
                return res.status(400).json({ message: 'Supplier name is required' });
            }

            if (trimmedName !== supplier.name) {
                const existing = await Supplier.findOne({ name: trimmedName, _id: { $ne: id } });
                if (existing) {
                    return res.status(409).json({ message: 'Supplier name already exists' });
                }
                supplier.name = trimmedName;
            }
        }

        if (contact !== undefined) supplier.contact = contact ? contact.trim() : undefined;
        if (email !== undefined) supplier.email = email ? email.trim() : undefined;
        if (address !== undefined) supplier.address = address ? address.trim() : undefined;
        if (products !== undefined) supplier.products = normaliseProducts(products);

        await supplier.save();

        res.json(supplier.toObject());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete supplier (admin only)
router.delete('/:id', auth('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid supplier ID' });
        }

        const linkedItem = await Item.exists({ supplierId: id });
        if (linkedItem) {
            return res.status(400).json({ message: 'Cannot delete supplier while items reference it' });
        }

        const supplier = await Supplier.findByIdAndDelete(id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        res.json({ message: 'Supplier deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
