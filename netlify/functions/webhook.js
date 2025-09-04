const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const { detectType, normalize } = require("./lib/intent");
const { fetchPrice } = require("./lib/price");
const { formatPrice, apologyText } = require("./lib/format");
const {
    sendText, sendQuickPriceOptions, sendTyping,
    passThreadToHuman, takeThreadBack
} = require("./lib/messenger");
const { removeDiacritics } = require("./lib/diacritics");

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
            for (const ev of entry.standby || []) {
                const psid = ev.sender?.id;
                const text = ev.message?.text || "";
                if (!psid || !text) continue;

                // Chỉ cho phép từ khoá "bật bot" để lấy quyền về (tránh bot phá cuộc trò chuyện người thật)
                const q = removeDiacritics(text).toLowerCase();
                if (/\bbat\s*bot\b|\bmo\s*bot\b|\bxem\s*gia\b/.test(q)) {
                    await takeThreadBack(psid);
                    await sendText(psid, "🤖 Bot đã bật lại. Bạn muốn xem giá loại nào ạ?");
                    await sendQuickPriceOptions(psid);
                }
            }

            // 🔹 Khi bot đang giữ thread control, sự kiện ở entry.messaging

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
                            await sendText(psid,
                                "✳️ Quý khách vui lòng chờ trong giây lát, nhân viên sẽ hỗ trợ ngay ạ.\n" +
                                "❗ Nếu cần gấp, xin gọi 0932 113 113.\n" +
                                "❤️ Xin cảm ơn anh/chị đã ủng hộ tiệm ❤️"
                            );
                            await passThreadToHuman(psid, "user_request_human");
                            await sendTyping(psid, false);
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

                const intent = detectType(text);
                // optional debug:
                // const { q } = normalize(text); console.log("DEBUG q:", q, "intent:", intent);

                await sendTyping(psid, true);

                if (intent.type === "ignore") {
                    await sendTyping(psid, false);
                    continue;
                }
                if (intent.type === "thanks") {
                    await sendText(psid, "Dạ không có gì ạ ❤️!");
                    await sendTyping(psid, false);
                    continue;
                }

                if (intent.type === "price") {
                    const d = await fetchPrice(intent.label);
                    await sendText(psid, (!d || !d.buyVND || !d.sellVND) ? apologyText() : formatPrice(d));
                    await sendTyping(psid, false);
                    continue;
                }

                // fallback: unknown → hiện nút
                await sendQuickPriceOptions(psid);
                await sendTyping(psid, false);
            }
        }
        return { statusCode: 200, body: "" };
    }

    return { statusCode: 405, body: "" };
};
