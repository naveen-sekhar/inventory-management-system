const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

const cors = require('cors');
const connectDB = require('./config/db');
const alertService = require('./services/alertService');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const supplierRoutes = require('./routes/suppliers');
const salesRoutes = require('./routes/sales');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');
const logRoutes = require('./routes/logs');
const analyticsRoutes = require('./routes/analytics');
const shopApiRoutes = require('./routes/shop-api');
const ecommercePortalRoutes = require('./routes/ecommerce-portal');
const recipientRoutes = require('./routes/recipients');

// Initialize database connection
connectDB().catch(err => {
    console.error('Database connection failed:', err);
    // Don't exit in serverless - allow retry on next request
    if (process.env.VERCEL !== '1') {
        process.exit(1);
    }
});

// Only initialize scheduled jobs if not in serverless environment
if (process.env.VERCEL !== '1') {
    alertService.initScheduledJobs();
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const app = express();

// ===== IP ADDRESS AND REQUEST LOGGING MIDDLEWARE =====
app.use((req, res, next) => {
    // Get real IP address (handles proxies and load balancers)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket?.remoteAddress ||
        'Unknown';

    // Store IP in request object for use in routes
    req.clientIp = ip;

    // Get timestamp
    const timestamp = new Date().toISOString();

    // Get user agent
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Colors for terminal output
    const colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        dim: '\x1b[2m',
        cyan: '\x1b[36m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        red: '\x1b[31m',
        magenta: '\x1b[35m',
        blue: '\x1b[34m'
    };

    // Method colors
    const methodColors = {
        GET: colors.green,
        POST: colors.cyan,
        PUT: colors.yellow,
        PATCH: colors.yellow,
        DELETE: colors.red,
        OPTIONS: colors.dim
    };

    const methodColor = methodColors[req.method] || colors.reset;

    // Log request details to terminal
    console.log(`\n${colors.bright}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.dim}[${timestamp}]${colors.reset}`);
    console.log(`${methodColor}${req.method}${colors.reset} ${colors.bright}${req.originalUrl || req.url}${colors.reset}`);
    console.log(`${colors.cyan}IP:${colors.reset} ${ip}`);

    // Log authentication if present
    if (req.headers.authorization) {
        const tokenPreview = req.headers.authorization.substring(0, 30) + '...';
        console.log(`${colors.magenta}Auth:${colors.reset} ${tokenPreview}`);
    }

    // Log body for POST/PUT/PATCH requests (excluding sensitive data)
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        const sanitizedBody = { ...req.body };
        // Remove sensitive fields from logs
        if (sanitizedBody.password) sanitizedBody.password = '***HIDDEN***';
        if (sanitizedBody.passwordHash) sanitizedBody.passwordHash = '***HIDDEN***';
        if (sanitizedBody.token) sanitizedBody.token = '***HIDDEN***';

        console.log(`${colors.blue}Body:${colors.reset} ${JSON.stringify(sanitizedBody, null, 2)}`);
    }

    // Log query parameters
    if (Object.keys(req.query).length > 0) {
        console.log(`${colors.yellow}Query:${colors.reset} ${JSON.stringify(req.query)}`);
    }

    // Log user agent (shortened)
    const shortUA = userAgent.length > 60 ? userAgent.substring(0, 60) + '...' : userAgent;
    console.log(`${colors.dim}User-Agent:${colors.reset} ${shortUA}`);

    // Capture response time
    const startTime = Date.now();

    // Override res.json to log response
    const originalJson = res.json.bind(res);
    res.json = function (data) {
        const duration = Date.now() - startTime;
        const statusColor = res.statusCode < 300 ? colors.green :
            res.statusCode < 400 ? colors.yellow : colors.red;

        console.log(`${statusColor}Status:${colors.reset} ${res.statusCode} ${colors.dim}(${duration}ms)${colors.reset}`);
        console.log(`${colors.bright}${'='.repeat(80)}${colors.reset}\n`);

        return originalJson(data);
    };

    // Override res.send to log response for non-JSON
    const originalSend = res.send.bind(res);
    res.send = function (data) {
        const duration = Date.now() - startTime;
        const statusColor = res.statusCode < 300 ? colors.green :
            res.statusCode < 400 ? colors.yellow : colors.red;

        console.log(`${statusColor}Status:${colors.reset} ${res.statusCode} ${colors.dim}(${duration}ms)${colors.reset}`);
        console.log(`${colors.bright}${'='.repeat(80)}${colors.reset}\n`);

        return originalSend(data);
    };

    next();
});

// Increase payload size limit for image uploads (base64 can be large)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS Configuration - allows all origins in development, configurable in production
const corsOptions = {
    origin: NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || '*'
        : '*',
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Serve static frontend files without auto-index so custom route can handle '/'
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/shop', shopApiRoutes);
app.use('/api/ecommerce', ecommercePortalRoutes);
app.use('/api/recipients', recipientRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Export for Vercel serverless
module.exports = app;

// Only start server if not in serverless environment (Vercel)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, HOST, () =>
        console.log(`Server running on http://localhost:${PORT}`)
    );
}
