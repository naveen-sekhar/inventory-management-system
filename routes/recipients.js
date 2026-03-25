const express = require('express');
const router = express.Router();
const Recipient = require('../models/Recipient');
const auth = require('../middleware/auth');

// Get all recipients
router.get('/', auth(['admin', 'manager']), async (req, res) => {
    try {
        const recipients = await Recipient.find().sort({ createdAt: -1 });
        res.json(recipients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add a new recipient
router.post('/', auth(['admin']), async (req, res) => {
    try {
        const { name, email, types } = req.body;
        const newRecipient = new Recipient({ name, email, types });
        await newRecipient.save();
        res.status(201).json(newRecipient);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update a recipient
router.put('/:id', auth(['admin']), async (req, res) => {
    try {
        const { name, email, types, isActive } = req.body;
        const updatedRecipient = await Recipient.findByIdAndUpdate(
            req.params.id,
            { name, email, types, isActive },
            { new: true }
        );
        if (!updatedRecipient) return res.status(404).json({ message: 'Recipient not found' });
        res.json(updatedRecipient);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete a recipient
router.delete('/:id', auth(['admin']), async (req, res) => {
    try {
        const deletedRecipient = await Recipient.findByIdAndDelete(req.params.id);
        if (!deletedRecipient) return res.status(404).json({ message: 'Recipient not found' });
        res.json({ message: 'Recipient deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
