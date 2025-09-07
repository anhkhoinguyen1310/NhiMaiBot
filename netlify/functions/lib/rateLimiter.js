// askLimiter.js
const store = new Map();
// key = psid -> { count: number, nextAllowedAt: number, lastAt: number }

const ALLOWED = 2;                      // 2 lần
const COOLdown_MS = 30 * 60 * 1000;     // 30 phút

function _now() { return Date.now(); }

function consumeAsk(psid) {
    const now = _now();
    const rec = store.get(psid) || { count: 0, nextAllowedAt: 0, lastAt: 0 };

    // đang bị chặn?
    if (now < rec.nextAllowedAt) {
        return { allowed: false, blockedMs: rec.nextAllowedAt - now, remaining: 0 };
    }

    if (rec.lastAt && now - rec.lastAt > COOLdown_MS) rec.count = 0;

    // đã hết 3 lần? → chặn 30'
    if (rec.count >= ALLOWED) {
        rec.count = 0; // reset để sau cooldown có lại 3 lần mới
        rec.nextAllowedAt = now + COOLdown_MS;
        rec.lastAt = now;
        store.set(psid, rec);
        return { allowed: false, blockedMs: COOLdown_MS, remaining: 0 };
    }

    // cho phép lần này
    rec.count += 1;
    rec.lastAt = now;
    rec.nextAllowedAt = 0;
    store.set(psid, rec);

    return { allowed: true, remaining: ALLOWED - rec.count, blockedMs: 0 };
}

function minutesLeft(ms) {
    return Math.ceil(ms / 60000);
}

module.exports = { consumeAsk, minutesLeft };
