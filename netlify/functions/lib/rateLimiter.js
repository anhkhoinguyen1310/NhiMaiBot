// lib/askLimiterAtlas.js
const getDb = require("./mongo");

const ALLOWED = 2;             // allow 2 asks
const BLOCK_SEC = 30 * 60;     // block 30 minutes
const COUNT_TTL_SEC = 7 * 24 * 60 * 60; // auto-clean counts after 7 days

function minutesLeft(sec) { return Math.ceil(sec / 60); }

async function ensureIndexes(db) {
    const counts = db.collection("ask_counts");
    const blocks = db.collection("ask_blocks");
    await counts.createIndex({ psid: 1 }, { unique: true });
    await counts.createIndex({ updatedAt: 1 }, { expireAfterSeconds: COUNT_TTL_SEC });
    await blocks.createIndex({ psid: 1 }, { unique: true });
    // TTL by 'until' – document disappears when time passes (TTL check runs ~every 60s)
    await blocks.createIndex({ until: 1 }, { expireAfterSeconds: 0 });
}

async function consumeAsk(psid) {
    const db = await getDb();
    await ensureIndexes(db);

    const counts = db.collection("ask_counts");
    const blocks = db.collection("ask_blocks");
    const now = new Date();

    // 1) is blocked?
    const blk = await blocks.findOne({ psid });
    if (blk && blk.until > now) {
        const blockedSec = Math.max(1, Math.ceil((blk.until - now) / 1000));
        return { allowed: false, blockedSec, remaining: 0 };
    }

    // 2) increment count atomically
    const rec = await counts.findOneAndUpdate(
        { psid },
        [
            {
                $set: {
                    count: { $add: [{ $ifNull: ["$count", 0] }, 1] },
                    updatedAt: now
                }
            }
        ],
        { upsert: true, returnDocument: "after" }
    );
    const count = rec.value?.count ?? 1;
    console.log("consumeAsk:", psid, "count=", count);

    // 3) over the limit → create block & reset count
    if (count > ALLOWED) {
        const until = new Date(Date.now() + BLOCK_SEC * 1000);
        await blocks.updateOne({ psid }, { $set: { psid, until } }, { upsert: true });
        await counts.updateOne({ psid }, { $set: { count: 0, updatedAt: now } });
        return { allowed: false, blockedSec: BLOCK_SEC, remaining: 0 };
    }

    return { allowed: true, remaining: ALLOWED - count, blockedSec: 0 };
}

module.exports = { consumeAsk, minutesLeft };
