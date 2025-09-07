const cooldownMap = new Map(); // userId -> timestamp of last request

const COOLDOWN_MS = 3000; // 3 giây

function isRateLimited(userId) {
    const now = Date.now();
    const lastRequestTime = cooldownMap.get(userId) || 0;
    if (now - lastRequestTime < COOLDOWN_MS) {
        return true; // vẫn đang trong thời gian cooldown
    }
    return false;
}

function setCoolDown(userId) {
    cooldownMap.set(userId, Date.now());
}

module.exports = { isRateLimited, setCoolDown };