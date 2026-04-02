// utils/pagination.js
const { getAllCashouts, getCashoutsByUser, getCashoutsByStatus, getCashoutsByUserAndStatus } = require('./database');

const itemsPerPage = 5;

async function handleViewButtons(interaction, client) {
    if (!interaction.customId.startsWith('view_')) return false;

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
        return true;
    }

    const cached = client.viewCache?.get(userId);
    if (!cached) {
        await interaction.reply({ content: '❌ Session expired. Please use /view-cashouts again.', ephemeral: true });
        return true;
    }

    let { currentPage = 0, transactions, filterType, targetUser } = cached;
    const totalPages = Math.ceil(transactions.length / itemsPerPage);

    if (action === 'prev' && currentPage > 0) {
        currentPage--;
    } else if (action === 'next' && currentPage < totalPages - 1) {
        currentPage++;
    } else if (action === 'refresh') {
        if (targetUser) {
            transactions = filterType === 'all' ? await getCashoutsByUser(targetUser) : await getCashoutsByUserAndStatus(targetUser, filterType);
        } else {
            transactions = filterType === 'all' ? await getAllCashouts() : await getCashoutsByStatus(filterType);
        }
        currentPage = 0;
        client.viewCache.set(userId, { ...cached, transactions, currentPage });
    } else {
        return false;
    }

    client.viewCache.set(userId, { ...cached, currentPage });
    
    const { sendPage } = require('../commands/view-cashouts');
    if (sendPage) {
        await sendPage(interaction, client, userId, currentPage);
    }
    return true;
}

async function handleHistoryButtons(interaction, client) {
    if (!interaction.customId.startsWith('history_')) return false;

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
        return true;
    }

    const cached = client.historyCache?.get(userId);
    if (!cached) {
        await interaction.reply({ content: '❌ Session expired. Please use /history-cash-out again.', ephemeral: true });
        return true;
    }

    let { currentPage = 0, transactions } = cached;
    const totalPages = Math.ceil(transactions.length / 10);

    if (action === 'prev' && currentPage > 0) {
        currentPage--;
    } else if (action === 'next' && currentPage < totalPages - 1) {
        currentPage++;
    } else if (action === 'refresh') {
        transactions = await getCashoutsByUser(userId);
        currentPage = 0;
        client.historyCache.set(userId, { transactions, currentPage });
    } else {
        return false;
    }

    client.historyCache.set(userId, { transactions, currentPage });
    
    const { sendHistoryPage } = require('../commands/history-cash-out');
    if (sendHistoryPage) {
        await sendHistoryPage(interaction, client, userId, currentPage);
    }
    return true;
}

module.exports = { handleViewButtons, handleHistoryButtons };