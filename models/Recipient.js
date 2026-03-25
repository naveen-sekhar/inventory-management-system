const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    types: {
        type: [String],
        enum: ['low_stock', 'daily_report'],
        default: ['low_stock', 'daily_report']
    },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('Recipient', recipientSchema);
