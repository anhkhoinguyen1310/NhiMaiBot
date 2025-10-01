const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_ID = process.env.APP_ID;
const PAGE_ID = process.env.PAGE_ID;
const { detectType } = require("./lib/intent");
const {
    sendText, sendQuickPriceOptions, sendTyping,
    passThreadToHuman, takeThreadBack, sendHandoverCard, requestThreadBack, addLabelToUser, getOrCreateLabelId, clearNeedAgentLabel,
    sendPriceWithNote
} = require("./lib/messenger");
const {
    countUniquePsidToday,
    countDailyMessages,
    recordEvent24h,
    countMessagesLast24h,
    countActiveUsersLast24h,
    ensureStatsIndexes,
    countVanDeKhacClicksLast24h,
    countVanDeKhacUsersLast24h,
    countMessagesTodayVN,
    countVanDeKhacClicksTodayVN,
    countVanDeKhacUsersTodayVN,
} = require("./lib/stats");
const { consumeAsk1hByMinutes, minutesLeft, resetUserLimit } = require("./lib/rateLimiterByMinute");
function buildKeySet(raw) {
    if (!raw) return new Set();
    return new Set(raw.split(/[,;\n]/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
        .map(s => s.normalize("NFD").replace(/\p{Diacritic}/gu, ""))
    );
}
const ADMIN_KEYS = buildKeySet(process.env.ADMIN_KEYS);
const UNLOCK_KEYS = buildKeySet(process.env.UNLOCK_KEYS);
const RESET_LIMIT_KEYS = buildKeySet(process.env.RESET_LIMIT_KEYS);

function normalizeKey(s = "") {
    return s.toString().trim().toLowerCase()
        .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function isAdminKey(s = "") { return ADMIN_KEYS.has(normalizeKey(s)); }
function isResetLimitKey(s = "") { return RESET_LIMIT_KEYS.has(normalizeKey(s)); }

// Helper to wrap work in a typing indicator with a minimum visible duration
async function withTyping(psid, workFn, { minMs = 700, preDelayMs = 0 } = {}) {
    const start = Date.now();
    await sendTyping(psid, true);
    try {
        if (preDelayMs > 0) {
            await new Promise(r => setTimeout(r, preDelayMs));
        }
        const res = await workFn();
        const elapsed = Date.now() - start;
        if (elapsed < minMs) {
            await new Promise(r => setTimeout(r, minMs - elapsed));
        }
        return res;
    } finally {
        await sendTyping(psid, false);
    }
}

async function logThreadOwner(psid) {
    const PAGE_ID = process.env.PAGE_ID;
    const ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

    if (!PAGE_ID || !ACCESS_TOKEN) {
        console.log("logThreadOwner: missing PAGE_ID or PAGE_ACCESS_TOKEN");
        return;
    }

    const url = `https://graph.facebook.com/v18.0/${PAGE_ID}/thread_owner?recipient=${psid}&access_token=${ACCESS_TOKEN}`;
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    console.log("thread_owner:", data);   // sẽ thấy app_id chủ thread hiện tại
}

// Proactively ensure stats indexes/collections on cold start
let statsEnsured = false;

exports.handler = async (event) => {
    if (!statsEnsured) {
        try { await ensureStatsIndexes(); } catch (e) { console.log("ensureStatsIndexes error:", e?.message || e); }
        statsEnsured = true;
    }
    // Verify webhook (GET)
    if (event.httpMethod === "GET") {
        const p = event.queryStringParameters || {};
        if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
            return { statusCode: 200, body: p["hub.challenge"] };

        }
        return { statusCode: 403, body: "Forbidden" };
    }

    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        if (body.object !== "page") return { statusCode: 404, body: "" };
        for (const entry of body.entry || []) {
            console.log("ENTRY Key:", Object.keys(entry));
            for (const sEv of entry.standby || []) {
                const psid = sEv.sender?.id;
                const payload =
                    sEv.postback?.payload ||
                    sEv.message?.quick_reply?.payload ||
                    null;
                const text = sEv.message?.text || "";
                if (!psid) continue;

                console.log("STANDBY RAW:", JSON.stringify(sEv));
                console.log("STANDBY payload:", payload, "text:", text);

                // 1) Khách bấm "Kích Hoạt Báo Giá" → lấy quyền về rồi cảm ơn
                if (payload === "RESUME_BOT" || UNLOCK_KEYS.has(text.toString().trim().toLowerCase())) {
                    const r = await takeThreadBack(psid, "resume_button");
                    console.log("take_thread_control:", r);
                    if (r?.ok || r?.data?.success) {
                        await new Promise(x => setTimeout(x, 200));
                        await clearNeedAgentLabel(psid);
                        await sendText(psid, "❤️ Xin cảm ơn anh/chị đã ủng hộ tiệm ❤️");

                    }
                    continue;
                }

                // 2) SOFT RECLAIM: khách gửi text hỏi giá trong khi Page đang giữ
                if (text) {
                    const intent = detectType(text); // bạn đã có sẵn
                    if (intent.type === "price") {
                        // Không cướp lời ngay: xin lại quyền để agent chủ động bấm
                        await requestThreadBack(psid, "user_asked_price_while_human");
                        console.log("requested_thread_control (soft reclaim)");
                        // (tuỳ chọn) bạn cũng có thể gắn label "Need Agent" ở đây nếu muốn
                        continue;
                    }
                }
            }


            // ===== MESSAGING: khi bot ĐANG giữ thread =====
            for (const ev of entry.messaging || []) {
                const psid = ev.sender?.id;
                if (!psid) continue;


                // ✅ BẮT HANDOVER TRƯỚC
                if (ev.take_thread_control || ev.pass_thread_control) {
                    console.log("HANDOVER EVENT:", JSON.stringify(ev));
                    const newOwner = ev.take_thread_control?.new_owner_app_id || ev.pass_thread_control?.new_owner_app_id;
                    if (newOwner && String(newOwner) === String(APP_ID)) {
                        await clearNeedAgentLabel(psid);
                        console.log("Bot has become the thread owner");
                        continue;
                    }
                    if (newOwner === 263902037430900) {
                        console.log("Now owned by Page Inbox");
                    }
                }

                // ---- payload trước
                const payload = ev.message?.quick_reply?.payload || ev.postback?.payload || null;
                if (payload) {
                    // record interaction for 24h rolling window
                    try { await recordEvent24h(psid, { kind: "payload", payload }); } catch (e) { console.log("recordEvent24h(payload)", e?.message || e); }

                    // ✅ Nếu user bấm "Kết thúc chat" quá nhanh (trước khi pass xong),
                    // postback sẽ rơi vào entry.messaging. Xử lý ngay tại đây:
                    if (payload === "RESUME_BOT") {

                        await sendText(psid, "❤️ Xin cảm ơn anh/chị đã ủng hộ tiệm ❤️");
                        await sendTyping(psid, false);
                        continue;
                    }
                    const pricePayloads = ["PRICE_NHAN_9999", "PRICE_VANG_18K", "PRICE_VANG_24K"];
                    if (pricePayloads.includes(payload)) {
                        await withTyping(psid, async () => {
                            const res = await consumeAsk1hByMinutes(psid);
                            console.log("limiter(1h atlas):", { psid, res });
                            if (!res.allowed) {
                                await sendText(psid, `📢 Hệ thống đang cập nhật giá. Quý khách vui lòng quay lại sau ${minutesLeft(res.blockedSec)} phút nữa. Xin cám ơn quý khách.`);
                                return;
                            }
                            // Map payload to label and send price
                            const labelMap = {
                                PRICE_NHAN_9999: "Nhẫn 9999",
                                PRICE_VANG_18K: "Nữ Trang 610",
                                PRICE_VANG_24K: "Nữ Trang 980",
                            };
                            await sendPriceWithNote(psid, labelMap[payload]);
                        }, { preDelayMs: 600, minMs: 900 });
                        continue;
                    }


                    var label = null;
                    switch (payload) {
                        case "TALK_TO_AGENT": {
                            // 1) gắn nhãn để agent lọc kịp thời
                            try {
                                const labelId = await getOrCreateLabelId("Cứu Cứu"); //
                                if (labelId) await addLabelToUser(psid, labelId);
                            } catch (e) { console.log("Label error:", e); }
                            // 2) gửi thẻ chờ
                            await sendHandoverCard(psid);
                            // 3) delay 2s rồi gửi text hỏi thăm
                            await sendTyping(psid, true);
                            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds delay
                            await sendText(psid, "Dạ, mình cần tiệm hỗ trợ gì ạ?");
                            await sendTyping(psid, false);
                            const r = await passThreadToHuman(psid, "user_request_human");
                            console.log("pass_thread_control:", r);
                            await logThreadOwner(psid);
                            continue;
                        }
                    }

                    // Non-price payloads fall through here (e.g. TALK_TO_AGENT handled above)
                    continue;
                }

                // ---- text---- //
                const text = ev.message?.text || "";
                if (!text) continue;

                await sendTyping(psid, true);
                // record interaction for 24h rolling window
                try { await recordEvent24h(psid, { kind: "text" }); } catch (e) { console.log("recordEvent24h(text)", e?.message || e); }
                const intent = detectType(text);

                if (isAdminKey(text)) {
                    const started = Date.now();
                    await sendTyping(psid, true);
                    const [uniqueUsersToday, msgsToday, vdkClicksToday, vdkUsersToday] = await Promise.all([
                        countUniquePsidToday(),
                        countMessagesTodayVN(),
                        countVanDeKhacClicksTodayVN(),
                        countVanDeKhacUsersTodayVN(),
                    ]);
                    const avgToday = uniqueUsersToday > 0 ? (msgsToday / uniqueUsersToday).toFixed(1) : 0;
                    const message = [
                        "📊 THỐNG KÊ HÔM NAY:",
                        `🧑‍💼 Tổng số người nhắn tin: ${uniqueUsersToday}`,
                        `💬 Tổng tin nhắn: ${msgsToday}`,
                        `🆘 Vấn Đề Khác: ${vdkClicksToday} click / ${vdkUsersToday} người`,
                        `📈 Trung bình: ${avgToday} tin/người`,
                        `⏰ Cập nhật: ${new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
                    ].join("\n");
                    // ensure typing visible at least 400ms for UX
                    const elapsed = Date.now() - started;
                    if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed));
                    await sendText(psid, message);
                    await sendTyping(psid, false);

                    continue;
                }
                if (isResetLimitKey(text)) {
                    await sendTyping(psid, true);
                    await resetUserLimit(psid);
                    await sendText(psid, "😵‍💫 Gỡ chặn rồi đó, hỏi gì hỏi tiếp đi đồ độc ác!");
                    await sendTyping(psid, false);
                    continue;
                }
                if (intent.type === "ignore") { await sendTyping(psid, false); continue; }
                if (intent.type === "thanks") { await sendText(psid, "Dạ không có gì ạ ❤️!"); await sendTyping(psid, false); continue; }
                if (intent.type === "price") {
                    await withTyping(psid, async () => {
                        const res = await consumeAsk1hByMinutes(psid);
                        console.log("limiter(1h atlas):", { psid, res });
                        if (!res.allowed) {
                            await sendText(psid, `📢 Hệ thống đang cập nhật giá. Quý khách vui lòng quay lại sau ${minutesLeft(res.blockedSec)} phút nữa. Xin cám ơn quý khách.`);
                            return;
                        }
                        await sendPriceWithNote(psid, intent.label);
                    }, { preDelayMs: 600, minMs: 900 });
                    continue;
                }
                // không hiểu → gợi ý
                await sendQuickPriceOptions(psid);
                await sendTyping(psid, false);
            }
        }

        return { statusCode: 200, body: "" };
    }

    return { statusCode: 405, body: "" };
};
