const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GRAPH_BASE = "https://graph.facebook.com/v18.0";
const PAGE_ID = process.env.PAGE_ID;
// Disabled mode shared message
const BOT_DISABLED_MESSAGE = "🙏 Tiệm hiện tạm ngưng cập nhật tự động online. Để biết được giá vui lòng gọi 0932 113 113. Nếu quý khách cần tư vấn nữ trang xin bấm vào 'Vấn Đề Khác'. Xin cảm ơn ạ.";
// --- Early close configuration (optional) ---
// Set EARLY_CLOSE_DATE (YYYY-MM-DD, Asia/Ho_Chi_Minh) and EARLY_CLOSE_HOUR (24h) in env to activate.
// Example (for a one-off early close at 17:00 on 2025-10-08):
// EARLY_CLOSE_DATE=2025-10-08
// EARLY_CLOSE_HOUR=17
const EARLY_CLOSE_DATE = process.env.EARLY_CLOSE_DATE; // format: YYYY-MM-DD
const EARLY_CLOSE_HOUR = parseInt(process.env.EARLY_CLOSE_HOUR, 10); // default 17 if provided
const { apologyText, formatPrice, apologyUpdateText } = require("./format");
const { fetchPrice } = require("./price");
const { DateTime } = require("luxon");

// Helper to get the current DateTime in Asia/Ho_Chi_Minh
function getHoChiMinhNow() {
    return DateTime.now().setZone("Asia/Ho_Chi_Minh");
}

function isBusinessHour(dt = getHoChiMinhNow()) {
    const hour = dt.hour;
    return hour >= 7 && hour < 21;
}

function isEarlyCloseActive(dt = getHoChiMinhNow()) {
    if (!EARLY_CLOSE_DATE) return false;
    const dayStr = dt.toFormat("yyyy-LL-dd");
    return dayStr === EARLY_CLOSE_DATE;
}

function getEarlyCloseStatus() {
    const now = getHoChiMinhNow();
    const activeToday = isEarlyCloseActive(now);
    return {
        EARLY_CLOSE_DATE,
        EARLY_CLOSE_HOUR,
        EARLY_CLOSE_TEST_NOW: process.env.EARLY_CLOSE_TEST_NOW || null,
        now: now.toISO(),
        hour: now.hour,
        activeToday,
        afterCut: activeToday ? now.hour >= EARLY_CLOSE_HOUR : false
    };
}

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
    const started = Date.now();
    const action = on ? "typing_on" : "typing_off";
    const res = await callGraph({
        recipient: { id: psid },
        sender_action: action,
    });
    console.log("sendTyping", { psid, action, latencyMs: Date.now() - started });
    return res;
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
async function sendDisabledNotice(psid, { addCallButton = true } = {}) {
    // Quick replies support only: text | location | user_phone_number | user_email
    // We just keep the TALK_TO_AGENT quick reply (text). Phone quick reply type would be 'user_phone_number' (returns user's number),
    // but we want a direct call button, so we send a second button template when requested.
    await callGraph({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: {
            text: BOT_DISABLED_MESSAGE,
            quick_replies: [
                { content_type: "text", title: "Vấn Đề Khác", payload: "TALK_TO_AGENT" }
            ]
        }
    });
    if (addCallButton) {
        await callGraph({
            recipient: { id: psid },
            messaging_type: "RESPONSE",
            message: {
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "button",
                        text: "📞 Cần gấp? Gọi nhanh tiệm:",
                        buttons: [
                            { type: "phone_number", title: "Gọi Tiệm", payload: "+84932113113" }
                        ]
                    }
                }
            }
        });
    }
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
                        "❗ Nếu cần gấp, xin gọi 0932 113 113.\n",
                    //"👉 Báo giá tự động đã tắt. Sau khi trò chuyện xong với nhân viên, hãy bấm 'Kích Hoạt Báo Giá' tại tin nhắn này để kích hoạt lại báo giá tự động.",
                    buttons: [
                        //{ type: "postback", title: "Kích Hoạt Báo Giá", payload: "RESUME_BOT" },
                        { type: "postback", title: "Kết Thúc Chat", payload: "RESUME_BOT" },
                        { type: "phone_number", title: "Gọi tiệm", payload: "+84932113113" }

                    ]
                }
            }
        }
    });
}

