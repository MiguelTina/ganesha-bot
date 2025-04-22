require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const { connectDB, getDB } = require('./db');

connectDB();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sesiones = {};

// 👉 Función que busca productos por nombre
async function buscarProductoPorNombre(nombre, numeroCliente) {
  const db = getDB();
  const texto = nombre.trim().toLowerCase();

  const productos = await db.collection('productos-demo').find({
    nombre: { $regex: texto, $options: 'i' },
  }).toArray();

  if (productos.length === 0) return 'No encontré ese producto 😕';

  // Guardar el producto mostrado en la sesión
  sesiones[numeroCliente].ultimoProductoMostrado = productos[0];

  return productos.map(p => `🛒 ${p.nombre} - $${p.precio}`).join('\n');
}

// 👉 Funciones disponibles para GPT
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
  }
];

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
  client.onMessage(async (message) => {
    if (!message.body || message.isGroupMsg) return;

    const numeroCliente = message.from;
    const texto = message.body.toLowerCase();

    if (!sesiones[numeroCliente]) {
      sesiones[numeroCliente] = [
        {
          role: 'system',
          content: 'Eres un vendedor amable que solo responde sobre productos del catálogo.',
        },
      ];
      sesiones[numeroCliente].carrito = [];
      sesiones[numeroCliente].ultimoProductoMostrado = null;
    }

    // 👉 Lógica para agregar producto al carrito
    if (
      texto.includes("agregar") ||
      texto.includes("añadir") ||
      texto.includes("lo puedes agregar") ||
      texto.includes("puedes añadir") ||
      texto.includes("me interesa") ||
      texto.includes("añádelo")
    ) {
      const ultimo = sesiones[numeroCliente].ultimoProductoMostrado;

      if (ultimo) {
        sesiones[numeroCliente].carrito.push(ultimo);
        await client.sendText(numeroCliente, `✅ Agregué *${ultimo.nombre}* al carrito.`);
      } else {
        await client.sendText(numeroCliente, "No sé qué producto agregar. ¿Podrías repetir el nombre?");
      }
      return;
    }

    // 👉 Lógica para ver el carrito
    if (
      texto.includes("ver carrito") ||
      texto.includes("mostrar carrito") ||
      texto.includes("mi carrito")
    ) {
      const carrito = sesiones[numeroCliente].carrito;

      if (!carrito || carrito.length === 0) {
        await client.sendText(numeroCliente, "🛒 Tu carrito está vacío.");
      } else {
        let total = 0;
        const resumen = carrito.map((p, i) => {
          total += p.precio;
          return `${i + 1}. ${p.nombre} - $${p.precio}`;
        }).join('\n');

        const mensaje = `🧾 *Resumen de tu carrito:*\n\n${resumen}\n\n💰 Total: $${total}`;
        await client.sendText(numeroCliente, mensaje);
      }
      return;
    }

    sesiones[numeroCliente].push({ role: 'user', content: message.body });

    try {
      const respuesta = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: sesiones[numeroCliente],
        functions,
        function_call: "auto",
      });

      const mensajeGPT = respuesta.choices[0].message;
      console.log("➡️ Mensaje GPT:", mensajeGPT);

      if (mensajeGPT.function_call) {
        const llamada = mensajeGPT.function_call;
        const nombreFuncion = llamada.name;
        const args = JSON.parse(llamada.arguments);

        console.log("📞 GPT pidió llamar a:", nombreFuncion);
        console.log("🧾 Parámetros:", args);

        let resultadoFuncion = '';

        if (nombreFuncion === "buscarProductoPorNombre") {
          resultadoFuncion = await buscarProductoPorNombre(args.nombre, numeroCliente);
          console.log("🔍 Resultado de la búsqueda:", resultadoFuncion);
        }

        const segundaRespuesta = await openai.chat.completions.create({
          model: "gpt-4-turbo",
          messages: [
            ...sesiones[numeroCliente],
            mensajeGPT,
            { role: "function", name: nombreFuncion, content: resultadoFuncion },
          ],
        });

        const textoFinal = segundaRespuesta.choices[0].message.content;
        console.log("🤖 Respuesta final de GPT:", textoFinal);

        await client.sendText(numeroCliente, textoFinal);
        sesiones[numeroCliente].push({ role: 'assistant', content: textoFinal });

      } else {
        await client.sendText(numeroCliente, mensajeGPT.content);
        sesiones[numeroCliente].push({ role: 'assistant', content: mensajeGPT.content });
      }

    } catch (error) {
      console.error("❌ Error en el bot:", error);
      await client.sendText(numeroCliente, "Ocurrió un error, intenta de nuevo más tarde.");
    }
  });
}
