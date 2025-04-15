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
    // --- Comando: Agregar productos al carrito ---
    if (/agregar (\d+) ([a-z0-9áéíóúüñ\s]+) al carrito/i.test(consulta)) {
      const match = consulta.match(/agregar (\d+) ([a-z0-9áéíóúüñ\s]+) al carrito/i);
      const cantidad = parseInt(match[1]);
      const nombreProducto = match[2].trim();
      const producto = await coleccionProductos.findOne({ nombre: new RegExp(nombreProducto, 'i') });
      if (producto) {
        let carrito = sesiones[message.from].carrito;
        let idx = carrito.findIndex(item => item._id.equals(producto._id));
        if (idx !== -1) {
          carrito[idx].cantidad += cantidad;
        } else {
          carrito.push({ ...producto, cantidad });
        }
        await client.sendText(message.from, `✅ He agregado ${cantidad} x ${producto.nombre} a tu carrito.`);
      } else {
        await client.sendText(message.from, `Por el momento no manejamos "${nombreProducto}" en nuestro catálogo. ¿Hay algún otro producto o necesidad en la que te pueda ayudar?`);
      }
      return;
    }

    // --- Comando: Eliminar productos del carrito ---
    if (/eliminar(\s+\d+)? ([a-z0-9áéíóúüñ\s]+) del carrito/i.test(consulta)) {
      const match = consulta.match(/eliminar(\s+(\d+))? ([a-z0-9áéíóúüñ\s]+) del carrito/i);
      const cantidad = match[2] ? parseInt(match[2]) : null;
      const nombreProducto = match[3].trim();
      let carrito = sesiones[message.from].carrito;
      let idx = carrito.findIndex(item => new RegExp(nombreProducto, 'i').test(item.nombre));
      if (idx !== -1) {
        if (cantidad && carrito[idx].cantidad > cantidad) {
          carrito[idx].cantidad -= cantidad;
          await client.sendText(message.from, `Se eliminaron ${cantidad} x ${carrito[idx].nombre} del carrito. Quedan ${carrito[idx].cantidad}.`);
        } else {
          await client.sendText(message.from, `Se eliminó ${carrito[idx].nombre} del carrito.`);
          carrito.splice(idx, 1);
        }
      } else {
        await client.sendText(message.from, `Ese producto no está en tu carrito.`);
      }
      return;
    }

    // --- Comando: Cambiar cantidad de un producto ---
    if (/cambiar cantidad de ([a-z0-9áéíóúüñ\s]+) a (\d+)/i.test(consulta)) {
      const match = consulta.match(/cambiar cantidad de ([a-z0-9áéíóúüñ\s]+) a (\d+)/i);
      const nombreProducto = match[1].trim();
      const cantidad = parseInt(match[2]);
      let carrito = sesiones[message.from].carrito;
      let idx = carrito.findIndex(item => new RegExp(nombreProducto, 'i').test(item.nombre));
      if (idx !== -1) {
        carrito[idx].cantidad = cantidad;
        await client.sendText(message.from, `La cantidad de ${carrito[idx].nombre} ahora es ${cantidad}.`);
      } else {
        await client.sendText(message.from, `Ese producto no está en tu carrito.`);
      }
      return;
    }

    // --- Comando: Ver resumen del carrito ---
    if (/ver carrito|resumen del carrito/i.test(consulta)) {
      let carrito = sesiones[message.from].carrito;
      if (carrito.length === 0) {
        await client.sendText(message.from, `Tu carrito está vacío.`);
      } else {
        let total = 0;
        let resumen = carrito.map(item => {
          total += item.precio * item.cantidad;
          return `- ${item.nombre}: ${item.cantidad} x $${item.precio} = $${item.cantidad * item.precio}`;
        }).join('\n');
        await client.sendText(message.from, `🛒 Resumen de tu carrito:\n${resumen}\nTotal: $${total}`);
      }
      return;
    }

    // --- Comando: Vaciar carrito ---
    if (/vaciar carrito/i.test(consulta)) {
      sesiones[message.from].carrito = [];
      await client.sendText(message.from, `Tu carrito ha sido vaciado.`);
      return;
    }

    // --- Comando: Finalizar pedido ---
    if (/finalizar pedido/i.test(consulta)) {
      let carrito = sesiones[message.from].carrito;
      if (carrito.length === 0) {
        await client.sendText(message.from, `Tu carrito está vacío. Agrega productos antes de finalizar tu pedido.`);
        return;
      }
      let total = 0;
      let resumen = carrito.map(item => {
        total += item.precio * item.cantidad;
        return `- ${item.nombre}: ${item.cantidad} x $${item.precio} = $${item.cantidad * item.precio}`;
      }).join('\n');
      await client.sendText(message.from, `Vas a finalizar tu pedido con:\n${resumen}\nTotal: $${total}\n¿Confirmas tu pedido? Responde 'confirmar pedido' para continuar.`);
      sesiones[message.from].esperandoConfirmacion = true;
      return;
    }

    // --- Confirmar pedido ---
    if (sesiones[message.from].esperandoConfirmacion && /confirmar pedido/i.test(consulta)) {
      let carrito = sesiones[message.from].carrito;
      let total = 0;
      let resumen = carrito.map(item => {
        total += item.precio * item.cantidad;
        return `- ${item.nombre}: ${item.cantidad} x $${item.precio} = $${item.cantidad * item.precio}`;
      }).join('\n');
      // Aquí podrías guardar el pedido en la base de datos si lo deseas
      await client.sendText(message.from, `✅ ¡Tu pedido ha sido registrado!\n${resumen}\nTotal: $${total}\nPronto nos pondremos en contacto contigo para coordinar la entrega.`);
      sesiones[message.from].carrito = [];
      sesiones[message.from].esperandoConfirmacion = false;
      return;
    }

    // --- FLUJO SIMPLIFICADO DE CATÁLOGO ---
    // Si el usuario pide un producto/categoría, mostrar opciones
    let nombreBuscado = null;
    let productoDirecto = null;

    const consultaProducto = consulta.match(/(busco|quiero|necesito|tienes|manejas|vendes)\s+([a-z0-9áéíóúüñ\s]+)/i);
    if (consultaProducto) {
      nombreBuscado = consultaProducto[2].trim();
    }
    if (!nombreBuscado && consulta.match(/^([a-z0-9áéíóúüñ\s]+)\?$/i)) {
      nombreBuscado = consulta.replace(/[¿?]/g, '').trim();
    }
    if (!nombreBuscado && consulta.match(/^([a-z0-9áéíóúüñ\s]+)$/i)) {
      nombreBuscado = consulta.trim();
    }
    // Excluir palabras de área/superficie
    const palabrasArea = ['interior', 'exterior', 'pared', 'paredes', 'techo', 'madera', 'metal', 'hogar', 'negocio', 'azotea'];
    if (nombreBuscado && palabrasArea.includes(nombreBuscado.toLowerCase())) {
      // Ignorar, no es producto
      nombreBuscado = null;
    }
    if (nombreBuscado) {
      // Buscar todas las coincidencias en el catálogo
      const productosCoinciden = await coleccionProductos.find({
        $or: [
          { nombre: { $regex: nombreBuscado, $options: 'i' } },
          { categoria: { $regex: nombreBuscado, $options: 'i' } }
        ]
      }).toArray();
      if (productosCoinciden.length > 0) {
        const lista = productosCoinciden.map(p => `- ${p.nombre}`).join('\n');
        await client.sendText(message.from, `Perfecto, manejo estas opciones:\n${lista}\nSi quieres saber el precio o la descripción de alguna opción, dímelo.`);
        return;
      } else {
        await client.sendText(message.from, `Lamentablemente en este momento no manejamos "${nombreBuscado}" en nuestro catálogo. ¿Hay algún otro producto o necesidad en la que te pueda ayudar?`);
        return;
      }
    }

    // Si el usuario pregunta por precio o descripción de una opción específica
    const matchPrecio = consulta.match(/(precio|cu[aá]nto cuesta|cu[aá]l es el precio) (de |del |de la )?([a-z0-9áéíóúüñ\s]+)/i);
    if (matchPrecio) {
      const nombreProducto = matchPrecio[3].trim();
      const producto = await coleccionProductos.findOne({ nombre: new RegExp(nombreProducto, 'i') });
      if (producto) {
        await client.sendText(message.from, `La opción ${producto.nombre} tiene un costo de $${producto.precio}. ¿Le gustaría agregarla al carrito?`);
      } else {
        await client.sendText(message.from, `No encontré la opción "${nombreProducto}" en el catálogo.`);
      }
      return;
    }
    const matchDescripcion = consulta.match(/(descripcion|descripción|qué es|información de|dame detalles de) (de |del |de la )?([a-z0-9áéíóúüñ\s]+)/i);
    if (matchDescripcion) {
      const nombreProducto = matchDescripcion[3].trim();
      const producto = await coleccionProductos.findOne({ nombre: new RegExp(nombreProducto, 'i') });
      if (producto) {
        await client.sendText(message.from, `${producto.nombre}: ${producto.descripcion}. ¿Le gustaría agregarlo al carrito?`);
      } else {
        await client.sendText(message.from, `No encontré la opción "${nombreProducto}" en el catálogo.`);
      }
      return;
    }

    const prompt = `Eres un asistente virtual de Ganesha, experto en ventas consultivas y atención al cliente. Tu objetivo es ayudar, escuchar y guiar al usuario como un vendedor profesional (inspirado en Brian Tracy).

Catálogo de productos:
${productos.map(p => `- ${p.nombre}: ${p.descripcion}, Precio: $${p.precio}`).join('\n')}

${contextoMemoria}

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
