const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config');
const { getRate, saveLog, getWorkerByUserId, updateUserLimit, getRemainingTime, isUserLimited } = require('../utils/database');
const { generateOrderId } = require('../utils/helpers');

// الصور
const topRightImage = 'https://media.discordapp.net/attachments/1487311776256098414/1489130417838882916/HHHHHHHHHHHHHHHHHHHHHH.gif';
const bottomImage = 'https://media.discordapp.net/attachments/1489063780813111539/1489203223985393794/Untitled-1.gif?ex=69cf9014&is=69ce3e94&hm=c790ea2a988c1c3ca6429459028d7ef53308afe7bf54d858f7a6383ae447ffcd&';

// دالة العد التنازلي
async function startLimitCountdown(client, userId, message, targetDate, totalAmount) {
    if (client.limitIntervals && client.limitIntervals.get(userId)) {
        clearInterval(client.limitIntervals.get(userId));
    }
    if (!client.limitIntervals) client.limitIntervals = new Map();
    
    const updateEmbed = async () => {
        const now = new Date();
        const diffMs = targetDate - now;
        
        if (diffMs <= 0) {
            clearInterval(interval);
            client.limitIntervals.delete(userId);
            client.limitMessages.delete(userId);
            
            const expiredEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Limit Expired')
                .setDescription(`<@${userId}>, your withdrawal limit has been **RESET**! You can now withdraw again.`)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '💰 Total Withdrawn', value: `${totalAmount}/2000 (Reset)`, inline: true },
                    { name: '📅 Reset Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'GRINDORA SERVICES | You can now request withdrawals again' })
                .setTimestamp();
            
            await message.edit({ embeds: [expiredEmbed] }).catch(() => {});
            return;
        }
        
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const remainingSec = diffSec % 60;
        const remainingMin = diffMin % 60;
        
        const updatedEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('⛔ Withdrawal Limit Reached')
            .setDescription(`<@${userId}> has reached the **2000** withdrawal limit!`)
            .setThumbnail(topRightImage)
            .setImage(bottomImage)
            .addFields(
                { name: '💰 Total Withdrawn', value: `${totalAmount}/2000`, inline: true },
                { name: '⏰ Time Remaining', value: `**${diffHours}h ${remainingMin}m ${remainingSec}s**`, inline: true },
                { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
            )
            .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
            .setTimestamp();
        
        await message.edit({ embeds: [updatedEmbed] }).catch(() => {});
    };
    
    await updateEmbed();
    
    const interval = setInterval(updateEmbed, 1000);
    client.limitIntervals.set(userId, interval);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cash-out')
        .setDescription('Request withdrawal (Worker only)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw (Max 2000)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(config.maxAmount))
        .addStringOption(option =>
            option.setName('method')
                .setDescription('Withdrawal method')
                .setRequired(true)
                .addChoices(
                    { name: 'V-Cash', value: 'v-cash' },
                    { name: 'Crypto', value: 'crypto' }
                )),

    async execute(interaction, client) {
        // Check if user has Worker role
        const hasWorkerRole = interaction.member.roles.cache.has(config.roles.worker);
        if (!hasWorkerRole) {
            return interaction.reply({ content: '❌ This command is only for Workers', flags: 64 });
        }

        // ========== فحص إذا كان المستخدم محدود حالياً ==========
        const limitedCheck = await isUserLimited(interaction.user.id);
        
        if (limitedCheck.limited) {
            const targetDate = new Date(limitedCheck.limitedUntil);
            const remaining = limitedCheck.remainingTime || await getRemainingTime(interaction.user.id);
            
            const limitEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('⛔ Withdrawal Limit Reached')
                .setDescription(`<@${interaction.user.id}>, you have reached the **2000** withdrawal limit!`)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '💰 Total Withdrawn', value: `${limitedCheck.totalAmount}/2000`, inline: true },
                    { name: '⏰ Time Remaining', value: remaining ? `**${remaining.hours}h ${remaining.minutes}m ${remaining.seconds}s**` : 'Calculating...', inline: true },
                    { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
                )
                .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                .setTimestamp();

            if (!client.limitMessages) client.limitMessages = new Map();
            const existingMsg = client.limitMessages.get(interaction.user.id);
            
            if (existingMsg) {
                try {
                    const channel = await client.channels.fetch(existingMsg.channelId);
                    const msg = await channel.messages.fetch(existingMsg.messageId);
                    await msg.edit({ embeds: [limitEmbed] });
                    return interaction.reply({ content: '⛔ You are currently under withdrawal limit. Check the embed above.', flags: 64 });
                } catch (err) {
                    client.limitMessages.delete(interaction.user.id);
                }
            }
            
            const msg = await interaction.reply({ embeds: [limitEmbed], fetchReply: true });
            client.limitMessages.set(interaction.user.id, {
                channelId: interaction.channel.id,
                messageId: msg.id,
                totalAmount: limitedCheck.totalAmount,
                limitedUntil: targetDate
            });
            
            startLimitCountdown(client, interaction.user.id, msg, targetDate, limitedCheck.totalAmount);
            return;
        }

        // Check if user has data in database
        const workerData = await getWorkerByUserId(interaction.user.id);
        if (!workerData) {
            return interaction.reply({ content: '❌ You are not registered. Contact Owner to add your data.', flags: 64 });
        }

        // Check if command is used in the correct channel
        if (interaction.channel.id !== workerData.channelId) {
            return interaction.reply({ content: `❌ You can only use /cash-out in <#${workerData.channelId}>`, flags: 64 });
        }

        const amount = interaction.options.getInteger('amount');
        const method = interaction.options.getString('method');

        // ========== فحص الـ Limit ==========
        const limitResult = await updateUserLimit(interaction.user.id, amount);
        
        if (limitResult.limited) {
            const remainingTime = await getRemainingTime(interaction.user.id);
            const targetDate = remainingTime ? remainingTime.until : new Date();
            
            if (!client.limitMessages) client.limitMessages = new Map();
            const existingMessage = client.limitMessages.get(interaction.user.id);
            
            if (existingMessage) {
                try {
                    const channel = await client.channels.fetch(existingMessage.channelId);
                    const msg = await channel.messages.fetch(existingMessage.messageId);
                    
                    const updatedEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('⛔ Withdrawal Limit Reached')
                        .setDescription(`<@${interaction.user.id}> has reached the **2000** withdrawal limit!`)
                        .setThumbnail(topRightImage)
                        .setImage(bottomImage)
                        .addFields(
                            { name: '💰 Total Withdrawn', value: `${limitResult.totalAmount}/2000`, inline: true },
                            { name: '⏰ Time Remaining', value: remainingTime ? `**${remainingTime.hours}h ${remainingTime.minutes}m ${remainingTime.seconds}s**` : 'Calculating...', inline: true },
                            { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
                        )
                        .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                        .setTimestamp();
                    
                    await msg.edit({ embeds: [updatedEmbed] });
                    return interaction.reply({ content: '⛔ You are still under withdrawal limit. Check the embed above.', flags: 64 });
                } catch (err) {
                    client.limitMessages.delete(interaction.user.id);
                }
            }
            
            const limitEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('⛔ Withdrawal Limit Reached')
                .setDescription(`<@${interaction.user.id}> has reached the **2000** withdrawal limit!`)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '💰 Total Withdrawn', value: `${limitResult.totalAmount}/2000`, inline: true },
                    { name: '⏰ Time Remaining', value: remainingTime ? `**${remainingTime.hours}h ${remainingTime.minutes}m ${remainingTime.seconds}s**` : 'Calculating...', inline: true },
                    { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
                )
                .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                .setTimestamp();

            const msg = await interaction.reply({ embeds: [limitEmbed], fetchReply: true });
            
            client.limitMessages.set(interaction.user.id, {
                channelId: interaction.channel.id,
                messageId: msg.id,
                totalAmount: limitResult.totalAmount,
                limitedUntil: targetDate
            });
            
            try {
                const logsChannel = await client.channels.fetch(config.channels.approveLogs);
                const notificationEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('⛔ Withdrawal Limit Reached')
                    .setDescription(`<@${interaction.user.id}> has reached the **2000** withdrawal limit!`)
                    .setThumbnail(topRightImage)
                    .setImage(bottomImage)
                    .addFields(
                        { name: '💰 Total Withdrawn', value: `${limitResult.totalAmount}/2000`, inline: true },
                        { name: '⏰ Time Remaining', value: remainingTime ? `**${remainingTime.hours}h ${remainingTime.minutes}m ${remainingTime.seconds}s**` : 'Calculating...', inline: true },
                        { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
                    )
                    .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                    .setTimestamp();
                
                await logsChannel.send({ embeds: [notificationEmbed] });
            } catch (err) {}
            
            startLimitCountdown(client, interaction.user.id, msg, targetDate, limitResult.totalAmount);
            return;
        }

        if (limitResult.wouldExceed) {
            return interaction.reply({ 
                content: `❌ You only have **${limitResult.remaining}** remaining out of 2000 limit. You cannot withdraw ${amount}.`, 
                flags: 64 
            });
        }

        // ========== التحقق من وجود رقم أو عنوان ==========
        let number;
        if (method === 'v-cash') {
            number = workerData.vcashNumber;
            if (!number) {
                return interaction.reply({ content: '❌ You don\'t have a V-Cash number registered. Contact Owner to add it.', flags: 64 });
            }
        } else {
            number = workerData.cryptoAddress;
            if (!number) {
                return interaction.reply({ content: '❌ You don\'t have a Crypto address registered. Contact Owner to add it.', flags: 64 });
            }
        }

        const rate = await getRate();
        const currentRate = method === 'v-cash' ? rate.vcash : rate.crypto;
        const total = amount * currentRate;
        const orderId = generateOrderId();

        const checkWalletMessage = `\`\`\`diff\n- Check wallet\n\`\`\`\`!w ${interaction.user.id}\`\n\n\`\`\`diff\n- If You Sure\n\`\`\`\`/remove_earnings amount:${amount}m user:${interaction.user.id}\``;

        const embedTitle = limitResult.isLast ? '🟡 New Cash Out Request (LAST WITHDRAWAL)' : '🟡 New Cash Out Request';
        
        const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(embedTitle)
            .setDescription(`**Order ID:** \`${orderId}\``)
            .setThumbnail(topRightImage)
            .setImage(bottomImage)
            .addFields(
                { name: '👤 User', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                { name: '📢 Channel', value: `${interaction.channel}`, inline: true },
                { name: '💰 Amount', value: `${amount}`, inline: true },
                { name: '💳 Method', value: method === 'v-cash' ? 'V-Cash' : 'Crypto', inline: true },
                { name: '📞 Number/Address', value: `\`${number}\``, inline: false },
                { name: '📊 Current Rate', value: `${currentRate} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                { name: '🧮 Total', value: `${total.toFixed(2)} ${method === 'v-cash' ? 'EGP' : 'USD'}`, inline: true },
                { name: '─────────────────', value: checkWalletMessage, inline: false }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        if (limitResult.isLast) {
            embed.addFields({ name: '⚠️ LIMIT STATUS', value: `**THIS IS THE LAST WITHDRAWAL!** User will be limited after approval.`, inline: false });
        } else {
            embed.addFields({ name: '📊 Limit Status', value: `${limitResult.totalAmount || amount}/2000 (${limitResult.remaining || 2000 - amount} remaining)`, inline: false });
        }

        // استخدام stringify آمن للأرقام الكبيرة
        const approveButton = new ButtonBuilder()
            .setCustomId(`approve_${orderId}_${interaction.user.id}_${amount}_${method}_${String(number).replace(/_/g, '-')}_${currentRate}_${total}_${interaction.channel.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_${orderId}_${interaction.user.id}_${amount}_${method}_${String(number).replace(/_/g, '-')}_${interaction.channel.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(approveButton, cancelButton);

        const ownerChannel = await client.channels.fetch(config.channels.approveChannel);
        await ownerChannel.send({ embeds: [embed], components: [row] });

        const replyMessage = limitResult.isLast 
            ? `✅ Last withdrawal request sent successfully!\n📋 Order ID: \`${orderId}\`\n⚠️ You have reached the 2000 limit and will be restricted after approval.`
            : `✅ Withdrawal request sent successfully\n📋 Order ID: \`${orderId}\`\n📊 Limit: ${limitResult.totalAmount || amount}/2000`;
        
        await interaction.reply({ content: replyMessage, flags: 64 });

        await saveLog({
            orderId,
            userId: interaction.user.id,
            username: interaction.user.tag,
            channelId: interaction.channel.id,
            amount,
            method,
            number,
            rate: currentRate,
            total,
            status: 'pending',
            isLast: limitResult.isLast || false
        });
    }
};