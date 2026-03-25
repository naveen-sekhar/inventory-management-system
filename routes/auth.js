const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');

const router = express.Router();

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

// Admin only route for user creation keeps registration limited to privileged accounts.
router.post('/register', auth('admin'), async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const trimmedUsername = username ? username.trim() : '';
        const allowedRoles = ['admin', 'manager', 'staff', 'ecommerce'];
        const normalisedRole = allowedRoles.includes(role) ? role : 'staff';

        if (!trimmedUsername || !password)
            return res.status(400).json({ message: 'Missing username or password' });

        const existing = await User.findOne({ username: trimmedUsername });
        if (existing) return res.status(400).json({ message: 'Username already exists' });

        const hash = await bcrypt.hash(password, 10);
        const user = new User({
            username: trimmedUsername,
            passwordHash: hash,
            role: normalisedRole,
            createdBy: req.user.id
        });
        await user.save();

        const adminUser = await User.findById(req.user.id);
        await logActivity(
            req.user.id,
            adminUser.username,
            'user_created',
            'user',
            `Created new user: ${trimmedUsername} with role: ${normalisedRole}`,
            user._id,
            { role: normalisedRole },
            req.clientIp
        );

        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const trimmedUsername = username ? username.trim() : '';
        if (!trimmedUsername || !password) {
            return res.status(400).json({ message: 'Missing username or password' });
        }

        const user = await User.findOne({ username: trimmedUsername });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is deactivated. Contact admin.' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        await logActivity(
            user._id,
            user.username,
            'login',
            'system',
            `User logged in successfully`,
            null,
            null,
            req.clientIp
        );

        res.json({ token, role: user.role, username: user.username });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/change-password', auth(), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new password are required' });
        }

        if (String(newPassword).trim().length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters long' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isCurrentValid) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ message: 'New password must be different from the current password' });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();

        await logActivity(
            req.user.id,
            user.username,
            'password_changed',
            'user',
            'Updated account password',
            user._id
        );

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/logout', auth(), async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user) {
            await logActivity(
                req.user.id,
                user.username,
                'logout',
                'system',
                'User logged out',
                null,
                null,
                req.clientIp
            );
        }

        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ message: err.message });
    }
});

// Health check endpoint with DB status and ping
router.get('/health', async (req, res) => {
    const startTime = Date.now();
    try {
        // Check MongoDB connection
        const dbState = mongoose.connection.readyState;
        const dbStatus = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        // Ping database
        let dbPing = null;
        if (dbState === 1) {
            const pingStart = Date.now();
            await mongoose.connection.db.admin().ping();
            dbPing = Date.now() - pingStart;
        }

        const responseTime = Date.now() - startTime;

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: {
                status: dbStatus[dbState] || 'unknown',
                connected: dbState === 1,
                ping: dbPing
            },
            server: {
                uptime: process.uptime(),
                responseTime: responseTime
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: {
                status: 'error',
                connected: false,
                ping: null
            },
            error: error.message
        });
    }
});

module.exports = router;
