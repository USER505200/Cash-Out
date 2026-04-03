const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config.json');
const { getWorkerByUserId, updateWorker } = require('../utils/mongodb');



module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit-data')
        .setDescription('Edit worker data (Owner only)'),

    async execute(interaction, client) {
        if (!interaction.member.roles.cache.has(config.roles.owner)) {
            return interaction.reply({ content: '❌ This command is for Owner only', flags: 64 });
        }

        const modal = new ModalBuilder()
            .setCustomId('editDataModal')
            .setTitle('Edit Worker Data');

        const workerIdInput = new TextInputBuilder()
            .setCustomId('workerId')
            .setLabel('Worker User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter Discord User ID to edit')
            .setRequired(true);

        const channelIdInput = new TextInputBuilder()
            .setCustomId('channelId')
            .setLabel('New Channel ID (leave empty to keep)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter new Channel ID')
            .setRequired(false);

        const vcashInput = new TextInputBuilder()
            .setCustomId('vcashNumber')
            .setLabel('New V-Cash Number (leave empty to keep)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter new V-Cash number')
            .setRequired(false);

        const cryptoInput = new TextInputBuilder()
            .setCustomId('cryptoAddress')
            .setLabel('New Crypto Address (leave empty to keep)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter new Crypto address')
            .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(workerIdInput);
        const row2 = new ActionRowBuilder().addComponents(channelIdInput);
        const row3 = new ActionRowBuilder().addComponents(vcashInput);
        const row4 = new ActionRowBuilder().addComponents(cryptoInput);

        modal.addComponents(row1, row2, row3, row4);

        await interaction.showModal(modal);

        // Handle modal submit
        const filter = (i) => i.customId === 'editDataModal';
        
        try {
            const modalInteraction = await interaction.awaitModalSubmit({ 
                filter, 
                time: 300000
            });
            
            const workerId = modalInteraction.fields.getTextInputValue('workerId');
            const newChannelId = modalInteraction.fields.getTextInputValue('channelId') || undefined;
            const newVcash = modalInteraction.fields.getTextInputValue('vcashNumber') || undefined;
            const newCrypto = modalInteraction.fields.getTextInputValue('cryptoAddress') || undefined;

            const existing = await getWorkerByUserId(workerId);
            if (!existing) {
                if (modalInteraction.isRepliable()) {
                    await modalInteraction.reply({ content: `❌ Worker with ID ${workerId} not found`, flags: 64 });
                }
                return;
            }

            const updateData = {};
            if (newChannelId !== undefined && newChannelId !== '') updateData.channelId = newChannelId;
            if (newVcash !== undefined && newVcash !== '') updateData.vcashNumber = newVcash;
            if (newCrypto !== undefined && newCrypto !== '') updateData.cryptoAddress = newCrypto;

            const result = await updateWorker(workerId, updateData);
            
            if (modalInteraction.isRepliable()) {
                await modalInteraction.reply({ content: result.message, flags: 64 });
            }
        } catch (error) {
            console.error('Modal submit error:', error);
            // Interaction expired or user cancelled - don't try to reply
        }
    }
};