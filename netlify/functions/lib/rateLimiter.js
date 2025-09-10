// lib/rateLimiter.js (Atlas)
const getDb = require("./mongo");

const ALLOWED = 2;               // you set 2
const BLOCK_SEC = 60 * 60;
const COUNT_TTL_SEC = 2 * 60 * 60; // keep count for 2 hours

function minutesLeft(sec) { return Math.ceil(sec / 60); }

let indexesReady = false;
async function ensureIndexes(db) {
    if (indexesReady) return;
    const counts = db.collection("ask_counts");
    const blocks = db.collection("ask_blocks");
    await counts.createIndex({ psid: 1 }, { unique: true });
    await counts.createIndex({ updatedAt: 1 }, { expireAfterSeconds: COUNT_TTL_SEC });
    await blocks.createIndex({ psid: 1 }, { unique: true });
    await blocks.createIndex({ until: 1 }, { expireAfterSeconds: 0 });
    indexesReady = true;
}

async function consumeAsk(psid) {
    const db = await getDb();
    await ensureIndexes(db);

    const counts = db.collection("ask_counts");
    const blocks = db.collection("ask_blocks");
    const now = new Date();

    // 1) already blocked?
    const blk = await blocks.findOne({ psid });
    if (blk && blk.until > now) {
        const blockedSec = Math.max(1, Math.ceil((blk.until - now) / 1000));
        return { allowed: false, blockedSec, remaining: 0 };
    }

    // 2) atomic increment
    const r = await counts.findOneAndUpdate(
        { psid },
        { $inc: { count: 1 }, $set: { updatedAt: now } },  // <- $inc only
        { upsert: true, returnDocument: "after" }
    );

    // Some server/driver combos can return value=null on upsert/race → re-read
    let count = r.value?.count;
    if (typeof count !== "number") {
        const doc = await counts.findOne({ psid }, { projection: { count: 1 } });
        count = doc?.count ?? 0;
    }

    // 3) over limit → create a block + reset counter
    if (count > ALLOWED) {
        const until = new Date(now.getTime() + BLOCK_SEC * 1000);
        await blocks.updateOne({ psid }, { $set: { psid, until } }, { upsert: true });
        await counts.updateOne({ psid }, { $set: { count: 0, updatedAt: now } });
        return { allowed: false, blockedSec: BLOCK_SEC, remaining: 0 };
    }

    return { allowed: true, remaining: Math.max(0, ALLOWED - count), blockedSec: 0 };
}

module.exports = { consumeAsk, minutesLeft };
