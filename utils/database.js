const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDatabase() {
    try {
        const dbPath = path.join(__dirname, '..', 'database.db');
        
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // جدول الأسعار
        await db.exec(`
            CREATE TABLE IF NOT EXISTS rates (
                id INTEGER PRIMARY KEY,
                vcash REAL DEFAULT 11,
                crypto REAL DEFAULT 0.185
            )
        `);

        // جدول سجل العمليات
        await db.exec(`
            CREATE TABLE IF NOT EXISTS logs (
                orderId TEXT PRIMARY KEY,
                userId TEXT,
                username TEXT,
                channelId TEXT,
                amount INTEGER,
                method TEXT,
                number TEXT,
                rate REAL,
                total REAL,
                status TEXT,
                processedBy TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // إضافة عمود isLast إذا لم يكن موجود
        try {
            const tableInfo = await db.all(`PRAGMA table_info(logs)`);
            const hasIsLastColumn = tableInfo.some(col => col.name === 'isLast');
            
            if (!hasIsLastColumn) {
                await db.exec(`ALTER TABLE logs ADD COLUMN isLast BOOLEAN DEFAULT 0`);
                console.log('✅ Added isLast column to logs table');
            }
        } catch (err) {
            console.log('⚠️ Could not add isLast column:', err.message);
        }

        // جدول بيانات الـ Workers
        await db.exec(`
            CREATE TABLE IF NOT EXISTS workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workerId TEXT UNIQUE,
                channelId TEXT,
                vcashNumber TEXT,
                cryptoAddress TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // جدول الـ Limits
        await db.exec(`
            CREATE TABLE IF NOT EXISTS limits (
                userId TEXT PRIMARY KEY,
                totalAmount INTEGER DEFAULT 0,
                lastReset TIMESTAMP,
                isLimited BOOLEAN DEFAULT 0,
                limitedUntil TIMESTAMP
            )
        `);

        const check = await db.get('SELECT COUNT(*) as count FROM rates');
        if (check.count === 0) {
            await db.run('INSERT INTO rates (vcash, crypto) VALUES (11, 0.185)');
        }

        console.log('✅ Database initialized successfully');
        return true;
    } catch (error) {
        console.error('Database error:', error);
        return false;
    }
}

// ==================== دوال الأسعار ====================
async function getRate() {
    try {
        return await db.get('SELECT vcash, crypto FROM rates LIMIT 1');
    } catch (error) {
        console.error('getRate error:', error);
        return { vcash: 11, crypto: 0.185 };
    }
}

async function setRate(method, value) {
    try {
        if (method === 'vcash') {
            await db.run('UPDATE rates SET vcash = ?', value);
        } else if (method === 'crypto') {
            await db.run('UPDATE rates SET crypto = ?', value);
        }
    } catch (error) {
        console.error('setRate error:', error);
    }
}

// ==================== دوال الـ Workers ====================
async function addWorker(workerId, channelId, vcashNumber, cryptoAddress) {
    try {
        const existing = await db.get('SELECT * FROM workers WHERE workerId = ?', workerId);
        if (existing) {
            return { success: false, message: `❌ Worker <@${workerId}> already exists! Use /edit-data to update.` };
        }
        
        await db.run(
            'INSERT INTO workers (workerId, channelId, vcashNumber, cryptoAddress) VALUES (?, ?, ?, ?)',
            workerId, channelId, vcashNumber || null, cryptoAddress || null
        );
        return { success: true, message: `✅ Worker <@${workerId}> added successfully!\n📢 Channel: <#${channelId}>\n📱 V-Cash: ${vcashNumber || 'Not set'}\n🔐 Crypto: ${cryptoAddress || 'Not set'}` };
    } catch (error) {
        console.error('addWorker error:', error);
        return { success: false, message: `❌ Database error: ${error.message}` };
    }
}

async function getWorkerByUserId(workerId) {
    try {
        return await db.get('SELECT * FROM workers WHERE workerId = ?', workerId);
    } catch (error) {
        console.error('getWorkerByUserId error:', error);
        return null;
    }
}

async function getWorkerByChannelId(channelId) {
    try {
        return await db.get('SELECT * FROM workers WHERE channelId = ?', channelId);
    } catch (error) {
        console.error('getWorkerByChannelId error:', error);
        return null;
    }
}

async function getAllWorkers() {
    try {
        return await db.all('SELECT * FROM workers ORDER BY createdAt DESC');
    } catch (error) {
        console.error('getAllWorkers error:', error);
        return [];
    }
}

async function updateWorker(workerId, data) {
    try {
        const existing = await db.get('SELECT * FROM workers WHERE workerId = ?', workerId);
        if (!existing) {
            return { success: false, message: `❌ Worker <@${workerId}> not found!` };
        }
        
        const updates = [];
        const values = [];
        
        if (data.channelId !== undefined && data.channelId !== '') {
            updates.push('channelId = ?');
            values.push(data.channelId);
        }
        if (data.vcashNumber !== undefined) {
            updates.push('vcashNumber = ?');
            values.push(data.vcashNumber === '' ? null : data.vcashNumber);
        }
        if (data.cryptoAddress !== undefined) {
            updates.push('cryptoAddress = ?');
            values.push(data.cryptoAddress === '' ? null : data.cryptoAddress);
        }
        
        if (updates.length === 0) {
            return { success: false, message: 'No data to update' };
        }
        
        values.push(workerId);
        await db.run(`UPDATE workers SET ${updates.join(', ')} WHERE workerId = ?`, values);
        return { success: true, message: `✅ Worker <@${workerId}> updated successfully!` };
    } catch (error) {
        console.error('updateWorker error:', error);
        return { success: false, message: `❌ Error: ${error.message}` };
    }
}

async function deleteWorker(workerId) {
    try {
        const existing = await db.get('SELECT * FROM workers WHERE workerId = ?', workerId);
        if (!existing) {
            return { success: false, message: `❌ Worker <@${workerId}> not found!` };
        }
        
        await db.run('DELETE FROM workers WHERE workerId = ?', workerId);
        return { success: true, message: `✅ Worker <@${workerId}> deleted successfully!` };
    } catch (error) {
        console.error('deleteWorker error:', error);
        return { success: false, message: `❌ Error: ${error.message}` };
    }
}

// ==================== دوال اللوجات ====================
async function saveLog(data) {
    try {
        await db.run(`
            INSERT INTO logs (orderId, userId, username, channelId, amount, method, number, rate, total, status, isLast)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, data.orderId, data.userId, data.username, data.channelId, data.amount, data.method, data.number, data.rate, data.total, data.status, data.isLast ? 1 : 0);
    } catch (error) {
        console.error('saveLog error:', error);
    }
}

async function updateLogStatus(orderId, status, processedBy) {
    try {
        await db.run('UPDATE logs SET status = ?, processedBy = ? WHERE orderId = ?', status, processedBy, orderId);
    } catch (error) {
        console.error('updateLogStatus error:', error);
    }
}

async function getLogsByUser(userId) {
    try {
        return await db.all('SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC', userId);
    } catch (error) {
        console.error('getLogsByUser error:', error);
        return [];
    }
}

async function getAllLogs() {
    try {
        return await db.all('SELECT * FROM logs ORDER BY timestamp DESC');
    } catch (error) {
        console.error('getAllLogs error:', error);
        return [];
    }
}

// ==================== دوال الإحصائيات والتقارير ====================
async function getAllCashouts() {
    try {
        return await db.all('SELECT * FROM logs ORDER BY timestamp DESC');
    } catch (error) {
        console.error('getAllCashouts error:', error);
        return [];
    }
}

async function getCashoutsByUser(userId) {
    try {
        return await db.all('SELECT * FROM logs WHERE userId = ? ORDER BY timestamp DESC', userId);
    } catch (error) {
        console.error('getCashoutsByUser error:', error);
        return [];
    }
}

async function getCashoutsByStatus(status) {
    try {
        return await db.all('SELECT * FROM logs WHERE status = ? ORDER BY timestamp DESC', status);
    } catch (error) {
        console.error('getCashoutsByStatus error:', error);
        return [];
    }
}

async function getCashoutsByUserAndStatus(userId, status) {
    try {
        return await db.all(
            'SELECT * FROM logs WHERE userId = ? AND status = ? ORDER BY timestamp DESC',
            userId, status
        );
    } catch (error) {
        console.error('getCashoutsByUserAndStatus error:', error);
        return [];
    }
}

async function getCashoutsStats() {
    try {
        const stats = await db.get(`
            SELECT 
                COUNT(*) as totalTransactions,
                SUM(amount) as totalAmount,
                SUM(total) as totalWithFees,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approvedCount,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledCount,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount,
                SUM(CASE WHEN method = 'v-cash' THEN amount ELSE 0 END) as totalVCash,
                SUM(CASE WHEN method = 'crypto' THEN amount ELSE 0 END) as totalCrypto
            FROM logs
        `);
        return stats;
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
        const stats = await db.get(`
            SELECT 
                COUNT(*) as totalTransactions,
                SUM(amount) as totalAmount,
                SUM(total) as totalWithFees,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approvedCount,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledCount,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount,
                SUM(CASE WHEN method = 'v-cash' THEN amount ELSE 0 END) as totalVCash,
                SUM(CASE WHEN method = 'crypto' THEN amount ELSE 0 END) as totalCrypto
            FROM logs
            WHERE userId = ?
        `, userId);
        return stats;
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
        if (userId === 'all') {
            const result = await db.run('DELETE FROM logs');
            return { 
                success: true, 
                message: `Deleted ${result.changes} transaction(s) from ALL users.` 
            };
        } else {
            const result = await db.run('DELETE FROM logs WHERE userId = ?', userId);
            return { 
                success: true, 
                message: `Deleted ${result.changes} transaction(s) for user <@${userId}>.` 
            };
        }
    } catch (error) {
        console.error('deleteHistory error:', error);
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function getUserHistoryCount(userId) {
    try {
        const result = await db.get('SELECT COUNT(*) as count FROM logs WHERE userId = ?', userId);
        return result ? result.count : 0;
    } catch (error) {
        console.error('getUserHistoryCount error:', error);
        return 0;
    }
}

async function getTotalHistoryCount() {
    try {
        const result = await db.get('SELECT COUNT(*) as count FROM logs');
        return result ? result.count : 0;
    } catch (error) {
        console.error('getTotalHistoryCount error:', error);
        return 0;
    }
}

// ==================== دوال الـ Limit ====================
async function getUserLimit(userId) {
    try {
        let limit = await db.get('SELECT * FROM limits WHERE userId = ?', userId);
        if (!limit) {
            await db.run('INSERT INTO limits (userId, totalAmount, lastReset, isLimited, limitedUntil) VALUES (?, 0, datetime("now"), 0, NULL)', userId);
            limit = await db.get('SELECT * FROM limits WHERE userId = ?', userId);
        }
        
        if (limit.isLimited && limit.limitedUntil) {
            const now = new Date();
            const limitedUntil = new Date(limit.limitedUntil);
            if (now >= limitedUntil) {
                await db.run('UPDATE limits SET totalAmount = 0, isLimited = 0, limitedUntil = NULL, lastReset = datetime("now") WHERE userId = ?', userId);
                limit.isLimited = 0;
                limit.totalAmount = 0;
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
        const limit = await getUserLimit(userId);
        
        if (limit.isLimited) {
            return { success: false, message: 'User is currently limited', limited: true, totalAmount: limit.totalAmount };
        }
        
        const currentTotal = limit.totalAmount || 0;
        const newTotal = currentTotal + amount;
        
        // إذا كان المجموع الجديد أكبر من 2000
        if (newTotal > 2000) {
            return { 
                success: false, 
                message: `This withdrawal would exceed the limit! You have ${2000 - currentTotal} remaining.`,
                wouldExceed: true,
                remaining: 2000 - currentTotal,
                totalAmount: currentTotal
            };
        }
        
        // إذا كان المجموع الجديد يساوي 2000 بالضبط (آخر عملية)
        if (newTotal === 2000) {
            // حساب وقت انتهاء الـ Limit (28 ساعة بالضبط من الآن)
            const limitedUntil = new Date();
            limitedUntil.setTime(limitedUntil.getTime() + (28 * 60 * 60 * 1000));
            
            await db.run(`
                UPDATE limits 
                SET totalAmount = ?, 
                    lastReset = datetime("now"),
                    isLimited = 1,
                    limitedUntil = ?
                WHERE userId = ?
            `, newTotal, limitedUntil.toISOString(), userId);
            
            console.log(`✅ User ${userId} reached 2000 limit, limited until ${limitedUntil.toISOString()}`);
            
            return { 
                success: true, 
                message: `Last withdrawal! Total: ${newTotal}/2000. You are now limited for 28 hours.`,
                totalAmount: newTotal,
                remaining: 0,
                isLast: true,
                limitedUntil: limitedUntil
            };
        }
        
        // أقل من 2000 (عادي)
        await db.run(`
            UPDATE limits 
            SET totalAmount = ?, lastReset = datetime("now") 
            WHERE userId = ?
        `, newTotal, userId);
        
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
            const limitedUntil = new Date(limit.limitedUntil);
            
            if (now >= limitedUntil) {
                await db.run(`
                    UPDATE limits 
                    SET totalAmount = 0, 
                        isLimited = 0, 
                        limitedUntil = NULL, 
                        lastReset = datetime("now") 
                    WHERE userId = ?
                `, userId);
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
            // 28 ساعة بالضبط من الآن
            const limitedUntil = new Date();
            limitedUntil.setTime(limitedUntil.getTime() + (28 * 60 * 60 * 1000));
            
            await db.run(`
                UPDATE limits 
                SET isLimited = 1, limitedUntil = ? 
                WHERE userId = ?
            `, limitedUntil.toISOString(), userId);
            
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
        const limit = await db.get('SELECT limitedUntil FROM limits WHERE userId = ?', userId);
        if (!limit || !limit.limitedUntil) return null;
        
        const now = new Date();
        const limitedUntil = new Date(limit.limitedUntil);
        
        if (now >= limitedUntil) return null;
        
        // حساب الفرق بالمللي ثانية
        const diffMs = limitedUntil - now;
        
        // تحويل إلى ساعات ودقائق وثواني
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
        await db.run('UPDATE limits SET totalAmount = 0, isLimited = 0, limitedUntil = NULL, lastReset = datetime("now") WHERE userId = ?', userId);
        return { success: true, message: `Limit reset for user <@${userId}>` };
    } catch (error) {
        console.error('resetUserLimit error:', error);
        return { success: false, message: error.message };
    }
}

async function isLimitExpired(userId) {
    try {
        const limit = await db.get('SELECT limitedUntil FROM limits WHERE userId = ?', userId);
        if (!limit || !limit.limitedUntil) return true;
        
        const now = new Date();
        const limitedUntil = new Date(limit.limitedUntil);
        
        return now >= limitedUntil;
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