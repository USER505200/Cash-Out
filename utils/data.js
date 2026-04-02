const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDataDatabase() {
    try {
        const dbPath = path.join(__dirname, '..', 'workers.db');
        
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT UNIQUE,
                username TEXT,
                channelId TEXT,
                vcashNumber TEXT,
                cryptoAddress TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                createdBy TEXT
            )
        `);

        console.log('✅ Workers database initialized');
        return true;
    } catch (error) {
        console.error('Workers database error:', error);
        return false;
    }
}

async function addWorkerData(userId, username, channelId, vcashNumber, cryptoAddress, createdBy) {
    try {
        const existing = await db.get('SELECT * FROM workers WHERE userId = ?', userId);
        if (existing) {
            return { success: false, message: `❌ Worker <@${userId}> already exists!` };
        }
        
        await db.run(
            `INSERT INTO workers (userId, username, channelId, vcashNumber, cryptoAddress, createdBy) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            userId, username, channelId, vcashNumber || null, cryptoAddress || null, createdBy
        );
        
        const newWorker = await db.get('SELECT * FROM workers WHERE userId = ?', userId);
        return { success: true, message: `✅ Worker <@${userId}> added successfully!`, data: newWorker };
    } catch (error) {
        console.error('addWorkerData error:', error);
        return { success: false, message: `❌ Database error: ${error.message}` };
    }
}

async function getWorkerData(userId) {
    try {
        return await db.get('SELECT * FROM workers WHERE userId = ?', userId);
    } catch (error) {
        console.error('getWorkerData error:', error);
        return null;
    }
}

async function getWorkerByChannel(channelId) {
    try {
        return await db.get('SELECT * FROM workers WHERE channelId = ?', channelId);
    } catch (error) {
        console.error('getWorkerByChannel error:', error);
        return null;
    }
}

async function getAllWorkersData() {
    try {
        return await db.all('SELECT * FROM workers ORDER BY createdAt DESC');
    } catch (error) {
        console.error('getAllWorkersData error:', error);
        return [];
    }
}

async function updateWorkerData(userId, data) {
    try {
        const existing = await db.get('SELECT * FROM workers WHERE userId = ?', userId);
        if (!existing) {
            return { success: false, message: `❌ Worker <@${userId}> not found!` };
        }
        
        const updates = [];
        const values = [];
        
        if (data.channelId !== undefined) {
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
        if (data.username !== undefined) {
            updates.push('username = ?');
            values.push(data.username);
        }
        
        if (updates.length === 0) {
            return { success: false, message: 'No data to update' };
        }
        
        values.push(userId);
        await db.run(`UPDATE workers SET ${updates.join(', ')} WHERE userId = ?`, values);
        return { success: true, message: `✅ Worker <@${userId}> updated successfully!` };
    } catch (error) {
        console.error('updateWorkerData error:', error);
        return { success: false, message: `❌ Error: ${error.message}` };
    }
}

async function deleteWorkerData(userId) {
    try {
        const existing = await db.get('SELECT * FROM workers WHERE userId = ?', userId);
        if (!existing) {
            return { success: false, message: `❌ Worker <@${userId}> not found!` };
        }
        
        await db.run('DELETE FROM workers WHERE userId = ?', userId);
        return { success: true, message: `✅ Worker <@${userId}> deleted successfully!` };
    } catch (error) {
        console.error('deleteWorkerData error:', error);
        return { success: false, message: `❌ Error: ${error.message}` };
    }
}

async function getWorkersCount() {
    try {
        const result = await db.get('SELECT COUNT(*) as count FROM workers');
        return result ? result.count : 0;
    } catch (error) {
        console.error('getWorkersCount error:', error);
        return 0;
    }
}

module.exports = {
    initDataDatabase,
    addWorkerData,
    getWorkerData,
    getWorkerByChannel,
    getAllWorkersData,
    updateWorkerData,
    deleteWorkerData,
    getWorkersCount
};