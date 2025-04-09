require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');
const fs = require('fs');
const sesiones = {}; // Guardar datos temporales por número de cliente

// Cargar productos desde archivo local
const productos = JSON.parse(fs.readFileSync('productos.json', 'utf-8'));

// Conectar a OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Memoria temporal de producto y nombre por cliente

wppconnect.create({
  session: 'ganesha-session',
  catchQR: (base64Qr, asciiQR) => {
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

  const nombreUsuario = sesiones[message.from]?.nombre || '';

  // Paso 1: Detectar saludo y preguntar nombre
  if (/^hola|buenos días|buenas tardes|buenas noches/.test(consulta)) {
    const saludo = nombreUsuario
      ? `¡Hola de nuevo, ${nombreUsuario}! ¿En qué puedo ayudarte hoy?`
      : `¡Hola! ¡Bienvenido a Ganesha! Soy tu asistente virtual. ¿Con quién tengo el gusto?`;

    await client.sendText(message.from, saludo);
    return;
  }

  // Paso 2: Detectar "me llamo" o "soy" y guardar nombre
  if (/^me llamo|^soy /.test(consulta)) {
    const posibleNombre = consulta.replace(/^(me llamo|soy)/i, "").trim();

    sesiones[message.from] = {
      ...sesiones[message.from],
      nombre: posibleNombre
    };

    await client.sendText(
      message.from,
      `Mucho gusto, ${posibleNombre}. ¿En qué puedo ayudarte hoy?`
    );
    return;
  }

  // Ejemplo de uso del nombre para respuestas personalizadas
  if (consulta.includes("pintura")) {
    await client.sendText(
      message.from,
      `Claro${nombreUsuario ? ", " + nombreUsuario : ""}, manejamos varias opciones de pintura como la Pintura Vinílica Blanca. ¿Te gustaría saber más detalles sobre esta o prefieres otra opción?`
    );
    return;
  }

  // ... Aquí sigue tu lógica para buscar productos, manejar categorías, características, etc ...
});

    // Crear prompt para OpenAI con reglas claras
    const nombre = sesiones[message.from]?.nombre || '';
    const prompt = `
Eres un asistente virtual de Ganesha, una tienda especializada en pinturas, impermeabilizantes, esmaltes y productos de construcción. Tu objetivo es ayudar a los clientes a resolver dudas, ofrecer productos, explicar características y mantener una conversación humana, clara y cálida.

REGLAS:
- Solo responde sobre productos que estén en el archivo productos.json.
- Si el cliente pregunta por algo que no esté en el catálogo, dile amablemente que por el momento no manejas ese producto.
- Si el cliente saluda, preséntate y pregunta su nombre si aún no lo sabes.
- Si sabes su nombre, úsalo para responder de forma cercana.
- Mantén un tono amable y empático como un vendedor real.
- Responde siempre en español.

CATÁLOGO:
${productos.map(p => `- ${p.nombre}: ${p.descripcion}, Precio: $${p.precio} MXN`).join("\n")}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message.body }
      ]
    });

    const respuesta = completion.choices[0].message.content;
    await client.sendText(message.from, respuesta);
  });
}
