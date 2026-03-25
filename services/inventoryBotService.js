function handleChatInteraction() {
    const error = new Error('InventoryBot has been disabled.');
    error.code = 'INVENTORYBOT_DISABLED';
    throw error;
}

module.exports = {
    handleChatInteraction
};
