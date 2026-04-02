const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { addWorker, getWorkerByUserId } = require('../utils/database');

// الصور
const topRightImage = 'https://media.discordapp.net/attachments/1487311776256098414/1489130417838882916/HHHHHHHHHHHHHHHHHHHHHH.gif';
const bottomImage = 'https://media.discordapp.net/attachments/1489063780813111539/1489203223985393794/Untitled-1.gif?ex=69cf9014&is=69ce3e94&hm=c790ea2a988c1c3ca6429459028d7ef53308afe7bf54d858f7a6383ae447ffcd&';

// الرتب المسموح لها
const allowedRoles = [
    '1487214820276043967', // Owner
    '1487298785913606317', // Admin
    '1487299732215697469'  // Support
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add-data')
        .setDescription('Add worker data (Owner/Admin/Support)'),

    async execute(interaction, client) {
        // Check if user has allowed role
        const hasAllowedRole = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
            return interaction.reply({ content: '❌ This command is for Owner, Admin, or Support only', flags: 64 });
        }

        const modal = new ModalBuilder()
            .setCustomId('addDataModal')
            .setTitle('Add Worker Data');

        const workerIdInput = new TextInputBuilder()
            .setCustomId('workerId')
            .setLabel('Worker User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Discord User ID')
            .setRequired(true);

        const channelIdInput = new TextInputBuilder()
            .setCustomId('channelId')
            .setLabel('Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Channel ID')
            .setRequired(true);

        const vcashInput = new TextInputBuilder()
            .setCustomId('vcashNumber')
            .setLabel('V-Cash Number (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter V-Cash phone number')
            .setRequired(false);

        const cryptoInput = new TextInputBuilder()
            .setCustomId('cryptoAddress')
            .setLabel('Crypto Address (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Crypto wallet address')
            .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(workerIdInput);
        const row2 = new ActionRowBuilder().addComponents(channelIdInput);
        const row3 = new ActionRowBuilder().addComponents(vcashInput);
        const row4 = new ActionRowBuilder().addComponents(cryptoInput);

        modal.addComponents(row1, row2, row3, row4);

        await interaction.showModal(modal);

        // Handle modal submit
        const filter = (i) => i.customId === 'addDataModal' && i.user.id === interaction.user.id;
        
        try {
            const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 300000 });
            
            const workerId = modalInteraction.fields.getTextInputValue('workerId');
            const channelId = modalInteraction.fields.getTextInputValue('channelId');
            const vcashNumber = modalInteraction.fields.getTextInputValue('vcashNumber') || null;
            const cryptoAddress = modalInteraction.fields.getTextInputValue('cryptoAddress') || null;

            // Get worker info
            let workerUsername = 'Unknown';
            let workerUser = null;
            try {
                workerUser = await client.users.fetch(workerId);
                workerUsername = workerUser.tag;
            } catch (err) {
                console.log('Could not fetch user:', err);
            }

            const result = await addWorker(workerId, channelId, vcashNumber, cryptoAddress);

            // Reply only once
            if (modalInteraction.isRepliable() && !modalInteraction.replied) {
                await modalInteraction.reply({ content: result.message, flags: 64 });
            }

            // Send log to approveLogs channel (don't reply again)
            if (result.success) {
                try {
                    const logsChannel = await client.channels.fetch(config.channels.approveLogs);
                    
                    // Get role name for footer
                    let roleName = 'Unknown';
                    if (interaction.member.roles.cache.has('1487214820276043967')) roleName = 'Owner';
                    else if (interaction.member.roles.cache.has('1487298785913606317')) roleName = 'Admin';
                    else if (interaction.member.roles.cache.has('1487299732215697469')) roleName = 'Support';
                    
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('📝 [LOG] New Worker Added')
                        .setThumbnail(topRightImage)
                        .setImage(bottomImage)
                        .addFields(
                            { name: '👤 Worker', value: `<@${workerId}> (${workerUsername})`, inline: true },
                            { name: '🆔 User ID', value: `\`${workerId}\``, inline: true },
                            { name: '📢 Channel', value: `<#${channelId}>`, inline: true },
                            { name: '📱 V-Cash', value: vcashNumber || 'Not set', inline: true },
                            { name: '🔐 Crypto', value: cryptoAddress || 'Not set', inline: true },
                            { name: '✅ Added by', value: `${interaction.user.tag} (${roleName})`, inline: true },
                            { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                        )
                        .setFooter({ text: 'Worker Registration Log | GRINDORA SERVICES' })
                        .setTimestamp();
                    
                    await logsChannel.send({ embeds: [logEmbed] });
                    console.log(`✅ Log sent for new worker: ${workerId}`);
                } catch (err) {
                    console.log('Could not send log:', err);
                }

                // Also try to send DM to the worker
                if (workerUser) {
                    try {
                        const dmEmbed = new EmbedBuilder()
                            .setColor(0x00ff00)
                            .setTitle('✅ You have been registered!')
                            .setDescription(`You are now registered as a **Worker** in GRINDORA SERVICES`)
                            .setThumbnail(topRightImage)
                            .setImage(bottomImage)
                            .addFields(
                                { name: '📢 Your Channel', value: `<#${channelId}>`, inline: true },
                                { name: '📱 V-Cash', value: vcashNumber || 'Not set', inline: true },
                                { name: '🔐 Crypto', value: cryptoAddress || 'Not set', inline: true },
                                { name: '📋 Commands', value: `Use \`/cash-out\` to withdraw\nUse \`/history-cash-out\` to view history`, inline: false }
                            )
                            .setFooter({ text: 'GRINDORA SERVICES' })
                            .setTimestamp();
                        
                        await workerUser.send({ embeds: [dmEmbed] });
                    } catch (err) {
                        console.log('Could not send DM to worker:', err);
                    }
                }
            }
        } catch (error) {
            console.error('Modal submit error:', error);
        }
    }
};