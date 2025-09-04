const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GRAPH_URL = `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

async function callGraph(body) {
    const r = await fetch(GRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        console.error("Graph API error:", r.status, data);
    } else {
        console.log("Graph API response:", data);
    }
    return data;
}

async function sendText(psid, text) {
    return callGraph({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: { text },
    });
}

async function sendTyping(psid, on = true) {
    return callGraph({
        recipient: { id: psid },
        sender_action: on ? "typing_on" : "typing_off",
    });
}

async function sendQuickPriceOptions(psid) {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const body = {
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: {
            text: "Bạn muốn xem giá loại nào ạ?",
            quick_replies: [
                { content_type: "text", title: "Nhẫn 9999", payload: "PRICE_9999" },
                { content_type: "text", title: "Vàng 18K", payload: "PRICE_18K" },
                { content_type: "text", title: "Vàng 24K", payload: "PRICE_24K" },
                { content_type: "text", title: "Gặp nhân viên", payload: "TALK_AGENT" }
            ]
        }
    };
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

module.exports = { sendText, sendQuickPriceOptions, sendTyping };
