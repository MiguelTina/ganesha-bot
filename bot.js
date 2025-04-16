require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const fs = require('fs');
const { connectDB, getDB } = require('./db');

connectDB();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sesiones = {}; // { [numero]: { estado, carrito, productoBuscado, opcionSeleccionada, cantidadPendiente, direccionPendiente, contactoPendiente, nombre } }


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
    const consulta = message.body;

    // 1. Identificar cliente y su colección de productos
    const cliente = await coleccionClientes.findOne({ numero: message.from });
    if (!cliente || !cliente.coleccion_productos) {
      await client.sendText(message.from, 'Lo siento, no tengo acceso a tu catálogo de productos en este momento.');
      return;
    }
    const coleccionProductos = db.collection(cliente.coleccion_productos);
    const coleccionPedidos = db.collection('pedidos');

    // 2. Inicializar sesión si no existe
    if (!sesiones[message.from]) sesiones[message.from] = { carrito: [], nombre: cliente.nombre || '' };

    // 3. Obtener catálogo agrupado por categoría
    const productos = await coleccionProductos.find().toArray();
    const catalogoPorCategoria = {};
    productos.forEach(prod => {
      if (!catalogoPorCategoria[prod.categoria]) {
        catalogoPorCategoria[prod.categoria] = [];
      }
      catalogoPorCategoria[prod.categoria].push({
        nombre: prod.nombre,
        descripcion: prod.descripcion,
        precio: prod.precio
      });
    });

    // 4. Obtener carrito actual
    const carrito = sesiones[message.from].carrito || [];

    // 5. Construir prompt estricto estilo Brian Tracy
    const prompt = `Eres un asistente virtual de ventas para WhatsApp, inspirado en el estilo persuasivo, profesional y empático de Brian Tracy. Tu única función es ayudar a los clientes a navegar el catálogo de productos, agregar productos al carrito, mostrar el carrito y finalizar una cotización. \n\nSigue estas reglas estrictamente:\n1. SOLO puedes hablar de los productos que aparecen en el catálogo que te mostraré. Si el cliente pregunta por un producto o tema fuera del catálogo, responde amablemente que no manejas esa información, pero puedes ayudarle a elegir entre los productos disponibles.\n2. Nunca respondas preguntas personales, técnicas, de otro tipo de productos, ni temas ajenos a la compra.\n3. Si el cliente pregunta por un producto fuera del catálogo, sugiere otras opciones similares dentro del catálogo si existen.\n4. Siempre guía la conversación paso a paso: primero muestra las categorías, luego los productos de la categoría, luego permite agregar al carrito, mostrar el carrito y finalizar la compra.\n5. Lleva un registro del carrito del cliente en cada mensaje (te pasarán el historial de carrito en cada mensaje).\n6. Cuando el cliente decida finalizar, pide dirección y contacto, y confirma que enviarás la cotización al área de ventas.\n7. Si el cliente intenta desviar la conversación, recuérdale amablemente que solo puedes ayudarle con la compra de productos del catálogo.\n8. Usa un tono profesional, amable, persuasivo y claro, motivando al cliente a tomar la mejor decisión de compra, como lo haría Brian Tracy.\n\nEste es el catálogo de productos (estructura JSON):\n${JSON.stringify(catalogoPorCategoria, null, 2)}\n\nEl carrito actual del cliente es:\n${JSON.stringify(carrito, null, 2)}\n\nRecuerda: No puedes hablar de ningún tema fuera del catálogo, ni dar información de productos que no estén listados. Si el cliente pregunta por algo diferente, recuérdale amablemente que solo puedes ayudarle con la compra de productos del catálogo.\n\nComienza saludando y ofreciendo ver el catálogo por categorías.`;

    // 6. Enviar mensaje a OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: consulta }
      ]
    });
    const respuestaGPT = completion.choices[0].message.content;
    await client.sendText(message.from, respuestaGPT);

    // 7. Detección de acciones para actualizar carrito y finalizar pedido
    // Puedes mejorar esto con NLP o reglas más avanzadas según tus necesidades
    if (/agregar (\d+) ([^\n]+) al carrito/i.test(consulta)) {
      const match = consulta.match(/agregar (\d+) ([^\n]+) al carrito/i);
      const cantidad = parseInt(match[1]);
      const nombreProducto = match[2];
      const producto = productos.find(p => new RegExp(nombreProducto, 'i').test(p.nombre));
      if (producto) {
        sesiones[message.from].carrito.push({ ...producto, cantidad });
      }
    }
    if (/vaciar carrito|eliminar carrito/i.test(consulta)) {
      sesiones[message.from].carrito = [];
    }
    if (/finalizar( mi)? compra|enviar cotizaci[oó]n/i.test(consulta)) {
      // Aquí puedes solicitar dirección/contacto y registrar el pedido en la base de datos
      // Ejemplo de guardado:
      await coleccionPedidos.insertOne({
        cliente: { nombre: sesiones[message.from].nombre || 'Cliente', numero: message.from },
        productos: carrito,
        total: carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0),
        fecha: new Date(),
        estado: 'COTIZACION_CERRADA'
      });
      await client.sendText(message.from, 'Su carrito ha sido enviado y nos pondremos en contacto con usted para coordinar la entrega, gracias.');
      // Notificar a vendedor/admin
      const admin = '5214778459574@c.us';
      const detalle = carrito.map(p => `- ${p.nombre} x${p.cantidad}`).join('\n');
      await client.sendText(admin, `🛎️ Nueva cotización cerrada de ${nombre}\nNúmero: ${message.from}\nTotal: $${total.toFixed(2)} MXN\nProductos:\n${detalle}\nDirección: ${sesion.direccionPendiente}\nContacto: ${sesion.contactoPendiente}`);
      // Limpiar sesión
      sesiones[message.from] = { carrito: [], estado: 'inicio' };
      return;
    }

    // 4. Reconocimiento de intención de cotización/producto
    if (/(busco|quiero|me gustaría|comprar|adquirir|saber precio de|cotizar|necesito|precio de) (.+)/i.test(consulta)) {
      // Extraer producto/categoría buscado
      const matchProd = consulta.match(/(busco|quiero|me gustaría|comprar|adquirir|saber precio de|cotizar|necesito|precio de) (.+)/i);
      const busqueda = matchProd[2];
      // Buscar productos que coincidan
      const productos = await coleccionProductos.find({ $or: [
        { nombre: new RegExp(busqueda, 'i') },
        { descripcion: new RegExp(busqueda, 'i') },
        { categoria: new RegExp(busqueda, 'i') }
      ] }).toArray();
      if (!productos.length) {
        await client.sendText(message.from, 'No encontré opciones para esa búsqueda. ¿Desea intentar con otro producto o categoría?');
        return;
      }
      // Listar opciones encontradas
      let opciones = productos.map((p, i) => `${i + 1}. ${p.nombre} - $${p.precio} (${p.descripcion || ''})`).join('\n');
      await client.sendText(message.from, `Claro, manejamos las siguientes opciones:\n${opciones}\n¿Te gustaría añadir alguna al carrito? (Indica el nombre o número de la opción)`);
      sesion.estado = 'esperando_opcion_producto';
      sesion.opcionesActuales = productos;
      return;
    }

    // 5. Selección de opción de producto
    if (sesion.estado === 'esperando_opcion_producto' && sesion.opcionesActuales) {
      let opcionElegida = null;
      // Si el usuario responde con un número
      const num = parseInt(consulta.trim());
      if (!isNaN(num) && sesion.opcionesActuales[num - 1]) {
        opcionElegida = sesion.opcionesActuales[num - 1].nombre;
      } else {
        // Buscar por nombre
        const prod = sesion.opcionesActuales.find(p => new RegExp(consulta, 'i').test(p.nombre));
        if (prod) opcionElegida = prod.nombre;
      }
      if (!opcionElegida) {
        await client.sendText(message.from, 'No entendí la opción. Por favor indica el número o nombre del producto que deseas.');
        return;
      }
      sesion.productoBuscado = opcionElegida;
      sesion.estado = 'esperando_cantidad';
      await client.sendText(message.from, `¿Cuántas unidades le gustaría añadir al carrito?`);
      return;
    }

    // 6. Ver resumen del carrito
    if (/ver (el )?resumen( del carrito)?/.test(consulta)) {
      const carrito = sesion.carrito;
      if (!carrito.length) {
        await client.sendText(message.from, 'Tu carrito está vacío. Puedes agregar productos enviando el nombre o categoría.');
        return;
      }
      const resumen = carrito.map((p, i) => `${i + 1}. ${p.nombre} - $${p.precio} x ${p.cantidad}`).join('\n');
      const total = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
      await client.sendText(message.from, `🛒 Resumen de tu carrito:\n${resumen}\n\n🧾 Total: $${total.toFixed(2)} MXN\n¿Desea finalizar su compra? (responda "finalizar mi compra")`);
      sesion.estado = 'inicio';
      return;
    }

    if (/finalizar( mi)? compra/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      if (!carrito.length) {
        await client.sendText(message.from, 'Tu carrito está vacío. Agrega productos antes de finalizar la compra.');
        return;
      }
      // Aquí podrías pedir dirección/contacto y guardar el pedido si lo deseas
      await client.sendText(message.from, '¡Gracias por tu compra! Pronto nos pondremos en contacto para coordinar la entrega.');
      sesiones[message.from].carrito = [];
      return;
    }
  });
}
