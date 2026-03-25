const express = require('express');
const bcrypt = require('bcryptjs');
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

// Get all users (Admin only)
router.get('/', auth('admin'), async (req, res) => {
    try {
        const users = await User.find()
            .select('-passwordHash')
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get single user (Admin only)
router.get('/:id', auth('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-passwordHash')
            .populate('createdBy', 'username');

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update user (Admin only)
router.put('/:id', auth('admin'), async (req, res) => {
    try {
        const { username, role, password } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        const updates = {};
        if (username && username.trim()) updates.username = username.trim();
        if (role && ['admin', 'manager', 'staff'].includes(role)) updates.role = role;
        if (password) updates.passwordHash = await bcrypt.hash(password, 10);

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        ).select('-passwordHash');

        const adminUser = await User.findById(req.user.id);
        await logActivity(
            req.user.id,
            adminUser.username,
            'user_updated',
            'user',
            `Updated user: ${updatedUser.username}`,
            updatedUser._id,
            { updates },
            req.clientIp
        );

        res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete user (Admin only)
router.delete('/:id', auth('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Prevent deleting yourself
        if (user._id.toString() === req.user.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(req.params.id);

        const adminUser = await User.findById(req.user.id);
        await logActivity(
            req.user.id,
            adminUser.username,
            'user_deleted',
            'user',
            `Deleted user: ${user.username}`,
            null,
            { deletedUsername: user.username },
            req.clientIp
        );

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Activate/Deactivate user (Admin only)
router.patch('/:id/toggle-active', auth('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Prevent deactivating yourself
        if (user._id.toString() === req.user.id) {
            return res.status(400).json({ message: 'Cannot deactivate your own account' });
        }

        user.isActive = !user.isActive;
        await user.save();

        const adminUser = await User.findById(req.user.id);
        await logActivity(
            req.user.id,
            adminUser.username,
            user.isActive ? 'user_activated' : 'user_deactivated',
            'user',
            `${user.isActive ? 'Activated' : 'Deactivated'} user: ${user.username}`,
            user._id,
            null,
            req.clientIp
        );

        res.json({
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            user: { ...user.toObject(), passwordHash: undefined }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user statistics (Admin only)
router.get('/stats/overview', auth('admin'), async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const inactiveUsers = await User.countDocuments({ isActive: false });

        const roleDistribution = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        res.json({
            totalUsers,
            activeUsers,
            inactiveUsers,
            roleDistribution
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
