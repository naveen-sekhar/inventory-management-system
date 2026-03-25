const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        contact: { type: String, trim: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        products: { type: [String], default: [] }
    },
    {
        timestamps: true
    }
);

supplierSchema.set('toJSON', { virtuals: true, versionKey: false });
supplierSchema.set('toObject', { virtuals: true, versionKey: false });

module.exports = mongoose.model('Supplier', supplierSchema);
