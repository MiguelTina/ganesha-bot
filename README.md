# Ganesha Bot

Ganesha Bot es un chatbot inteligente de ventas para WhatsApp, conectado a un CRM propio basado en MongoDB. Está diseñado para manejar múltiples cuentas y productos, interactuar de manera natural y persuasiva (inspirado en técnicas de Brian Tracy), cotizar, cerrar ventas y notificar automáticamente al CRM.

## Características principales
- **Integración WhatsApp:** Utiliza `@wppconnect-team/wppconnect` para operar como un agente en WhatsApp.
- **Respuestas humanas:** Usa OpenAI para respuestas naturales y personalizadas.
- **Manejo de múltiples cuentas/productos:** Cada cliente puede tener su propio catálogo y sesión.
- **Cotización y cierre de ventas:** El bot guía la conversación, cotiza productos y registra ventas.
- **Notificación automática:** Cada venta es registrada en el CRM (base de datos MongoDB).
- **Extensible:** Listo para integrarse con un panel web o API REST en el futuro.

## Estructura del proyecto
- `bot.js`: Lógica principal del bot, flujo conversacional, integración WhatsApp y OpenAI.
- `db.js`: Conexión y acceso a MongoDB.
- `productos.json`: Ejemplo de productos para poblar la base de datos.
- `seed-clientes.js`, `seed-productos.js`: Scripts para poblar la base de datos.
- `tokens/`: Carpeta de sesión y autenticación WhatsApp.
- `.env`: Variables de entorno sensibles (no compartir).

## Flujo Conversacional (Resumen)
1. El bot recibe un mensaje de WhatsApp.
2. Identifica al cliente por su número y recupera su catálogo.
3. Responde de forma amable y persuasiva, guiando la conversación.
4. Permite agregar productos a un carrito, cotiza y confirma pedidos.
5. Registra la venta en la base de datos (CRM) y notifica al cliente.

## Cómo ejecutar
1. Clona el repositorio y ejecuta `npm install`.
2. Configura tu `.env` con las claves de MongoDB y OpenAI.
3. Ejecuta `node bot.js` y escanea el QR con WhatsApp.

## Variables de entorno necesarias
- `MONGODB_URI`: URI de conexión a MongoDB Atlas/local.
- `OPENAI_API_KEY`: Clave de API de OpenAI.

## Futuras mejoras sugeridas
- Panel web para CRM (dashboard, analíticas, edición de clientes/productos).
- API REST para integraciones externas.
- Lógica avanzada de seguimiento y remarketing.
- Soporte multi-idioma y personalización de mensajes.

## To-Do y Avance del Proyecto

- [x] Revisión general de la estructura y lógica del bot
- [x] Documentación detallada del proyecto (README)
- [x] Mejorar el flujo conversacional y lógica de ventas (Brian Tracy style)
- [ ] Agregar comandos para eliminar productos del carrito o modificar cantidades
- [ ] Simular y documentar pruebas de conversación
- [ ] Preparar el proyecto para subirlo a GitHub
- [ ] Mejorar persistencia de sesiones/carrito en base de datos
- [ ] Sugerir/implementar panel CRM o API REST

## Contribución y soporte
- Código comentado y estructurado para facilitar colaboración.
- Se recomienda usar ramas y pull requests para mejoras.

## Licencia
ISC

---

> Proyecto mantenido por [tu nombre o equipo]. Inspirado en las mejores prácticas de ventas y atención al cliente.
