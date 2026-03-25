const express = require('express');
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');
const alertService = require('../services/alertService');

const router = express.Router();

const parseRange = (from, to) => {
    let startDate;
    let endDate;

    if (from) {
        const parsedFrom = new Date(from);
        if (Number.isNaN(parsedFrom.getTime())) {
            return { error: 'Invalid from date' };
        }
        startDate = parsedFrom;
    }

    if (to) {
        const parsedTo = new Date(to);
        if (Number.isNaN(parsedTo.getTime())) {
            return { error: 'Invalid to date' };
        }
        endDate = parsedTo;
    }

    if (!startDate && !endDate) {
        endDate = new Date();
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 30);
    } else if (!startDate && endDate) {
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 30);
    } else if (startDate && !endDate) {
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 30);
    }

    if (startDate > endDate) {
        return { error: 'From date must be before to date' };
    }

    return { startDate, endDate };
};

router.get('/low-stock', auth(['admin', 'manager']), async (_req, res) => {
    try {
        const items = await Item.find({
            $expr: { $lt: ['$quantity', '$reorderLevel'] }
        })
            .populate('supplierId', 'name contact email')
            .sort({ reorderLevel: 1, quantity: 1 });

        res.json(items.map((item) => item.toObject({ virtuals: true })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/sales-summary', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { period = 'daily', from, to } = req.query;

        let startDate, endDate;

        // If no explicit date range provided, use default based on period
        if (!from && !to) {
            endDate = new Date();
            startDate = new Date();

            switch (period) {
                case 'weekly':
                    startDate.setDate(endDate.getDate() - (8 * 7)); // 8 weeks
                    break;
                case 'monthly':
                    startDate.setMonth(endDate.getMonth() - 12); // 12 months
                    break;
                default: // daily
                    startDate.setDate(endDate.getDate() - 7); // 7 days
                    break;
            }
        } else {
            const rangeResult = parseRange(from, to);
            if (rangeResult.error) {
                return res.status(400).json({ message: rangeResult.error });
            }
            startDate = rangeResult.startDate;
            endDate = rangeResult.endDate;
        }

        let dateFormat;
        let labelFormatter;

        switch (period) {
            case 'weekly':
                dateFormat = '%G-%V';
                labelFormatter = (entry) => {
                    const [year, week] = entry._id.split('-');
                    return `Week ${week}, ${year}`;
                };
                break;
            case 'monthly':
                dateFormat = '%Y-%m';
                labelFormatter = (entry) => {
                    const [year, month] = entry._id.split('-');
                    const date = new Date(year, parseInt(month) - 1);
                    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                };
                break;
            default:
                dateFormat = '%Y-%m-%d';
                labelFormatter = (entry) => {
                    const date = new Date(entry._id);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                };
        }

        const pipeline = [
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: dateFormat,
                            date: '$date'
                        }
                    },
                    totalQuantity: { $sum: '$quantitySold' },
                    totalAmount: { $sum: '$totalAmount' }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const summary = await Sale.aggregate(pipeline);
        res.json(summary.map((entry) => ({
            period: labelFormatter(entry),
            totalQuantity: entry.totalQuantity,
            totalAmount: Number((entry.totalAmount || 0).toFixed(2))
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/revenue', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const matchStage = {
            date: { $gte: startDate, $lte: endDate }
        };

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalQuantity: { $sum: '$quantitySold' },
                    count: { $sum: 1 }
                }
            }
        ];

        const result = await Sale.aggregate(pipeline);
        const summary = result[0] || { totalRevenue: 0, totalQuantity: 0, count: 0 };
        const totalRevenue = summary.totalRevenue || 0;
        const averageOrderValue = summary.count ? totalRevenue / summary.count : 0;

        res.json({
            from: startDate,
            to: endDate,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            totalQuantity: summary.totalQuantity,
            orderCount: summary.count,
            averageOrderValue: Number(averageOrderValue.toFixed(2))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper function to convert data to CSV
function convertToCSV(data, headers) {
    if (!data || data.length === 0) return '';

    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => {
        return headers.map(header => {
            const value = row[header];
            // Handle values that might contain commas or quotes
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

// Export low stock report as CSV
router.get('/low-stock/export', auth(['admin', 'manager']), async (req, res) => {
    try {
        const items = await Item.find({
            $expr: { $lt: ['$quantity', '$reorderLevel'] }
        })
            .populate('supplierId', 'name')
            .sort({ reorderLevel: 1, quantity: 1 });

        const data = items.map(item => ({
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            reorderLevel: item.reorderLevel,
            supplier: item.supplierId?.name || 'N/A',
            price: item.price
        }));

        const csv = convertToCSV(data, ['name', 'category', 'quantity', 'reorderLevel', 'supplier', 'price']);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=low-stock-report.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Inventory summary report
router.get('/inventory-summary', auth(['admin', 'manager']), async (req, res) => {
    try {
        const totalItems = await Item.countDocuments();
        const lowStockItems = await Item.countDocuments({
            $expr: { $lt: ['$quantity', '$reorderLevel'] }
        });
        const expiredItems = await Item.countDocuments({
            expiryDate: { $lt: new Date() }
        });

        const totalValue = await Item.aggregate([
            {
                $group: {
                    _id: null,
                    value: { $sum: { $multiply: ['$quantity', '$price'] } }
                }
            }
        ]);

        const categoryBreakdown = await Item.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalQuantity: { $sum: '$quantity' },
                    totalValue: { $sum: { $multiply: ['$quantity', '$price'] } }
                }
            },
            { $sort: { totalValue: -1 } }
        ]);

        res.json({
            totalItems,
            lowStockItems,
            expiredItems,
            totalValue: totalValue[0]?.value || 0,
            categoryBreakdown
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Expired products report
router.get('/expired-products', auth(['admin', 'manager']), async (req, res) => {
    try {
        const expiredItems = await Item.find({
            expiryDate: { $lt: new Date() }
        })
            .populate('supplierId', 'name')
            .sort({ expiryDate: 1 });

        res.json(expiredItems.map(item => item.toObject({ virtuals: true })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Sales report with filters (daily, weekly, monthly)
router.get('/sales', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { period = 'daily', from, to } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const sales = await Sale.find({
            date: { $gte: startDate, $lte: endDate }
        })
            .populate('itemId', 'name category')
            .sort({ date: -1 });

        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Export sales report as CSV
router.get('/sales/export', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const sales = await Sale.find({
            date: { $gte: startDate, $lte: endDate }
        })
            .populate('itemId', 'name category')
            .sort({ date: -1 });

        const data = sales.map(sale => ({
            date: sale.date.toISOString().split('T')[0],
            item: sale.itemId?.name || 'N/A',
            category: sale.itemId?.category || 'N/A',
            quantitySold: sale.quantitySold,
            unitPrice: sale.unitPrice,
            totalAmount: sale.totalAmount
        }));

        const csv = convertToCSV(data, ['date', 'item', 'category', 'quantitySold', 'unitPrice', 'totalAmount']);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Supplier performance report
router.get('/suppliers', auth(['admin', 'manager']), async (req, res) => {
    try {
        const suppliers = await Supplier.find();

        const performanceData = await Promise.all(suppliers.map(async (supplier) => {
            const itemCount = await Item.countDocuments({ supplierId: supplier._id });
            const lowStockCount = await Item.countDocuments({
                supplierId: supplier._id,
                $expr: { $lt: ['$quantity', '$reorderLevel'] }
            });

            const items = await Item.find({ supplierId: supplier._id });
            const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

            return {
                supplierId: supplier._id,
                supplierName: supplier.name,
                contact: supplier.contact,
                email: supplier.email,
                itemCount,
                lowStockCount,
                totalValue: Number(totalValue.toFixed(2))
            };
        }));

        res.json(performanceData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Export supplier report as CSV
router.get('/suppliers/export', auth(['admin', 'manager']), async (req, res) => {
    try {
        const suppliers = await Supplier.find();

        const performanceData = await Promise.all(suppliers.map(async (supplier) => {
            const itemCount = await Item.countDocuments({ supplierId: supplier._id });
            const lowStockCount = await Item.countDocuments({
                supplierId: supplier._id,
                $expr: { $lt: ['$quantity', '$reorderLevel'] }
            });

            const items = await Item.find({ supplierId: supplier._id });
            const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

            return {
                name: supplier.name,
                contact: supplier.contact,
                email: supplier.email,
                itemCount,
                lowStockCount,
                totalValue: Number(totalValue.toFixed(2))
            };
        }));

        const csv = convertToCSV(performanceData, ['name', 'contact', 'email', 'itemCount', 'lowStockCount', 'totalValue']);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=supplier-performance-report.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Category-wise sales report
router.get('/sales-by-category', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const pipeline = [
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $lookup: {
                    from: 'items',
                    localField: 'itemId',
                    foreignField: '_id',
                    as: 'item'
                }
            },
            { $unwind: '$item' },
            {
                $group: {
                    _id: '$item.category',
                    totalRevenue: { $sum: '$totalAmount' },
                    totalQuantity: { $sum: '$quantitySold' },
                    salesCount: { $sum: 1 },
                    averageOrderValue: { $avg: '$totalAmount' },
                    topProducts: {
                        $push: {
                            name: '$item.name',
                            quantity: '$quantitySold',
                            revenue: '$totalAmount'
                        }
                    }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ];

        const categoryStats = await Sale.aggregate(pipeline);

        // Process top products for each category
        const result = categoryStats.map(cat => {
            // Group products by name and sum their quantities
            const productMap = {};
            cat.topProducts.forEach(p => {
                if (!productMap[p.name]) {
                    productMap[p.name] = { name: p.name, quantity: 0, revenue: 0 };
                }
                productMap[p.name].quantity += p.quantity;
                productMap[p.name].revenue += p.revenue;
            });

            // Get top 5 products
            const topProducts = Object.values(productMap)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5)
                .map(p => ({
                    name: p.name,
                    quantity: p.quantity,
                    revenue: Number(p.revenue.toFixed(2))
                }));

            return {
                category: cat._id || 'Uncategorized',
                totalRevenue: Number((cat.totalRevenue || 0).toFixed(2)),
                totalQuantity: cat.totalQuantity || 0,
                salesCount: cat.salesCount || 0,
                averageOrderValue: Number((cat.averageOrderValue || 0).toFixed(2)),
                topProducts
            };
        });

        res.json({
            dateRange: { from: startDate, to: endDate },
            categories: result,
            totalCategories: result.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Detailed sales summary report
router.get('/detailed-summary', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        // Overall sales metrics
        const salesMetrics = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalQuantity: { $sum: '$quantitySold' },
                    salesCount: { $sum: 1 },
                    averageOrderValue: { $avg: '$totalAmount' },
                    minOrderValue: { $min: '$totalAmount' },
                    maxOrderValue: { $max: '$totalAmount' }
                }
            }
        ]);

        const metrics = salesMetrics[0] || {
            totalRevenue: 0,
            totalQuantity: 0,
            salesCount: 0,
            averageOrderValue: 0,
            minOrderValue: 0,
            maxOrderValue: 0
        };

        // Top selling products
        const topProducts = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$itemId',
                    totalQuantity: { $sum: '$quantitySold' },
                    totalRevenue: { $sum: '$totalAmount' },
                    salesCount: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'items',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'item'
                }
            },
            { $unwind: '$item' },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            {
                $project: {
                    name: '$item.name',
                    category: '$item.category',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    salesCount: 1,
                    currentStock: '$item.quantity',
                    price: '$item.price'
                }
            }
        ]);

        // Category breakdown
        const categoryBreakdown = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $lookup: {
                    from: 'items',
                    localField: 'itemId',
                    foreignField: '_id',
                    as: 'item'
                }
            },
            { $unwind: '$item' },
            {
                $group: {
                    _id: '$item.category',
                    revenue: { $sum: '$totalAmount' },
                    quantity: { $sum: '$quantitySold' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // Inventory status
        const inventoryStatus = await Item.aggregate([
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    totalStockValue: { $sum: { $multiply: ['$quantity', '$price'] } },
                    totalQuantity: { $sum: '$quantity' },
                    lowStockItems: {
                        $sum: {
                            $cond: [{ $lt: ['$quantity', '$reorderLevel'] }, 1, 0]
                        }
                    },
                    outOfStockItems: {
                        $sum: {
                            $cond: [{ $eq: ['$quantity', 0] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const inventory = inventoryStatus[0] || {
            totalProducts: 0,
            totalStockValue: 0,
            totalQuantity: 0,
            lowStockItems: 0,
            outOfStockItems: 0
        };

        // Daily sales trend (last 7 days within range)
        const dailyTrend = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$date' }
                    },
                    revenue: { $sum: '$totalAmount' },
                    quantity: { $sum: '$quantitySold' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
        ]);

        // Supplier performance
        const supplierPerformance = await Item.aggregate([
            {
                $lookup: {
                    from: 'suppliers',
                    localField: 'supplierId',
                    foreignField: '_id',
                    as: 'supplier'
                }
            },
            { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$supplier._id',
                    name: { $first: '$supplier.name' },
                    productCount: { $sum: 1 },
                    totalStockValue: { $sum: { $multiply: ['$quantity', '$price'] } },
                    lowStockCount: {
                        $sum: {
                            $cond: [{ $lt: ['$quantity', '$reorderLevel'] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { totalStockValue: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            dateRange: {
                from: startDate,
                to: endDate,
                days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
            },
            salesMetrics: {
                totalRevenue: Number((metrics.totalRevenue || 0).toFixed(2)),
                totalQuantity: metrics.totalQuantity || 0,
                salesCount: metrics.salesCount || 0,
                averageOrderValue: Number((metrics.averageOrderValue || 0).toFixed(2)),
                minOrderValue: Number((metrics.minOrderValue || 0).toFixed(2)),
                maxOrderValue: Number((metrics.maxOrderValue || 0).toFixed(2))
            },
            topProducts: topProducts.map(p => ({
                name: p.name,
                category: p.category,
                totalQuantity: p.totalQuantity,
                totalRevenue: Number((p.totalRevenue || 0).toFixed(2)),
                salesCount: p.salesCount,
                currentStock: p.currentStock,
                price: Number((p.price || 0).toFixed(2))
            })),
            categoryBreakdown: categoryBreakdown.map(c => ({
                category: c._id || 'Uncategorized',
                revenue: Number((c.revenue || 0).toFixed(2)),
                quantity: c.quantity,
                salesCount: c.count,
                averageValue: Number((c.revenue / c.count || 0).toFixed(2))
            })),
            inventoryStatus: {
                totalProducts: inventory.totalProducts,
                totalStockValue: Number((inventory.totalStockValue || 0).toFixed(2)),
                totalQuantity: inventory.totalQuantity,
                lowStockItems: inventory.lowStockItems,
                outOfStockItems: inventory.outOfStockItems
            },
            dailyTrend: dailyTrend.map(d => ({
                date: d._id,
                revenue: Number((d.revenue || 0).toFixed(2)),
                quantity: d.quantity,
                salesCount: d.count
            })),
            supplierPerformance: supplierPerformance.map(s => ({
                name: s.name || 'Unknown',
                productCount: s.productCount,
                totalStockValue: Number((s.totalStockValue || 0).toFixed(2)),
                lowStockCount: s.lowStockCount
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Product performance report
router.get('/product-performance', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to, category } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        // Build match stage for sales
        const salesMatch = {
            date: { $gte: startDate, $lte: endDate }
        };

        // Get sales data with product info
        const pipeline = [
            { $match: salesMatch },
            {
                $lookup: {
                    from: 'items',
                    localField: 'itemId',
                    foreignField: '_id',
                    as: 'item'
                }
            },
            { $unwind: '$item' }
        ];

        // Add category filter if provided
        if (category) {
            pipeline.push({
                $match: { 'item.category': category }
            });
        }

        pipeline.push(
            {
                $group: {
                    _id: '$itemId',
                    name: { $first: '$item.name' },
                    category: { $first: '$item.category' },
                    currentStock: { $first: '$item.quantity' },
                    reorderLevel: { $first: '$item.reorderLevel' },
                    unitPrice: { $first: '$item.price' },
                    totalQuantitySold: { $sum: '$quantitySold' },
                    totalRevenue: { $sum: '$totalAmount' },
                    salesCount: { $sum: 1 },
                    averageSaleValue: { $avg: '$totalAmount' }
                }
            },
            {
                $project: {
                    name: 1,
                    category: 1,
                    currentStock: 1,
                    reorderLevel: 1,
                    unitPrice: 1,
                    totalQuantitySold: 1,
                    totalRevenue: 1,
                    salesCount: 1,
                    averageSaleValue: 1,
                    stockValue: { $multiply: ['$currentStock', '$unitPrice'] },
                    isLowStock: { $lt: ['$currentStock', '$reorderLevel'] }
                }
            },
            { $sort: { totalRevenue: -1 } }
        );

        const products = await Sale.aggregate(pipeline);

        res.json({
            dateRange: { from: startDate, to: endDate },
            category: category || 'All Categories',
            products: products.map(p => ({
                id: p._id,
                name: p.name,
                category: p.category,
                currentStock: p.currentStock,
                reorderLevel: p.reorderLevel,
                unitPrice: Number((p.unitPrice || 0).toFixed(2)),
                totalQuantitySold: p.totalQuantitySold,
                totalRevenue: Number((p.totalRevenue || 0).toFixed(2)),
                salesCount: p.salesCount,
                averageSaleValue: Number((p.averageSaleValue || 0).toFixed(2)),
                stockValue: Number((p.stockValue || 0).toFixed(2)),
                isLowStock: p.isLowStock
            })),
            totalProducts: products.length
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Export category sales report as CSV
router.get('/sales-by-category/export', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to } = req.query;
        const { error, startDate, endDate } = parseRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        const pipeline = [
            {
                $match: {
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $lookup: {
                    from: 'items',
                    localField: 'itemId',
                    foreignField: '_id',
                    as: 'item'
                }
            },
            { $unwind: '$item' },
            {
                $group: {
                    _id: '$item.category',
                    totalRevenue: { $sum: '$totalAmount' },
                    totalQuantity: { $sum: '$quantitySold' },
                    salesCount: { $sum: 1 },
                    averageOrderValue: { $avg: '$totalAmount' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ];

        const categoryStats = await Sale.aggregate(pipeline);

        const data = categoryStats.map(cat => ({
            category: cat._id || 'Uncategorized',
            totalRevenue: Number((cat.totalRevenue || 0).toFixed(2)),
            totalQuantity: cat.totalQuantity || 0,
            salesCount: cat.salesCount || 0,
            averageOrderValue: Number((cat.averageOrderValue || 0).toFixed(2))
        }));

        const csv = convertToCSV(data, ['category', 'totalRevenue', 'totalQuantity', 'salesCount', 'averageOrderValue']);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=category-sales-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Manual trigger for low stock alert
router.post('/trigger-low-stock-alert', auth(['admin']), async (req, res) => {
    try {
        await alertService.checkLowStockAndNotify();
        res.json({ message: 'Low stock check triggered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Manual trigger for daily report
router.post('/trigger-daily-report', auth(['admin']), async (req, res) => {
    try {
        await alertService.sendDailyReport();
        res.json({ message: 'Daily report triggered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
