require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const { connectDB, getDB } = require('./db');

connectDB();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sesiones = {};

wppconnect
  .create({
    session: 'ganesha-session',
    headless: false,
    browserArgs: ['--no-sandbox'],
    catchQR: (base64QR, asciiQR) => {
      console.log('Escanea este QR con tu celular:');
      console.log(asciiQR);
    },
    statusFind: (statusSession) => {
      console.log('Estado de la sesión:', statusSession);
    }
  })
  .then((client) => start(client))
  .catch((error) => console.error(error));

async function start(client) {
  const db = getDB();
  const coleccionProductos = db.collection('productos');
  const coleccionPedidos = db.collection(process.env.COL_PEDIDOS || 'pedidos');

  client.onMessage(async (message) => {
    const consulta = message.body.toLowerCase().trim();

    if (!sesiones[message.from]) {
      sesiones[message.from] = {
        carrito: [],
        categoriaActual: null,
        productosCategoria: [],
        ultimoProducto: null,
        ultimaInteraccion: null
      };
    }

    const sesion = sesiones[message.from];

    // === FINALIZAR COTIZACIÓN ===
    if (/finalizar|terminar/.test(consulta)) {
      const carrito = sesion.carrito;
      if (carrito.length === 0) {
        await client.sendText(message.from, 'Tu carrito está vacío.');
      } else {
        let resumen = '*🛒 Resumen de tu cotización:*\n';
        carrito.forEach((p, i) => {
          resumen += `${i + 1}. ${p.nombre} - $${p.precio} x ${p.cantidad}\n`;
        });
        const total = carrito.reduce((acc, p) => acc + p.precio * p.cantidad, 0);
        resumen += `\n*Total: $${total.toFixed(2)}*\n\nGracias por tu compra.`;
        await client.sendText(message.from, resumen);
      }

      sesiones[message.from] = {
        carrito: [],
        categoriaActual: null,
        productosCategoria: [],
        ultimoProducto: null,
        ultimaInteraccion: null
      };

      return;
    }

    // === CONFIRMACIÓN DE "SÍ" O "NO" ===
    if (/^s[ií]$/.test(consulta) && sesion.ultimoProducto) {
      sesion.carrito.push({ ...sesion.ultimoProducto, cantidad: 1 });
      await client.sendText(message.from, `✅ Agregado 1 x ${sesion.ultimoProducto.nombre} al carrito.`);
      sesion.categoriaActual = null;
      sesion.productosCategoria = [];
      sesion.ultimoProducto = null;
      sesion.ultimaInteraccion = null;
      await client.sendText(message.from, `¿Deseas cotizar otra categoría?\n\n*Categorías disponibles:*\n- Impermeabilizantes\n- Pinturas\n- Esmaltes\n- Barnices`);
      return;
    }

    if (/^no$/.test(consulta) && sesion.ultimoProducto) {
      await client.sendText(message.from, 'Entendido, no se agregó el producto. ¿Quieres ver otra categoría?');
      sesion.ultimoProducto = null;
      return;
    }

    // === DETECCIÓN DE CATEGORÍA ===
    const categorias = ['impermeabilizantes', 'pinturas', 'esmaltes', 'barnices'];
    for (const cat of categorias) {
      if (consulta.includes(cat)) {
        sesion.categoriaActual = cat;
        const productos = await coleccionProductos.find({ categoria: cat }).toArray();
        if (productos.length === 0) {
          await client.sendText(message.from, `No encontré productos en la categoría "${cat}".`);
        } else {
          let mensaje = `Estos son los productos en *${cat}*:\n`;
          productos.forEach((p, i) => {
            mensaje += `\n${i + 1}. ${p.nombre} - $${p.precio}`;
          });
          mensaje += `\n\nResponde con el nombre o "opción 1", "opción 2", etc.`;
          sesion.productosCategoria = productos;
          await client.sendText(message.from, mensaje);
        }
        return;
      }
    }

    // === OPCIONES TIPO "OPCIÓN 1" ===
    const matchOpcion = consulta.match(/opci[oó]n\s*(\\d+)/i);
    if (matchOpcion && sesion.productosCategoria.length > 0) {
      const index = parseInt(matchOpcion[1]) - 1;
      const producto = sesion.productosCategoria[index];
      if (producto) {
        sesion.ultimoProducto = producto;
        await client.sendText(message.from, `Seleccionaste *${producto.nombre}* por $${producto.precio}. ¿Te gustaría agregarlo al carrito?`);
        return;
      }
    }

    // === GPT: RESPUESTAS INTELIGENTES ===
    const productos = await coleccionProductos.find().toArray();
    const prompt = `Actúa como asistente de ventas de Ganesha. Catálogo:\n${productos.map(p => `- ${p.nombre}: ${p.descripcion}, Precio: $${p.precio}`).join('\n')}`;
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message.body }
      ]
    });

    await client.sendText(message.from, completion.choices[0].message.content);
  });
}
