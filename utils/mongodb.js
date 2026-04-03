const mongoose = require('mongoose');

async function initDatabase() {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cashbot';
    
    try {
        await mongoose.connect(mongoURI);
        console.log('✅ MongoDB connected successfully');
        await initDefaultData();
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

async function initDefaultData() {
    const Rate = mongoose.model('Rate', new mongoose.Schema({
        id: { type: Number, default: 1, unique: true },
        vcash: { type: Number, default: 11 },
        crypto: { type: Number, default: 0.185 }
    }));
    
    const exists = await Rate.findOne({ id: 1 });
    if (!exists) {
        await Rate.create({ id: 1, vcash: 11, crypto: 0.185 });
    }
}

// تعريف الـ Schemas
const rateSchema = new mongoose.Schema({ id: Number, vcash: Number, crypto: Number });
const logSchema = new mongoose.Schema({
    orderId: String, userId: String, username: String, channelId: String,
    amount: Number, method: String, number: String, rate: Number,
    total: Number, status: String, processedBy: String, isLast: Boolean,
    timestamp: { type: Date, default: Date.now }
});
const workerSchema = new mongoose.Schema({
    workerId: { type: String, unique: true }, channelId: String,
    vcashNumber: String, cryptoAddress: String, createdAt: { type: Date, default: Date.now }
});
const limitSchema = new mongoose.Schema({
    userId: { type: String, unique: true }, totalAmount: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now }, isLimited: { type: Boolean, default: false },
    limitedUntil: { type: Date, default: null }
});

const Rate = mongoose.model('Rate', rateSchema);
const Log = mongoose.model('Log', logSchema);
const Worker = mongoose.model('Worker', workerSchema);
const Limit = mongoose.model('Limit', limitSchema);

// ==================== دوال الأسعار ====================
async function getRate() {
    let rate = await Rate.findOne({ id: 1 });
    if (!rate) rate = await Rate.create({ id: 1, vcash: 11, crypto: 0.185 });
    return { vcash: rate.vcash, crypto: rate.crypto };
}

async function setRate(method, value) {
    const update = method === 'vcash' ? { vcash: value } : { crypto: value };
    await Rate.findOneAndUpdate({ id: 1 }, update, { upsert: true });
}

// ==================== دوال العمال ====================
async function addWorker(workerId, channelId, vcashNumber, cryptoAddress) {
    const existing = await Worker.findOne({ workerId });
    if (existing) return { success: false, message: `❌ Worker already exists` };
    await Worker.create({ workerId, channelId, vcashNumber, cryptoAddress });
    return { success: true, message: `✅ Worker added successfully!` };
}

async function getWorkerByUserId(workerId) { return await Worker.findOne({ workerId }); }
async function getWorkerByChannelId(channelId) { return await Worker.findOne({ channelId }); }
async function getAllWorkers() { return await Worker.find().sort({ createdAt: -1 }); }

async function updateWorker(workerId, data) {
    await Worker.findOneAndUpdate({ workerId }, data);
    return { success: true, message: `✅ Worker updated successfully!` };
}

async function deleteWorker(workerId) {
    await Worker.deleteOne({ workerId });
    return { success: true, message: `✅ Worker deleted successfully!` };
}

// ==================== دوال السجلات ====================
async function saveLog(data) { await Log.create(data); }
async function updateLogStatus(orderId, status, processedBy) { await Log.findOneAndUpdate({ orderId }, { status, processedBy }); }
async function getLogsByUser(userId) { return await Log.find({ userId }).sort({ timestamp: -1 }); }
async function getAllLogs() { return await Log.find().sort({ timestamp: -1 }); }
async function getAllCashouts() { return await getAllLogs(); }
async function getCashoutsByUser(userId) { return await getLogsByUser(userId); }
async function getCashoutsByStatus(status) { return await Log.find({ status }).sort({ timestamp: -1 }); }
async function getCashoutsByUserAndStatus(userId, status) { return await Log.find({ userId, status }).sort({ timestamp: -1 }); }

async function getCashoutsStats() {
    const stats = await Log.aggregate([{ $group: { _id: null,
        totalTransactions: { $sum: 1 }, totalAmount: { $sum: '$amount' },
        totalWithFees: { $sum: '$total' },
        approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
    } }]);
    return stats[0] || { totalTransactions: 0, totalAmount: 0, totalWithFees: 0, approvedCount: 0, cancelledCount: 0, pendingCount: 0 };
}

async function getCashoutsStatsByUser(userId) {
    const stats = await Log.aggregate([{ $match: { userId } }, { $group: { _id: null,
        totalTransactions: { $sum: 1 }, totalAmount: { $sum: '$amount' },
        totalWithFees: { $sum: '$total' }
    } }]);
    return stats[0] || { totalTransactions: 0, totalAmount: 0, totalWithFees: 0 };
}

// ==================== دوال مسح التاريخ ====================
async function deleteHistory(userId) {
    if (userId === 'all') {
        const result = await Log.deleteMany({});
        return { success: true, message: `Deleted ${result.deletedCount} transactions` };
    } else {
        const result = await Log.deleteMany({ userId });
        return { success: true, message: `Deleted ${result.deletedCount} transactions` };
    }
}

// ==================== دوال الـ Limit ====================
async function getUserLimit(userId) {
    let limit = await Limit.findOne({ userId });
    if (!limit) limit = await Limit.create({ userId });
    if (limit.isLimited && limit.limitedUntil && new Date() >= limit.limitedUntil) {
        limit.totalAmount = 0; limit.isLimited = false; limit.limitedUntil = null;
        await limit.save();
    }
    return limit;
}

async function updateUserLimit(userId, amount) {
    const limit = await getUserLimit(userId);
    if (limit.isLimited) return { limited: true, totalAmount: limit.totalAmount };
    
    const newTotal = (limit.totalAmount || 0) + amount;
    if (newTotal > 2000) return { wouldExceed: true, remaining: 2000 - (limit.totalAmount || 0) };
    
    if (newTotal === 2000) {
        limit.totalAmount = newTotal; limit.isLimited = true;
        limit.limitedUntil = new Date(Date.now() + 28 * 60 * 60 * 1000);
        await limit.save();
        return { isLast: true, totalAmount: newTotal };
    }
    
    limit.totalAmount = newTotal; await limit.save();
    return { totalAmount: newTotal, remaining: 2000 - newTotal };
}

async function isUserLimited(userId) {
    const limit = await getUserLimit(userId);
    if (!limit.isLimited) return { limited: false };
    return { limited: true, limitedUntil: limit.limitedUntil, totalAmount: limit.totalAmount };
}

async function activateLimitAfterApproval(userId) {
    const limit = await getUserLimit(userId);
    if (limit.totalAmount >= 2000 && !limit.isLimited) {
        limit.isLimited = true;
        limit.limitedUntil = new Date(Date.now() + 28 * 60 * 60 * 1000);
        await limit.save();
        return { success: true };
    }
    return { success: false };
}

async function getRemainingTime(userId) {
    const limit = await Limit.findOne({ userId });
    if (!limit || !limit.limitedUntil) return null;
    const diff = limit.limitedUntil - Date.now();
    if (diff <= 0) return null;
    return { hours: Math.floor(diff / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000), until: limit.limitedUntil };
}

async function resetUserLimit(userId) {
    await Limit.findOneAndUpdate({ userId }, { totalAmount: 0, isLimited: false, limitedUntil: null, lastReset: new Date() }, { upsert: true });
    return { success: true };
}

module.exports = {
    initDatabase, getRate, setRate, addWorker, getWorkerByUserId, getWorkerByChannelId,
    getAllWorkers, updateWorker, deleteWorker, saveLog, updateLogStatus, getLogsByUser,
    getAllLogs, getAllCashouts, getCashoutsByUser, getCashoutsByStatus, getCashoutsByUserAndStatus,
    getCashoutsStats, getCashoutsStatsByUser, deleteHistory, getUserLimit, updateUserLimit,
    isUserLimited, activateLimitAfterApproval, getRemainingTime, resetUserLimit
};