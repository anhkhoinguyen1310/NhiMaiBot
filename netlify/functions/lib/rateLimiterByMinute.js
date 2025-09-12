// Cửa sổ 1 giờ, cho hỏi 2 lần. Lần 3 chặn 60', mỗi lần vượt thêm +15'.
const getDb = require("./mongo");

const WINDOW_SEC = 60 * 60;  // cửa sổ 1 giờ
const BASE_ALLOW = 5;        // cho phép 2 lần trong 1 giờ
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
async function consumeAsk1hByMinutes(psid) {
    const db = await getDb();
    await ensureIndexes(db);

    const now = new Date();
    const events = db.collection("ask_events");
    const blocks = db.collection("ask_blocks");

    // luôn ghi event để cửa sổ 1h chính xác (TTL 1h sẽ tự xoá)
    await events.insertOne({ psid, at: now });

    const since = new Date(now.getTime() - WINDOW_SEC * 1000);
    const hitsLastHour = await events.countDocuments({ psid, at: { $gt: since } });

    // đang bị block?
    const blk = await blocks.findOne({ psid });
    const currentlyBlocked = Boolean(blk && blk.until > now);

    if (currentlyBlocked) {
        // >>> CỘNG VÀO "THỜI GIAN CÒN LẠI" <<<
        const remainingSecBefore =
            Math.max(0, Math.ceil((blk.until.getTime() - now.getTime()) / 1000));
        const bumpedSec = remainingSecBefore + EXTRA_BLOCK_PER_HIT_MIN * 60;

        const finalUntil = new Date(now.getTime() + bumpedSec * 1000);
        await blocks.updateOne(
            { psid },
            { $set: { psid, until: finalUntil } },
            { upsert: true }
        );

        console.log("bump-block", {
            psid,
            remainingBeforeMin: Math.ceil(remainingSecBefore / 60),
            afterMin: Math.ceil(bumpedSec / 60),
            hits: hitsLastHour,
        });

        return {
            allowed: false,
            blockedSec: bumpedSec,
            remaining: 0,
            hits: hitsLastHour,
        };
    }

    // chưa bị block: lần thứ 3 trong 1h → chặn 60'
    if (hitsLastHour > BASE_ALLOW) {
        const until = new Date(now.getTime() + BASE_BLOCK_MIN * 60 * 1000);
        await blocks.updateOne({ psid }, { $set: { psid, until } }, { upsert: true });

        return {
            allowed: false,
            blockedSec: Math.ceil((until - now) / 1000),
            remaining: 0,
            hits: hitsLastHour,
        };
    }

    // cho phép (0 hoặc 1 lần trước đó)
    return {
        allowed: true,
        remaining: Math.max(0, BASE_ALLOW - hitsLastHour),
        blockedSec: 0,
        hits: hitsLastHour,
    };
}

module.exports = { consumeAsk1hByMinutes, minutesLeft };
