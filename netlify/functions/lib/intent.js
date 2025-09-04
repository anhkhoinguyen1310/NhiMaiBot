const { removeDiacritics } = require("./diacritics");
const any = (arr, s) => arr.some((re) => re.test(s));

function normalize(rawText) {
    const raw = String(rawText || "");
    const q = removeDiacritics(raw).toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    return { rawLower: raw.toLowerCase(), q };
}

function containsNhanVerb(raw) { // tránh nhầm "nhẫn"
    return /\bnhận\b/.test(raw);
}

// 18K (ưu tiên)
const K18 = [
    /\b18\s*k\b/, /\b18kt\b/, /\b18\s*kar?a?t?\b/,
    /\b610\b/, /\bnu\s*trang\s*610\b/, /\bvang\s*tay\b/, /\bvang\s*18\b/
];
// 24K
const K24 = [
    /\b24\s*k\b/, /\b24kt\b/, /\b24\s*kar?a?t?\b/,
    /\b980\b/, /\bnu\s*trang\s*980\b/, /\bvang\s*ta\b/, /\bvang\s*24\b/
];
// 9999
const K9999 = [
    /\b9999\b/, /\b4\s*so\b/, /\bb[o0]n\s*so\b/, /\bbon\s*so\b/,
    /\bnhan\s*tron\b/, /\bnhan\s*4\s*so\s*9\b/, /\b4\s*so\s*9\b/
];

// hỏi chung chung → mặc định nhẫn 9999
const GENERIC_PRICE = [
    /\bgia\b/, /\bgia\s*vang\b/, /\bvang\b/
];

function detectType(rawText) {
    const { rawLower, q } = normalize(rawText);

    if (containsNhanVerb(rawLower)) return { type: "ignore" };

    // ƯU TIÊN 18K trước 24K
    if (any(K18, q)) return { type: "price", label: "Nữ Trang 610", kind: "18k" };
    if (any(K24, q)) return { type: "price", label: "Nữ Trang 980", kind: "24k" };
    if (any(K9999, q)) return { type: "price", label: "Nhẫn 9999", kind: "9999" };

    // Hỏi "giá/vàng" chung chung → mặc định Nhẫn 9999
    if (any(GENERIC_PRICE, q)) {
        return { type: "price", label: "Nhẫn 9999", kind: "default" };
    }

    // Không match gì → unknown (để hiện quick replies)
    return { type: "unknown" };
}

module.exports = { detectType, normalize };
