const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const { detectType } = require("./lib/intent");
const { fetchPrice } = require("./lib/price");
const { formatPrice, apologyText } = require("./lib/format");
const {
    sendText, sendQuickPriceOptions, sendTyping,
    passThreadToHuman, takeThreadBack, sendHandoverCard, requestThreadBack, getThreadOwner
} = require("./lib/messenger");

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

exports.handler = async (event) => {
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

                // 1) Khách bấm "Kết thúc chat" → lấy quyền về rồi cảm ơn
                if (payload === "RESUME_BOT") {
                    const r = await takeThreadBack(psid, "resume_button");
                    console.log("take_thread_control:", r);
                    if (r?.ok || r?.data?.success) {
                        // (nhỏ) đợi 200ms cho chắc đã trở thành owner
                        await new Promise(x => setTimeout(x, 200));
                        await sendText(psid, "❤️ Xin cảm ơn anh/chị đã ủng hộ tiệm ❤️");
                        // (tuỳ chọn) gợi ý tiếp
                        // await sendQuickPriceOptions(psid);
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

                // ---- payload trước
                const payload = ev.message?.quick_reply?.payload || ev.postback?.payload || null;
                if (payload) {
                    await sendTyping(psid, true);

                    // ✅ Nếu user bấm "Kết thúc chat" quá nhanh (trước khi pass xong),
                    // postback sẽ rơi vào entry.messaging. Xử lý ngay tại đây:
                    if (payload === "RESUME_BOT") {

                        await sendText(psid, "❤️ Xin cảm ơn anh/chị đã ủng hộ tiệm ❤️");
                        await sendTyping(psid, false);
                        continue;
                    }

                    let label = null;
                    switch (payload) {
                        case "PRICE_NHAN_9999": label = "Nhẫn 9999"; break;
                        case "PRICE_VANG_18K": label = "Nữ Trang 610"; break;
                        case "PRICE_VANG_24K": label = "Nữ Trang 980"; break;
                        case "TALK_TO_AGENT": {
                            await sendHandoverCard(psid);
                            await sendTyping(psid, false);
                            const r = await passThreadToHuman(psid, "user_request_human");
                            console.log("pass_thread_control:", r);
                            await logThreadOwner(psid);
                            continue;
                        }
                    }

                    if (label) {
                        const d = await fetchPrice(label);
                        await sendText(psid, (!d || !d.buyVND || !d.sellVND) ? apologyText() : formatPrice(d));
                    } else {
                        await sendQuickPriceOptions(psid);
                    }
                    await sendTyping(psid, false);
                    continue;
                }

                // ---- text
                const text = ev.message?.text || "";
                if (!text) continue;

                await sendTyping(psid, true);
                const intent = detectType(text);

                if (intent.type === "ignore") { await sendTyping(psid, false); continue; }
                if (intent.type === "thanks") { await sendText(psid, "Dạ không có gì ạ ❤️!"); await sendTyping(psid, false); continue; }
                if (intent.type === "price") {
                    const d = await fetchPrice(intent.label);
                    await sendText(psid, (!d || !d.buyVND || !d.sellVND) ? apologyText() : formatPrice(d));
                    await sendTyping(psid, false);
                    continue;
                }

                await sendQuickPriceOptions(psid);
                await sendTyping(psid, false);
            }
        }

        return { statusCode: 200, body: "" };
    }

    return { statusCode: 405, body: "" };
};
