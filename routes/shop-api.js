const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const auth = require('../middleware/auth');

// Public product listing (no auth required)
router.get('/products', async (req, res) => {
    try {
        const { category, search, minPrice, maxPrice, inStock } = req.query;

        let query = {
            isEcommerceEnabled: true,
            ecommerceVisibility: 'public'
        };

        // Only show products with stock > 0 by default
        if (inStock !== 'false') {
            query.quantity = { $gt: 0 };
        }

        if (category && category !== 'all') {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }

        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        const products = await Item.find(query)
            .select('name description category price quantity sku images ecommerceTags')
            .sort({ createdAt: -1 });

        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch products', error: error.message });
    }
});

// Get single product details
router.get('/products/:id', async (req, res) => {
    try {
        // First try to find with ecommerce filters
        let product = await Item.findOne({
            _id: req.params.id,
            isEcommerceEnabled: true,
            ecommerceVisibility: 'public'
        })
            .select('name description category price quantity sku images ecommerceTags');

        // If not found, try to find the product anyway (for backward compatibility)
        // and check if it exists but just needs ecommerce fields set
        if (!product) {
            product = await Item.findOne({ _id: req.params.id })
                .select('name description category price quantity sku images ecommerceTags isEcommerceEnabled ecommerceVisibility');

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            // If product exists but ecommerce not enabled, enable it automatically
            if (product.isEcommerceEnabled !== true || product.ecommerceVisibility !== 'public') {
                product.isEcommerceEnabled = true;
                product.ecommerceVisibility = 'public';
                await product.save();
            }
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch product', error: error.message });
    }
});

// Get product categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await Item.distinct('category', {
            isEcommerceEnabled: true,
            ecommerceVisibility: 'public'
        });
        res.json(categories.filter(Boolean));
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
    }
});

// Create order (customer checkout)
router.post('/orders', async (req, res) => {
    try {
        const { items, customerInfo, paymentMethod, totalAmount } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No items in order' });
        }

        // Validate stock availability
        for (const orderItem of items) {
            const product = await Item.findById(orderItem.productId);

            if (!product) {
                return res.status(404).json({
                    message: `Product not found`
                });
            }

            if (product.quantity < orderItem.quantity) {
                return res.status(400).json({
                    message: `Insufficient stock for ${product.name}. Available: ${product.quantity}`
                });
            }
        }

        // Create sales records and update stock
        const saleRecords = [];

        for (const orderItem of items) {
            const product = await Item.findById(orderItem.productId);

            // Create sale record
            const sale = new Sale({
                itemId: product._id,
                quantity: orderItem.quantity,
                unitPrice: product.price,
                totalAmount: product.price * orderItem.quantity,
                customerName: customerInfo.name,
                customerContact: customerInfo.contact,
                customerEmail: customerInfo.email,
                paymentMethod: paymentMethod || 'online',
                orderStatus: 'pending',
                shippingAddress: customerInfo.address
            });

            await sale.save();
            saleRecords.push(sale);

            // Update stock
            product.quantity -= orderItem.quantity;
            product.lowStock = product.quantity <= product.reorderLevel;
            await product.save();
        }

        res.status(201).json({
            message: 'Order placed successfully',
            orderId: saleRecords[0]._id,
            sales: saleRecords,
            totalAmount
        });

    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ message: 'Failed to create order', error: error.message });
    }
});

// Get order status (public - with order ID)
router.get('/orders/:orderId', async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.orderId)
            .populate('itemId', 'name category price');

        if (!sale) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json({
            orderId: sale._id,
            status: sale.orderStatus,
            items: [{
                name: sale.itemId.name,
                category: sale.itemId.category,
                quantity: sale.quantity,
                price: sale.unitPrice,
                total: sale.totalAmount
            }],
            customerName: sale.customerName,
            customerContact: sale.customerContact,
            customerEmail: sale.customerEmail,
            shippingAddress: sale.shippingAddress,
            createdAt: sale.createdAt,
            totalAmount: sale.totalAmount
        });

    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch order', error: error.message });
    }
});

// Merchant: Get all orders (requires auth)
router.get('/merchant/orders', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;

        let query = {};

        if (status && status !== 'all') {
            query.orderStatus = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const orders = await Sale.find(query)
            .populate('itemId', 'name category sku')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
    }
});

// Merchant: Update order status (requires auth)
router.put('/merchant/orders/:orderId', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { orderStatus, trackingNumber, notes } = req.body;

        const sale = await Sale.findById(req.params.orderId);

        if (!sale) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (orderStatus) sale.orderStatus = orderStatus;
        if (trackingNumber) sale.trackingNumber = trackingNumber;
        if (notes) sale.notes = notes;

        await sale.save();

        res.json({ message: 'Order updated successfully', order: sale });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update order', error: error.message });
    }
});

// Merchant: Get analytics (requires auth)
router.get('/merchant/analytics', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let query = {};
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const orders = await Sale.find(query);

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

        const statusBreakdown = {
            pending: orders.filter(o => o.orderStatus === 'pending').length,
            processing: orders.filter(o => o.orderStatus === 'processing').length,
            shipped: orders.filter(o => o.orderStatus === 'shipped').length,
            delivered: orders.filter(o => o.orderStatus === 'delivered').length,
            cancelled: orders.filter(o => o.orderStatus === 'cancelled').length
        };

        res.json({
            totalOrders,
            totalRevenue,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            statusBreakdown
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
    }
});

module.exports = router;
