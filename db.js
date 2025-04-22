const { MongoClient } = require('mongodb');

let db;

async function connectDB() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  db = client.db('ganesha'); // 👈 debe ser exactamente "ganesha"
  console.log("✅ Conectado a MongoDB");
}

function getDB() {
  return db;
}

module.exports = { connectDB, getDB };
