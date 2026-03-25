require('dotenv').config();
const mongoose = require('mongoose');
const alertService = require('./services/alertService');

const testAlerts = async () => {
    console.log('Starting Alert System Test...');

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('WARNING: EMAIL_USER or EMAIL_PASS is missing in .env. Email sending will likely fail.');
    }

    try {
        // Connect to Database
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.');

        // Test Low Stock Alert
        console.log('\n--- Testing Low Stock Alert ---');
        console.log('Checking for items with quantity < reorderLevel...');
        await alertService.checkLowStockAndNotify();
        console.log('Low Stock Alert check completed. Check your email (and spam folder) if you had low stock items.');

        // Test Daily Report
        console.log('\n--- Testing Daily Report ---');
        console.log('Generating PDF and sending email...');
        await alertService.sendDailyReport();
        console.log('Daily Report generation and send completed. Check your email.');

    } catch (error) {
        console.error('Test failed with error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB. Test finished.');
        process.exit();
    }
};

testAlerts();
