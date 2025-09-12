const getDb = require("./mongo");

async function countUniquePsidToday() {
    const db = await getDb();
    const events = db.collection("ask_events");

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999); // cuối ngày UTC

    const unique = await events.distinct("psid", { at: { $gte: startOfDay, $lte: endOfDay } });
    return unique.length;
}

module.exports = { countUniquePsidToday };
