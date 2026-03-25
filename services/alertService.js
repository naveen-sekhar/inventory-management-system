const Item = require('../models/Item');
const Recipient = require('../models/Recipient');
const emailService = require('./emailService');
const reportService = require('./reportService');
const cron = require('node-cron');

const checkLowStockAndNotify = async () => {
    try {
        // Find items where quantity is less than reorderLevel
        const items = await Item.find({ $expr: { $lt: ["$quantity", "$reorderLevel"] } });

        if (items.length > 0) {
            let html = '<h2>Low Stock Alert</h2><p>The following items are running low on stock:</p><ul>';
            items.forEach(item => {
                html += `<li><strong>${item.name}</strong>: Current Quantity: ${item.quantity} (Reorder Level: ${item.reorderLevel})</li>`;
            });
            html += '</ul>';

            // Get all active recipients who want low stock alerts
            const recipients = await Recipient.find({
                isActive: true,
                types: 'low_stock'
            });

            if (recipients.length === 0) {
                console.log('No active recipients configured for low stock alerts. Using default admin email.');
                const adminEmail = process.env.EMAIL_FROM;
                await emailService.sendEmail(adminEmail, 'Low Stock Alert', 'Some items are low on stock.', html);
            } else {
                // Send email to all recipients
                for (const recipient of recipients) {
                    await emailService.sendEmail(recipient.email, 'Low Stock Alert', 'Some items are low on stock.', html);
                }
                console.log(`Low stock alert sent to ${recipients.length} recipient(s) for ${items.length} items.`);
            }
        } else {
            console.log('No low stock items found.');
        }
    } catch (error) {
        console.error('Error checking low stock:', error);
    }
};

const sendDailyReport = async () => {
    try {
        const pdfBuffer = await reportService.generateInventoryReport();

        // Get all active recipients who want daily reports
        const recipients = await Recipient.find({
            isActive: true,
            types: 'daily_report'
        });

        if (recipients.length === 0) {
            console.log('No active recipients configured for daily reports. Using default admin email.');
            const adminEmail = process.env.EMAIL_FROM;
            await emailService.sendEmail(
                adminEmail,
                'Daily Inventory Report',
                'Please find attached the daily inventory report.',
                '<p>Please find attached the daily inventory report.</p>',
                [
                    {
                        filename: `inventory-report-${new Date().toISOString().split('T')[0]}.pdf`,
                        content: pdfBuffer
                    }
                ]
            );
        } else {
            // Send email to all recipients
            for (const recipient of recipients) {
                await emailService.sendEmail(
                    recipient.email,
                    'Daily Inventory Report',
                    'Please find attached the daily inventory report.',
                    '<p>Please find attached the daily inventory report.</p>',
                    [
                        {
                            filename: `inventory-report-${new Date().toISOString().split('T')[0]}.pdf`,
                            content: pdfBuffer
                        }
                    ]
                );
            }
            console.log(`Daily report sent to ${recipients.length} recipient(s).`);
        }
    } catch (error) {
        console.error('Error sending daily report:', error);
    }
};

const initScheduledJobs = () => {
    // Run low stock check every day at 9:00 AM
    cron.schedule('0 9 * * *', () => {
        console.log('Running scheduled low stock check...');
        checkLowStockAndNotify();
    });

    // Send daily report every day at 6:00 PM
    cron.schedule('0 18 * * *', () => {
        console.log('Running scheduled daily report...');
        sendDailyReport();
    });

    console.log('Scheduled jobs initialized.');
};

module.exports = {
    checkLowStockAndNotify,
    sendDailyReport,
    initScheduledJobs
};
