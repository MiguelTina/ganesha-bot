require('dotenv').config();
const { connectDB, getDB } = require('./db');

async function insertarProductos() {
  await connectDB();
  const db = getDB();

  const productosDemo = [
    {
      nombre: 'Pintura Vinílica Blanca 19L',
      descripcion: 'Pintura de excelente calidad para interiores y exteriores.',
      precio: 890,
    },
    {
      nombre: 'Impermeabilizante Rojo 19L',
      descripcion: 'Impermeabilizante acrílico para azoteas, cubre 70m².',
      precio: 1250,
    },
  ];

  try {
    const resultado = await db.collection('productos_demo').insertMany(productosDemo);
    console.log('✅ Productos insertados correctamente:', resultado.insertedCount);
  } catch (error) {
    console.error('❌ Error al insertar productos:', error);
  }
}

insertarProductos();
