const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PRICE_URL = process.env.PRICE_URL;

exports.handler = async (event) => {
    // Facebook verify
    if (event.httpMethod === "GET") {
        const p = event.queryStringParameters || {};
        if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
            return { statusCode: 200, body: p["hub.challenge"] };
        }
        return { statusCode: 403, body: "Forbidden" };
    }

    // Messenger events
    if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        if (body.object !== "page") return { statusCode: 404, body: "" };

        for (const entry of body.entry || []) {
            for (const ev of entry.messaging || []) {
                const psid = ev.sender?.id;
                const text = ev.message?.text || "";
                if (!psid) continue;

                const q = (text || "").toLowerCase();
                if (q.includes("giá") || q.includes("9999")) {
                    const d = await fetchPrice();
                    const msg = formatPrice(d);
                    await sendText(psid, msg);
                } else {
                    await sendText(psid, "Bạn có thể hỏi: 'giá 9999 hôm nay?'");
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
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient: { id: psid },
            message: { text },
        }),
    });
    const data = await r.json();
    console.log("Graph API response:", data);
}

function formatPrice(d) {
    if (!d || !d.buyVND || !d.sellVND) return "Xin lỗi, giá hôm nay chưa được cập nhật.";
    const when = new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit"
    }).format(new Date(d.updatedAt));

    return `✨ Giá vàng 9999 hôm nay ✨

💰 Mua: ${d.buyVND} / chỉ
💰  Bán: ${d.sellVND} / chỉ

⏰ Cập nhật: ${when}`;
}
