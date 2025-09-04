function formatDatetime(dateLike, tz = "Asia/Ho_Chi_Minh") {
    if (!dateLike) return "";
    try {
        return new Intl.DateTimeFormat("vi-VN", {
            timeZone: tz,
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
        }).format(new Date(dateLike));
    } catch {
        return "";
    }
}

function apologyText() {
    return `🙏 Xin lỗi quý khách!

Hiện Tiệm chưa cập nhật giá. Mong quý khách thông cảm.
`;
}

function formatPrice(d) {
    if (!d || !d.buyVND || !d.sellVND) {
        return apologyText();
    }
    const when = formatDatetime(d.updatedAt);
    return `✨ Giá Vàng ${d.type} hiện tại ✨

💰 Mua: ${d.buyVND} / chỉ
💰 Bán: ${d.sellVND} / chỉ

⏰ Cập nhật: ${when}`;
}

module.exports = { formatPrice, formatDatetime, apologyText };
