require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('../models/Item');

const productId = process.argv[2];

async function findProduct() {
    try {
        await mongoose.connect('mongodb://localhost:27017/inventory-system');
        console.log('✅ Connected to MongoDB\n');

        const product = await Item.findById(productId);

        if (product) {
            console.log('✅ Product found:');
            console.log(`   Name: ${product.name}`);
            console.log(`   Barcode: ${product.barcode}`);
            console.log(`   Price: ₹${product.price}`);
            console.log(`   Quantity: ${product.quantity}`);
            console.log(`   E-commerce enabled: ${product.isEcommerceEnabled}`);
            console.log(`   Visibility: ${product.ecommerceVisibility}`);
        } else {
            console.log('❌ Product not found with ID:', productId);
            console.log('\nSearching for similar IDs...');

            const allProducts = await Item.find().limit(5);
            console.log('\n📦 Recent products:');
            allProducts.forEach(p => {
                console.log(`   ${p._id} - ${p.name}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

findProduct();
