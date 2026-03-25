const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const seedUsers = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB Connected');

        // Clear existing users (optional - remove if you want to keep existing data)
        await User.deleteMany({});
        console.log('🗑️  Cleared existing users');

        // Hash passwords
        const adminHash = await bcrypt.hash('admin123', 10);
        const managerHash = await bcrypt.hash('manager123', 10);
        const staffHash = await bcrypt.hash('staff123', 10);

        // Create demo users
        const users = [
            {
                username: 'admin',
                passwordHash: adminHash,
                role: 'admin'
            },
            {
                username: 'manager1',
                passwordHash: managerHash,
                role: 'manager'
            },
            {
                username: 'staff1',
                passwordHash: staffHash,
                role: 'staff'
            }
        ];

        // Insert users
        await User.insertMany(users);
        console.log('✅ Demo users created successfully:');
        console.log('   - admin / admin123 (admin)');
        console.log('   - manager1 / manager123 (manager)');
        console.log('   - staff1 / staff123 (staff)');

        // Close connection
        mongoose.connection.close();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error seeding database:', error.message);
        process.exit(1);
    }
};

seedUsers();
