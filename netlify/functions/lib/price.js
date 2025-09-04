const PRICE_URL = process.env.PRICE_URL;

async function fetchAllPrices() {
    try {
        const r = await fetch(PRICE_URL);
        const arr = await r.json();
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        console.error("PRICE_URL error", e);
        return [];
    }
}

async function fetchPrice(label) {
    const arr = await fetchAllPrices();
    return arr.find((x) =>
        String(x?.type || "").toLowerCase().includes(String(label).toLowerCase())
    ) || null;
}

module.exports = { fetchPrice, fetchAllPrices };
