// db.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db();
    console.log('✅ Conectado a MongoDB Atlas');
  } catch (err) {
    console.error('❌ Error al conectar a MongoDB:', err);
  }
}

function getDB() {
  if (!db) {
    throw new Error('La base de datos no ha sido conectada. Asegúrate de llamar connectDB() primero.');
  }
  return db;
}

module.exports = {
  connectDB,
  getDB
};
