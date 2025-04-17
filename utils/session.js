// utils/session.js

/**
 * Inicializa la sesión de usuario si no existe.
 */
function initSession(sesiones, numero) {
  if (!sesiones[numero]) {
    sesiones[numero] = {
      nombre: '',
      paso: 'inicio',
      categoriaSeleccionada: null,
      productoSeleccionado: null,
      carrito: [],
      menuActual: null
    };
  }
}

module.exports = { initSession };
