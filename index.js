const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// قراءة الكونفيج
const config = {
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

console.log('Token:', config.token ? '✅' : '❌');
console.log('ClientId:', config.clientId ? '✅' : '❌');
console.log('GuildId:', config.guildId ? '✅' : '❌');

const { initDatabase, deleteHistory, resetUserLimit, getUserLimit } = require('./utils/database');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent  // هذا مهم جداً للأوامر الـ Prefix
    ] 
});

const PREFIX = '!';

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`Bot is ready! Use ${PREFIX}helpout to test`);
    
    // Register slash commands
    try {
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
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        console.log(`✅ Registered ${commands.length} slash commands`);
    } catch (error) {
        console.error('Register error:', error);
    }
});

// معالجة الأوامر الـ Prefix
client.on('messageCreate', async message => {
    // تجاهل رسائل البوت نفسه
    if (message.author.bot) return;
    
    // تجاهل الرسائل اللي مش بتبدأ بالبادئة
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    console.log(`Command received: ${commandName} from ${message.author.tag}`);

    // ========== !helpout ==========
    if (commandName === 'helpout') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x00bfff)
            .setTitle('📋 Bot Commands')
            .setDescription('**Prefix Commands:**')
            .addFields(
                { name: '!helpout', value: 'Show this help message', inline: false },
                { name: '!clearchat @user', value: 'Clear DM messages (Owner only)', inline: false },
                { name: '!deletehistory @user', value: 'Delete user history (Owner only)', inline: false },
                { name: '!deletehistory all', value: 'Delete ALL history (Owner only)', inline: false },
                { name: '!resetlimit @user', value: 'Reset withdrawal limit (Owner/Admin/Support)', inline: false }
            )
            .setFooter({ text: 'Use / for slash commands: /cash-out, /rate, /view-cashouts, /history-cash-out' })
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

    // ========== !clearchat ==========
    if (commandName === 'clearchat') {
        if (!message.member.roles.cache.has(config.roles.owner)) {
            return message.reply('❌ This command is for Owner only');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Please mention a user! Usage: `!clearchat @user`');
        }

        await message.reply(`🔄 Clearing DM messages with ${targetUser.tag}...`);

        let deletedCount = 0;

        try {
            const dmChannel = await targetUser.createDM();
            const messages = await dmChannel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(msg => msg.author.id === client.user.id);
            
            for (const msg of botMessages.values()) {
                await msg.delete().catch(() => {});
                deletedCount++;
            }
            
            await message.reply(`✅ Deleted **${deletedCount}** messages from DM with ${targetUser.tag}`);
        } catch (error) {
            console.error(error);
            await message.reply(`❌ Failed: ${error.message}`);
        }
    }

    // ========== !deletehistory ==========
    if (commandName === 'deletehistory') {
        if (!message.member.roles.cache.has(config.roles.owner)) {
            return message.reply('❌ This command is for Owner only');
        }

        const target = args[0];
        if (!target) {
            return message.reply('❌ Please specify a user (@mention) or "all"');
        }

        if (target === 'all') {
            await message.reply('🔄 Deleting ALL transaction history...');
            const result = await deleteHistory('all');
            await message.reply(`✅ ${result.message}`);
        } else {
            const targetUser = message.mentions.users.first();
            if (!targetUser) {
                return message.reply('❌ Please mention a valid user!');
            }
            await message.reply(`🔄 Deleting history for ${targetUser.tag}...`);
            const result = await deleteHistory(targetUser.id);
            await message.reply(`✅ ${result.message}`);
        }
    }

    // ========== !resetlimit ==========
    if (commandName === 'resetlimit') {
        const allowedResetRoles = [
            config.roles.owner,
            '1487298785913606317', // Admin
            '1487299732215697469'  // Support
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
                .setDescription(`Withdrawal limit reset for ${targetUser.tag}`)
                .addFields(
                    { name: '📊 Previous Total', value: `${limitInfo.totalAmount || 0}/2000`, inline: true },
                    { name: '🔄 Reset By', value: message.author.tag, inline: true },
                    { name: '📅 Reset Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply(`❌ Failed to reset limit: ${result.message}`);
        }
    }
});

// معالجة الـ Slash Commands
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

// تشغيل البوت
async function start() {
    try {
        await initDatabase();
        console.log('✅ Database ready');
        await client.login(config.token);
    } catch (error) {
        console.error('Error starting bot:', error);
    }
}

start();