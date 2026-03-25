const jwt = require('jsonwebtoken');

function auth(requiredRole) {
    const roles = Array.isArray(requiredRole)
        ? requiredRole
        : requiredRole
            ? [requiredRole]
            : null;

    return (req, res, next) => {
        const header = req.header('Authorization');
        if (!header) return res.status(401).json({ message: 'Missing token' });

        const token = header.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Invalid token format' });

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;

            if (roles && !roles.includes(decoded.role))
                return res.status(403).json({ message: 'Forbidden: insufficient rights' });

            next();
        } catch (err) {
            res.status(401).json({ message: 'Invalid or expired token' });
        }
    };
}

module.exports = auth;
