const { removeDiacritics } = require("./diacritics");
const any = (arr, s) => arr.some((re) => re.test(s));

// Nhận diện “nhận” (động từ) để bỏ qua (tránh nhầm “nhẫn”)
function containsNhanVerb(raw) {
    return /\bnhận\b/.test(raw);
}

function normalize(rawText) {
    const raw = String(rawText || "");
    const q = removeDiacritics(raw).toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    return { rawLower: raw.toLowerCase(), q };
}

// Tập regex
const K18 = [
    /\b18\s*k\b/, /\b18kt\b/, /\b18\s*kar?a?t?\b/,
    /\b610\b/, /\bnu\s*trang\s*610\b/, /\bvang\s*tay\b/,
    /\bvang\s*18\b/                 // <-- thêm: “vàng 18”
];

const K24 = [
    /\b24\s*k\b/, /\b24kt\b/, /\b24\s*kar?a?t?\b/,
    /\b980\b/, /\bnu\s*trang\s*980\b/, /\bvang\s*ta\b/,
    /\bvang\s*24\b/                 // <-- thêm: “vàng 24”
];

const K9999 = [
    /\b9999\b/, /\b4\s*so\b/, /\bb[o0]n\s*so\b/, /\bbon\s*so\b/,
    /\bnhan\s*tron\b/, /\bnhan\s*4\s*so\s*9\b/, /\b4\s*so\s*9\b/
];

const PRICE_TRIGGERS = [
    /\bgia\b/, /\bbao\s*nhieu\b/, /\bbao\s*nhiu\b/, /\bbn\b/,
    /\bcap\s*nhat\b/, /\bupdate\b/
];
const GOLD_TRIGGERS = [/\bvang\b/, /\bnu\s*trang\b/, /\bnhan\b/];
const GENERIC_CHAT = [
    /\bad\b/, /\bad\s*oi\b/, /\boi\b/, /\bban\b/, /\bban\s*oi\b/,
    /\bshop\b/, /\bcho\s*hoi\b/, /\bhoi\b/, /\bxin\s*chao\b/,
    /\bchao\b/, /\bhello\b/, /\bhi\b/, /\bh[ôo]m?\s*nay\b/, /\bnay\b/
];

function detectType(rawText) {
    const { rawLower, q } = normalize(rawText);

    // 1) “nhận” (đúng dấu) → im lặng
    if (containsNhanVerb(rawLower)) return { type: "ignore" };

    // 2) Nhận diện rõ ràng theo regex
    if (any(K18, q)) return { type: "price", label: "Nữ Trang 610", kind: "18k" };
    if (any(K24, q)) return { type: "price", label: "Nữ Trang 980", kind: "24k" };
    if (any(K9999, q)) return { type: "price", label: "Nhẫn 9999", kind: "9999" };

    // 3) Heuristic bổ sung: có 'vang' + số 18 (không có 24/9999) → 18k
    const hasVang = /\bvang\b/.test(q);
    const has18 = /(^|[^0-9])18($|[^0-9])/.test(q);
    const has24 = /(^|[^0-9])24($|[^0-9])/.test(q);
    const has9999 = /\b9999\b/.test(q);

    if (hasVang && has18 && !has24 && !has9999) {
        return { type: "price", label: "Nữ Trang 610", kind: "18k-heuristic" };
    }
    if (hasVang && has24 && !has18 && !has9999) {
        return { type: "price", label: "Nữ Trang 980", kind: "24k-heuristic" };
    }

    // 4) Câu mơ hồ → hiện nút
    if (any(PRICE_TRIGGERS, q) || any(GOLD_TRIGGERS, q) || any(GENERIC_CHAT, q)) {
        return { type: "unknown" };
    }

    return { type: "unknown" };
}

module.exports = { detectType, normalize };
