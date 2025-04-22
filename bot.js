require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const { connectDB, getDB } = require('./db');

connectDB();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sesiones = {};
let globalClient;

async function buscarProductoPorNombre(nombre, numeroCliente) {
  const db = getDB();
  const texto = nombre.trim().toLowerCase();

  const productos = await db.collection('productos-demo').find({
    nombre: { $regex: texto, $options: 'i' }
  }).toArray();

  if (productos.length === 0) {
    return '😔 Lo siento, ese producto no lo tengo en este momento. ¿Te gustaría que te ayude con otro artículo de nuestro catálogo?';
  }

  // Si solo hay uno, guarda en memoria, envía imagen y devuelve descripción completa
  if (productos.length === 1) {
    const p = productos[0];
    sesiones[numeroCliente].ultimoProductoMostrado = p;

    if (p.imagen) {
      console.log("Enviando imagen:", p.imagen);
      await globalClient.sendImage(
        numeroCliente,
        p.imagen,
        'producto.jpg',
        ''
      );
    }

    return `🛒 *${p.nombre}* - $${p.precio}\n\n${p.descripcion || ''}`;
  }

  // Si hay varios, no se manda imagen y se listan
  return productos.map(p => `🛒 *${p.nombre}* - $${p.precio}`).join('\n');
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

    if (!sesiones[numeroCliente]) {
      sesiones[numeroCliente] = [
        {
          role: 'system',
          content: 'Eres un vendedor amable que solo responde sobre productos del catálogo.'
        }
      ];
      sesiones[numeroCliente].carrito = [];
      sesiones[numeroCliente].ultimoProductoMostrado = null;
    }

    sesiones[numeroCliente].push({ role: 'user', content: message.body });

    try {
      const respuesta = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages: sesiones[numeroCliente],
        functions,
        function_call: "auto",
      });

      const respuestaGPT = respuesta.choices[0].message;

      if (respuestaGPT.function_call) {
        const datos = JSON.parse(respuestaGPT.function_call.arguments);
        const resultado = await buscarProductoPorNombre(datos.nombre, numeroCliente);
        await client.sendText(numeroCliente, resultado);
        return;
      }

      if (respuestaGPT.content) {
        await client.sendText(numeroCliente, respuestaGPT.content);
        sesiones[numeroCliente].push({ role: 'assistant', content: respuestaGPT.content });
      }
    } catch (error) {
      console.error("Error en la conversación:", error);
      await client.sendText(numeroCliente, 'Ocurrió un error al procesar tu solicitud.');
    }
  });
}
