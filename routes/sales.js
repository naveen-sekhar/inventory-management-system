const express = require('express');
const mongoose = require('mongoose');
const Item = require('../models/Item');
const Sale = require('../models/Sale');
const auth = require('../middleware/auth');

const router = express.Router();

const parseQuantity = (value) => {
    if (value === undefined || value === null || value === '') {
        return { error: 'Quantity sold is required' };
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
        return { error: 'Quantity sold must be a valid number' };
    }

    if (parsed <= 0) {
        return { error: 'Quantity sold must be greater than zero' };
    }

    return { value: Math.floor(parsed) };
};

const parseDateRange = (from, to) => {
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

const normalizeSummary = (summary = {}) => ({
    totalAmount: Number((summary.totalAmount || 0).toFixed(2)),
    totalQuantity: summary.totalQuantity || 0,
    transactions: summary.transactions || 0,
    uniqueProducts: summary.uniqueProducts || 0
});

const buildUserSummaryPipeline = (userObjectId, startDate, endDate) => {
    const match = { soldBy: userObjectId };

    if (startDate || endDate) {
        match.date = {};
        if (startDate) match.date.$gte = startDate;
        if (endDate) match.date.$lte = endDate;
    }

    return [
        { $match: match },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$totalAmount' },
                totalQuantity: { $sum: '$quantitySold' },
                transactions: { $sum: 1 },
                products: { $addToSet: '$itemId' }
            }
        },
        {
            $project: {
                _id: 0,
                totalAmount: { $ifNull: ['$totalAmount', 0] },
                totalQuantity: { $ifNull: ['$totalQuantity', 0] },
                transactions: { $ifNull: ['$transactions', 0] },
                uniqueProducts: { $size: { $ifNull: ['$products', []] } }
            }
        }
    ];
};

const aggregateUserSummary = async (userObjectId, startDate, endDate) => {
    const [result] = await Sale.aggregate(buildUserSummaryPipeline(userObjectId, startDate, endDate));
    return normalizeSummary(result);
};

// Record a sale (admin, manager, staff)
router.post('/', auth(['admin', 'manager', 'staff']), async (req, res) => {
    try {
        const { itemId, quantitySold, date } = req.body;

        if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ message: 'Valid item ID is required' });
        }

        const quantityResult = parseQuantity(quantitySold);
        if (quantityResult.error) {
            return res.status(400).json({ message: quantityResult.error });
        }

        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        if (item.quantity < quantityResult.value) {
            return res.status(400).json({ message: 'Insufficient stock for this sale' });
        }

        item.quantity -= quantityResult.value;
        await item.save();

        const saleDate = date ? new Date(date) : new Date();
        if (Number.isNaN(saleDate.getTime())) {
            return res.status(400).json({ message: 'Invalid sale date' });
        }

        const totalAmount = Number((item.price * quantityResult.value).toFixed(2));
        const sale = await Sale.create({
            itemId,
            quantitySold: quantityResult.value,
            date: saleDate,
            soldBy: req.user.id,
            totalAmount
        });

        await sale.populate('itemId', 'name category');
        res.status(201).json(sale.toObject());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// List all sales (admin & manager)
router.get('/', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { itemId, from, to, userId } = req.query;
        const filter = {};

        if (itemId) {
            if (!mongoose.Types.ObjectId.isValid(itemId)) {
                return res.status(400).json({ message: 'Invalid item ID' });
            }
            filter.itemId = itemId;
        }

        if (userId) {
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({ message: 'Invalid user ID' });
            }
            filter.soldBy = userId;
        }

        const { error, startDate, endDate } = parseDateRange(from, to);
        if (error) {
            return res.status(400).json({ message: error });
        }

        filter.date = { $gte: startDate, $lte: endDate };

        const sales = await Sale.find(filter)
            .populate('itemId', 'name category')
            .populate('soldBy', 'username role')
            .sort({ date: -1 });

        res.json(sales.map((sale) => sale.toObject()));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Personal sales summary (admin, manager, staff)
router.get('/summary/me', auth(['admin', 'manager', 'staff']), async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid user context' });
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [todaySummary, monthSummary, recentSales] = await Promise.all([
            aggregateUserSummary(userObjectId, todayStart, todayEnd),
            aggregateUserSummary(userObjectId, monthStart, todayEnd),
            Sale.find({ soldBy: userObjectId })
                .sort({ date: -1 })
                .limit(10)
                .populate('itemId', 'name category')
        ]);

        res.json({
            today: todaySummary,
            monthToDate: monthSummary,
            recentSales: recentSales.map((sale) => ({
                id: sale._id,
                itemName: sale.itemId?.name || 'Unknown item',
                category: sale.itemId?.category || '—',
                quantity: sale.quantitySold,
                totalAmount: Number((sale.totalAmount || 0).toFixed(2)),
                date: sale.date
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get sale by ID (admin & manager)
router.get('/:id', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid sale ID' });
        }

        const sale = await Sale.findById(id)
            .populate('itemId', 'name category')
            .populate('soldBy', 'username role');
        if (!sale) {
            return res.status(404).json({ message: 'Sale not found' });
        }

        res.json(sale.toObject());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Date range report (admin & manager)
router.get('/report/date-range', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { from, to } = req.query;
        const { error, startDate, endDate } = parseDateRange(from, to);
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
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$date'
                        }
                    },
                    totalQuantity: { $sum: '$quantitySold' },
                    totalAmount: { $sum: '$totalAmount' }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const results = await Sale.aggregate(pipeline);
        res.json({
            range: {
                from: startDate,
                to: endDate
            },
            data: results.map((entry) => ({
                date: entry._id,
                totalQuantity: entry.totalQuantity,
                totalAmount: entry.totalAmount
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
