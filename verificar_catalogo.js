const { connectDB, getDB } = require('./db');

(async () => {
  await connectDB();
  const db = getDB();

  const productos = await db.collection('productos-demo').find({}).toArray();
  console.log('📦 Productos en catálogo:');
  productos.forEach(p => {
    console.log(`- ${p.nombre} ($${p.precio})`);
  });

  process.exit();
})();

