const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PRICE_URL = process.env.PRICE_URL;


function removeDiacritics(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
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

                const q = removeDiacritics(String(text)).toLowerCase().trim();

                if (/\b18\s*k\b|\bvang\s*tay\b|\bvang\s*18\b/.test(q)) {
                    const d = await fetchPrice("Nữ Trang 610"); // 18k
                    await sendText(psid, formatPrice(d));

                } else if (/\b24\s*k\b|\bvang\s*ta\b|\bvang\s*24\b/.test(q)) {
                    const d = await fetchPrice("Nữ Trang 980"); // 24k
                    await sendText(psid, formatPrice(d));

                } else if (/\b9999\b|\b4\s*so\b|\bbon\s*so\b|\bnhan\s*tron\b|\bnhan\b/.test(q)) {
                    const d = await fetchPrice("Nhẫn 9999");
                    await sendText(psid, formatPrice(d));

                } else if (/\bgia\b|\bvang\b/.test(q)) {
                    // fallback chung chung → mặc định trả nhẫn 9999
                    const d = await fetchPrice("Nhẫn 9999");
                    await sendText(psid, formatPrice(d));
                }


            }
        }
    }

    return { statusCode: 200, body: "" };
}

return { statusCode: 405, body: "" };

async function fetchPrice(type) {
    try {
        const r = await fetch(PRICE_URL);
        const arr = await r.json();
        console.log("PRICE_URL response:", arr);
        return arr.find((x) => x.type.toLowerCase().includes(type.toLowerCase()));
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
            messaging_type: "RESPONSE",
            message: { text },
        }),
    });
    const data = await r.json();
    console.log("Graph API response:", data);
}





function formatPrice(d) {
    if (!d || !d.buyVND || !d.sellVND) return "Xin lỗi, giá hôm nay chưa được cập nhật.";

    let when = "";
    if (d.updatedAt) {
        when = new Intl.DateTimeFormat("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",   // ép về giờ VN
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit"
        }).format(new Date(d.updatedAt));
    }

    return `✨ Giá Vàng ${d.type} hiện tại ✨

💰 Mua: ${d.buyVND} / chỉ
💰 Bán: ${d.sellVND} / chỉ

⏰ Cập nhật: ${when}`;
}
