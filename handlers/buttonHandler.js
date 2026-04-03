const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { updateLogStatus, getWorkerByUserId, activateLimitAfterApproval } = require('../utils/database');

const topRightImage = 'https://media.discordapp.net/attachments/1487311776256098414/1489130417838882916/HHHHHHHHHHHHHHHHHHHHHH.gif';
const bottomImage = 'https://media.discordapp.net/attachments/1489063780813111539/1489203223985393794/Untitled-1.gif?ex=69cf9014&is=69ce3e94&hm=c790ea2a988c1c3ca6429459028d7ef53308afe7bf54d858f7a6383ae447ffcd&';

const allowedRoles = [
    '1487214820276043967', // Owner
    '1487298785913606317', // Admin
    '1487299732215697469'  // Support
];

module.exports = {
    async handle(interaction, client) {
        if (!interaction.isButton()) return;

        // Handle view-cashouts buttons
        if (interaction.customId.startsWith('view_')) {
            const { sendPage } = require('../commands/view-cashouts');
            const parts = interaction.customId.split('_');
            const action = parts[1];
            const userId = parts[2];

            if (interaction.user.id !== userId) {
                await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
                return;
            }

            const cached = client.viewCache?.get(userId);
            if (!cached) {
                await interaction.reply({ content: '❌ Session expired. Please use /view-cashouts again.', ephemeral: true });
                return;
            }

            let { currentPage = 0, transactions, filterType, targetUser } = cached;
            const totalPages = Math.ceil(transactions.length / 5);

            if (action === 'prev' && currentPage > 0) {
                currentPage--;
            } else if (action === 'next' && currentPage < totalPages - 1) {
                currentPage++;
            } else if (action === 'refresh') {
                const { getAllCashouts, getCashoutsByUser, getCashoutsByStatus, getCashoutsByUserAndStatus } = require('../utils/database');
                if (targetUser) {
                    transactions = filterType === 'all' ? await getCashoutsByUser(targetUser) : await getCashoutsByUserAndStatus(targetUser, filterType);
                } else {
                    transactions = filterType === 'all' ? await getAllCashouts() : await getCashoutsByStatus(filterType);
                }
                currentPage = 0;
                client.viewCache.set(userId, { ...cached, transactions, currentPage });
            } else {
                return;
            }

            client.viewCache.set(userId, { ...cached, currentPage });
            await sendPage(interaction, client, userId, currentPage);
            return;
        }

        // Handle history-cash-out buttons
        if (interaction.customId.startsWith('history_')) {
            const { sendHistoryPage } = require('../commands/history-cash-out');
            const parts = interaction.customId.split('_');
            const action = parts[1];
            const userId = parts[2];
            let targetPage = parts.length > 3 ? parseInt(parts[3]) : null;

            if (interaction.user.id !== userId) {
                await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
                return;
            }

            const cached = client.historyCache?.get(userId);
            if (!cached) {
                await interaction.reply({ content: '❌ Session expired. Please use /history-cash-out again.', ephemeral: true });
                return;
            }

            let { currentPage = 0, transactions } = cached;
            const totalPages = Math.ceil(transactions.length / 10);

            if (action === 'prev' && targetPage !== null && targetPage >= 0) {
                currentPage = targetPage;
            } else if (action === 'next' && targetPage !== null && targetPage < totalPages) {
                currentPage = targetPage;
            } else if (action === 'refresh') {
                const { getCashoutsByUser } = require('../utils/database');
                transactions = await getCashoutsByUser(userId);
                currentPage = 0;
                client.historyCache.set(userId, { transactions, currentPage });
                await sendHistoryPage(interaction, client, userId, currentPage);
                return;
            } else {
                await interaction.reply({ content: '❌ Invalid action.', ephemeral: true });
                return;
            }

            client.historyCache.set(userId, { transactions, currentPage });
            await sendHistoryPage(interaction, client, userId, currentPage);
            return;
        }

        // Handle list-workers buttons
        if (interaction.customId.startsWith('listworkers_')) {
            const { sendWorkersPage } = require('../commands/list-workers');
            const parts = interaction.customId.split('_');
            const action = parts[1];
            const userId = parts[2];
            const targetPage = parseInt(parts[3]);

            if (interaction.user.id !== userId) {
                await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
                return;
            }

            const cached = client.workersCache?.get(userId);
            if (!cached) {
                await interaction.reply({ content: '❌ Session expired. Use /list-workers again.', ephemeral: true });
                return;
            }

            let { workers, currentPage = 0 } = cached;
            const totalPages = Math.ceil(workers.length / 5);

            if (action === 'prev' && !isNaN(targetPage) && targetPage >= 0) {
                currentPage = targetPage;
            } else if (action === 'next' && !isNaN(targetPage) && targetPage < totalPages) {
                currentPage = targetPage;
            } else if (action === 'refresh') {
                const { getAllWorkers } = require('../utils/database');
                workers = await getAllWorkers();
                currentPage = 0;
                client.workersCache.set(userId, { workers, currentPage });
                await sendWorkersPage(interaction, client, userId, currentPage);
                return;
            } else {
                await interaction.reply({ content: '❌ Invalid action.', ephemeral: true });
                return;
            }

            client.workersCache.set(userId, { workers, currentPage });
            await sendWorkersPage(interaction, client, userId, currentPage);
            return;
        }

        // Handle approve/cancel buttons
        const customId = interaction.customId;

        if (!interaction.isRepliable()) {
            console.log('Interaction is not repliable');
            return;
        }

        const hasAllowedRole = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
            return interaction.reply({ content: '❌ Only Owner, Admin, or Support can approve/cancel', flags: 64 });
        }

        if (customId.startsWith('approve_')) {
            const parts = customId.split('_');
            const orderId = parts[1];
            const userId = parts[2];
            const amount = parts[3];
            const method = parts[4];
            const number = parts[5];
            const rate = parts[6];
            const total = parts[7];
            const channelId = parts[8];

            const workerData = await getWorkerByUserId(userId);
            const workerChannelId = workerData ? workerData.channelId : null;

            const newEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Cash Out Request - APPROVED')
                .setDescription(`**Order ID:** \`${orderId}\``)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '👤 User', value: `<@${userId}>`, inline: true },
                    { name: '💰 Amount', value: amount, inline: true },
                    { name: '💳 Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                    { name: '📊 Rate', value: `${rate} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                    { name: '🧮 Total', value: `${total} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                    { name: `✅ ${interaction.member.roles.cache.has('1487214820276043967') ? 'Owner' : (interaction.member.roles.cache.has('1487298785913606317') ? 'Admin' : 'Support')} Approved by`, value: `${interaction.user.tag}`, inline: true }
                )
                .setTimestamp();

            await interaction.message.edit({ embeds: [newEmbed], components: [] });

            const approvalEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Request Approved')
                .setDescription(`Your withdrawal request has been **APPROVED** successfully!`)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '📋 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '💰 Amount', value: `${amount} EGP`, inline: true },
                    { name: '💳 Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                    { name: '📊 Rate', value: `${rate} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                    { name: '🧮 Total', value: `${total} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                    { name: '✅ Approved by', value: interaction.user.tag, inline: true }
                )
                .setFooter({ text: 'GRINDORA SERVICES | Thank you for trusting us' })
                .setTimestamp();

            try {
                const user = await client.users.fetch(userId);
                await user.send({ embeds: [approvalEmbed] });
                console.log(`✅ DM sent to ${user.tag}`);
            } catch (err) {
                console.log('Could not send DM to user:', err);
            }

            try {
                if (workerChannelId) {
                    const workerChannel = await client.channels.fetch(workerChannelId);
                    if (workerChannel && workerChannel.isTextBased()) {
                        await workerChannel.send({ embeds: [approvalEmbed] });
                        console.log(`✅ Message sent to worker channel ${workerChannelId}`);
                    }
                }
            } catch (err) {
                console.log('Could not send message to worker channel:', err);
            }

            const logsChannel = await client.channels.fetch(config.channels.approveLogs);
            const logEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('📝 [LOG] Withdrawal Approved')
                .setThumbnail(topRightImage)
                .addFields(
                    { name: 'Order ID', value: orderId, inline: true },
                    { name: 'User', value: `<@${userId}>`, inline: true },
                    { name: 'Amount', value: amount.toString(), inline: true },
                    { name: 'Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                    { name: 'Rate', value: `${rate} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                    { name: 'Total', value: `${total} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                    { name: 'Approved by', value: interaction.user.tag, inline: true }
                )
                .setTimestamp();

            await logsChannel.send({ embeds: [logEmbed] });
            await updateLogStatus(orderId, 'approved', interaction.user.tag);
            await activateLimitAfterApproval(userId);

            try {
                await interaction.deferUpdate();
            } catch (err) {
                console.log('Could not defer update');
            }
        }

        if (customId.startsWith('cancel_')) {
            const parts = customId.split('_');
            const orderId = parts[1];
            const userId = parts[2];
            const amount = parts[3];
            const method = parts[4];
            const number = parts[5];
            const channelId = parts[6];

            const workerData = await getWorkerByUserId(userId);
            const workerChannelId = workerData ? workerData.channelId : null;

            const newEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Cash Out Request - CANCELLED')
                .setDescription(`**Order ID:** \`${orderId}\``)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '👤 User', value: `<@${userId}>`, inline: true },
                    { name: '💰 Amount', value: amount, inline: true },
                    { name: '💳 Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                    { name: `❌ ${interaction.member.roles.cache.has('1487214820276043967') ? 'Owner' : (interaction.member.roles.cache.has('1487298785913606317') ? 'Admin' : 'Support')} Cancelled by`, value: `${interaction.user.tag}`, inline: true }
                )
                .setTimestamp();

            await interaction.message.edit({ embeds: [newEmbed], components: [] });

            const cancelEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Withdrawal Request Cancelled')
                .setDescription(`Your withdrawal request has been **CANCELLED**`)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '📋 Order ID', value: `\`${orderId}\``, inline: true },
                    { name: '💰 Amount', value: `${amount} EGP`, inline: true },
                    { name: '💳 Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                    { name: '❌ Cancelled by', value: interaction.user.tag, inline: true }
                )
                .setFooter({ text: 'GRINDORA SERVICES | Please contact support for more info' })
                .setTimestamp();

            try {
                const user = await client.users.fetch(userId);
                await user.send({ embeds: [cancelEmbed] });
                console.log(`❌ DM sent to ${user.tag}`);
            } catch (err) {
                console.log('Could not send DM to user:', err);
            }

            try {
                if (workerChannelId) {
                    const workerChannel = await client.channels.fetch(workerChannelId);
                    if (workerChannel && workerChannel.isTextBased()) {
                        await workerChannel.send({ embeds: [cancelEmbed] });
                        console.log(`❌ Message sent to worker channel ${workerChannelId}`);
                    }
                }
            } catch (err) {
                console.log('Could not send message to worker channel:', err);
            }

            const logsChannel = await client.channels.fetch(config.channels.approveLogs);
            const logEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('📝 [LOG] Withdrawal Cancelled')
                .setThumbnail(topRightImage)
                .addFields(
                    { name: 'Order ID', value: orderId, inline: true },
                    { name: 'User', value: `<@${userId}>`, inline: true },
                    { name: 'Amount', value: amount.toString(), inline: true },
                    { name: 'Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                    { name: 'Cancelled by', value: interaction.user.tag, inline: true }
                )
                .setTimestamp();

            await logsChannel.send({ embeds: [logEmbed] });
            await updateLogStatus(orderId, 'cancelled', interaction.user.tag);

            try {
                await interaction.deferUpdate();
            } catch (err) {
                console.log('Could not defer update');
            }
        }
    }
};