async function sendPriceWithNote(psid, label, { delayBetweenMs = 350 } = {}) {
    const now = getHoChiMinhNow();
    const earlyCloseToday = isEarlyCloseActive(now);
    console.log("early-close-debug", getEarlyCloseStatus());

    // If today is an early close day and we've passed the early close hour, treat as closed.
    if (earlyCloseToday && now.hour >= EARLY_CLOSE_HOUR) {
        await sendText(psid, `🙏 Tiệm đã đóng cửa sớm lúc ${EARLY_CLOSE_HOUR}:00 hôm nay. Mai tiệm hoạt động bình thường (7:00 - 21:00). Quý khách vui lòng quay lại sau ạ ❤️`);
        return false;
    }

    // Outside normal business hours (and not in the special early-close window before the cut). 
    if (!isBusinessHour(now)) {
        await sendText(psid, apologyText());
        return false;
    }

    // We're within business hours. Fetch price.
    const d = await fetchPrice(label);
    if (!d || !d.buyVND || !d.sellVND) {
        await sendText(psid, apologyUpdateText());
        return false;
    }

    // If it's the early close day but still before early close hour, prepend a notice.
    if (earlyCloseToday && now.hour < EARLY_CLOSE_HOUR) {
        await sendText(psid, `📢 📢 Thông báo : Hôm nay tiệm sẽ đóng cửa sớm lúc ${EARLY_CLOSE_HOUR}:00. Quý khách vui lòng ghé hoặc giao dịch trước ${EARLY_CLOSE_HOUR}:00 ạ.`);
    }

    // Standard overload / rate reminder note.
    await sendText(psid, "Xin chào quý khách, từ ngày 15/10 Bot báo giá tự động sẽ ngưng hoạt động cho đến khi có thông báo mới nhất từ tiệm. Tiệm cảm ơn quý khách đã ủng hộ bot trong suốt thời gian qua. Nếu quý khách muốn cập nhật giá, xin hãy gọi đến số 0932113113 ❤️");
    await sendText(psid, "❗❗Lưu ý: Do lượng tin nhắn đang quá tải, quý khách vui lòng chỉ nhắn hỏi giá 1️⃣ lần 1️⃣ tiếng.\n❤️ Tiệm cảm ơn quý khách ❤️");
    if (delayBetweenMs > 0) await new Promise(r => setTimeout(r, delayBetweenMs));
    await sendText(psid, formatPrice(d));
    return true;
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
// Bỏ label đã có ID khỏi user
async function removeLabelFromUser(psid, labelId) {
    const url = `${GRAPH_BASE}/${labelId}/label?access_token=${PAGE_ACCESS_TOKEN}&user=${psid}`;
    const r = await fetch(url, { method: "DELETE" });
    const data = await r.json().catch(() => ({}));
    console.log("unlabelUser:", data, "status=", r.status);
    return { ok: r.ok, data };
}

async function clearNeedAgentLabel(psid, name = "Cứu Cứu") { // ← đổi tên theo ý bạn
    try {
        // nếu bạn muốn tuyệt đối không tạo label mới khi chưa có, có thể tách 1 hàm getLabelIdOnly()
        const id = await getOrCreateLabelId(name);
        if (id) return removeLabelFromUser(psid, id);
    } catch (e) { console.log("clearNeedAgentLabel error:", e); }
    return null;
}



module.exports = { sendText, sendHandoverCard, sendQuickPriceOptions, sendTyping, passThreadToHuman, sendPriceWithNote, takeThreadBack, addLabelToUser, requestThreadBack, getThreadOwner, getOrCreateLabelId, removeLabelFromUser, clearNeedAgentLabel, sendDisabledNotice, BOT_DISABLED_MESSAGE };
