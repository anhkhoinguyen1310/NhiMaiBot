const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const { detectType, normalize } = require("./lib/intent");
const { fetchPrice } = require("./lib/price");
const { formatPrice, apologyText } = require("./lib/format");
const {
    sendText, sendQuickPriceOptions, sendTyping,
    passThreadToHuman, takeThreadBack, sendHandoverCard
} = require("./lib/messenger");
const { removeDiacritics } = require("./lib/diacritics");

async function logThreadOwner(psid) {
    const PAGE_ID = process.env.PAGE_ID;                    // nhớ set env PAGE_ID
    const ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;     // đã có sẵn

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
            // ===== STANDBY: khi bot KHÔNG giữ thread =====
            for (const sEv of entry.standby || []) {
                const psid = sEv.sender?.id;
                const payload =
                    sEv.postback?.payload ||
                    sEv.message?.quick_reply?.payload ||
                    null;
                if (!psid) continue;

                console.log("STANDBY RAW:", JSON.stringify(sEv));

                // Chỉ chấp nhận nút "Kết thúc chat"
                if (payload === "RESUME_BOT") {
                    const result = await takeThreadBack(psid, "resume_button");
                    console.log("take_thread_control:", result);
                    await logThreadOwner(psid);

                    if (result?.ok || result?.data?.success) {
                        // ✅ Quay lại bot và gửi LỜI CẢM ƠN như bạn yêu cầu
                        await sendText(psid, "❤️ Xin cảm ơn anh/chị đã ủng hộ tiệm ❤️");
                        // (tuỳ chọn) nếu muốn gợi ý tiếp:
                        // await sendQuickPriceOptions(psid);
                    } else {
                        console.log("TAKE FAILED → chưa giữ quyền, không gửi message.");
                    }
                }
                // Không xử lý text “bật bot/mở bot/xem giá” nữa → xoá hẳn fallback regex
            }


            // ===== MESSAGING: khi bot ĐANG giữ thread =====
            for (const ev of entry.messaging || []) {
                const psid = ev.sender?.id;
                if (!psid) continue;

                // ---- payload trước
                const payload = ev.message?.quick_reply?.payload || ev.postback?.payload || null;
                if (payload) {
                    await sendTyping(psid, true);
                    let label = null;

                    switch (payload) {
                        case "PRICE_NHAN_9999": label = "Nhẫn 9999"; break;
                        case "PRICE_VANG_18K": label = "Nữ Trang 610"; break;
                        case "PRICE_VANG_24K": label = "Nữ Trang 980"; break;
                        case "TALK_TO_AGENT": {
                            // gửi card có nút 'Kết thúc chat' trước khi pass
                            await sendHandoverCard(psid);
                            await sendTyping(psid, false);                 // tắt trước khi pass
                            const r = await passThreadToHuman(psid, "user_request_human");
                            console.log("pass_thread_control:", r);
                            await logThreadOwner(psid);

                            continue; // từ đây KHÔNG gửi gì thêm nữa

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
