const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config.json');
const { getRate, saveLog, getWorkerByUserId, updateUserLimit, getRemainingTime } = require('../utils/database');
const { generateOrderId } = require('../utils/helpers');

// الصور
const topRightImage = 'https://media.discordapp.net/attachments/1487311776256098414/1489130417838882916/HHHHHHHHHHHHHHHHHHHHHH.gif';
const bottomImage = 'https://cdn.discordapp.com/attachments/1488636198225186899/1488946591749505186/Untitled-1.gif';

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
        
        // إذا كان الـ Limit مفعل والمستخدم حاول يسحب زيادة (أكبر من 2000)
        if (limitResult.limited && limitResult.totalAmount > 2000) {
            const remainingTime = await getRemainingTime(interaction.user.id);
            const targetDate = remainingTime.until;
            
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
                            { name: '⏰ Time Remaining', value: `**${remainingTime?.hours || 0}h ${remainingTime?.minutes || 0}m ${remainingTime?.seconds || 0}s**`, inline: true },
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
                    { name: '⏰ Time Remaining', value: `**${remainingTime?.hours || 0}h ${remainingTime?.minutes || 0}m ${remainingTime?.seconds || 0}s**`, inline: true },
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
                        { name: '⏰ Time Remaining', value: `**${remainingTime?.hours || 0}h ${remainingTime?.minutes || 0}m ${remainingTime?.seconds || 0}s**`, inline: true },
                        { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
                    )
                    .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                    .setTimestamp();
                
                await logsChannel.send({ embeds: [notificationEmbed] });
            } catch (err) {}
            
            if (client.limitIntervals && client.limitIntervals.get(interaction.user.id)) {
                clearInterval(client.limitIntervals.get(interaction.user.id));
            }
            if (!client.limitIntervals) client.limitIntervals = new Map();
            
            const interval = setInterval(async () => {
                const newRemaining = await getRemainingTime(interaction.user.id);
                
                if (!newRemaining) {
                    clearInterval(interval);
                    client.limitIntervals.delete(interaction.user.id);
                    client.limitMessages.delete(interaction.user.id);
                    return;
                }
                
                const updatedEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('⛔ Withdrawal Limit Reached')
                    .setDescription(`<@${interaction.user.id}> has reached the **2000** withdrawal limit!`)
                    .setThumbnail(topRightImage)
                    .setImage(bottomImage)
                    .addFields(
                        { name: '💰 Total Withdrawn', value: `${limitResult.totalAmount}/2000`, inline: true },
                        { name: '⏰ Time Remaining', value: `**${newRemaining.hours}h ${newRemaining.minutes}m ${newRemaining.seconds}s**`, inline: true },
                        { name: '📅 Unlock Time', value: `<t:${Math.floor(newRemaining.until / 1000)}:F>`, inline: false }
                    )
                    .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                    .setTimestamp();
                
                await msg.edit({ embeds: [updatedEmbed] }).catch(() => {});
            }, 1000);
            
            client.limitIntervals.set(interaction.user.id, interval);
            
            return;
        }

        // إذا كان المبلغ هيعدي الحد (أكبر من 2000)
        if (limitResult.wouldExceed) {
            return interaction.reply({ 
                content: `❌ You only have **${limitResult.remaining}** remaining out of 2000 limit. You cannot withdraw ${amount}.`, 
                flags: 64 
            });
        }

        // ========== آخر عملية (total بالضبط 2000) ==========
        if (limitResult.isLast === true) {
            // تعريف checkWalletMessage هنا
            const checkWalletMessage = `\`\`\`diff\n- Check wallet\n\`\`\`\`!w ${interaction.user.id}\`\n\n\`\`\`diff\n- If You Sure\n\`\`\`\`/remove_earnings amount:${amount} user:${interaction.user.id}\``;
            
            // استخدام limitedUntil من limitResult
            const targetDate = limitResult.limitedUntil;
            
            // الوقت المتبقي الأولي
            const now = new Date();
            let initialHours = 28, initialMinutes = 0, initialSeconds = 0;
            
            if (targetDate) {
                const diffMs = targetDate - now;
                if (diffMs > 0) {
                    const diffSec = Math.floor(diffMs / 1000);
                    const diffMin = Math.floor(diffSec / 60);
                    initialHours = Math.floor(diffMin / 60);
                    initialMinutes = diffMin % 60;
                    initialSeconds = diffSec % 60;
                }
            }
            
            // Embed الـ Limit للمستخدم
            const limitEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('⛔ Withdrawal Limit Reached')
                .setDescription(`<@${interaction.user.id}> has reached the **2000** withdrawal limit!`)
                .setThumbnail(topRightImage)
                .setImage(bottomImage)
                .addFields(
                    { name: '💰 Total Withdrawn', value: `${limitResult.totalAmount}/2000`, inline: true },
                    { name: '⏰ Time Remaining', value: `**${initialHours}h ${initialMinutes}m ${initialSeconds}s**`, inline: true },
                    { name: '📅 Unlock Time', value: targetDate ? `<t:${Math.floor(targetDate / 1000)}:F>` : 'Calculating...', inline: false }
                )
                .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                .setTimestamp();

            // إرسال Embed الـ Limit (بدون رسالة نجاح)
            const msg = await interaction.reply({ embeds: [limitEmbed], fetchReply: true });
            
            // حفظ الـ Embed في الكاش
            if (!client.limitMessages) client.limitMessages = new Map();
            client.limitMessages.set(interaction.user.id, {
                channelId: interaction.channel.id,
                messageId: msg.id,
                totalAmount: limitResult.totalAmount,
                limitedUntil: targetDate
            });
            
            // إرسال إشعار لشانل اللوجات
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
                        { name: '⏰ Time Remaining', value: `**${initialHours}h ${initialMinutes}m ${initialSeconds}s**`, inline: true },
                        { name: '📅 Unlock Time', value: targetDate ? `<t:${Math.floor(targetDate / 1000)}:F>` : 'Calculating...', inline: false }
                    )
                    .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                    .setTimestamp();
                
                await logsChannel.send({ embeds: [notificationEmbed] });
            } catch (err) {}
            
            // بدء الـ interval للعد التنازلي
            if (client.limitIntervals && client.limitIntervals.get(interaction.user.id)) {
                clearInterval(client.limitIntervals.get(interaction.user.id));
            }
            if (!client.limitIntervals) client.limitIntervals = new Map();
            
            const interval = setInterval(async () => {
                if (!targetDate) return;
                
                const nowTime = new Date();
                const diffMs = targetDate - nowTime;
                
                if (diffMs <= 0) {
                    clearInterval(interval);
                    client.limitIntervals.delete(interaction.user.id);
                    client.limitMessages.delete(interaction.user.id);
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
                    .setDescription(`<@${interaction.user.id}> has reached the **2000** withdrawal limit!`)
                    .setThumbnail(topRightImage)
                    .setImage(bottomImage)
                    .addFields(
                        { name: '💰 Total Withdrawn', value: `${limitResult.totalAmount}/2000`, inline: true },
                        { name: '⏰ Time Remaining', value: `**${diffHours}h ${remainingMin}m ${remainingSec}s**`, inline: true },
                        { name: '📅 Unlock Time', value: `<t:${Math.floor(targetDate / 1000)}:F>`, inline: false }
                    )
                    .setFooter({ text: 'GRINDORA SERVICES | Withdrawal limit: 2000 per 28 hours' })
                    .setTimestamp();
                
                await msg.edit({ embeds: [updatedEmbed] }).catch(() => {});
            }, 1000);
            
            client.limitIntervals.set(interaction.user.id, interval);
            
            // ========== إرسال طلب الـ Approve للـ Owner ==========
            let number;
            if (method === 'v-cash') {
                number = workerData.vcashNumber;
                if (!number) return;
            } else {
                number = workerData.cryptoAddress;
                if (!number) return;
            }

            const rate = await getRate();
            const currentRate = method === 'v-cash' ? rate.vcash : rate.crypto;
            const total = amount * currentRate;
            const orderId = generateOrderId();

            const embed = new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('🟡 New Cash Out Request (LAST WITHDRAWAL)')
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
                    { name: '─────────────────', value: checkWalletMessage, inline: false },
                    { name: '⚠️ LIMIT STATUS', value: `**THIS IS THE LAST WITHDRAWAL!** User will be limited after approval.`, inline: false }
                )
                .setFooter({ text: `Requested by ${interaction.user.tag}` })
                .setTimestamp();

            const approveButton = new ButtonBuilder()
                .setCustomId(`approve_${orderId}_${interaction.user.id}_${amount}_${method}_${number}_${currentRate}_${total}_${interaction.channel.id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId(`cancel_${orderId}_${interaction.user.id}_${amount}_${method}_${number}_${interaction.channel.id}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(approveButton, cancelButton);

            const ownerChannel = await client.channels.fetch(config.channels.approveChannel);
            await ownerChannel.send({ embeds: [embed], components: [row] });

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
                isLast: true
            });
            
            return;
        }

        // ========== عملية عادية (أقل من 2000) ==========
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

        const checkWalletMessage = `\`\`\`diff\n- Check wallet\n\`\`\`\`!w ${interaction.user.id}\`\n\n\`\`\`diff\n- If You Sure\n\`\`\`\`/remove_earnings amount:${amount} user:${interaction.user.id}\``;

        const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('🟡 New Cash Out Request')
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
                { name: '─────────────────', value: checkWalletMessage, inline: false },
                { name: '📊 Limit Status', value: `${limitResult.totalAmount || amount}/2000 (${limitResult.remaining || 2000 - amount} remaining)`, inline: false }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        const approveButton = new ButtonBuilder()
            .setCustomId(`approve_${orderId}_${interaction.user.id}_${amount}_${method}_${number}_${currentRate}_${total}_${interaction.channel.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
            .setCustomId(`cancel_${orderId}_${interaction.user.id}_${amount}_${method}_${number}_${interaction.channel.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(approveButton, cancelButton);

        const ownerChannel = await client.channels.fetch(config.channels.approveChannel);
        await ownerChannel.send({ embeds: [embed], components: [row] });

        // رسالة نجاح عادية
        await interaction.reply({ 
            content: `✅ Withdrawal request sent successfully\n📋 Order ID: \`${orderId}\`\n📊 Limit: ${limitResult.totalAmount || amount}/2000`, 
            flags: 64 
        });

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
            isLast: false
        });
    }
};