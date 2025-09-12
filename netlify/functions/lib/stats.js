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

module.exports = { recordDailyUser, countUniquePsidToday, countUniquePsidByDay };
