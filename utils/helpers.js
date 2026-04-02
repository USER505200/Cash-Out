function generateOrderId() {
    const chars = 'MTUVWXYZ0123';
    let result = 'CX-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = {
    generateOrderId
};