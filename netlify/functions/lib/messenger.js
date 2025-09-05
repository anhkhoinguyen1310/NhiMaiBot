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
    const r = await fetch(`https://graph.facebook.com/v18.0/me/${path}?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    console.log(`Graph ${path} status=`, r.status, "body=", data);
    return { ok: r.ok, data };
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
            text: "Bạn cần tiệm hỗ trợ gì ạ? Xin nhấn vào một trong các lựa chọn bên dưới",
            quick_replies: [
                { content_type: "text", title: "Vấn Đề Khác", payload: "TALK_TO_AGENT" },
                { content_type: "text", title: "Giá Nhẫn 9999", payload: "PRICE_NHAN_9999" },
                { content_type: "text", title: "Giá Nữ Trang 610", payload: "PRICE_VANG_18K" },
                { content_type: "text", title: "Giá Nữ Trang 980", payload: "PRICE_VANG_24K" },

            ],
        },
    });
}
async function sendHandoverCard(psid) {
    return callGraph({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text:
                        "✳️ Quý khách vui lòng chờ trong giây lát, nhân viên sẽ hỗ trợ ngay ạ.\n" +
                        "❗ Nếu cần gấp, xin gọi 0932 113 113.\n" +
                        "👉 Khi xong, bấm 'Kết thúc chat' để được cập nhật giá tự động nha.",
                    buttons: [
                        { type: "postback", title: "Kết thúc chat", payload: "RESUME_BOT" },
                        { type: "phone_number", title: "Gọi tiệm", payload: "+84932113113" }
                    ]
                }
            }
        }
    });
}
async function addLabelToUser(psid, labelId) {
    const url = `https://graph.facebook.com/v23.0/${labelId}/label?access_token=${PAGE_ACCESS_TOKEN}`;
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: psid })
    });
    console.log("labelUser:", await r.json().catch(() => ({})));
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

async function requestThreadBack(psid, metadata = "bot_request") {
    return callGraphPath("request_thread_control", {
        recipient: { id: psid },
        metadata,
    });
}

async function getThreadOwner(psid) {
    const url = `${GRAPH_BASE}/${process.env.PAGE_ID}/thread_owner?recipient=${psid}&access_token=${PAGE_ACCESS_TOKEN}`;
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    console.log("thread_owner:", data);
    return data;
}

// Lấy ID của label theo tên; nếu chưa có thì tạo mới
async function getOrCreateLabelId(labelName) {
    // 1) list labels
    const listUrl = `${GRAPH_BASE}/${PAGE_ID}/custom_labels?access_token=${PAGE_ACCESS_TOKEN}`;
    const r1 = await fetch(listUrl);
    const j1 = await r1.json().catch(() => ({}));
    const found = j1?.data?.find(
        (x) => (x.page_label_name || x.name) === labelName
    );
    if (found?.id) return found.id;

    // 2) create label (tham số mới: page_label_name)
    const createUrl = `${GRAPH_BASE}/${PAGE_ID}/custom_labels?access_token=${PAGE_ACCESS_TOKEN}`;
    const r2 = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_label_name: labelName }),
    });
    const j2 = await r2.json().catch(() => ({}));
    // Meta thường trả { id, page_label_name }
    if (j2?.id) return j2.id;

    console.log("createLabel failed:", j2);
    return null;
}

// Gắn label đã có ID vào user
async function addLabelToUser(psid, labelId) {
    const url = `${GRAPH_BASE}/${labelId}/label?access_token=${PAGE_ACCESS_TOKEN}`;
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: psid }),
    });
    console.log("labelUser:", await r.json().catch(() => ({})));
}


module.exports = { sendText, sendHandoverCard, sendQuickPriceOptions, sendTyping, passThreadToHuman, takeThreadBack, addLabelToUser, requestThreadBack, getThreadOwner, getOrCreateLabelId };
