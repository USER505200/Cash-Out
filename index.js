const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { initDatabase, deleteHistory, resetUserLimit, getUserLimit } = require('./utils/mongodb'); // ← غير إلى mongodb

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages
    ] 
});

const PREFIX = '!';
const token = process.env.TOKEN || config.token; // ← أضف هذا السطر

async function start() {
    try {
        await initDatabase();
        console.log('✅ Database ready (MongoDB)');

        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        
        if (fs.existsSync(commandsPath)) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                try {
                    const command = require(`./commands/${file}`);
                    if (command.data) {
                        commands.push(command.data.toJSON());
                        console.log(`✅ Loaded command: ${file}`);
                    }
                } catch (err) {
                    console.log(`⚠️ Failed to load command ${file}:`, err.message);
                }
            }
        }

        const rest = new REST({ version: '10' }).setToken(token);

        client.once('ready', async () => {
            console.log(`✅ Logged in as ${client.user.tag}`);
            
            if (client.limitIntervals) {
                for (const [userId, interval] of client.limitIntervals) {
                    clearInterval(interval);
                }
                client.limitIntervals.clear();
            }

            try {
                await rest.put(
                    Routes.applicationGuildCommands(config.clientId, config.guildId),
                    { body: commands }
                );
                console.log('✅ Slash commands registered');
            } catch (error) {
                console.error(error);
            }
        });

        // باقي الكود كما هو...
        client.on('interactionCreate', async interaction => {
            if (interaction.isChatInputCommand()) {
                try {
                    const command = require(`./commands/${interaction.commandName}.js`);
                    await command.execute(interaction, client);
                } catch (error) {
                    console.error(error);
                    await interaction.reply({ content: '❌ Something went wrong', flags: 64 });
                }
            }

            if (interaction.isButton()) {
                try {
                    const buttonHandler = require('./handlers/buttonHandler');
                    await buttonHandler.handle(interaction, client);
                } catch (error) {
                    console.error('Button handler error:', error);
                }
            }
        });

        client.on('messageCreate', async message => {
            if (message.author.bot) return;
            if (!message.content.startsWith(PREFIX)) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            if (commandName === 'helpout') {
                const helpEmbed = new EmbedBuilder()
                    .setColor(0x00bfff)
                    .setTitle('📋 Bot Prefix Commands')
                    .setDescription('Here are all available prefix commands:')
                    .setThumbnail(client.user.displayAvatarURL())
                    .addFields(
                        { name: '!clearchat @user', value: 'Clear all bot messages from DM with a specific user (Owner only)', inline: false },
                        { name: '!deletehistory @user', value: 'Delete transaction history for a specific user (Owner only)', inline: false },
                        { name: '!deletehistory all', value: 'Delete ALL transaction history (Owner only)', inline: false },
                        { name: '!resetlimit @user', value: 'Reset withdrawal limit for a specific user (Owner/Admin/Support)', inline: false },
                        { name: '!helpout', value: 'Show this help message', inline: false }
                    )
                    .setFooter({ text: 'Use / for slash commands like /cash-out, /rate, /view-cashouts, /history-cash-out' })
                    .setTimestamp();

                return message.reply({ embeds: [helpEmbed] });
            }

            if (commandName === 'clearchat') {
                if (!message.member.roles.cache.has(config.roles.owner)) {
                    return message.reply('❌ This command is for Owner only');
                }

                const targetUser = message.mentions.users.first();
                if (!targetUser) {
                    return message.reply('❌ Please mention a user! Usage: `!clearchat @user`');
                }

                await message.reply(`🔄 Clearing ALL bot messages from DM with ${targetUser.tag}...`);

                let deletedCount = 0;
                let hasMore = true;

                try {
                    const dmChannel = await targetUser.createDM();
                    
                    while (hasMore) {
                        const messages = await dmChannel.messages.fetch({ limit: 100 });
                        
                        if (messages.size === 0) {
                            hasMore = false;
                            break;
                        }
                        
                        const botMessages = messages.filter(msg => msg.author.id === client.user.id);
                        
                        if (botMessages.size === 0) {
                            if (messages.size < 100) hasMore = false;
                            continue;
                        }
                        
                        for (const msg of botMessages.values()) {
                            await msg.delete().catch(() => {});
                            deletedCount++;
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                        
                        if (messages.size < 100) hasMore = false;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    await message.reply(`✅ Deleted **${deletedCount}** messages from DM with ${targetUser.tag}`);
                } catch (error) {
                    console.error(error);
                    await message.reply(`❌ Failed: ${error.message}`);
                }
            }

            if (commandName === 'deletehistory') {
                if (!message.member.roles.cache.has(config.roles.owner)) {
                    return message.reply('❌ This command is for Owner only');
                }

                const target = args[0];
                if (!target) {
                    return message.reply('❌ Please specify a user (@mention) or "all"\nUsage: `!deletehistory @user` or `!deletehistory all`');
                }

                if (target === 'all') {
                    await message.reply('🔄 Deleting ALL transaction history...');
                    const result = await deleteHistory('all');
                    await message.reply(`✅ ${result.message}`);
                } else {
                    const targetUser = message.mentions.users.first();
                    if (!targetUser) {
                        return message.reply('❌ Please mention a valid user!\nUsage: `!deletehistory @user`');
                    }
                    await message.reply(`🔄 Deleting history for ${targetUser.tag}...`);
                    const result = await deleteHistory(targetUser.id);
                    await message.reply(`✅ ${result.message}`);
                }
            }

            if (commandName === 'resetlimit') {
                const allowedResetRoles = [
                    '1487214820276043967',
                    '1487298785913606317',
                    '1487299732215697469'
                ];
                
                const hasAllowedRole = allowedResetRoles.some(roleId => message.member.roles.cache.has(roleId));
                if (!hasAllowedRole) {
                    return message.reply('❌ This command is for Owner, Admin, or Support only');
                }

                const targetUser = message.mentions.users.first();
                if (!targetUser) {
                    return message.reply('❌ Please mention a user! Usage: `!resetlimit @user`');
                }

                const limitInfo = await getUserLimit(targetUser.id);
                
                if (!limitInfo.isLimited && (limitInfo.totalAmount === 0 || limitInfo.totalAmount < 2000)) {
                    return message.reply(`✅ User ${targetUser.tag} does not have an active limit. Current total: ${limitInfo.totalAmount || 0}/2000`);
                }

                await message.reply(`🔄 Resetting withdrawal limit for ${targetUser.tag}...`);

                const result = await resetUserLimit(targetUser.id);
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('✅ Limit Reset')
                        .setDescription(`Withdrawal limit has been reset for ${targetUser.tag}`)
                        .addFields(
                            { name: '👤 User', value: `${targetUser}`, inline: true },
                            { name: '📊 Previous Total', value: `${limitInfo.totalAmount || 0}/2000`, inline: true },
                            { name: '🔄 Reset By', value: message.author.tag, inline: true },
                            { name: '📅 Reset Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                        )
                        .setThumbnail(targetUser.displayAvatarURL())
                        .setTimestamp();
                    
                    await message.reply({ embeds: [embed] });
                    
                    if (client.limitIntervals && client.limitIntervals.has(targetUser.id)) {
                        clearInterval(client.limitIntervals.get(targetUser.id));
                        client.limitIntervals.delete(targetUser.id);
                    }
                } else {
                    await message.reply(`❌ Failed to reset limit: ${result.message}`);
                }
            }
        });

        client.login(token);
    } catch (error) {
        console.error('Error starting bot:', error);
    }
}

start();