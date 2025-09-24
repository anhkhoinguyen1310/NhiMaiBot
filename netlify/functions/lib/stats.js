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

/** Ghi nhận tin nhắn vào thống kê daily (persistent) */
async function recordDailyMessage(psid, messageType = "general") {
    const db = await getDb();
    const dailyStats = db.collection("daily_message_stats");
    const day = dayStrInTZ(); // Get today in VN timezone
    
    await dailyStats.updateOne(
        { date: day },
        { 
            $inc: { 
                totalMessages: 1,
                [`messageTypes.${messageType}`]: 1
            },
            $addToSet: { uniqueUsers: psid },
            $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
    );
}

/** Đếm tổng số tin nhắn trong ngày từ daily_message_stats (24h) */
async function countTotalDailyMessages() {
    const db = await getDb();
    const dailyStats = db.collection("daily_message_stats");
    const day = dayStrInTZ();
    
    const stats = await dailyStats.findOne({ date: day });
    return stats?.totalMessages || 0;
}

module.exports = { recordDailyUser, countUniquePsidToday, countUniquePsidByDay, countDailyMessages, recordDailyMessage, countTotalDailyMessages };
