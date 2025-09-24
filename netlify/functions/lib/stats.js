// lib/stats.js
const getDb = require("./mongo");

// VN không đổi DST, nên +7 là ổn định
const VN_OFFSET_MIN = 7 * 60;

function dayStrInTZ(date = new Date(), offsetMin = VN_OFFSET_MIN) {
    const t = new Date(date.getTime() + offsetMin * 60 * 1000);
    // trả về "YYYY-MM-DD" theo giờ VN
    return t.toISOString().slice(0, 10);
}

let dailyIdxReady = false;
async function ensureDailyIndexes(db) {
    if (dailyIdxReady) return;
    const daily = db.collection("ask_daily_users");
    // mỗi PSID mỗi ngày chỉ 1 doc
    await daily.createIndex({ day: 1, psid: 1 }, { unique: true, name: "day_psid_unique" });
    await daily.createIndex({ day: 1 }, { name: "day_1" });
    dailyIdxReady = true;
}

/** Ghi nhận “hôm nay PSID này đã nhắn” (idempotent). */
async function recordDailyUser(psid) {
    const db = await getDb();
    await ensureDailyIndexes(db);
    const day = dayStrInTZ();
    await db.collection("ask_daily_users").updateOne(
        { day, psid },
        { $setOnInsert: { firstAt: new Date() } },
        { upsert: true }
    );
}

/** Đếm số PSID unique của hôm nay (giờ VN). */
async function countUniquePsidToday() {
    const db = await getDb();
    await ensureDailyIndexes(db);
    const day = dayStrInTZ();
    return db.collection("ask_daily_users").countDocuments({ day });
}

/** (tuỳ chọn) Đếm theo ngày bất kỳ "YYYY-MM-DD" */
async function countUniquePsidByDay(day) {
    const db = await getDb();
    await ensureDailyIndexes(db);
    return db.collection("ask_daily_users").countDocuments({ day });
}

/** Đếm tổng số tin nhắn trong ngày từ ask_events collection */
async function countDailyMessages() {
    const db = await getDb();

    // Use Vietnam timezone consistently, like other functions
    const day = dayStrInTZ(); // Get today in VN timezone
    const todayVN = new Date(day + 'T00:00:00.000+07:00'); // Start of day in VN
    const tomorrowVN = new Date(todayVN);
    tomorrowVN.setDate(tomorrowVN.getDate() + 1); // End of day in VN

    const events = db.collection("ask_events");
    const count = await events.countDocuments({
        at: { $gte: todayVN, $lt: tomorrowVN }
    });

    return count;
}

// ===== Rolling 24h metrics (continuous window) =====
let rollingIdxReady = false;
async function ensure24hIndexes(db) {
    if (rollingIdxReady) return;
    const coll = db.collection("ask_events_24h");

    // compound for psid + time range queries
    const idx = await coll.indexes();
    if (!idx.find(i => i.name === "psid_1_at_1")) {
        await coll.createIndex({ psid: 1, at: 1 }, { name: "psid_1_at_1" });
    }
    // TTL: expire documents after 24h
    if (!idx.find(i => i.name === "at_ttl_24h")) {
        await coll.createIndex({ at: 1 }, { name: "at_ttl_24h", expireAfterSeconds: 24 * 60 * 60 });
    }
    rollingIdxReady = true;
}

/** Insert one rolling-24h event for any inbound user interaction. */
async function recordEvent24h(psid, extra = {}) {
    const db = await getDb();
    await ensure24hIndexes(db);
    await db.collection("ask_events_24h").insertOne({ psid, at: new Date(), ...extra });
}

/** Count all events in the last 24 hours (server clock). */
async function countMessagesLast24h() {
    const db = await getDb();
    await ensure24hIndexes(db);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return db.collection("ask_events_24h").countDocuments({ at: { $gt: since } });
}

/** Count unique users active in the last 24 hours. */
async function countActiveUsersLast24h() {
    const db = await getDb();
    await ensure24hIndexes(db);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ids = await db.collection("ask_events_24h").distinct("psid", { at: { $gt: since } });
    return ids.length;
}

/** Ensure all stats-related indexes (daily + 24h). Safe to call repeatedly. */
async function ensureStatsIndexes() {
    const db = await getDb();
    try { await ensureDailyIndexes(db); } catch (e) { console.log("ensureDailyIndexes error:", e?.message || e); }
    try { await ensure24hIndexes(db); } catch (e) { console.log("ensure24hIndexes error:", e?.message || e); }
}

module.exports = {
    recordDailyUser,
    countUniquePsidToday,
    countUniquePsidByDay,
    countDailyMessages,
    // 24h rolling
    ensure24hIndexes,
    ensureStatsIndexes,
    recordEvent24h,
    countMessagesLast24h,
    countActiveUsersLast24h,
};
