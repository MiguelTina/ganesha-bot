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

// Función que busca productos por nombre
async function buscarProductoPorNombre(nombre, numeroCliente) {
  const db = getDB();
  const texto = nombre.trim().toLowerCase();

  const productos = await db.collection('productos-demo').find({
    nombre: { $regex: texto, $options: 'i' },
  }).toArray();

  if (productos.length === 0) return 'No encontré ese producto 😕';

  if (productos.length === 1) {
    const p = productos[0];
    sesiones[numeroCliente].ultimoProductoMostrado = p;

    if (p.imagen) {
  const axios = require('axios');
  const fs = require('fs');
  const path = require('path');

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

    await globalClient.sendImage(
      numeroCliente,
      imagePath,
      'producto.jpg'
    );

    fs.unlinkSync(imagePath); // Borra el archivo temporal
  } catch (error) {
    console.error('❌ Error al enviar imagen:', error.message);
  }
}


    return `🛒 *${p.nombre}* - $${p.precio}`;
  }

  return productos.map(p => `🛒 ${p.nombre} - $${p.precio}`).join('\n');
}

// Definición para GPT
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

// Inicia el bot
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
}).then((client) => start(client))
  .catch((error) => console.error(error));

async function start(client) {
  globalClient = client;
  client.onMessage(async (message) => {
    if (!message.body || message.isGroupMsg) return;

    const numeroCliente = message.from;

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
        await client.sendText(numeroCliente, respuestaDirecta);
      }

    } catch (error) {
      console.error('Error:', error);
      await client.sendText(numeroCliente, 'Ocurrió un error al procesar tu solicitud.');
    }
  });
}
