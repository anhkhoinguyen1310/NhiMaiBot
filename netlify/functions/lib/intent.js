const { removeDiacritics } = require("./diacritics");

// Trả về một object intent:
// - { type: "ignore" }                    -> bỏ qua (vd: có chữ "nhận")
// - { type: "price", label: "<label>" }   -> cần fetch giá theo label
// - { type: "unknown" }                   -> không rõ, gợi ý quick replies
function detectType(rawText) {
    const raw = String(rawText || "").toLowerCase();

    // Giữ nguyên logic: có chữ "nhận" (đúng dấu) thì bỏ qua (tránh nhầm "nhẫn")
    if (/\bnhận\b/.test(raw)) {
        return { type: "ignore" };
    }

    const q = removeDiacritics(raw).toLowerCase().trim();

    // Ưu tiên 18k trước 24k để "vàng tây" không bị ăn nhầm "vàng ta"
    if (/\b18\s*k\b|\bvang\s*tay\b|\bvang\s*18\b/.test(q)) {
        return { type: "price", label: "Nữ Trang 610", kind: "18k" };
    }

    if (/\b980\b|\b24\s*k\b|\bvang\s*ta\b|\bvang\s*24\b/.test(q)) {
        return { type: "price", label: "Nữ Trang 980", kind: "24k" };
    }

    if (/\b9999\b|\b4\s*so\b|\bbon\s*so\b|\bnhan\s*tron\b/.test(q)) {
        return { type: "price", label: "Nhẫn 9999", kind: "9999" };
    }

    // Hỏi chung chung có chữ "giá"/"vàng" -> mặc định nhẫn 9999
    if (/\bgia\b|\bvang\b/.test(q)) {
        return { type: "price", label: "Nhẫn 9999", kind: "default" };
    }

    return { type: "unknown" };
}

module.exports = { detectType };
