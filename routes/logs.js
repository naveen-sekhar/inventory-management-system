const express = require('express');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all activity logs (Admin and Manager) with pagination and filters
router.get('/', auth(['admin', 'manager']), async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            action,
            resourceType,
            userId,
            from,
            to,
            startDate,
            dateRange,
            username
        } = req.query;

        const query = {};

        if (action) query.action = action;
        if (resourceType) query.resourceType = resourceType;
        if (userId) query.userId = userId;
        if (username) {
            query.username = { $regex: new RegExp(username, 'i') };
        }

        const createdAt = {};

        if (from) createdAt.$gte = new Date(from);
        if (startDate && !createdAt.$gte) createdAt.$gte = new Date(startDate);
        if (to) createdAt.$lte = new Date(to);

        if (dateRange && dateRange !== 'all') {
            const now = new Date();
            const rangeLowerBounds = {
                today: (() => {
                    const start = new Date();
                    start.setHours(0, 0, 0, 0);
                    return start;
                })(),
                week: (() => {
                    const start = new Date();
                    start.setDate(start.getDate() - 6);
                    start.setHours(0, 0, 0, 0);
                    return start;
                })(),
                month: (() => {
                    const start = new Date();
                    start.setDate(start.getDate() - 29);
                    start.setHours(0, 0, 0, 0);
                    return start;
                })()
            };

            const lowerBound = rangeLowerBounds[dateRange];
            if (lowerBound) {
                createdAt.$gte = createdAt.$gte && createdAt.$gte > lowerBound ? createdAt.$gte : lowerBound;
                if (!createdAt.$lte) createdAt.$lte = now;
            }
        }

        if (Object.keys(createdAt).length) {
            query.createdAt = createdAt;
        }

        const numericLimit = parseInt(limit, 10);
        const numericPage = parseInt(page, 10);

        const logs = await ActivityLog.find(query)
            .populate('userId', 'username role')
            .sort({ createdAt: -1 })
            .limit(numericLimit)
            .skip((numericPage - 1) * numericLimit);

        const total = await ActivityLog.countDocuments(query);
        const totalPages = Math.ceil(total / numericLimit) || 1;

        res.json({
            logs,
            total,
            page: numericPage,
            totalPages,
            limit: numericLimit
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get activity log statistics
router.get('/stats', auth('admin'), async (req, res) => {
    try {
        const {
            from,
            to,
            dateRange,
            action,
            resourceType,
            userId,
            username
        } = req.query;

        const query = {};
        if (action) query.action = action;
        if (resourceType) query.resourceType = resourceType;
        if (userId) query.userId = userId;
        if (username) {
            query.username = { $regex: new RegExp(username, 'i') };
        }

        const createdAt = {};
        if (from) createdAt.$gte = new Date(from);
        if (to) createdAt.$lte = new Date(to);

        if (dateRange && dateRange !== 'all') {
            const now = new Date();
            const rangeLowerBounds = {
                today: (() => {
                    const start = new Date();
                    start.setHours(0, 0, 0, 0);
                    return start;
                })(),
                week: (() => {
                    const start = new Date();
                    start.setDate(start.getDate() - 6);
                    start.setHours(0, 0, 0, 0);
                    return start;
                })(),
                month: (() => {
                    const start = new Date();
                    start.setDate(start.getDate() - 29);
                    start.setHours(0, 0, 0, 0);
                    return start;
                })()
            };

            const lowerBound = rangeLowerBounds[dateRange];
            if (lowerBound) {
                createdAt.$gte = createdAt.$gte && createdAt.$gte > lowerBound ? createdAt.$gte : lowerBound;
                if (!createdAt.$lte) createdAt.$lte = now;
            }
        }

        if (Object.keys(createdAt).length) {
            query.createdAt = createdAt;
        }

        const baseQuery = { ...query };

        const total = await ActivityLog.countDocuments(baseQuery);

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const todayQuery = { ...baseQuery };
        todayQuery.createdAt = {
            ...(baseQuery.createdAt || {}),
            $gte: baseQuery.createdAt?.$gte && baseQuery.createdAt.$gte > startOfToday
                ? baseQuery.createdAt.$gte
                : startOfToday
        };

        const today = await ActivityLog.countDocuments(todayQuery);
        const uniqueUsers = (await ActivityLog.distinct('userId', baseQuery)).length;

        const actionStats = await ActivityLog.aggregate([
            { $match: query },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const resourceStats = await ActivityLog.aggregate([
            { $match: query },
            { $group: { _id: '$resourceType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const userStats = await ActivityLog.aggregate([
            { $match: query },
            { $group: { _id: '$userId', username: { $first: '$username' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            total,
            today,
            uniqueUsers,
            actionStats,
            resourceStats,
            topUsers: userStats
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get recent activity (Admin and Manager)
router.get('/recent', auth(['admin', 'manager']), async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const logs = await ActivityLog.find()
            .populate('userId', 'username role')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user's own activity logs
router.get('/my-activity', auth(), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;

        const logs = await ActivityLog.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await ActivityLog.countDocuments({ userId: req.user.id });

        res.json({
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete old logs (Admin only) - useful for maintenance
router.delete('/cleanup', auth('admin'), async (req, res) => {
    try {
        const { olderThanDays = 90 } = req.body;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

        const result = await ActivityLog.deleteMany({
            createdAt: { $lt: cutoffDate }
        });

        res.json({
            message: `Deleted ${result.deletedCount} log entries older than ${olderThanDays} days`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
