require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const fs = require('fs');
const { connectDB, getDB } = require('./db');

connectDB();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sesiones = {};

wppconnect
  .create({
    session: 'ganesha-session',
    catchQR: (base64QR, asciiQR) => {
      console.log('Escanea este QR con tu celular:');
      console.log(asciiQR);
    },
    statusFind: (statusSession) => {
      console.log('Estado de la sesión:', statusSession);
    },
    headless: true,
  })
  .then((client) => start(client))
  .catch((error) => console.error(error));

async function start(client) {
  const db = getDB();
  const coleccionClientes = db.collection('clientes');

  client.onMessage(async (message) => {
    console.log('Mensaje recibido:', message.body);
    const consulta = message.body.toLowerCase();

    let cliente = await coleccionClientes.findOne({ numero: message.from });

    if (!cliente) {
      // Crear cliente automáticamente con colección de productos por defecto
      const nuevoCliente = {
        nombre: '',
        numero: message.from,
        coleccion_productos: 'productos',
        creado: new Date(),
      };
      await coleccionClientes.insertOne(nuevoCliente);
      cliente = nuevoCliente;
      sesiones[message.from] = { carrito: [], nombre: '' };
      await client.sendText(message.from, '¡Bienvenido! Te he registrado para que puedas cotizar nuestros productos. ¿Con quién tengo el gusto?');
      return; // Detener aquí para evitar doble saludo
    } else if (!cliente.coleccion_productos) {
      await client.sendText(message.from, 'Lo siento, no tengo acceso a tu catálogo de productos en este momento.');
      return;
    }

    // Sincronizar nombre de la sesión con la base de datos
    if (!sesiones[message.from]) sesiones[message.from] = { carrito: [], nombre: cliente.nombre || '' };
    if (!sesiones[message.from].nombre && cliente.nombre) sesiones[message.from].nombre = cliente.nombre;

    const coleccionProductos = db.collection(cliente.coleccion_productos);
    const coleccionPedidos = db.collection('pedidos');

    if (!sesiones[message.from]) sesiones[message.from] = { carrito: [] };
    const nombreUsuario = sesiones[message.from]?.nombre || '';

    // Evitar saludo/bienvenida repetida: solo si es nuevo y no tiene nombre
    if (/(hola|buenos d[íi]as|buenas tardes|buenas noches|qué tal|holi|hey)/.test(consulta)) {
      if (!sesiones[message.from].saludado) {
        if (!sesiones[message.from].nombre) {
          await client.sendText(message.from, '¡Hola! 😊 Bienvenido a Ganesha, tu asesor de confianza. ¿Con quién tengo el gusto?');
        } else {
          await client.sendText(message.from, `¡Qué gusto saludarte de nuevo, ${sesiones[message.from].nombre}! ¿En qué puedo ayudarte hoy?`);
        }
        sesiones[message.from].saludado = true;
      }
      // Si ya saludó en esta sesión, no responder nada
      return;
    }

    // Si el usuario responde solo con su nombre después del saludo inicial
    if (!sesiones[message.from].nombre && consulta.match(/^con\s+([a-záéíóúüñ]+)$/i)) {
      const nombreFinal = consulta.replace(/^con\s+/i, '').trim().split(' ')[0];
      sesiones[message.from].nombre = nombreFinal;
      await coleccionClientes.updateOne(
        { numero: message.from },
        { $set: { nombre: nombreFinal } }
      );
      await client.sendText(message.from, `¡Mucho gusto, ${nombreFinal}. ¿Cómo puedo ayudarte el día de hoy?`);
      sesiones[message.from].saludado = true;
      return;
    }

    if ((/me llamo|soy /.test(consulta)) && !sesiones[message.from].nombre) {
      const posibleNombre = consulta.replace(/^me llamo|soy/i, '').trim();
      if (posibleNombre.length > 0) {
        const nombreFinal = posibleNombre.split(' ')[0];
        sesiones[message.from].nombre = nombreFinal;
        await coleccionClientes.updateOne(
          { numero: message.from },
          { $set: { nombre: nombreFinal } }
        );
        await client.sendText(message.from, `¡Mucho gusto, ${nombreFinal}. ¿Cómo puedo ayudarte el día de hoy?`);
        sesiones[message.from].saludado = true;
        return;
      }
    }

    if (/finalizar pedido/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      const nombre = sesiones[message.from].nombre || 'Cliente sin nombre';

      if (!carrito.length) {
        await client.sendText(message.from, 'Tu carrito está vacío. ¿Te gustaría que te ayude a elegir los mejores productos para tu proyecto?');
        return;
      }

      const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

      await coleccionPedidos.insertOne({
        cliente: { nombre, numero: message.from },
        productos: carrito,
        total,
        fecha: new Date(),
      });

      await client.sendText(message.from, `✅ ¡Tu pedido ha sido registrado con éxito, ${nombre}! Total: $${total.toFixed(2)} MXN\nAgradezco mucho tu confianza. ¿Te gustaría recibir recomendaciones para aprovechar mejor tus productos? Si tienes alguna otra consulta, estoy aquí para ayudarte.`);

      const admin = '5214778459574@c.us';
      const detalle = carrito.map(p => `- ${p.nombre} x${p.cantidad}`).join('\n');
      await client.sendText(admin, `🛎️ Nuevo pedido de ${nombre}\nNúmero: ${message.from}\nTotal: $${total.toFixed(2)} MXN\nProductos:\n${detalle}`);

      sesiones[message.from].carrito = [];
      return;
    }

    if (/resumen del carrito/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      if (!carrito.length) {
        await client.sendText(message.from, 'Tu carrito está vacío. ¿Te gustaría que te recomiende productos según tus necesidades?');
        return;
      }
      const resumen = carrito.map((p, i) => `${i + 1}. ${p.nombre} - $${p.precio} x ${p.cantidad}`).join('\n');
      const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
      await client.sendText(message.from, `🛒 Este es tu carrito actual:\n${resumen}\n\n🧾 Total: $${total.toFixed(2)} MXN\n¿Te gustaría agregar algo más o necesitas asesoría para tu compra?`);
      return;
    }

    // Eliminar producto del carrito
    const matchEliminar = consulta.match(/eliminar (.+) del carrito/);
    if (matchEliminar) {
      const nombreProducto = matchEliminar[1].trim();
      let carrito = sesiones[message.from].carrito;
      const index = carrito.findIndex(p => p.nombre.toLowerCase().includes(nombreProducto));
      if (index !== -1) {
        const eliminado = carrito.splice(index, 1)[0];
        await client.sendText(message.from, `✅ He eliminado ${eliminado.nombre} de tu carrito.`);
      } else {
        await client.sendText(message.from, `No encontré "${nombreProducto}" en tu carrito. ¿Quieres que te ayude a buscarlo o agregarlo?`);
      }
      return;
    }

    // Cambiar cantidad de producto en el carrito
    const matchCantidadMod = consulta.match(/cambiar cantidad de (.+) a (\d+)/);
    if (matchCantidadMod) {
      const nombreProducto = matchCantidadMod[1].trim();
      const nuevaCantidad = parseInt(matchCantidadMod[2]);
      let carrito = sesiones[message.from].carrito;
      const producto = carrito.find(p => p.nombre.toLowerCase().includes(nombreProducto));
      if (producto) {
        producto.cantidad = nuevaCantidad;
        await client.sendText(message.from, `✅ Ahora tienes ${nuevaCantidad} x ${producto.nombre} en tu carrito.`);
      } else {
        await client.sendText(message.from, `No encontré "${nombreProducto}" en tu carrito. ¿Quieres que te ayude a agregarlo?`);
      }
      return;
    }

    const matchCantidad = consulta.match(/agregar (\d+) (.+) al carrito/);
    if (matchCantidad) {
      const cantidad = parseInt(matchCantidad[1]);
      const nombreProducto = matchCantidad[2];
      const producto = await coleccionProductos.findOne({ nombre: new RegExp(nombreProducto, 'i') });

      if (producto) {
        sesiones[message.from].carrito.push({ ...producto, cantidad });
        await client.sendText(message.from, `✅ He agregado ${cantidad} x ${producto.nombre} a tu carrito. ¿Te gustaría saber cómo aprovecharlo mejor o necesitas cotización de otro producto?`);
      } else {
        await client.sendText(message.from, `Por el momento no manejamos "${nombreProducto}" en nuestro catálogo. ¿Hay algún otro producto o necesidad en la que te pueda ayudar?`);
      }
      return;
    }

    // --- Nueva lógica robusta: búsqueda previa de producto en cualquier mensaje ---
    // Si el usuario menciona explícitamente un producto, buscar coincidencias antes de pasar a OpenAI
    const consultaProducto = consulta.match(/(busco|quiero|necesito|tienes|manejas|vendes)\s+([a-z0-9áéíóúüñ\s]+)/i);
    if (consultaProducto) {
      const nombreBuscado = consultaProducto[2].trim();
      // Buscar por nombre, alias o categoría
      const productoDirecto = await coleccionProductos.findOne({
        $or: [
          { nombre: new RegExp(nombreBuscado, 'i') },
          { alias: { $elemMatch: { $regex: nombreBuscado, $options: 'i' } } },
          { categoria: new RegExp(nombreBuscado, 'i') }
        ]
      });
      if (!productoDirecto) {
        await client.sendText(message.from, `Lamentablemente en este momento no manejamos "${nombreBuscado}" en nuestro catálogo. ¿Hay algún otro producto o necesidad en la que te pueda ayudar?`);
        return;
      }
    }

    // Solo sugerir productos si el usuario hace una consulta específica, no en el primer mensaje
    if (consulta.length < 4 || /catálogo|productos|lista/i.test(consulta)) {
      await client.sendText(message.from, '¿En qué producto o necesidad específica te gustaría que te ayude hoy? Puedes decirme qué buscas y te asesoro personalmente.');
      return;
    }

    const productos = await coleccionProductos.find().toArray();
    const prompt = `Eres un asistente virtual de Ganesha, experto en ventas consultivas y atención al cliente. Tu objetivo es ayudar, escuchar y guiar al usuario como un vendedor profesional (inspirado en Brian Tracy).

Catálogo de productos:
${productos.map(p => `- ${p.nombre}: ${p.descripcion}, Precio: $${p.precio}`).join('\n')}

Reglas para la conversación:
- Siempre haz preguntas abiertas y de calificación antes de recomendar productos (por ejemplo: ¿Para qué área o superficie es?, ¿Tienes alguna preferencia de marca o color?, ¿Cuál es tu presupuesto aproximado?, ¿Es para uso interior o exterior?).
- Si el usuario menciona un producto, primero pregunta detalles relevantes para poder asesorar mejor antes de recomendar.
- No des una lista de productos sin antes entender la necesidad específica del usuario.
- Cuando tengas la información suficiente, ofrece preparar una cotización o recomendar productos concretos.
- Cierra con una pregunta consultiva, como: “¿Te gustaría que te prepare una cotización?” o “¿Quieres que te recomiende productos específicos para tu caso?”
- Si el usuario pide un producto que no existe, responde de forma empática que no lo manejamos, pero sugiere alternativas si es posible.
- Evita saludos repetidos, solo da la bienvenida en el primer mensaje.

Recuerda: tu tono debe ser consultivo, cálido y profesional. El objetivo es ayudar al usuario a tomar la mejor decisión para su compra.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message.body },
      ],
    });

    let respuestaGPT = completion.choices[0].message.content;
    // Filtrar saludos automáticos si ya se saludó en la sesión
    if (sesiones[message.from].saludado) {
      respuestaGPT = respuestaGPT.replace(/^\s*(¡?hola!?[,.]?\s*)+/i, '');
      respuestaGPT = respuestaGPT.replace(/^\s*(buenos días|buenas tardes|buenas noches)[,.]?\s*/i, '');
    }
    await client.sendText(message.from, respuestaGPT.trim());
  });
}
