// utils/productSearch.js
const Fuse = require('fuse.js');

/**
 * Busca productos usando fuzzy search sobre nombre, sinónimos y descripción.
 * @param {Array} productos - Array de productos (cada uno debe tener al menos {nombre, descripcion, sinonimos})
 * @param {string} textoBusqueda - Texto que escribió el usuario
 * @param {number} [limite=5] - Número máximo de resultados a devolver
 * @returns {Array} - Lista de productos más relevantes
 */
function buscarProductosFuzzy(productos, textoBusqueda, limite = 5) {
  const opciones = {
    keys: [
      'nombre',
      'descripcion',
      'sinonimos',
    ],
    threshold: 0.4, // Sensibilidad de coincidencia (más bajo = más estricto)
  };
  const fuse = new Fuse(productos, opciones);
  const resultados = fuse.search(textoBusqueda);
  return resultados.slice(0, limite).map(r => r.item);
}

module.exports = { buscarProductosFuzzy };
