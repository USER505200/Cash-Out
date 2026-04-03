const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { getAllCashouts, getCashoutsStats, getCashoutsByUser, getCashoutsByStatus, getCashoutsStatsByUser, getCashoutsByUserAndStatus } = require('../utils/database');

const itemsPerPage = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('view-cashouts')
        .setDescription('View all cashout transactions (Owner only)')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter transactions')
                .setRequired(false)
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Approved Only', value: 'approved' },
                    { name: 'Cancelled Only', value: 'cancelled' },
                    { name: 'Pending Only', value: 'pending' },
                    { name: 'Server Total', value: 'server' }
                ))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View stats for specific user')
                .setRequired(false)),

    async execute(interaction, client) {
        if (!interaction.member.roles.cache.has(config.roles.owner)) {
            return interaction.reply({ content: '❌ This command is for Owner only', flags: 64 });
        }

        const filterType = interaction.options.getString('filter') || 'all';
        const targetUser = interaction.options.getUser('user');

        if (filterType === 'server') {
            const stats = await getCashoutsStats();
            const serverEmbed = new EmbedBuilder()
                .setColor(0x00bfff)
                .setTitle('📊 SERVER CASHOUT STATISTICS')
                .addFields(
                    { name: '💰 Total Transactions', value: stats.totalTransactions?.toString() || '0', inline: true },
                    { name: '✅ Approved', value: stats.approvedCount?.toString() || '0', inline: true },
                    { name: '❌ Cancelled', value: stats.cancelledCount?.toString() || '0', inline: true },
                    { name: '⏳ Pending', value: stats.pendingCount?.toString() || '0', inline: true },
                    { name: '💵 Total Amount', value: `${stats.totalAmount || 0}`, inline: true },
                    { name: '💸 Total with Fees', value: `${(stats.totalWithFees || 0).toFixed(2)}`, inline: true }
                )
                .setTimestamp();
            return interaction.reply({ embeds: [serverEmbed], flags: 64 });
        }

        let transactions = [];
        if (targetUser) {
            transactions = filterType === 'all' ? await getCashoutsByUser(targetUser.id) : await getCashoutsByUserAndStatus(targetUser.id, filterType);
        } else {
            transactions = filterType === 'all' ? await getAllCashouts() : await getCashoutsByStatus(filterType);
        }

        if (!transactions || transactions.length === 0) {
            return interaction.reply({ content: '❌ No transactions found.', flags: 64 });
        }

        if (!client.viewCache) client.viewCache = new Map();
        client.viewCache.set(interaction.user.id, {
            transactions,
            filterType,
            targetUser: targetUser ? targetUser.id : null,
            currentPage: 0,
            userId: interaction.user.id
        });

        await sendPage(interaction, client, interaction.user.id, 0);
    }
};

async function sendPage(interaction, client, userId, page) {
    const cached = client.viewCache?.get(userId);
    if (!cached) {
        if (interaction.replied) {
            await interaction.editReply({ content: '❌ Session expired. Use /view-cashouts again.', components: [] });
        } else {
            await interaction.reply({ content: '❌ Session expired. Use /view-cashouts again.', flags: 64 });
        }
        return;
    }

    const { transactions, filterType, targetUser } = cached;
    const start = page * itemsPerPage;
    const pageTransactions = transactions.slice(start, start + itemsPerPage);
    const totalPages = Math.ceil(transactions.length / itemsPerPage);

    let totalAmount = 0, totalWithFees = 0;
    for (const tx of transactions) {
        totalAmount += tx.amount;
        totalWithFees += tx.total;
    }

    const embed = new EmbedBuilder()
        .setColor(0x00bfff)
        .setTitle(targetUser ? `📊 Transactions for <@${targetUser}>` : '📊 Cashout Transactions')
        .setDescription(`**Filter:** ${filterType}\n**Total Amount:** ${totalAmount}\n**Total with Fees:** ${totalWithFees.toFixed(2)}`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
        .setTimestamp();

    for (const tx of pageTransactions) {
        const statusEmoji = tx.status === 'approved' ? '✅' : (tx.status === 'cancelled' ? '❌' : '⏳');
        embed.addFields({
            name: `${statusEmoji} ${tx.orderId}`,
            value: `**User:** <@${tx.userId}>\n**Amount:** ${tx.amount}\n**Method:** ${tx.method === 'v-cash' ? 'V-Cash' : 'Crypto'}\n**Status:** ${tx.status}\n**Date:** ${new Date(tx.timestamp).toLocaleString()}`,
            inline: false
        });
    }

    const row = new ActionRowBuilder();
    if (page > 0) row.addComponents(new ButtonBuilder().setCustomId(`view_prev_${userId}`).setLabel('◀ Previous').setStyle(ButtonStyle.Primary));
    if (page < totalPages - 1) row.addComponents(new ButtonBuilder().setCustomId(`view_next_${userId}`).setLabel('Next ▶').setStyle(ButtonStyle.Primary));
    row.addComponents(new ButtonBuilder().setCustomId(`view_refresh_${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary));

    client.viewCache.set(userId, { ...cached, currentPage: page });

    if (interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }
}

// Export the sendPage function for use in buttonHandler
module.exports.sendPage = sendPage;