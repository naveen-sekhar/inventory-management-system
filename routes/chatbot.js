const express = require('express');

const router = express.Router();

// Chat functionality has been removed. This route is kept for backward compatibility and now returns 410.
router.all('/', (req, res) => {
    res.status(410).json({ message: 'InventoryBot has been removed from this application.' });
});

module.exports = router;
