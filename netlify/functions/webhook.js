// Netlify Function: Messenger webhook
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; // token của Page
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;           // ví dụ: verify_goldbot
const PRICE_URL = process.env.PRICE_URL;                 // Apps Script /exec

exports.handler = async (event) => {
    // Facebook verification
    if (event.httpMethod === "GET") {
        const p = event.queryStringParameters || {};
        if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
            return { statusCode: 200, body: p["hub.challenge"] };
        }
        return { statusCode: 403, body: "Forbidden" };
    }

    // Receive messages
    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        if (body.object !== "page") return { statusCode: 404, body: "" };

        for (const entry of body.entry || []) {
            for (const ev of entry.messaging || []) {
                const psid = ev.sender?.id;
                const text = ev.message?.text || "";
                if (!psid) continue;

                const t = removeDiacritics(String(text)).toLowerCase();
                if (/(gia|giá|vang|vàng|9999|sjc)/.test(t)) {
                    const d = await fetchPrice();
                    const msg = formatPrice(d);
                    await sendText(psid, msg);
                } else {
                    await sendText(psid, 'Bạn có thể hỏi: "giá 9999 hôm nay?"');
                }
            }
        }
        return { statusCode: 200, body: "" };
    }

    return { statusCode: 405, body: "" };
};

async function fetchPrice() {
    try {
        const r = await fetch(PRICE_URL);
        return await r.json();
    } catch (e) {
        console.error("PRICE_URL error", e);
        return null;
    }
}

async function sendText(psid, text) {
    const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient: { id: psid },
            messaging_type: "RESPONSE",
            message: { text }
        })
    });
}

function removeDiacritics(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatPrice(d) {
    if (!d || !d.buyVND || !d.sellVND) return "Xin lỗi, giá hôm nay chưa được cập nhật.";
    const when = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(d.updatedAt));
    return `Giá ${d.type} hôm nay:
• Mua: ${d.buyVND} / chỉ
• Bán: ${d.sellVND} / chỉ
• 1 lượng (10 chỉ): Mua ${d.buyPerLuongVND}, Bán ${d.sellPerLuongVND}
(${when})`;
}
