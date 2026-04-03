const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const { getAllWorkers } = require('../utils/mongodb');


const itemsPerPage = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list-workers')
        .setDescription('List all registered workers (Owner/Admin/Support)'),

    async execute(interaction, client) {
        // الرتب المسموح لها
        const allowedRoles = [
            '1487214820276043967', // Owner
            '1487298785913606317', // Admin
            '1487299732215697469'  // Support
        ];
        
        const hasAllowedRole = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
            return interaction.reply({ content: '❌ This command is for Owner, Admin, or Support only', flags: 64 });
        }

        const workers = await getAllWorkers();

        if (!workers || workers.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('📋 Registered Workers')
                .setDescription('No workers registered yet.')
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (!client.workersCache) {
            client.workersCache = new Map();
        }
        client.workersCache.set(interaction.user.id, { workers, currentPage: 0 });

        await sendWorkersPage(interaction, client, interaction.user.id, 0);
    }
};

async function sendWorkersPage(interaction, client, userId, page) {
    const cached = client.workersCache?.get(userId);
    if (!cached) {
        if (interaction.replied) {
            await interaction.editReply({ content: '❌ Session expired. Use /list-workers again.', components: [] });
        } else {
            await interaction.reply({ content: '❌ Session expired. Use /list-workers again.', flags: 64 });
        }
        return;
    }

    const { workers } = cached;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageWorkers = workers.slice(start, end);
    const totalPages = Math.ceil(workers.length / itemsPerPage);

    const embed = new EmbedBuilder()
        .setColor(0x00bfff)
        .setTitle('📋 Registered Workers List')
        .setDescription(`**Total Workers:** ${workers.length}`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
        .setTimestamp();

    for (const worker of pageWorkers) {
        embed.addFields({
            name: `👤 <@${worker.workerId}>`,
            value: `**Channel:** <#${worker.channelId}>\n**V-Cash:** ${worker.vcashNumber || 'Not set'}\n**Crypto:** ${worker.cryptoAddress || 'Not set'}\n**Registered:** <t:${Math.floor(new Date(worker.createdAt).getTime() / 1000)}:R>`,
            inline: false
        });
    }

    const row = new ActionRowBuilder();
    
    if (page > 0) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`listworkers_prev_${userId}_${page - 1}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    if (page < totalPages - 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`listworkers_next_${userId}_${page + 1}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Primary)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`listworkers_refresh_${userId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    const components = row.components.length > 0 ? [row] : [];

    client.workersCache.set(userId, { workers, currentPage: page });

    if (interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: components });
    } else {
        await interaction.reply({ embeds: [embed], components: components, flags: 64 });
    }
}

// Handle button interactions for workers list
async function handleWorkersButtons(interaction, client) {
    if (!interaction.customId.startsWith('listworkers_')) return false;

    const customId = interaction.customId;
    const parts = customId.split('_');
    const action = parts[1];
    const userId = parts[2];
    const targetPage = parseInt(parts[3]);

    // Check if user owns this session
    if (interaction.user.id !== userId) {
        await interaction.reply({ content: '❌ You cannot control this menu.', ephemeral: true });
        return true;
    }

    const cached = client.workersCache?.get(userId);
    if (!cached) {
        await interaction.reply({ content: '❌ Session expired. Use /list-workers again.', ephemeral: true });
        return true;
    }

    let { workers, currentPage = 0 } = cached;
    const totalPages = Math.ceil(workers.length / itemsPerPage);

    if (action === 'prev' && !isNaN(targetPage) && targetPage >= 0) {
        currentPage = targetPage;
    } else if (action === 'next' && !isNaN(targetPage) && targetPage < totalPages) {
        currentPage = targetPage;
    } else if (action === 'refresh') {
        workers = await getAllWorkers();
        currentPage = 0;
        client.workersCache.set(userId, { workers, currentPage });
        await sendWorkersPage(interaction, client, userId, currentPage);
        return true;
    } else {
        await interaction.reply({ content: '❌ Invalid action.', ephemeral: true });
        return true;
    }

    // Update cache
    client.workersCache.set(userId, { workers, currentPage });
    
    // Send updated page
    await sendWorkersPage(interaction, client, userId, currentPage);
    return true;
}

module.exports.sendWorkersPage = sendWorkersPage;
module.exports.handleWorkersButtons = handleWorkersButtons;