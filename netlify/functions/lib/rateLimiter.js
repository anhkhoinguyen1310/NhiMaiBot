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

    // Đếm trong cửa sổ 60'
    const since = new Date(now.getTime() - WINDOW_SEC * 1000);
    const countBefore = await events.countDocuments({ psid, at: { $gt: since } });
    const hitsAfter = countBefore + 1;

    // Luôn ghi lại lần hỏi (kể cả đang block) để escalations hoạt động
    await events.insertOne({ psid, at: now });

    // (A) Tính thời gian block cần có cho tổng số lần hitsAfter
    //     3rd -> 60, 4th -> 75, 5th -> 90 ...
    let blockMinCandidate = 0;
    if (hitsAfter > BASE_ALLOW) {
        blockMinCandidate = BASE_BLOCK_MIN + EXTRA_BLOCK_PER_HIT_MIN * Math.max(0, (hitsAfter - BASE_ALLOW - 1));
    }

    // (B) Xem hiện đang bị block không
    const blk = await blocks.findOne({ psid });
    const currentlyBlocked = Boolean(blk && blk.until > now);

    // (C) Nếu chưa tới ngưỡng và cũng không bị block => CHO PHÉP
    if (!currentlyBlocked && hitsAfter <= BASE_ALLOW) {
        return {
            allowed: true,
            remaining: Math.max(0, BASE_ALLOW - hitsAfter),
            blockedSec: 0,
            hits: hitsAfter
        };
    }

    // (D) Nếu cần block (vì vượt ngưỡng) HOẶC đang block sẵn:
    //     tính mốc until mới = max(until hiện tại, now + blockMinCandidate)
    let finalUntil = (currentlyBlocked ? blk.until : now);
    if (blockMinCandidate > 0) {
        const newUntil = new Date(now.getTime() + blockMinCandidate * 60 * 1000);
        if (newUntil > finalUntil) finalUntil = newUntil; // gia hạn nếu lâu hơn
    }

    // Nếu vẫn chưa vượt ngưỡng mà đang block do lần trước, chỉ cần giữ nguyên until
    if (finalUntil <= now && blockMinCandidate === 0 && currentlyBlocked) {
        finalUntil = blk.until; // safety, nhưng thực tế nhánh này hiếm khi xảy ra
    }

    // Ghi/giữ block
    if (finalUntil > now) {
        await blocks.updateOne({ psid }, { $set: { psid, until: finalUntil } }, { upsert: true });
        const blockedSec = Math.max(1, Math.ceil((finalUntil - now) / 1000));
        return { allowed: false, blockedSec, remaining: 0, hits: hitsAfter };
    }

    // Trường hợp còn lại (không block)
    return {
        allowed: true,
        remaining: Math.max(0, BASE_ALLOW - hitsAfter),
        blockedSec: 0,
        hits: hitsAfter
    };
}


module.exports = { consumeAsk1h, minutesLeft };
