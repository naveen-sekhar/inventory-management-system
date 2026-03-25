const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        category: { type: String, required: true, trim: true },
        supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
        quantity: {
            type: Number,
            required: true,
            min: [0, 'Quantity cannot be negative']
        },
        reorderLevel: {
            type: Number,
            required: true,
            min: [0, 'Reorder level cannot be negative']
        },
        price: {
            type: Number,
            required: true,
            min: [0, 'Price cannot be negative']
        },
        barcode: { type: String, trim: true },
        unit: { type: String, trim: true },
        description: { type: String, trim: true, default: '' },
        specifications: { type: String, trim: true },
        notes: { type: String, trim: true },
        images: {
            type: [String],
            default: [],
            set: (images) => (Array.isArray(images) ? images.map(url => String(url).trim()) : [])
        },
        tags: {
            type: [String],
            default: [],
            set: (tags) => (Array.isArray(tags) ? tags.map(tag => String(tag).trim()).filter(Boolean) : [])
        },
        isEcommerceEnabled: { type: Boolean, default: true },
        ecommerceVisibility: {
            type: String,
            enum: ['public', 'limited', 'internal'],
            default: 'public'
        },
        ecommerceTags: {
            type: [String],
            default: [],
            set: (tags) => (Array.isArray(tags) ? tags.map(tag => String(tag).trim()).filter(Boolean) : [])
        },
        expiryDate: { type: Date },
        lastRestocked: { type: Date },
        sku: { type: String, unique: true, sparse: true },
        lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        lastModifiedAt: { type: Date }
    },
    {
        timestamps: true
    }
);

itemSchema.virtual('lowStock').get(function () {
    if (this.reorderLevel === undefined || this.reorderLevel === null) return false;
    return this.quantity < this.reorderLevel;
});

itemSchema.virtual('isExpired').get(function () {
    if (!this.expiryDate) return false;
    return new Date() > this.expiryDate;
});

itemSchema.virtual('stockValue').get(function () {
    return this.quantity * this.price;
});

itemSchema.set('toJSON', { virtuals: true, versionKey: false });
itemSchema.set('toObject', { virtuals: true, versionKey: false });

module.exports = mongoose.model('Item', itemSchema);
