const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Config - استخدام متغيرات البيئة أولاً
const config = {
    token: process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '',
    clientId: process.env.CLIENT_ID || '1489405495478325431',
    guildId: process.env.GUILD_ID || '1487197600456249378',
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

console.log('📌 Using Token:', config.token ? config.token.slice(0, 25) + '...' : '❌ MISSING');
console.log('📌 Client ID:', config.clientId);
console.log('📌 Guild ID:', config.guildId);

const { initDatabase, deleteHistory, resetUserLimit, getUserLimit } = require('./utils/database');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ] 
});

const PREFIX = '!';

// ==================== HTTP Server for Railway Healthcheck (بدون express) ====================
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    } else {
        res.writeHead(404);
        res.end();
    }
});
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`✅ Healthcheck server running on port ${PORT}`);
});

async function registerCommands() {
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
                        console.log(`✅ Loaded command: ${file}`);
                    }
                } catch (err) {
                    console.log(`⚠️ ${file}:`, err.message);
                }
            }
        }
        
        const rest = new REST({ version: '10' }).setToken(config.token);
        
        // حذف الأوامر القديمة
        console.log('🔄 Clearing old commands...');
        try {
            const existing = await rest.get(
                Routes.applicationGuildCommands(config.clientId, config.guildId)
            );
            for (const cmd of existing) {
                await rest.delete(
                    Routes.applicationGuildCommand(config.clientId, config.guildId, cmd.id)
                );
                console.log(`🗑️ Deleted: ${cmd.name}`);
            }
        } catch (e) {
            console.log('No existing commands or error:', e.message);
        }
        
        // تسجيل الأوامر الجديدة
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        console.log(`✅ Registered ${commands.length} slash commands`);
    } catch (error) {
        console.error('Register error:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`✅ Bot ID: ${client.user.id}`);
    await registerCommands();
});

// Prefix commands
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (commandName === 'helpout') {
        const embed = new EmbedBuilder()
            .setColor(0x00bfff)
            .setTitle('📋 GRINDORA CASH-OUT BOT')
            .setDescription('**Prefix Commands (!)**')
            .addFields(
                { name: '!helpout', value: 'Show this menu', inline: true },
                { name: '!ping', value: 'Check bot latency', inline: true },
                { name: '!clearchat @user', value: 'Clear DM (Owner)', inline: false },
                { name: '!deletehistory @user/all', value: 'Delete history (Owner)', inline: false },
                { name: '!resetlimit @user', value: 'Reset limit (Owner/Admin/Support)', inline: false }
            )
            .addFields(
                { name: '📱 Slash Commands (/)', value: '`/cash-out` `/add-data` `/delete-data` `/edit-data` `/history-cash-out` `/list-workers` `/rate` `/view-cashouts`', inline: false }
            )
            .setFooter({ text: 'GRINDORA SERVICES' })
            .setTimestamp();
        
        return message.reply({ embeds: [embed] });
    }

    if (commandName === 'ping') {
        return message.reply(`🏓 Pong! ${client.ws.ping}ms`);
    }

    if (commandName === 'clearchat') {
        if (!message.member.roles.cache.has(config.roles.owner)) {
            return message.reply('❌ Owner only');
        }
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Mention a user');
        
        await message.reply(`🔄 Clearing DM with ${target.tag}...`);
        try {
            const dm = await target.createDM();
            const msgs = await dm.messages.fetch({ limit: 100 });
            const botMsgs = msgs.filter(m => m.author.id === client.user.id);
            let count = 0;
            for (const m of botMsgs.values()) {
                await m.delete();
                count++;
            }
            await message.reply(`✅ Deleted ${count} messages`);
        } catch (e) {
            await message.reply(`❌ Error: ${e.message}`);
        }
    }

    if (commandName === 'deletehistory') {
        if (!message.member.roles.cache.has(config.roles.owner)) {
            return message.reply('❌ Owner only');
        }
        const target = args[0];
        if (!target) return message.reply('❌ @user or "all"');
        
        if (target === 'all') {
            const res = await deleteHistory('all');
            await message.reply(`✅ ${res.message}`);
        } else {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Mention a user');
            const res = await deleteHistory(user.id);
            await message.reply(`✅ ${res.message}`);
        }
    }

    if (commandName === 'resetlimit') {
        const allowed = [config.roles.owner, '1487298785913606317', '1487299732215697469'];
        if (!allowed.some(r => message.member.roles.cache.has(r))) {
            return message.reply('❌ Owner/Admin/Support only');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Mention a user');
        
        const info = await getUserLimit(user.id);
        if (!info.isLimited && info.totalAmount < 2000) {
            return message.reply(`✅ Not limited. Total: ${info.totalAmount || 0}/2000`);
        }
        
        const res = await resetUserLimit(user.id);
        if (res.success) {
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Limit Reset')
                .setDescription(`Reset for ${user.tag}`)
                .addFields(
                    { name: 'Previous', value: `${info.totalAmount || 0}/2000`, inline: true },
                    { name: 'By', value: message.author.tag, inline: true }
                )
                .setTimestamp();
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply(`❌ ${res.message}`);
        }
    }
});

// Slash commands handler
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

// Start
async function start() {
    try {
        if (!config.token) {
            console.error('❌ No token found! Set DISCORD_TOKEN environment variable');
            process.exit(1);
        }
        await initDatabase();
        console.log('✅ Database ready');
        await client.login(config.token);
    } catch (error) {
        console.error('Start error:', error);
    }
}

start();