// handlers/menu.js

/**
 * Muestra el menú principal de categorías con letras (A-Z).
 * @param {object} params
 * @param {object} params.client - Instancia de wppconnect
 * @param {string} params.to - Número de WhatsApp
 * @param {Array} params.categorias - Array de categorías [{nombre, letra}]
 * @returns {Promise<void>}
 */
async function mostrarMenuCategorias({ client, to, categorias }) {
  const mensaje = 'Selecciona una categoría escribiendo la letra correspondiente:\n' +
    categorias.map(cat => `${cat.letra}.- ${cat.nombre}`).join('\n');
  await client.sendText(to, mensaje);
}

module.exports = { mostrarMenuCategorias };
