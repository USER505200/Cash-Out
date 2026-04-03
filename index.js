const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

let config;

if (process.env.CONFIG_JSON) {
    try {
        config = JSON.parse(process.env.CONFIG_JSON);
    } catch (e) {
        console.error('Failed to parse CONFIG_JSON:', e.message);
        process.exit(1);
    }
} else {
    config = {
        token: process.env.DISCORD_TOKEN || process.env.BOT_TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID,
        roles: {
            owner: '1487214820276043967',
            worker: '1487299337041215508'
        },
        channels: {
            vcashRateChannel: '1488199657426386954',
            cryptoRateChannel: '1488200735467241513',
            approveChannel: '1487996852518256650',
            approveLogs: '1487996999876874370'
        },
        maxAmount: 2000
    };
}

console.log('Token:', config.token ? '✅' : '❌');
console.log('ClientId:', config.clientId ? '✅' : '❌');
console.log('GuildId:', config.guildId ? '✅' : '❌');

if (!config.token || !config.clientId || !config.guildId) {
    console.error('❌ Missing config!');
    process.exit(1);
}

const { initDatabase, deleteHistory, resetUserLimit, getUserLimit } = require('./utils/database');

// أقل Intents ممكنة - فقط الأساسيات
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

const PREFIX = '!';

async function start() {
    try {
        await initDatabase();
        console.log('✅ Database ready');

        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        
        if (fs.existsSync(commandsPath)) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                try {
                    const command = require(`./commands/${file}`);
                    if (command.data) {
                        commands.push(command.data.toJSON());
                        console.log(`✅ Loaded: ${file}`);
                    }
                } catch (err) {
                    console.log(`⚠️ ${file}:`, err.message);
                }
            }
        }

        const rest = new REST({ version: '10' }).setToken(config.token);

        client.once('ready', async () => {
            console.log(`✅ Logged in as ${client.user.tag}`);
            
            try {
                await rest.put(
                    Routes.applicationGuildCommands(config.clientId, config.guildId),
                    { body: commands }
                );
                console.log(`✅ Registered ${commands.length} commands`);
            } catch (error) {
                console.error('Register error:', error);
            }
        });

        client.on('interactionCreate', async interaction => {
            if (interaction.isChatInputCommand()) {
                try {
                    const command = require(`./commands/${interaction.commandName}.js`);
                    await command.execute(interaction, client);
                } catch (error) {
                    console.error(error);
                    await interaction.reply({ content: '❌ Error', flags: 64 });
                }
            }

            if (interaction.isButton()) {
                try {
                    const buttonHandler = require('./handlers/buttonHandler');
                    await buttonHandler.handle(interaction, client);
                } catch (error) {
                    console.error('Button error:', error);
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
                    .setTitle('📋 Commands')
                    .setDescription('Prefix commands:')
                    .addFields(
                        { name: '!helpout', value: 'Show this help', inline: true },
                        { name: '!clearchat @user', value: 'Clear DM (Owner)', inline: true },
                        { name: '!deletehistory @user/all', value: 'Delete history (Owner)', inline: true },
                        { name: '!resetlimit @user', value: 'Reset limit (Owner/Admin/Support)', inline: true }
                    )
                    .setFooter({ text: 'Use / for slash commands' })
                    .setTimestamp();

                return message.reply({ embeds: [helpEmbed] });
            }

            if (commandName === 'clearchat') {
                if (!message.member.roles.cache.has(config.roles.owner)) {
                    return message.reply('❌ Owner only');
                }

                const targetUser = message.mentions.users.first();
                if (!targetUser) return message.reply('❌ Mention a user');

                await message.reply(`🔄 Clearing DM with ${targetUser.tag}...`);

                try {
                    const dmChannel = await targetUser.createDM();
                    const messages = await dmChannel.messages.fetch({ limit: 100 });
                    const botMessages = messages.filter(msg => msg.author.id === client.user.id);
                    
                    let deleted = 0;
                    for (const msg of botMessages.values()) {
                        await msg.delete().catch(() => {});
                        deleted++;
                    }
                    
                    await message.reply(`✅ Deleted ${deleted} messages`);
                } catch (error) {
                    await message.reply(`❌ Failed: ${error.message}`);
                }
            }

            if (commandName === 'deletehistory') {
                if (!message.member.roles.cache.has(config.roles.owner)) {
                    return message.reply('❌ Owner only');
                }

                const target = args[0];
                if (!target) return message.reply('❌ @user or "all"');

                if (target === 'all') {
                    const result = await deleteHistory('all');
                    await message.reply(`✅ ${result.message}`);
                } else {
                    const targetUser = message.mentions.users.first();
                    if (!targetUser) return message.reply('❌ Mention a user');
                    const result = await deleteHistory(targetUser.id);
                    await message.reply(`✅ ${result.message}`);
                }
            }

            if (commandName === 'resetlimit') {
                const allowed = [config.roles.owner, '1487298785913606317', '1487299732215697469'];
                if (!allowed.some(r => message.member.roles.cache.has(r))) {
                    return message.reply('❌ Owner/Admin/Support only');
                }

                const targetUser = message.mentions.users.first();
                if (!targetUser) return message.reply('❌ Mention a user');

                const limitInfo = await getUserLimit(targetUser.id);
                
                if (!limitInfo.isLimited && limitInfo.totalAmount < 2000) {
                    return message.reply(`✅ Not limited. Total: ${limitInfo.totalAmount || 0}/2000`);
                }

                const result = await resetUserLimit(targetUser.id);
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('✅ Limit Reset')
                        .setDescription(`Reset for ${targetUser.tag}`)
                        .addFields(
                            { name: 'Previous', value: `${limitInfo.totalAmount || 0}/2000`, inline: true },
                            { name: 'Reset By', value: message.author.tag, inline: true }
                        )
                        .setTimestamp();
                    
                    await message.reply({ embeds: [embed] });
                } else {
                    await message.reply(`❌ ${result.message}`);
                }
            }
        });

        client.login(config.token);
    } catch (error) {
        console.error('Start error:', error);
    }
}

start();