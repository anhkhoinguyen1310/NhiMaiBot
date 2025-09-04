const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const { detectType } = require("./lib/intent");
const { fetchPrice } = require("./lib/price");
const { formatPrice, apologyText } = require("./lib/format");
const { sendText, sendQuickPriceOptions, sendTyping } = require("./lib/messenger");

const { normalize } = require("./lib/intent");


exports.handler = async (event) => {
    // ----- Facebook Verify -----
    if (event.httpMethod === "GET") {
        const p = event.queryStringParameters || {};
        if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
            return { statusCode: 200, body: p["hub.challenge"] };
        }
        return { statusCode: 403, body: "Forbidden" };
    }

    // ----- Messenger events -----
    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        if (body.object !== "page") return { statusCode: 404, body: "" };

        for (const entry of body.entry || []) {
            for (const ev of entry.messaging || []) {
                const psid = ev.sender?.id;
                if (!psid) continue;

                // 1) Bắt quick reply / postback payload (nếu có) TRƯỚC
                const payload =
                    ev.message?.quick_reply?.payload ||
                    ev.postback?.payload || null;

                if (payload) {
                    await sendTyping(psid, true);

                    let label = null;
                    switch (payload) {
                        case "PRICE_NHAN_9999": label = "Nhẫn 9999"; break;
                        case "PRICE_VANG_18K": label = "Nữ Trang 610"; break;
                        case "PRICE_VANG_24K": label = "Nữ Trang 980"; break;
                        default: break;
                    }

                    if (label) {
                        const d = await fetchPrice(label);
                        if (!d || !d.buyVND || !d.sellVND) {
                            await sendText(psid, apologyText());
                        } else {
                            await sendText(psid, formatPrice(d));
                        }
                    } else {
                        await sendQuickPriceOptions(psid);
                    }

                    await sendTyping(psid, false);
                    continue; // đã xử lý event này
                }


                // 2) Nếu không có payload → xử lý text
                const text = ev.message?.text || "";
                if (!text) continue;

                const intent = detectType(text);
                const { q } = normalize(text);
                console.log("DEBUG q:", q);
                console.log("DEBUG intent:", intent);


                await sendTyping(psid, true);

                if (intent.type === "ignore") {
                    await sendTyping(psid, false);
                    continue;
                }

                if (intent.type === "price") {
                    const d = await fetchPrice(intent.label);
                    if (!d || !d.buyVND || !d.sellVND) {
                        await sendText(psid, apologyText());
                        await sendQuickPriceOptions(psid);
                    } else {
                        await sendText(psid, formatPrice(d));
                    }
                    await sendTyping(psid, false);
                    continue;
                }

                // unknown → gợi ý quick replies
                await sendQuickPriceOptions(psid);
                await sendTyping(psid, false);
            }
        }
        return { statusCode: 200, body: "" };
    }

    return { statusCode: 405, body: "" };
};
