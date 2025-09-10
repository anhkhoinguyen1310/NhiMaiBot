// lib/mongo.js
const { MongoClient } = require("mongodb");

let client, db;
module.exports = async function getDb() {
    if (db) return db; // reuse across invocations (important for serverless)
    client = new MongoClient(process.env.MONGO_URI, { retryWrites: true });
    await client.connect();
    db = client.db(process.env.MONGO_DB || "pricebot");
    return db;
};
