const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GRAPH_URL = `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

async function callGraph(body) {
    const r = await fetch(GRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    try { console.log("Graph API response:", await r.json()); } catch { }
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
    return callGraph({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: {
            text: "Bạn muốn xem giá loại nào ạ?",
            quick_replies: [
                { content_type: "text", title: "Gặp nhân viên", payload: "TALK_TO_AGENT" },
                { content_type: "text", title: "Nhẫn 9999", payload: "PRICE_NHAN_9999" },
                { content_type: "text", title: "Vàng 18K", payload: "PRICE_VANG_18K" },
                { content_type: "text", title: "Vàng 24K", payload: "PRICE_VANG_24K" },

            ],
        },
    });
}

module.exports = { sendText, sendQuickPriceOptions, sendTyping };
