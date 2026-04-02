// config.js
module.exports = {
    token: process.env.token,
    clientId: process.env.clientId,
    guildId: process.env.guildId,
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