const express = require('express');
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const Supplier = require('../models/Supplier');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Dashboard overview statistics
router.get('/dashboard-stats', auth(), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Today's sales
        const todaySales = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: today, $lt: tomorrow }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Total inventory value
        const inventoryValue = await Item.aggregate([
            {
                $group: {
                    _id: null,
                    totalValue: { $sum: { $multiply: ['$quantity', '$price'] } },
                    totalItems: { $sum: 1 }
                }
            }
        ]);

        // Low stock count
        const lowStockCount = await Item.countDocuments({
            $expr: { $lt: ['$quantity', '$reorderLevel'] }
        });

        // Expired items count
        const expiredCount = await Item.countDocuments({
            expiryDate: { $lt: new Date() }
        });

        // Total suppliers
        const supplierCount = await Supplier.countDocuments();

        // Total users (admin only)
        let userCount = null;
        if (req.user.role === 'admin') {
            userCount = await User.countDocuments();
        }

        res.json({
            todaySales: {
                total: todaySales[0]?.total || 0,
                count: todaySales[0]?.count || 0
            },
            inventory: {
                totalValue: inventoryValue[0]?.totalValue || 0,
                totalItems: inventoryValue[0]?.totalItems || 0,
                lowStockCount,
                expiredCount
            },
            supplierCount,
            userCount
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Stock summary and trends
router.get('/stock-summary', auth(['admin', 'manager']), async (req, res) => {
    try {
        // Category distribution
        const categoryStats = await Item.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalQuantity: { $sum: '$quantity' },
                    totalValue: { $sum: { $multiply: ['$quantity', '$price'] } },
                    lowStockItems: {
                        $sum: {
                            $cond: [{ $lt: ['$quantity', '$reorderLevel'] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { totalValue: -1 } }
        ]);

        // Stock level distribution
        const stockLevels = await Item.aggregate([
            {
                $bucket: {
                    groupBy: '$quantity',
                    boundaries: [0, 10, 50, 100, 500, 1000, Number.MAX_VALUE],
                    default: 'Other',
                    output: {
                        count: { $sum: 1 },
                        items: { $push: '$name' }
                    }
                }
            }
        ]);

        // Top value items
        const topItems = await Item.aggregate([
            {
                $addFields: {
                    stockValue: { $multiply: ['$quantity', '$price'] }
                }
            },
            { $sort: { stockValue: -1 } },
            { $limit: 10 },
            {
                $project: {
                    name: 1,
                    category: 1,
                    quantity: 1,
                    price: 1,
                    stockValue: 1
                }
            }
        ]);

        res.json({
            categoryStats,
            stockLevels,
            topItems
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Sales analytics and trends
router.get('/sales-analytics', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Daily sales trend
        const dailySales = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$date'
                        }
                    },
                    totalAmount: { $sum: '$totalAmount' },
                    totalQuantity: { $sum: '$quantitySold' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Top selling items
        const topSellingItems = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: startDate }
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
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'items',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'item'
                }
            },
            { $unwind: '$item' },
            {
                $project: {
                    name: '$item.name',
                    category: '$item.category',
                    totalQuantity: 1,
                    totalRevenue: 1,
                    salesCount: 1
                }
            }
        ]);

        // Monthly revenue comparison
        const monthlyRevenue = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: new Date(new Date().getFullYear(), 0, 1) }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m',
                            date: '$date'
                        }
                    },
                    revenue: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            dailySales,
            topSellingItems,
            monthlyRevenue
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Supplier performance and efficiency
router.get('/supplier-analytics', auth(['admin', 'manager']), async (req, res) => {
    try {
        const suppliers = await Supplier.find();

        const analytics = await Promise.all(suppliers.map(async (supplier) => {
            const items = await Item.find({ supplierId: supplier._id });
            const itemCount = items.length;

            const lowStockCount = items.filter(item => item.quantity < item.reorderLevel).length;
            const totalStockValue = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            const averagePrice = itemCount > 0 ? items.reduce((sum, item) => sum + item.price, 0) / itemCount : 0;

            // Calculate efficiency score (lower low stock ratio = better)
            const efficiencyScore = itemCount > 0 ? ((itemCount - lowStockCount) / itemCount) * 100 : 0;

            return {
                supplierId: supplier._id,
                name: supplier.name,
                itemCount,
                lowStockCount,
                totalStockValue: Number(totalStockValue.toFixed(2)),
                averagePrice: Number(averagePrice.toFixed(2)),
                efficiencyScore: Number(efficiencyScore.toFixed(1))
            };
        }));

        // Sort by efficiency score
        analytics.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

        res.json(analytics);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Reorder suggestions based on sales trends
router.get('/reorder-suggestions', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get items below reorder level
        const lowStockItems = await Item.find({
            $expr: { $lt: ['$quantity', '$reorderLevel'] }
        }).populate('supplierId', 'name contact email');

        // Calculate sales velocity for low stock items
        const suggestions = await Promise.all(lowStockItems.map(async (item) => {
            const sales = await Sale.aggregate([
                {
                    $match: {
                        itemId: item._id,
                        date: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalSold: { $sum: '$quantitySold' }
                    }
                }
            ]);

            const totalSold = sales[0]?.totalSold || 0;
            const dailyAverage = totalSold / parseInt(days);
            const suggestedReorder = Math.ceil(dailyAverage * 30); // 30 days supply

            return {
                itemId: item._id,
                name: item.name,
                category: item.category,
                currentQuantity: item.quantity,
                reorderLevel: item.reorderLevel,
                supplier: item.supplierId,
                salesVelocity: Number(dailyAverage.toFixed(2)),
                suggestedReorderQuantity: suggestedReorder,
                urgency: item.quantity < (item.reorderLevel / 2) ? 'HIGH' : 'MEDIUM'
            };
        }));

        // Sort by urgency and quantity
        suggestions.sort((a, b) => {
            if (a.urgency === 'HIGH' && b.urgency !== 'HIGH') return -1;
            if (a.urgency !== 'HIGH' && b.urgency === 'HIGH') return 1;
            return a.currentQuantity - b.currentQuantity;
        });

        res.json(suggestions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Performance insights for managers
router.get('/performance-insights', auth(['admin', 'manager']), async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // Current period (last 30 days)
        const currentPeriodSales = await Sale.aggregate([
            { $match: { date: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: null,
                    revenue: { $sum: '$totalAmount' },
                    quantity: { $sum: '$quantitySold' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Previous period (30-60 days ago)
        const previousPeriodSales = await Sale.aggregate([
            { $match: { date: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
            {
                $group: {
                    _id: null,
                    revenue: { $sum: '$totalAmount' },
                    quantity: { $sum: '$quantitySold' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const current = currentPeriodSales[0] || { revenue: 0, quantity: 0, count: 0 };
        const previous = previousPeriodSales[0] || { revenue: 0, quantity: 0, count: 0 };

        const revenueGrowth = previous.revenue > 0
            ? ((current.revenue - previous.revenue) / previous.revenue) * 100
            : 0;

        const salesGrowth = previous.count > 0
            ? ((current.count - previous.count) / previous.count) * 100
            : 0;

        // Stock turnover rate
        const totalInventoryValue = await Item.aggregate([
            {
                $group: {
                    _id: null,
                    value: { $sum: { $multiply: ['$quantity', '$price'] } }
                }
            }
        ]);

        const inventoryValue = totalInventoryValue[0]?.value || 1;
        const turnoverRate = (current.revenue / inventoryValue).toFixed(2);

        res.json({
            currentPeriod: current,
            previousPeriod: previous,
            growth: {
                revenue: Number(revenueGrowth.toFixed(2)),
                sales: Number(salesGrowth.toFixed(2))
            },
            turnoverRate: Number(turnoverRate)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
