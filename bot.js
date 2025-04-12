require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const fs = require('fs');

const productos = JSON.parse(fs.readFileSync('productos.json', 'utf-8'));

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

function start(client) {
  client.onMessage(async (message) => {
    console.log('Mensaje recibido:', message.body);
    const consulta = message.body.toLowerCase();

    if (!sesiones[message.from]) sesiones[message.from] = { carrito: [] };

    const nombreUsuario = sesiones[message.from]?.nombre || '';
    const productoAnterior = sesiones[message.from]?.producto || null;
    const categoriaAnterior = sesiones[message.from]?.categoria || null;

    if (/(hola|buenos d[íi]as|buenas tardes|buenas noches|qué tal|holi|hey)/.test(consulta)) {
      if (nombreUsuario) {
        await client.sendText(message.from, `¡Qué gusto saludarte de nuevo, ${nombreUsuario}! 😊`);
        await client.sendText(message.from, `¿En qué te puedo ayudar hoy? ¿Buscas algo específico?`);
      } else {
        await client.sendText(message.from, '¡Hola! 😊 Bienvenido a Ganesha, tu tienda de pinturas y recubrimientos.');
        await client.sendText(message.from, '¿Con quién tengo el gusto?');

        const categoriasUnicas = [...new Set(productos.map(p => p.categoria))];
        const listaCategorias = categoriasUnicas.map(c => `🔹 ${c}`).join('\n');
        const bienvenida = `En Ganesha manejamos productos en las siguientes categorías:\n\n${listaCategorias}\n\n🛠️ Puedes escribirme el nombre del producto que necesitas o algo como:\n• "Quiero impermeabilizante"\n• "Muéstrame pinturas"\n• "Agrega pintura blanca al carrito"\n• "Ver resumen del carrito"\n\nEstoy aquí para ayudarte con tu cotización de forma rápida. 😊`;
        await client.sendText(message.from, bienvenida);
      }
      return;
    }

    if ((/me llamo|soy /.test(consulta)) && !sesiones[message.from].nombre) {
      const posibleNombre = consulta.replace(/^me llamo|soy/i, '').trim();
      if (posibleNombre.length > 0) {
        sesiones[message.from].nombre = posibleNombre.split(' ')[0];
        await client.sendText(message.from, `Mucho gusto, ${sesiones[message.from].nombre} 😊 ¿En qué te puedo ayudar hoy?`);
        return;
      }
    }

    const productoEncontrado = productos.find(p => {
      const nombreEnPalabras = p.nombre.toLowerCase().split(" ");
      const nombreMatch = nombreEnPalabras.some(palabra => consulta.includes(palabra));
      const aliasMatch = p.alias?.some(alias => consulta.includes(alias.toLowerCase()));
      return nombreMatch || aliasMatch;
    });

    if (productoEncontrado) {
      sesiones[message.from].producto = productoEncontrado;
      sesiones[message.from].categoria = productoEncontrado.categoria;

      if (consulta.includes("característica") || consulta.includes("información adicional") || consulta.includes("más detalles") || consulta.includes("para qué sirve")) {
        if (productoEncontrado.caracteristicas) {
          const respuesta = `¡Claro! Aquí tienes más información sobre *${productoEncontrado.nombre}*:\n\n${productoEncontrado.caracteristicas}`;
          await client.sendText(message.from, respuesta);
          return;
        }
      }

      const respuesta = `¡Claro! Aquí tienes la información del producto que encontré para ti:\n\n*${productoEncontrado.nombre}*\n${productoEncontrado.descripcion}\n*Precio:* $${productoEncontrado.precio} MXN\n\n¿Te gustaría saber más sobre este producto o ver otras opciones?`;
      await client.sendText(message.from, respuesta);
      return;
    }

    const matchAgregarCantidad = consulta.match(/agregar\s+(\d+)\s+(al carrito|unidades|piezas|de ese|de ese producto)/);
    if (productoAnterior && matchAgregarCantidad) {
      const cantidad = parseInt(matchAgregarCantidad[1]);
      if (!isNaN(cantidad)) {
        sesiones[message.from].carrito.push({ ...productoAnterior, cantidad });
        const respuesta = `Perfecto${nombreUsuario ? ", " + nombreUsuario : ""}. He agregado *${cantidad}* de *${productoAnterior.nombre}* a tu cotización.\n\n¿Deseas ver el resumen de tu carrito o agregar algo más?`;
        await client.sendText(message.from, respuesta);
        return;
      }
    }

    if (productoAnterior && /(ese|lo quiero|me interesa|de ese|agrega|el mismo|ese mismo|agregar al carrito)/.test(consulta)) {
      sesiones[message.from].carrito.push({ ...productoAnterior, cantidad: 1 });
      const respuesta = `Perfecto${nombreUsuario ? ", " + nombreUsuario : ""}. He agregado *${productoAnterior.nombre}* a tu cotización.\n\n¿Deseas ver el resumen de tu carrito o agregar algo más?`;
      await client.sendText(message.from, respuesta);
      return;
    }

    if (/ver carrito|resumen de carrito|qué llevo|mi cotización|ver mi pedido|carrito/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      if (carrito.length === 0) {
        await client.sendText(message.from, `Tu carrito está vacío por ahora${nombreUsuario ? ", " + nombreUsuario : ""}. ¿Quieres que te sugiera algunos productos?`);
      } else {
        let resumen = `🛒 *Tu cotización actual incluye:*\n\n`;
        let total = 0;
        carrito.forEach((p, i) => {
          const subtotal = p.precio * (p.cantidad || 1);
          resumen += `${i + 1}. *${p.nombre}*\nPrecio: $${p.precio} MXN x ${p.cantidad || 1} = $${subtotal.toFixed(2)}\n\n`;
          total += subtotal;
        });
        resumen += `🧾 *Total estimado:* $${total.toFixed(2)} MXN\n`;
        resumen += `📞 *Contacto:* https://wa.me/${message.from.replace(/@c\.us$/, '')}`;
        await client.sendText(message.from, resumen);
      }
      return;
    }

    if (/finalizar pedido|confirmar pedido|terminar cotización/.test(consulta)) {
      const carrito = sesiones[message.from].carrito;
      if (carrito.length === 0) {
        await client.sendText(message.from, 'Tu carrito está vacío. ¿Te gustaría agregar algún producto antes de finalizar tu pedido?');
      } else {
        let resumen = `📦 *Nuevo pedido recibido*\n\nCliente: *${nombreUsuario || 'No proporcionado'}*\nNúmero: *${message.from}*\nContacto: https://wa.me/${message.from.replace(/@c\.us$/, '')}\n\n🛒 *Productos cotizados:*\n`;
        let total = 0;
        carrito.forEach((p, i) => {
          const subtotal = p.precio * (p.cantidad || 1);
          resumen += `${i + 1}. *${p.nombre}* - $${p.precio} x ${p.cantidad || 1} = $${subtotal.toFixed(2)}\n`;
          total += subtotal;
        });
        resumen += `\n🧾 *Total estimado:* $${total.toFixed(2)} MXN`;

        await client.sendText(message.from, '¡Gracias por tu pedido! Te contactaremos lo más pronto posible para la entrega de tus productos.');
        await client.sendText('5214775200781@c.us', resumen);

        sesiones[message.from].carrito = [];
      }
      return;
    }

    if (/qué productos manejas|productos que tienes|qué venden|catálogo|productos disponibles/.test(consulta)) {
      const categoriasUnicas = [...new Set(productos.map(p => p.categoria))];
      const listaCategorias = categoriasUnicas.map(c => `🔹 ${c}`).join('\n');
      const respuesta = `¡Hola${nombreUsuario ? ", " + nombreUsuario : ""}! 🙌 En Ganesha manejamos productos en las siguientes categorías:\n\n${listaCategorias}\n\n🛠️ Puedes escribirme el nombre del producto que necesitas o algo como:\n• "Quiero impermeabilizante"\n• "Muéstrame pinturas"\n• "Agrega pintura blanca al carrito"\n• "Ver resumen del carrito"\n\nEstoy aquí para ayudarte con tu cotización de forma rápida. 😊`;
      await client.sendText(message.from, respuesta);
      return;
    }

    const prompt = `Eres un asistente virtual de Ganesha. Catálogo:\n${productos.map(p => `- ${p.nombre}: ${p.descripcion}, Precio: $${p.precio}`).join('\n')}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message.body }
      ]
    });

    const respuestaGPT = completion.choices[0].message.content;
    await client.sendText(message.from, respuestaGPT);
  });
}
