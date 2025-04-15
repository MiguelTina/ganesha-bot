// seed-productos.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db();
    const productos = db.collection('productos');

    const data = JSON.parse(fs.readFileSync('productos.json', 'utf-8'));

    if (!Array.isArray(data)) {
      console.error('❌ El archivo productos.json debe ser un arreglo de productos.');
      return;
    }

    const result = await productos.insertMany(data);
    console.log(`✅ ${result.insertedCount} productos insertados en MongoDB.`);
  } catch (err) {
    console.error('❌ Error al insertar productos:', err);
  } finally {
    await client.close();
  }
}

run();
