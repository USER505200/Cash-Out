const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { getCashoutsByUser, getWorkerByUserId } = require('../utils/database');

const itemsPerPage = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history-cash-out')
        .setDescription('View your cashout history (Worker only)'),

    async execute(interaction, client) {
        // Check if user has Worker role
        const hasWorkerRole = interaction.member.roles.cache.has(config.roles.worker);
        if (!hasWorkerRole) {
            return interaction.reply({ content: '❌ This command is only for Workers', flags: 64 });
        }

        // Check if user has data in database
        const workerData = await getWorkerByUserId(interaction.user.id);
        if (!workerData) {
            return interaction.reply({ content: '❌ You are not registered. Contact Owner to add your data.', flags: 64 });
        }

        // Check if command is used in the correct channel
        if (interaction.channel.id !== workerData.channelId) {
            return interaction.reply({ content: `❌ You can only use /history-cash-out in <#${workerData.channelId}>`, flags: 64 });
        }

        const transactions = await getCashoutsByUser(interaction.user.id);

        if (!transactions || transactions.length === 0) {
            const noDataEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('📜 Your Cashout History')
                .setDescription('No transactions found.')
                .setTimestamp();
            return interaction.reply({ embeds: [noDataEmbed], flags: 64 });
        }

        // Store transactions in cache
        if (!client.historyCache) {
            client.historyCache = new Map();
        }
        client.historyCache.set(interaction.user.id, { transactions, currentPage: 0 });

        await sendHistoryPage(interaction, client, interaction.user.id, 0);
    }
};

async function sendHistoryPage(interaction, client, userId, page) {
    const cached = client.historyCache?.get(userId);
    if (!cached) {
        if (interaction.replied) {
            await interaction.editReply({ content: '❌ Session expired. Please use /history-cash-out again.', components: [] });
        } else {
            await interaction.reply({ content: '❌ Session expired. Please use /history-cash-out again.', flags: 64 });
        }
        return;
    }

    const { transactions } = cached;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageTransactions = transactions.slice(start, end);
    const totalPages = Math.ceil(transactions.length / itemsPerPage);

    // Calculate stats
    let totalAmount = 0;
    let approvedCount = 0;
    let cancelledCount = 0;
    let pendingCount = 0;
    let totalVCash = 0;
    let totalCrypto = 0;

    for (const tx of transactions) {
        totalAmount += tx.amount;
        if (tx.status === 'approved') {
            approvedCount++;
            if (tx.method === 'v-cash') totalVCash += tx.amount;
            else totalCrypto += tx.amount;
        } else if (tx.status === 'cancelled') {
            cancelledCount++;
        } else if (tx.status === 'pending') {
            pendingCount++;
        }
    }

    // Stats Embed
    const statsEmbed = new EmbedBuilder()
        .setColor(0x00bfff)
        .setTitle(`📊 Your Cashout Statistics`)
        .setThumbnail(interaction.user?.displayAvatarURL() || interaction.client.user.displayAvatarURL())
        .addFields(
            { name: '💰 Total Transactions', value: String(transactions.length), inline: true },
            { name: '✅ Approved', value: String(approvedCount), inline: true },
            { name: '❌ Cancelled', value: String(cancelledCount), inline: true },
            { name: '⏳ Pending', value: String(pendingCount), inline: true },
            { name: '💵 Total Amount', value: String(totalAmount), inline: true },
            { name: '📱 V-Cash Total', value: String(totalVCash), inline: true },
            { name: '🔐 Crypto Total', value: String(totalCrypto), inline: true }
        )
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
        .setTimestamp();

    // Transactions Embed
    const transactionsEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`📝 Your Transaction History (Page ${page + 1}/${totalPages})`);

    if (pageTransactions.length === 0) {
        transactionsEmbed.setDescription('No transactions on this page.');
    } else {
        for (const tx of pageTransactions) {
            const statusEmoji = tx.status === 'approved' ? '✅' : (tx.status === 'cancelled' ? '❌' : '⏳');
            transactionsEmbed.addFields({
                name: `${statusEmoji} Order: ${tx.orderId}`,
                value: `**Amount:** ${tx.amount}\n**Method:** ${tx.method === 'v-cash' ? 'V-Cash' : 'Crypto'}\n**Status:** ${tx.status}\n**Date:** ${new Date(tx.timestamp).toLocaleString()}`,
                inline: false
            });
        }
    }

    // Create buttons with page number embedded
    const row = new ActionRowBuilder();
    
    if (page > 0) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`history_prev_${userId}_${page - 1}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    if (page < totalPages - 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`history_next_${userId}_${page + 1}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Primary)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`history_refresh_${userId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    const components = row.components.length > 0 ? [row] : [];

    // Save current page in cache
    client.historyCache.set(userId, { transactions, currentPage: page });

    if (interaction.replied) {
        await interaction.editReply({ embeds: [statsEmbed, transactionsEmbed], components: components });
    } else {
        await interaction.reply({ embeds: [statsEmbed, transactionsEmbed], components: components, flags: 64 });
    }
}

// Handle button interactions for history
async function handleHistoryButtons(interaction, client) {
    if (!interaction.customId.startsWith('history_')) return false;

    const customId = interaction.customId;
    const parts = customId.split('_');
    const action = parts[1];
    const userId = parts[2];
    
    // Get target page if exists (for prev/next)
    let targetPage = null;
    if (parts.length > 3) {
        targetPage = parseInt(parts[3]);
    }

    // Check if the user is the owner of the session
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
        return true;
    }

    const cached = client.historyCache?.get(userId);
    if (!cached) {
        await interaction.reply({ content: '❌ Session expired. Please use /history-cash-out again.', ephemeral: true });
        return true;
    }

    let { transactions } = cached;
    let currentPage = cached.currentPage || 0;
    const totalPages = Math.ceil(transactions.length / itemsPerPage);

    if (action === 'prev' && targetPage !== null && targetPage >= 0) {
        currentPage = targetPage;
    } else if (action === 'next' && targetPage !== null && targetPage < totalPages) {
        currentPage = targetPage;
    } else if (action === 'refresh') {
        transactions = await getCashoutsByUser(userId);
        currentPage = 0;
    } else {
        await interaction.reply({ content: '❌ Invalid action.', ephemeral: true });
        return true;
    }

    // Update cache
    client.historyCache.set(userId, { transactions, currentPage });
    
    // Send the updated page
    await sendHistoryPage(interaction, client, userId, currentPage);
    return true;
}

module.exports.sendHistoryPage