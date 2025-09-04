const { removeDiacritics } = require("./diacritics");

// Helper: test mảng regex
const any = (arr, s) => arr.some((re) => re.test(s));

// Các nhóm mẫu từ khoá (không dấu)
const PRICE_TRIGGERS = [
    /\bgia\b/, /\bbao\s*nhieu\b/, /\bbao\s*nhiu\b/, /\bbn\b/,
    /\bbao\s*nhieu\s*tien\b/, /\bbao\b/,
    /\bcap\s*nhat\b/, /\bupdate\b/
];

const GOLD_TRIGGERS = [
    /\bvang\b/, /\bnu\s*trang\b/, /\bnhan\b/
];

// 18K (vàng tây, 610‰, 18 kara/karat/kt)
const K18 = [
    /\b18\s*k\b/, /\b18kt\b/, /\b18\s*kar?a?t?\b/,
    /\b610\b/, /\bnu\s*trang\s*610\b/, /\bvang\s*tay\b/
];

// 24K (vàng ta, 980‰, 24 kara/karat/kt)
const K24 = [
    /\b24\s*k\b/, /\b24kt\b/, /\b24\s*kar?a?t?\b/,
    /\b980\b/, /\bnu\s*trang\s*980\b/, /\bvang\s*ta\b/
];

// Nhẫn 9999 (bốn số 9, nhẫn tròn)
const K9999 = [
    /\b9999\b/, /\b4\s*so\b/, /\bb[o0]n\s*so\b/, /\bbon\s*so\b/,
    /\bnhan\s*tron\b/, /\bnhan\s*4\s*so\s*9\b/, /\b4\s*so\s*9\b/
];

// Các từ "mơ hồ/giao tiếp" hay filler (để nhận diện unknown có chủ đích)
const GENERIC_CHAT = [
    /\bad\b/, /\bad\s*oi\b/, /\boi\b/, /\bban\b/, /\bban\s*oi\b/,
    /\bshop\b/, /\bcho\s*hoi\b/, /\bhoi\b/, /\bxin\s*chao\b/,
    /\bchao\b/, /\bhello\b/, /\bhi\b/, /\bh[ôo]m?\s*nay\b/, /\bnay\b/
];

// Quy tắc: có dấu "nhận" → ignore (tránh nhầm "nhẫn")
function containsNhanVerb(raw) {
    return /\bnhận\b/.test(raw);
}

function normalize(rawText) {
    const raw = String(rawText || "");
    const q = removeDiacritics(raw).toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ") // bỏ ký tự đặc biệt (giữ chữ-số-khoảng trắng)
        .replace(/\s+/g, " ")              // gộp khoảng trắng
        .trim();
    return { rawLower: raw.toLowerCase(), q };
}

// trả về:
// - { type: "ignore" }                  → có "nhận" (đúng dấu) → im lặng
// - { type: "price", label, kind }      → xác định rõ loại giá
// - { type: "unknown" }                 → không chắc → hiện quick replies
function detectType(rawText) {
    const { rawLower, q } = normalize(rawText);

    // 1) Giữ đúng yêu cầu: có chữ "nhận" (đúng dấu) thì bỏ qua
    if (containsNhanVerb(rawLower)) {
        return { type: "ignore" };
    }

    // 2) Ưu tiên nhận diện loại vàng nếu có
    if (any(K18, q)) return { type: "price", label: "Nữ Trang 610", kind: "18k" };
    if (any(K24, q)) return { type: "price", label: "Nữ Trang 980", kind: "24k" };
    if (any(K9999, q)) return { type: "price", label: "Nhẫn 9999", kind: "9999" };

    // 3) Nếu có dấu hiệu hỏi giá/nhắc vàng nhưng KHÔNG chỉ rõ loại → coi là "unknown" để bắt người dùng chọn
    const looksLikePriceQuestion =
        any(PRICE_TRIGGERS, q) || any(GOLD_TRIGGERS, q) || any(GENERIC_CHAT, q);

    if (looksLikePriceQuestion) {
        return { type: "unknown" }; // hiện quick replies: 9999 / 18K / 24K
    }

    // 4) Mọi thứ khác (vd: hỏi địa chỉ, thanh toán, giờ mở cửa, emoji...) → unknown
    return { type: "unknown" };
}

module.exports = { detectType };
