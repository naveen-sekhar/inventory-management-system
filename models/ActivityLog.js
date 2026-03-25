const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    username: { type: String, required: true },
    action: {
        type: String,
        required: true,
        enum: [
            'user_created', 'user_updated', 'user_deleted', 'user_activated', 'user_deactivated',
            'item_created', 'item_updated', 'item_deleted', 'stock_updated',
            'sale_recorded', 'sale_deleted',
            'supplier_created', 'supplier_updated', 'supplier_deleted',
            'report_generated', 'csv_import', 'csv_export',
            'login', 'logout', 'password_changed'
        ]
    },
    resourceType: {
        type: String,
        enum: ['user', 'item', 'sale', 'supplier', 'report', 'system'],
        required: true
    },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String }
}, {
    timestamps: true
});

// Index for faster queries
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ resourceType: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
