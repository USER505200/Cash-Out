const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { deleteWorker, getWorkerByUserId } = require('../utils/database');

const topRightImage = 'https://cdn.discordapp.com/attachments/1489497861350494339/1489723944582910002/word_1.gif?ex=69d1750a&is=69d0238a&hm=e9861e30bd5918e66c2d324e9bf21104bd21d8c18de12fb6cfa00681ce6f51e1&';
const bottomImage = 'https://cdn.discordapp.com/attachments/1489497861350494339/1489730355316392088/Untitled-1.gif?ex=69d17b02&is=69d02982&hm=91bba9f3cb622da72a3555f8a9ed89383f533898b0172e271605523595e1ce54&';

// الرتب المسموح لها
const allowedRoles = [
    '1487214820276043967', // Owner
    '1487298785913606317', // Admin
    '1487299732215697469'  // Support
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-data')
        .setDescription('Delete worker data (Owner/Admin/Support)'),

    async execute(interaction, client) {
        // Check if user has allowed role
        const hasAllowedRole = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
            return interaction.reply({ content: '❌ This command is for Owner, Admin, or Support only', flags: 64 });
        }

        const modal = new ModalBuilder()
            .setCustomId('deleteDataModal')
            .setTitle('Delete Worker Data');

        const workerIdInput = new TextInputBuilder()
            .setCustomId('workerId')
            .setLabel('Worker User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Discord User ID to delete')
            .setRequired(true);

        const confirmInput = new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel('Type "CONFIRM" to delete')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('CONFIRM')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(workerIdInput);
        const row2 = new ActionRowBuilder().addComponents(confirmInput);

        modal.addComponents(row1, row2);

        await interaction.showModal(modal);

        // Handle modal submit
        const filter = (i) => i.customId === 'deleteDataModal' && i.user.id === interaction.user.id;
        
        try {
            const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 300000 });
            
            const workerId = modalInteraction.fields.getTextInputValue('workerId');
            const confirm = modalInteraction.fields.getTextInputValue('confirm');

            if (confirm !== 'CONFIRM') {
                if (modalInteraction.isRepliable() && !modalInteraction.replied) {
                    await modalInteraction.reply({ content: '❌ Deletion cancelled. You must type "CONFIRM" to delete.', flags: 64 });
                }
                return;
            }

            // Get worker info before deletion
            const workerData = await getWorkerByUserId(workerId);
            if (!workerData) {
                if (modalInteraction.isRepliable() && !modalInteraction.replied) {
                    await modalInteraction.reply({ content: `❌ Worker with ID ${workerId} not found`, flags: 64 });
                }
                return;
            }

            let workerUsername = 'Unknown';
            try {
                const workerUser = await client.users.fetch(workerId);
                workerUsername = workerUser.tag;
            } catch (err) {
                console.log('Could not fetch user:', err);
            }

            const result = await deleteWorker(workerId);

            // Reply only once
            if (modalInteraction.isRepliable() && !modalInteraction.replied) {
                await modalInteraction.reply({ content: result.message, flags: 64 });
            }

            // Send log to approveLogs channel
            if (result.success) {
                try {
                    const logsChannel = await client.channels.fetch(config.channels.approveLogs);
                    
                    // Get role name for footer
                    let roleName = 'Unknown';
                    if (interaction.member.roles.cache.has('1487214820276043967')) roleName = 'Owner';
                    else if (interaction.member.roles.cache.has('1487298785913606317')) roleName = 'Admin';
                    else if (interaction.member.roles.cache.has('1487299732215697469')) roleName = 'Support';
                    
                    const logEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('📝 [LOG] Worker Deleted')
                        .setThumbnail(topRightImage)
                        .setImage(bottomImage)
                        .addFields(
                            { name: '👤 Worker', value: `<@${workerId}> (${workerUsername})`, inline: true },
                            { name: '🆔 User ID', value: `\`${workerId}\``, inline: true },
                            { name: '📢 Channel', value: `<#${workerData.channelId}>`, inline: true },
                            { name: '📱 V-Cash', value: workerData.vcashNumber || 'Not set', inline: true },
                            { name: '🔐 Crypto', value: workerData.cryptoAddress || 'Not set', inline: true },
                            { name: '❌ Deleted by', value: `${interaction.user.tag} (${roleName})`, inline: true },
                            { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                        )
                        .setFooter({ text: 'Worker Deletion Log | GRINDORA SERVICES' })
                        .setTimestamp();
                    
                    await logsChannel.send({ embeds: [logEmbed] });
                    console.log(`✅ Log sent for deleted worker: ${workerId}`);
                } catch (err) {
                    console.log('Could not send log:', err);
                }
            }
        } catch (error) {
            console.error('Modal submit error:', error);
        }
    }
};