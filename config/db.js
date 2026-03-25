const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    // If already connected, return
    if (isConnected && mongoose.connection.readyState === 1) {
        console.log('✅ Using existing MongoDB connection');
        return;
    }

    // Check if MONGO_URI is defined
    if (!process.env.MONGO_URI) {
        console.error('❌ MONGO_URI environment variable is not defined');
        throw new Error('MONGO_URI is not defined');
    }

    try {
        const options = {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        };

        await mongoose.connect(process.env.MONGO_URI, options);
        isConnected = true;
        console.log('✅ MongoDB Connected Successfully');
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        isConnected = false;
        throw error;
    }
};

module.exports = connectDB;
