const PDFDocument = require('pdfkit');
const Item = require('../models/Item');
const Sale = require('../models/Sale');

const generateInventoryReport = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const items = await Item.find({});
            const doc = new PDFDocument();
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                let pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            doc.fontSize(20).text('Inventory Report', { align: 'center' });
            doc.moveDown();

            doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
            doc.moveDown();

            // Table Header
            const tableTop = 150;
            const nameX = 50;
            const categoryX = 200;
            const quantityX = 350;
            const priceX = 450;

            doc.font('Helvetica-Bold');
            doc.text('Name', nameX, tableTop);
            doc.text('Category', categoryX, tableTop);
            doc.text('Qty', quantityX, tableTop);
            doc.text('Price', priceX, tableTop);
            doc.moveDown();

            doc.font('Helvetica');
            let y = tableTop + 25;

            items.forEach(item => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                doc.text(item.name.substring(0, 20), nameX, y);
                doc.text(item.category.substring(0, 15), categoryX, y);
                doc.text(item.quantity.toString(), quantityX, y);
                doc.text(item.price.toFixed(2), priceX, y);
                y += 20;
            });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

const generateSalesReport = async (startDate, endDate) => {
    return new Promise(async (resolve, reject) => {
        try {
            const query = {};
            if (startDate && endDate) {
                query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
            }

            const sales = await Sale.find(query).populate('itemId', 'name');
            const doc = new PDFDocument();
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                let pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            doc.fontSize(20).text('Sales Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Period: ${startDate ? new Date(startDate).toLocaleDateString() : 'All Time'} - ${endDate ? new Date(endDate).toLocaleDateString() : 'Present'}`, { align: 'center' });
            doc.moveDown();

            // Table Header
            const tableTop = 150;
            const dateX = 50;
            const itemX = 150;
            const qtyX = 350;
            const totalX = 450;

            doc.font('Helvetica-Bold');
            doc.text('Date', dateX, tableTop);
            doc.text('Item', itemX, tableTop);
            doc.text('Qty', qtyX, tableTop);
            doc.text('Total', totalX, tableTop);
            doc.moveDown();

            doc.font('Helvetica');
            let y = tableTop + 25;
            let totalRevenue = 0;

            sales.forEach(sale => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                doc.text(new Date(sale.date).toLocaleDateString(), dateX, y);
                doc.text(sale.itemId ? sale.itemId.name.substring(0, 25) : 'Unknown Item', itemX, y);
                doc.text(sale.quantitySold ? sale.quantitySold.toString() : sale.quantity.toString(), qtyX, y);
                doc.text(sale.totalAmount.toFixed(2), totalX, y);

                totalRevenue += sale.totalAmount;
                y += 20;
            });

            doc.moveDown();
            doc.font('Helvetica-Bold').text(`Total Revenue: ${totalRevenue.toFixed(2)}`, { align: 'right' });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = { generateInventoryReport, generateSalesReport };
