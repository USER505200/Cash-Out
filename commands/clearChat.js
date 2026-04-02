const config = require('../config.js');

module.exports = {
    name: 'clearchat',
    description: 'Clear DM messages with a user (Owner only)',
    usage: '!clearchat @user',
    
    async execute(message, args, client) {
        // Check if user is Owner
        if (!message.member.roles.cache.has(config.roles.owner)) {
            return message.reply('❌ This command is for Owner only');
        }

        // Get mentioned user
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Please mention a user! Usage: `!clearchat @user`');
        }

        await message.reply(`🔄 Clearing DM messages with ${targetUser.tag}...`);

        try {
            const dmChannel = await targetUser.createDM();
            let deletedCount = 0;
            
            // Delete messages in chunks
            let messages = await dmChannel.messages.fetch({ limit: 100 });
            
            while (messages.size > 0) {
                const botMessages = messages.filter(msg => msg.author.id === client.user.id);
                
                for (const msg of botMessages.values()) {
                    await msg.delete().catch(() => {});
                    deletedCount++;
                }
                
                if (messages.size === 100) {
                    const lastId = messages.last().id;
                    messages = await dmChannel.messages.fetch({ limit: 100, before: lastId });
                } else {
                    break;
                }
            }

            await message.reply(`✅ Cleared ${deletedCount} messages from DM with ${targetUser.tag}`);
        } catch (error) {
            console.error(error);
            await message.reply(`❌ Failed to clear messages: ${error.message}`);
        }
    }
};