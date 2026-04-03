const mongoose = require('mongoose');

let db;

async function initDatabase() {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cashbot';
    
    try {
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected successfully');
        
        await initDefaultData();
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        return false;
    }
}

async function initDefaultData() {
    try {
        const rateExists = await Rate.findOne({ id: 1 });
        if (!rateExists) {
            await Rate.create({ id: 1, vcash: 11, crypto: 0.185 });
            console.log('✅ Default rates created');
        }
    } catch (error) {
        console.error('initDefaultData error:', error);
    }
}

// ==================== Schemas ====================

const rateSchema = new mongoose.Schema({
    id: { type: Number, default: 1, unique: true },
    vcash: { type: Number, default: 11 },
    crypto: { type: Number, default: 0.185 }
});

const logSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    username: { type: String },
    channelId: { type: String },
    amount: { type: Number },
    method: { type: String },
    number: { type: String },
    rate: { type: Number },
    total: { type: Number },
    status: { type: String, default: 'pending' },
    processedBy: { type: String },
    isLast: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});

const workerSchema = new mongoose.Schema({
    workerId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    vcashNumber: { type: String, default: null },
    cryptoAddress: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const limitSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    totalAmount: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now },
    isLimited: { type: Boolean, default: false },
    limitedUntil: { type: Date, default: null }
});

// ==================== Models ====================
const Rate = mongoose.model('Rate', rateSchema);
const Log = mongoose.model('Log', logSchema);
const Worker = mongoose.model('Worker', workerSchema);
const Limit = mongoose.model('Limit', limitSchema);

// ==================== دوال الأسعار ====================
async function getRate() {
    try {
        let rate = await Rate.findOne({ id: 1 });
        if (!rate) {
            rate = await Rate.create({ id: 1, vcash: 11, crypto: 0.185 });
        }
        return { vcash: rate.vcash, crypto: rate.crypto };
    } catch (error) {
        console.error('getRate error:', error);
        return { vcash: 11, crypto: 0.185 };
    }
}

async function setRate(method, value) {
    try {
        const update = {};
        if (method === 'vcash') update.vcash = value;
        else if (method === 'crypto') update.crypto = value;
        
        await Rate.findOneAndUpdate({ id: 1 }, update, { upsert: true });
    } catch (error) {
        console.error('setRate error:', error);
    }
}

// ==================== دوال العمال ====================
async function addWorker(workerId, channelId, vcashNumber, cryptoAddress) {
    try {
        const existing = await Worker.findOne({ workerId });
        if (existing) {
            return { success: false, message: `❌ Worker <@${workerId}> already exists! Use /edit-data to update.` };
        }
        
        await Worker.create({
            workerId,
            channelId,
            vcashNumber: vcashNumber || null,
            cryptoAddress: cryptoAddress || null
        });
        
        return { success: true, message: `✅ Worker <@${workerId}> added successfully!\n📢 Channel: <#${channelId}>\n📱 V-Cash: ${vcashNumber || 'Not set'}\n🔐 Crypto: ${cryptoAddress || 'Not set'}` };
    } catch (error) {
        console.error('addWorker error:', error);
        return { success: false, message: `❌ Database error: ${error.message}` };
    }
}

async function getWorkerByUserId(workerId) {
    try {
        return await Worker.findOne({ workerId });
    } catch (error) {
        console.error('getWorkerByUserId error:', error);
        return null;
    }
}

async function getWorkerByChannelId(channelId) {
    try {
        return await Worker.findOne({ channelId });
    } catch (error) {
        console.error('getWorkerByChannelId error:', error);
        return null;
    }
}

async function getAllWorkers() {
    try {
        return await Worker.find().sort({ createdAt: -1 });
    } catch (error) {
        console.error('getAllWorkers error:', error);
        return [];
    }
}

