const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/inventory';

async function enableEcommerceForAllProducts() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const Item = mongoose.model('Item', new mongoose.Schema({}, { strict: false }));

        // Update all products to enable e-commerce
        const result = await Item.updateMany(
            {
                $or: [
                    { isEcommerceEnabled: { $exists: false } },
                    { isEcommerceEnabled: { $ne: true } },
                    { ecommerceVisibility: { $exists: false } },
                    { ecommerceVisibility: { $ne: 'public' } }
                ]
            },
            {
                $set: {
                    isEcommerceEnabled: true,
                    ecommerceVisibility: 'public'
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} products for e-commerce`);
        console.log(`   Matched: ${result.matchedCount} products`);

        // Show sample of updated products
        const sampleProducts = await Item.find()
            .select('name isEcommerceEnabled ecommerceVisibility')
            .limit(5);

        console.log('\n📦 Sample products:');
        sampleProducts.forEach(product => {
            console.log(`   - ${product.name}: ecommerce=${product.isEcommerceEnabled}, visibility=${product.ecommerceVisibility}`);
        });

        await mongoose.connection.close();
        console.log('\n✅ Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

enableEcommerceForAllProducts();
