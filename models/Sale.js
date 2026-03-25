const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
    {
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        quantitySold: {
            type: Number,
            min: [1, 'Quantity sold must be at least 1']
        },
        quantity: {
            type: Number,
            min: [1, 'Quantity must be at least 1']
        },
        unitPrice: {
            type: Number,
            min: [0, 'Unit price cannot be negative']
        },
        date: { type: Date, default: Date.now },
        soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        totalAmount: {
            type: Number,
            required: true,
            min: [0, 'Total amount cannot be negative']
        },
        customerName: String,
        customerContact: String,
        customerEmail: String,
        shippingAddress: String,
        paymentMethod: {
            type: String,
            enum: ['cash', 'card', 'upi', 'wallet', 'online'],
            default: 'cash'
        },
        orderStatus: {
            type: String,
            enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
            default: 'pending'
        },
        trackingNumber: String,
        notes: String
    },
    {
        timestamps: true
    }
);

saleSchema.set('toJSON', { virtuals: true, versionKey: false });
saleSchema.set('toObject', { virtuals: true, versionKey: false });

module.exports = mongoose.model('Sale', saleSchema);