async function updateWorker(workerId, data) {
    try {
        const existing = await Worker.findOne({ workerId });
        if (!existing) {
            return { success: false, message: `❌ Worker <@${workerId}> not found!` };
        }
        
        const updateData = {};
        if (data.channelId !== undefined && data.channelId !== '') updateData.channelId = data.channelId;
        if (data.vcashNumber !== undefined) updateData.vcashNumber = data.vcashNumber === '' ? null : data.vcashNumber;
        if (data.cryptoAddress !== undefined) updateData.cryptoAddress = data.cryptoAddress === '' ? null : data.cryptoAddress;
        
        if (Object.keys(updateData).length === 0) {
            return { success: false, message: 'No data to update' };
        }
        
        await Worker.findOneAndUpdate({ workerId }, updateData);
        return { success: true, message: `✅ Worker <@${workerId}> updated successfully!` };
    } catch (error) {
        console.error('updateWorker error:', error);
        return { success: false, message: `❌ Error: ${error.message}` };
    }
}

async function deleteWorker(workerId) {
    try {
        const existing = await Worker.findOne({ workerId });
        if (!existing) {
            return { success: false, message: `❌ Worker <@${workerId}> not found!` };
        }
        
        await Worker.deleteOne({ workerId });
        return { success: true, message: `✅ Worker <@${workerId}> deleted successfully!` };
    } catch (error) {
        console.error('deleteWorker error:', error);
        return { success: false, message: `❌ Error: ${error.message}` };
    }
}

// ==================== دوال السجلات ====================
async function saveLog(data) {
    try {
        await Log.create({
            orderId: data.orderId,
            userId: data.userId,
            username: data.username,
            channelId: data.channelId,
            amount: data.amount,
            method: data.method,
            number: data.number,
            rate: data.rate,
            total: data.total,
            status: data.status,
            isLast: data.isLast || false
        });
    } catch (error) {
        console.error('saveLog error:', error);
    }
}

async function updateLogStatus(orderId, status, processedBy) {
    try {
        await Log.findOneAndUpdate({ orderId }, { status, processedBy });
    } catch (error) {
        console.error('updateLogStatus error:', error);
    }
}

async function getLogsByUser(userId) {
    try {
        return await Log.find({ userId }).sort({ timestamp: -1 });
    } catch (error) {
        console.error('getLogsByUser error:', error);
        return [];
    }
}

async function getAllLogs() {
    try {
        return await Log.find().sort({ timestamp: -1 });
    } catch (error) {
        console.error('getAllLogs error:', error);
        return [];
    }
}

// ==================== دوال الإحصائيات ====================
async function getAllCashouts() {
    return await getAllLogs();
}

async function getCashoutsByUser(userId) {
    return await getLogsByUser(userId);
}

async function getCashoutsByStatus(status) {
    try {
        return await Log.find({ status }).sort({ timestamp: -1 });
    } catch (error) {
        console.error('getCashoutsByStatus error:', error);
        return [];
    }
}

async function getCashoutsByUserAndStatus(userId, status) {
    try {
        return await Log.find({ userId, status }).sort({ timestamp: -1 });
    } catch (error) {
        console.error('getCashoutsByUserAndStatus error:', error);
        return [];
    }
}

async function getCashoutsStats() {
    try {
        const stats = await Log.aggregate([
            {
                $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalWithFees: { $sum: '$total' },
                    approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                    cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                    pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    totalVCash: { $sum: { $cond: [{ $eq: ['$method', 'v-cash'] }, '$amount', 0] } },
                    totalCrypto: { $sum: { $cond: [{ $eq: ['$method', 'crypto'] }, '$amount', 0] } }
                }
            }
        ]);
        
        if (stats.length === 0) {
            return {
                totalTransactions: 0,
                totalAmount: 0,
                totalWithFees: 0,
                approvedCount: 0,
                cancelledCount: 0,
                pendingCount: 0,
                totalVCash: 0,
                totalCrypto: 0
            };
        }
        
        return stats[0];
    } catch (error) {
        console.error('getCashoutsStats error:', error);
        return {
            totalTransactions: 0,
            totalAmount: 0,
            totalWithFees: 0,
            approvedCount: 0,
            cancelledCount: 0,
            pendingCount: 0,
            totalVCash: 0,
            totalCrypto: 0
        };
    }
}

