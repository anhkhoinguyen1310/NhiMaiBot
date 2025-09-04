const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.facebook.com/v18.0";

async function callGraph(body) {
    const r = await fetch(`${GRAPH_BASE}/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    try { console.log("Graph API response:", await r.json()); } catch { }
}

// generic caller for handover paths
async function callGraphPath(path, body) {
    const r = await fetch(`${GRAPH_BASE}/me/${path}?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    try { console.log(`Graph ${path} response:`, await r.json()); } catch { }
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
            text: "Bạn cần tiệm hỗ trợ gì ạ?",
            quick_replies: [
                { content_type: "text", title: "Gặp nhân viên", payload: "TALK_TO_AGENT" },
                { content_type: "text", title: "Giá Nhẫn 9999", payload: "PRICE_NHAN_9999" },
                { content_type: "text", title: "Giá Vàng 18K", payload: "PRICE_VANG_18K" },
                { content_type: "text", title: "Giá Vàng 24K", payload: "PRICE_VANG_24K" },

            ],
        },
    });
}
// 🔸 Handover: chuyển quyền cho Page Inbox (người thật)
async function passThreadToHuman(psid, metadata = "handover_to_human") {
    // Page Inbox app_id = 263902037430900
    return callGraphPath("pass_thread_control", {
        recipient: { id: psid },
        target_app_id: 263902037430900,
        metadata,
    });
}
// 🔸 Handover: lấy quyền hội thoại về cho bot
async function takeThreadBack(psid, metadata = "bot_resume") {
    return callGraphPath("take_thread_control", {
        recipient: { id: psid },
        metadata,
    });
}


module.exports = { sendText, sendQuickPriceOptions, sendTyping, passThreadToHuman, takeThreadBack };
