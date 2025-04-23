require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const { connectDB, getDB } = require('./db');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

connectDB();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sesiones = {};
let globalClient;

async function buscarProductoPorNombre(nombre, numeroCliente) {
  const db = getDB();

  const palabrasClave = nombre.trim().toLowerCase().split(' ').filter(p => p.length > 2);
  const regex = palabrasClave.map(p => `(?=.*${p})`).join('') + '.*';

  const productos = await db.collection('productos-demo').find({
    nombre: { $regex: new RegExp(regex, 'i') },
  }).toArray();

  if (productos.length === 0) return 'No encontré ese producto 😕';

  if (productos.length === 1) {
    const p = productos[0];
    sesiones[numeroCliente].ultimoProductoMostrado = p;

    if (p.imagen) {
      try {
        const imagePath = path.join(__dirname, 'temp-image.jpg');
        const writer = fs.createWriteStream(imagePath);

        const response = await axios({
          url: p.imagen,
          method: 'GET',
          responseType: 'stream',
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        await globalClient.sendImage(numeroCliente, imagePath, 'producto.jpg');
        fs.unlinkSync(imagePath);
      } catch (error) {
        console.error('❌ Error al enviar imagen:', error.message);
      }
    }

    return `🛒 *${p.nombre}* - $${p.precio}`;
  }

  return productos.map(p => `🛒 ${p.nombre} - $${p.precio}`).join('\n');
}

const functions = [
  {
    name: "buscarProductoPorNombre",
    description: "Busca productos por nombre en el catálogo",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre del producto",
        },
      },
      required: ["nombre"],
    },
  },
];

wppconnect.create({
  session: 'ganesha-session',
  catchQR: (base64QR, asciiQR) => {
    console.log('Escanea este QR con tu celular:');
    console.log(asciiQR);
  },
  statusFind: (statusSession) => {
    console.log('Estado de la sesión:', statusSession);
  },
  headless: true,
}).then((client) => start(client)).catch((error) => console.error(error));

async function start(client) {
  globalClient = client;

  client.onMessage(async (message) => {
    if (!message.body || message.isGroupMsg) return;

    const numeroCliente = message.from;
    const texto = message.body.toLowerCase();

    if (!sesiones[numeroCliente]) {
      sesiones[numeroCliente] = [
        {
          role: 'system',
          content: 'Eres un vendedor amable que solo responde sobre productos del catálogo.'
        },
      ];
      sesiones[numeroCliente].carrito = [];
      sesiones[numeroCliente].ultimoProductoMostrado = null;
    }

    if (
      texto.includes('agrega') ||
      texto.includes('al carrito') ||
      texto.includes('ver carrito') ||
      texto.includes('comprar') ||
      texto.includes('finalizar compra') ||
      texto.includes('proceder a la compra') ||
      texto.includes('confirmo mi pedido') ||
      texto.includes('sería todo')
    ) {
      if (texto.includes('agrega') || texto.includes('al carrito')) {
        const ultimoProducto = sesiones[numeroCliente].ultimoProductoMostrado;
        if (ultimoProducto) {
          sesiones[numeroCliente].carrito.push(ultimoProducto);
          await client.sendText(numeroCliente, `✅ *${ultimoProducto.nombre}* fue agregado al carrito.`);
        } else {
          await client.sendText(numeroCliente, '❌ No tengo un producto reciente para agregar. Búscalo primero.');
        }
        return;
      }

      if (texto.includes('ver carrito')) {
        const carrito = sesiones[numeroCliente].carrito;
        if (!carrito.length) {
          await client.sendText(numeroCliente, '🛒 Tu carrito está vacío.');
        } else {
          const resumen = carrito.map((p, i) => `${i + 1}. ${p.nombre} - $${p.precio}`).join('\n');
          const total = carrito.reduce((sum, p) => sum + p.precio, 0);
          await client.sendText(numeroCliente, `🛍️ Tu carrito:\n${resumen}\n\n💰 Total: $${total}`);
        }
        return;
      }

      if (
        texto.includes('finalizar compra') ||
        texto.includes('comprar') ||
        texto.includes('sería todo') ||
        texto.includes('proceder a la compra') ||
        texto.includes('confirmo mi pedido')
      ) {
        const carrito = sesiones[numeroCliente].carrito;
        if (!carrito.length) {
          await client.sendText(numeroCliente, 'Tu carrito está vacío. Agrega productos antes de comprar.');
          return;
        }

        const resumen = carrito.map(p => `• ${p.nombre} - $${p.precio}`).join('\n');
        const total = carrito.reduce((sum, p) => sum + p.precio, 0);

        try {
          await axios.post('https://tuservidor.com/api/ventas', {
            cliente: numeroCliente,
            productos: carrito,
            total,
          });

          await client.sendText(numeroCliente, `✅ Tu cotización fue enviada al área de ventas. Un asesor te contactará pronto.\n\n🛒 *Resumen del Pedido:*\n${resumen}\n\n💰 *Total:* $${total}`);
        } catch (error) {
          console.error('❌ Error al enviar al CRM:', error.message);
          await client.sendText(numeroCliente, 'Ocurrió un error al enviar tu pedido. Intenta más tarde.');
        }

        sesiones[numeroCliente].carrito = [];
        return;
      }

      return;
    }

    sesiones[numeroCliente].push({ role: 'user', content: message.body });

    try {
      const respuesta = await openai.chat.completions.create({
        model: 'gpt-4-1106-preview',
        messages: sesiones[numeroCliente],
        functions,
        function_call: 'auto'
      });

      const mensajeGPT = respuesta.choices[0].message;

      if (mensajeGPT.function_call) {
        const llamada = mensajeGPT.function_call;
        const nombreFuncion = llamada.name;
        const args = JSON.parse(llamada.arguments);

        let resultadoFuncion = '';
        if (nombreFuncion === 'buscarProductoPorNombre') {
          resultadoFuncion = await buscarProductoPorNombre(args.nombre, numeroCliente);
        }

        const segundaRespuesta = await openai.chat.completions.create({
          model: 'gpt-4-1106-preview',
          messages: [
            ...sesiones[numeroCliente],
            mensajeGPT,
            { role: 'function', name: nombreFuncion, content: resultadoFuncion }
          ]
        });

        const final = segundaRespuesta.choices[0].message.content;
        sesiones[numeroCliente].push({ role: 'assistant', content: final });
        await client.sendText(numeroCliente, final);
      } else {
        const respuestaDirecta = mensajeGPT.content;
        sesiones[numeroCliente].push({ role: 'assistant', content: respuestaDirecta });

        // Buscar si menciona nombre entre asteriscos
        const posibleNombre = respuestaDirecta.match(/\*(.*?)\*/);
        if (posibleNombre) {
          const nombreDetectado = posibleNombre[1].trim();
          const producto = await getDB().collection('productos-demo').findOne({
            nombre: { $regex: new RegExp(nombreDetectado, 'i') }
          });
          if (producto) {
            sesiones[numeroCliente].ultimoProductoMostrado = producto;
            console.log(`📦 Producto detectado: ${producto.nombre}`);
          }
        }

        await client.sendText(numeroCliente, respuestaDirecta);
      }
    } catch (error) {
      console.error('Error:', error);
      await client.sendText(numeroCliente, 'Ocurrió un error al procesar tu solicitud.');
    }
  });
}
