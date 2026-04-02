const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { setRate } = require('../utils/database');

// الرتب المسموح لها بتغيير السعر
const allowedRateRoles = [
    '1487214820276043967', // Owner
    '1487298785913606317', // Admin
    '1487299732215697469'  // Support
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Change V-Cash or Crypto rate (Owner/Admin/Support only)')
        .addStringOption(option =>
            option.setName('method')
                .setDescription('Select currency')
                .setRequired(true)
                .addChoices(
                    { name: 'V-Cash', value: 'vcash' },
                    { name: 'Crypto', value: 'crypto' }
                ))
        .addNumberOption(option =>
            option.setName('value')
                .setDescription('New rate value (e.g., 11 or 0.185)')
                .setRequired(true)),

    async execute(interaction, client) {
        // Check if user has allowed role
        const hasAllowedRole = allowedRateRoles.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
            return interaction.reply({ content: '❌ This command is for Owner, Admin, or Support only', flags: 64 });
        }

        const method = interaction.options.getString('method');
        const newRate = interaction.options.getNumber('value');

        if (isNaN(newRate) || newRate <= 0) {
            return interaction.reply({ content: '❌ Value must be a positive number', flags: 64 });
        }

        await setRate(method, newRate);

        // Update channel name based on method
        try {
            if (method === 'vcash') {
                const channel = await client.channels.fetch('1488199657426386954');
                if (channel && channel.isTextBased()) {
                    await channel.setName(`┃💳┃V Cash RATE ${newRate}EGP/m`);
                }
            } else {
                const channel = await client.channels.fetch('1488200735467241513');
                if (channel && channel.isTextBased()) {
                    await channel.setName(`┃🔐┃Crypto RATE ${newRate}$-m`);
                }
            }
        } catch (err) {
            console.log('Could not update channel name:', err);
        }

        // Get role name for footer
        let roleName = 'Unknown';
        if (interaction.member.roles.cache.has('1487214820276043967')) roleName = 'Owner';
        else if (interaction.member.roles.cache.has('1487298785913606317')) roleName = 'Admin';
        else if (interaction.member.roles.cache.has('1487299732215697469')) roleName = 'Support';

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Rate Updated')
            .setDescription(`**${method === 'vcash' ? 'V-Cash' : 'Crypto'}** rate changed to: **${newRate}**`)
            .setFooter({ text: `Changed by ${roleName}: ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: 64 });
    }
};