async function getCashoutsStatsByUser(userId) {
    try {
        const stats = await Log.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalWithFees: { $sum: '$total' },
                    approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                    cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                    pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    totalVCash: { $sum: { $cond: [{ $eq: ['$method', 'v-cash'] }, '$amount', 0] } },
                    totalCrypto: { $sum: { $cond: [{ $eq: ['$method', 'crypto'] }, '$amount', 0] } }
                }
            }
        ]);
        
        if (stats.length === 0) {
            return {
                totalTransactions: 0,
                totalAmount: 0,
                totalWithFees: 0,
                approvedCount: 0,
                cancelledCount: 0,
                pendingCount: 0,
                totalVCash: 0,
                totalCrypto: 0
            };
        }
        
        return stats[0];
    } catch (error) {
        console.error('getCashoutsStatsByUser error:', error);
        return {
            totalTransactions: 0,
            totalAmount: 0,
            totalWithFees: 0,
            approvedCount: 0,
            cancelledCount: 0,
            pendingCount: 0,
            totalVCash: 0,
            totalCrypto: 0
        };
    }
}

// ==================== دوال مسح التاريخ ====================
async function deleteHistory(userId) {
    try {
        let result;
        if (userId === 'all') {
            result = await Log.deleteMany({});
            return { 
                success: true, 
                message: `Deleted ${result.deletedCount} transaction(s) from ALL users.` 
            };
        } else {
            result = await Log.deleteMany({ userId });
            return { 
                success: true, 
                message: `Deleted ${result.deletedCount} transaction(s) for user <@${userId}>.` 
            };
        }
    } catch (error) {
        console.error('deleteHistory error:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function getUserHistoryCount(userId) {
    try {
        return await Log.countDocuments({ userId });
    } catch (error) {
        console.error('getUserHistoryCount error:', error);
        return 0;
    }
}

async function getTotalHistoryCount() {
    try {
        return await Log.countDocuments();
    } catch (error) {
        console.error('getTotalHistoryCount error:', error);
        return 0;
    }
}

// ==================== دوال الـ Limit ====================
async function getUserLimit(userId) {
    try {
        let limit = await Limit.findOne({ userId });
        if (!limit) {
            limit = await Limit.create({
                userId,
                totalAmount: 0,
                lastReset: new Date(),
                isLimited: false,
                limitedUntil: null
            });
        }
        
        if (limit.isLimited && limit.limitedUntil) {
            const now = new Date();
            if (now >= limit.limitedUntil) {
                limit.totalAmount = 0;
                limit.isLimited = false;
                limit.limitedUntil = null;
                limit.lastReset = new Date();
                await limit.save();
            }
        }
        
        return limit;
    } catch (error) {
        console.error('getUserLimit error:', error);
        return { totalAmount: 0, isLimited: false, limitedUntil: null };
    }
}

async function updateUserLimit(userId, amount) {
    try {
        let limit = await getUserLimit(userId);
        
        if (limit.isLimited) {
            return { success: false, message: 'User is currently limited', limited: true, totalAmount: limit.totalAmount };
        }
        
        const currentTotal = limit.totalAmount || 0;
        const newTotal = currentTotal + amount;
        
        if (newTotal > 2000) {
            return { 
                success: false, 
                message: `This withdrawal would exceed the limit! You have ${2000 - currentTotal} remaining.`,
                wouldExceed: true,
                remaining: 2000 - currentTotal,
                totalAmount: currentTotal
            };
        }
        
        if (newTotal === 2000) {
            const limitedUntil = new Date();
            limitedUntil.setTime(limitedUntil.getTime() + (28 * 60 * 60 * 1000));
            
            limit.totalAmount = newTotal;
            limit.lastReset = new Date();
            limit.isLimited = true;
            limit.limitedUntil = limitedUntil;
            await limit.save();
            
            return { 
                success: true, 
                message: `Last withdrawal! Total: ${newTotal}/2000. You are now limited for 28 hours.`,
                totalAmount: newTotal,
                remaining: 0,
                isLast: true,
                limitedUntil: limitedUntil
            };
        }
        
        limit.totalAmount = newTotal;
        limit.lastReset = new Date();
        await limit.save();
        
        return { 
            success: true, 
            message: `Added ${amount} to limit. Total: ${newTotal}/2000`,
            totalAmount: newTotal,
            remaining: 2000 - newTotal,
            isLast: false
        };
    } catch (error) {
        console.error('updateUserLimit error:', error);
        return { success: false, message: error.message };
    }
}

async function isUserLimited(userId) {
    try {
        const limit = await getUserLimit(userId);
        
        if (!limit.isLimited) return { limited: false };
        
        if (limit.limitedUntil) {
            const now = new Date();
            if (now >= limit.limitedUntil) {
                limit.totalAmount = 0;
                limit.isLimited = false;
                limit.limitedUntil = null;
                limit.lastReset = new Date();
                await limit.save();
                return { limited: false };
            }
            
            const remainingTime = await getRemainingTime(userId);
            return { 
                limited: true, 
                limitedUntil: limit.limitedUntil,
                remainingTime: remainingTime,
                totalAmount: limit.totalAmount
            };
        }
        
        return { limited: true, totalAmount: limit.totalAmount };
    } catch (error) {
        console.error('isUserLimited error:', error);
        return { limited: false };
    }
}

async function activateLimitAfterApproval(userId) {
    try {
        const limit = await getUserLimit(userId);
        
        if (limit.totalAmount >= 2000 && !limit.isLimited) {
            const limitedUntil = new Date();
            limitedUntil.setTime(limitedUntil.getTime() + (28 * 60 * 60 * 1000));
            
            limit.isLimited = true;
            limit.limitedUntil = limitedUntil;
            await limit.save();
            
            return { success: true, message: 'Limit activated for 28 hours', limitedUntil };
        }
        
        return { success: false, message: 'Limit not reached yet' };
    } catch (error) {
        console.error('activateLimitAfterApproval error:', error);
        return { success: false, message: error.message };
    }
}

async function getRemainingTime(userId) {
    try {
        const limit = await Limit.findOne({ userId });
        if (!limit || !limit.limitedUntil) return null;
        
        const now = new Date();
        const limitedUntil = new Date(limit.limitedUntil);
        
        if (now >= limitedUntil) return null;
        
        const diffMs = limitedUntil - now;
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
            totalSeconds: totalSeconds,
            until: limitedUntil
        };
    } catch (error) {
        console.error('getRemainingTime error:', error);
        return null;
    }
}

async function resetUserLimit(userId) {
    try {
        await Limit.findOneAndUpdate(
            { userId },
            { totalAmount: 0, isLimited: false, limitedUntil: null, lastReset: new Date() },
            { upsert: true }
        );
        return { success: true, message: `Limit reset for user <@${userId}>` };
    } catch (error) {
        console.error('resetUserLimit error:', error);
        return { success: false, message: error.message };
    }
}

async function isLimitExpired(userId) {
    try {
        const limit = await Limit.findOne({ userId });
        if (!limit || !limit.limitedUntil) return true;
        
        const now = new Date();
        return now >= limit.limitedUntil;
    } catch (error) {
        console.error('isLimitExpired error:', error);
        return true;
    }
}

// ==================== الصادرات ====================
module.exports = {
    initDatabase,
    getRate,
    setRate,
    addWorker,
    getWorkerByUserId,
    getWorkerByChannelId,
    getAllWorkers,
    updateWorker,
    deleteWorker,
    saveLog,
    updateLogStatus,
    getLogsByUser,
    getAllLogs,
    getAllCashouts,
    getCashoutsByUser,
    getCashoutsByStatus,
    getCashoutsByUserAndStatus,
    getCashoutsStats,
    getCashoutsStatsByUser,
    deleteHistory,
    getUserHistoryCount,
    getTotalHistoryCount,
    getUserLimit,
    updateUserLimit,
    isUserLimited,
    activateLimitAfterApproval,
    getRemainingTime,
    resetUserLimit,
    isLimitExpired
};