const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Health check endpoint - no authentication required
router.get('/', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    
    // readyState values: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const status = {
        server: 'running',
        database: dbStatus === 1 ? 'connected' : 
                  dbStatus === 2 ? 'connecting' : 
                  dbStatus === 3 ? 'disconnecting' : 'disconnected',
        timestamp: new Date().toISOString()
    };

    const httpStatus = dbStatus === 1 ? 200 : 503;
    res.status(httpStatus).json(status);
});

module.exports = router;
