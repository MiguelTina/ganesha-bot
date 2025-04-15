require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Conectado a MongoDB Atlas');

    const db = client.db(); // Usa la base por defecto de tu URI
    const coleccionClientes = db.collection('clientes');

    const nuevoCliente = {
      nombre: "Tienda de Prueba",
      numero: "5214792228660",
      coleccion_productos: "productos_tienda_prueba",
      contacto_alerta: "5214778459574",
      creado: new Date()
    };

    const clienteExistente = await coleccionClientes.findOne({ numero: nuevoCliente.numero });

    if (!clienteExistente) {
      await coleccionClientes.insertOne(nuevoCliente);
      console.log('✅ Cliente insertado con éxito');
    } else {
      console.log('ℹ️ El cliente ya existe en la base de datos');
    }

  } catch (error) {
    console.error('❌ Error al insertar cliente:', error);
  } finally {
    await client.close();
  }
}

main();
