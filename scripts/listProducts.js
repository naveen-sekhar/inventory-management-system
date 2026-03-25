require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('../models/Item');

async function listProducts() {
    try {
        await mongoose.connect('mongodb://localhost:27017/inventory');
        console.log('✅ Connected to MongoDB\n');

        const products = await Item.find().limit(10);

        console.log(`📦 Found ${products.length} products:\n`);
        products.forEach((p, index) => {
            console.log(`${index + 1}. ${p.name}`);
            console.log(`   ID: ${p._id}`);
            console.log(`   Barcode: ${p.barcode || 'N/A'}`);
            console.log(`   Price: ₹${p.price}`);
            console.log(`   E-commerce: ${p.isEcommerceEnabled ? '✅' : '❌'}`);
            console.log('');
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

listProducts();
