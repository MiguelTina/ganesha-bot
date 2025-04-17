// handlers/greetings.js

async function handleGreeting({ message, client, sesiones, coleccionClientes, mostrarMenuCategorias, categoriasMenu }) {
  // Siempre usar 'Ganesha' como nombre de la tienda
  const clienteExistente = await coleccionClientes.findOne({ numero: message.from });

  if (clienteExistente) {
    sesiones[message.from].nombre = clienteExistente.nombre;
    await client.sendText(
      message.from,
      `¡Hola! Bienvenido a Ganesha, ${clienteExistente.nombre} 😊\nEstas son nuestras categorías principales:`
    );
    await mostrarMenuCategorias({ client, to: message.from, categorias: categoriasMenu });
  } else {
    await client.sendText(
      message.from,
      `¡Hola! Bienvenido a Ganesha 😊\n¿Con quién tengo el gusto?\nEstas son nuestras categorías principales:`
    );
    await mostrarMenuCategorias({ client, to: message.from, categorias: categoriasMenu });
  }
}

async function handleRegisterName({ message, client, sesiones, coleccionClientes, mostrarMenuCategorias, categoriasMenu }) {
  const consulta = message.body.toLowerCase();
  const posibleNombre = consulta.replace(/^me llamo|soy /i, '').trim();
  if (posibleNombre.length > 0) {
    sesiones[message.from].nombre = posibleNombre.split(' ')[0];
    await coleccionClientes.insertOne({
      numero: message.from,
      nombre: sesiones[message.from].nombre,
      creado: new Date(),
    });
    await client.sendText(
      message.from,
      `Mucho gusto, ${sesiones[message.from].nombre}. Estas son nuestras categorías:`
    );
    await mostrarMenuCategorias({ client, to: message.from, categorias: categoriasMenu });
    return true;
  }
  return false;
}

module.exports = {
  handleGreeting,
  handleRegisterName,
};
