// Cửa sổ 1 giờ, cho hỏi 2 lần. Lần 3 chặn 60', mỗi lần vượt thêm +15'.
const getDb = require("./mongo");

const WINDOW_SEC = 60 * 60;  // cửa sổ 1 giờ
const BASE_ALLOW = 2;        // cho phép 2 lần trong 1 giờ
const BASE_BLOCK_MIN = 60;   // lần thứ 3 → chặn 60 phút
const EXTRA_BLOCK_PER_HIT_MIN = 15; // mỗi lần vượt thêm +15 phút

function minutesLeft(sec) { return Math.ceil(sec / 60); }

let indexesReady = false;
async function ensureIndexes(db) {
    if (indexesReady) return;
    const events = db.collection("ask_events");
    const blocks = db.collection("ask_blocks");

    // ask_events: TTL 1 giờ trên field 'at' (mỗi lần hỏi là 1 event auto-expire sau 60')
    const eIdx = await events.indexes();
    if (!eIdx.find(i => i.name === "psid_at_1")) {
        await events.createIndex({ psid: 1, at: 1 }, { name: "psid_at_1" });
    }
    const ttlIdx = eIdx.find(i => i.name === "at_ttl_1h");
    if (!ttlIdx) {
        await events.createIndex({ at: 1 }, { name: "at_ttl_1h", expireAfterSeconds: WINDOW_SEC });
    } else if (ttlIdx.expireAfterSeconds !== WINDOW_SEC) {
        // Nếu cần đổi TTL (ít gặp), fallback: drop & recreate (tránh cần collMod)
        await events.dropIndex("at_ttl_1h");
        await events.createIndex({ at: 1 }, { name: "at_ttl_1h", expireAfterSeconds: WINDOW_SEC });
    }

    // ask_blocks: block đang hiệu lực
    const bIdx = await blocks.indexes();
    if (!bIdx.find(i => i.name === "psid_1")) {
        await blocks.createIndex({ psid: 1 }, { name: "psid_1", unique: true });
    }
    if (!bIdx.find(i => i.name === "until_1")) {
        await blocks.createIndex({ until: 1 }, { name: "until_1", expireAfterSeconds: 0 });
    }

    indexesReady = true;
}

/**
 * Logic:
 * 1) Nếu đang bị block (ask_blocks.until > now) → từ chối.
 * 2) Đếm số event trong 1 giờ gần nhất (countBefore).
 *    - Nếu countBefore >= 2 → block ngay:
 *        blockMin = 60 + 15 * (countBefore - 2)  // 3rd→60, 4th→75, 5th→90...
 *    - Ngược lại (0 hoặc 1) → cho phép và ghi 1 event {psid, at: now}.
 */
async function consumeAsk1h(psid) {
    const db = await getDb();
    await ensureIndexes(db);

    const now = new Date();
    const events = db.collection("ask_events");
    const blocks = db.collection("ask_blocks");

    // 1) Đang bị block?
    const blk = await blocks.findOne({ psid });
    if (blk && blk.until > now) {
        const blockedSec = Math.max(1, Math.ceil((blk.until - now) / 1000));
        return { allowed: false, blockedSec, remaining: 0, hits: null };
    }

    // 2) Đếm số lần hỏi trong 60' qua
    const since = new Date(now.getTime() - WINDOW_SEC * 1000);
    const countBefore = await events.countDocuments({ psid, at: { $gt: since } });

    if (countBefore >= BASE_ALLOW) {
        const extra = countBefore - BASE_ALLOW; // 2→0, 3→1, 4→2...
        const blockMin = BASE_BLOCK_MIN + EXTRA_BLOCK_PER_HIT_MIN * extra;
        const until = new Date(now.getTime() + blockMin * 60 * 1000);
        await blocks.updateOne({ psid }, { $set: { psid, until } }, { upsert: true });
        return { allowed: false, blockedSec: blockMin * 60, remaining: 0, hits: countBefore };
    }

    // 3) Cho phép: ghi event (auto-expire sau 1 giờ nhờ TTL)
    await events.insertOne({ psid, at: now });
    const hits = countBefore + 1;
    return { allowed: true, remaining: Math.max(0, BASE_ALLOW - hits), blockedSec: 0, hits };
}

module.exports = { consumeAsk1h, minutesLeft };
