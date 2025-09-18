function formatDatetime(dateLike, tz = "Asia/Ho_Chi_Minh") {
    if (!dateLike) return "";
    try {
        return new Intl.DateTimeFormat("vi-VN", {
            timeZone: tz,
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        }).format(new Date(dateLike));
    } catch {
        return "";
    }
}

function apologyText() {
    return "🙏 Xin lỗi quý khách. Tiệm đã đóng cửa. Quý khách hãy quay lại trong khung giờ làm việc để được cập nhật giá \n" +
        "⏰ Tiệm mở cửa từ 7:00 - 21:00 mỗi ngày.";

}
function apologyTextUpdateTime() {
    return "🙏 Xin lỗi quý khách. Giá đang được cập nhật\n" +
        "⏰ Quý khách vui lòng đợi trong giây lát.";
}

function formatPrice(d) {
    if (!d || !d.buyVND || !d.sellVND) {
        return apologyTextUpdateTime();
    }
    const when = formatDatetime(d.updatedAt);
    return [
        "🌼 TIỆM VÀNG NHỊ MAI 🌼",
        `✨ Giá Vàng ${d.type} hiện tại ✨`,
        "",
        `💰 Mua: ${d.buyVND} / chỉ`,
        `💰 Bán: ${d.sellVND} / chỉ`,
        "",
        `⏰ Cập nhật: ${when}`
    ].join("\n");
}

module.exports = { formatPrice, formatDatetime, apologyText };
