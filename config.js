// config.js
// This file reads from environment variables or CONFIG_JSON

let config;

if (process.env.CONFIG_JSON) {
    try {
        config = JSON.parse(process.env.CONFIG_JSON);
        console.log('✅ Config loaded from CONFIG_JSON');
    } catch (e) {
        console.error('Failed to parse CONFIG_JSON:', e.message);
        config = null;
    }
} else {
    // Default config from environment variables
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

module.exports = config;