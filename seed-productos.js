const { MongoClient } = require('mongodb');

async function seedProductos() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db('ganesha');
    const productos = db.collection('productos-demo');

    // Limpia colección
    await productos.deleteMany({});

    const datos = [
      {
        nombre: "Impermeabilizante rojo 19L",
        precio: 899,
        categoria: "impermeabilizantes",
        descripcion: "Impermeabilizante acrílico rojo cubeta 19 litros"
      },
      {
        nombre: "Impermeabilizante blanco 4L",
        precio: 349,
        categoria: "impermeabilizantes",
        descripcion: "Impermeabilizante blanco para techos 4 litros"
      },
      {
        nombre: "Pintura vinílica blanca 19L",
        precio: 649,
        categoria: "pinturas",
        descripcion: "Pintura interior blanca mate cubeta"
      }
    ];

    const resultado = await productos.insertMany(datos);

    console.log(`✅ Insertados ${resultado.insertedCount} productos:`);
    Object.values(resultado.insertedIds).forEach((id, i) => {
      console.log(` - ${datos[i].nombre}`);
    });

  } catch (error) {
    console.error("❌ Error insertando productos:", error);
  } finally {
    await client.close();
  }
}

seedProductos();

