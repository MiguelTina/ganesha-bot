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

// === preguntas sobre el último producto ===
if (/(cu[aá]nto cuesta|precio|vale|presentaci[oó]n|para qu[eé] sirve)/.test(consulta)) {
  const ultimo = sesiones[message.from]?.ultimoProducto;

  if (ultimo) {
    let respuesta = '';

    if (/cu[aá]nto cuesta|precio|vale/.test(consulta)) {
      respuesta = El precio de ${ultimo.nombre} es $${ultimo.precio} MXN.;
    } else if (/presentaci[oó]n/.test(consulta)) {
      respuesta = ${ultimo.nombre} se presenta en: ${ultimo.descripcion};
    } else if (/para qu[eé] sirve/.test(consulta)) {
      respuesta = Este producto sirve para: ${ultimo.descripcion};
    }

    await client.sendText(message.from, respuesta);
    return;
  }
}
	// === inicio memoria por cliente ===
    if (!sesiones [message.from]) {
    sesiones[message.form] = {
	nombre:'',
  	carrito: [],
	ultimoProducto: '',
	ultimaInteraccion: new Date()
 };
} 
    const cliente = await coleccionClientes.findOne({ numero: message.from });

    if (!cliente || !cliente.coleccion_productos) {
      await client.sendText(message.from, 'Lo siento, no tengo acceso a tu catálogo de productos en este momento.');
      return;
    }

    const coleccionProductos = db.collection(cliente.coleccion_productos);
    const coleccionPedidos = db.collection('pedidos');

    if (!sesiones[message.from]) sesiones[message.from] = { carrito: [] };
    const nombreUsuario = sesiones[message.from]?.nombre || '';

    if (/(hola|buenos d[íi]as|buenas tardes|buenas noches|qué tal|holi|hey)/.test(consulta)) {
      const clienteExistente = await coleccionClientes.findOne({ numero: message.from });

      if (clienteExistente) {
        sesiones[message.from].nombre = clienteExistente.nombre;
        await client.sendText(message.from, `¡Qué gusto saludarte de nuevo, ${clienteExistente.nombre}! 😉`);
        await client.sendText(message.from, '¿En qué te puedo ayudar hoy? ¿Buscas algo específico?');
      } else {
        await client.sendText(message.from, '¡Hola! 😊 Bienvenido a Ganesha. ¿Con quién tengo el gusto?');
      }
      return;
    }

    if ((/me llamo|soy /.test(consulta)) && !sesiones[message.from].nombre) {
      const posibleNombre = consulta.replace(/^me llamo|soy/i, '').trim();
      if (posibleNombre.length > 0) {
        sesiones[message.from].nombre = posibleNombre.split(' ')[0];

        await coleccionClientes.insertOne({
          numero: message.from,
          nombre: sesiones[message.from].nombre,
          creado: new Date(),
        });

        await client.sendText(message.from, `Mucho gusto, ${sesiones[message.from].nombre} 😊 ¿En qué te puedo ayudar hoy?`);
        return;
      }
    }

    if (/finalizar pedido/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      const nombre = sesiones[message.from].nombre || 'Cliente sin nombre';

      if (!carrito.length) {
        await client.sendText(message.from, 'Tu carrito está vacío. Agrega productos antes de finalizar el pedido.');
        return;
      }

      const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

      await coleccionPedidos.insertOne({
        cliente: { nombre, numero: message.from },
        productos: carrito,
        total,
        fecha: new Date(),
      });

      await client.sendText(message.from, `✅ Tu pedido ha sido registrado con éxito. Total: $${total.toFixed(2)} MXN\n¡Gracias por tu compra! 😊`);

      const admin = '5214778459574@c.us';
      const detalle = carrito.map(p => `- ${p.nombre} x${p.cantidad}`).join('\n');
      await client.sendText(admin, `🛎️ Nuevo pedido de ${nombre}\nNúmero: ${message.from}\nTotal: $${total.toFixed(2)} MXN\nProductos:\n${detalle}`);

      sesiones[message.from].carrito = [];
      return;
    }

    if (/resumen del carrito/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      if (!carrito.length) {
        await client.sendText(message.from, 'Tu carrito está vacío.');
        return;
      }
      const resumen = carrito.map((p, i) => `${i + 1}. ${p.nombre} - $${p.precio} x ${p.cantidad}`).join('\n');
      const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
      await client.sendText(message.from, `🛒 Tu carrito:\n${resumen}\n\n🧾 Total: $${total.toFixed(2)} MXN`);
      return;
    }

    const matchCantidad = consulta.match(/agregar (\d+) (.+) al carrito/);
    if (matchCantidad) {
      const cantidad = parseInt(matchCantidad[1]);
      const nombreProducto = matchCantidad[2];
      const producto = await coleccionProductos.findOne({ nombre: new RegExp(nombreProducto, 'i') });
     	
      if (producto) {
        sesiones[message.from].carrito.push({ ...producto, cantidad });
	   sesiones[message.from].ultimoProducto = producto;	
        await client.sendText(message.from, `✅ Agregado ${cantidad} x ${producto.nombre} al carrito.`);
      } else {
        await client.sendText(message.from, 'No encontré ese producto en el catálogo.');
      }
      return;
    }

    const productos = await coleccionProductos.find().toArray();
    const prompt = `Eres un asistente virtual de Ganesha. Catálogo:\n${productos.map(p => `- ${p.nombre}: ${p.descripcion}, Precio: $${p.precio}`).join('\n')}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message.body },
      ],
    });

    const respuestaGPT = completion.choices[0].message.content;
    await client.sendText(message.from, respuestaGPT);
  });
}
