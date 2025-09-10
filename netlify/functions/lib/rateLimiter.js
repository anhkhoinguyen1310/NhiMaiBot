// npm i @upstash/redis
const { Redis } = require("@upstash/redis");

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALLOWED = 2;               // cho hỏi 3 lần
const BLOCK_SEC = 3 * 60;       // khóa 30 phút
const COUNT_TTL_SEC = 24 * 60 * 60; // giữ đếm tối đa 24h (tuỳ bạn)

function minutesLeft(sec) { return Math.ceil(sec / 60); }

async function consumeAsk(psid) {
    const blockKey = `ask:block:${psid}`;
    const countKey = `ask:count:${psid}`;

    // đang bị khóa?
    const ttl = await redis.ttl(blockKey); // -2: không tồn tại, -1: có nhưng không TTL
    if (ttl > 0) return { allowed: false, blockedSec: ttl, remaining: 0 };

    // tăng đếm
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, COUNT_TTL_SEC);

    if (count > ALLOWED) {
        await redis.set(blockKey, 1, { ex: BLOCK_SEC });
        await redis.del(countKey); // reset quota sau khi hết khóa
        return { allowed: false, blockedSec: BLOCK_SEC, remaining: 0 };
    }
    return { allowed: true, remaining: ALLOWED - count, blockedSec: 0 };
}

module.exports = { consumeAsk, minutesLeft };
