/**
 * @file server.js
 * @author Bayron Cañas
 * @description Punto de entrada principal y orquestador del servidor de la API "Tienda-Tek".
 *              Este archivo es responsable de inicializar la aplicación Express, configurar
 *              todos los middlewares (CORS, parsers, etc.), montar las rutas de la API,
 *              y gestionar el arranque controlado del servidor tras verificar la conexión
 *              a la base de datos.
 */

// --- DEPENDENCIAS E INICIALIZACIÓN ---
// Carga las variables de entorno desde el archivo .env al objeto `process.env`.
// Es crucial que esta sea una de las primeras líneas en ejecutarse.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
// const helmet = require('helmet'); // NOTA: Helmet está desactivado temporalmente para fines de diagnóstico.
const path = require('path');

// --- IMPORTACIÓN DE MÓDULOS DE RUTAS ---
// Se importan los diferentes enrutadores que definen los endpoints de la API.
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const logRoutes = require('./routes/logs');

// --- CONFIGURACIÓN DE LA APLICACIÓN EXPRESS ---
const app = express();
// El puerto se obtiene de las variables de entorno (asignado por Render en producción)
// o se usa el 3000 como valor por defecto para el desarrollo local.
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE MIDDLEWARES ---

// 1. Helmet: (Desactivado)
// Middleware de seguridad que normalmente establece cabeceras HTTP para proteger la aplicación.

// 2. CORS (Cross-Origin Resource Sharing):
// Configuración explícita y permisiva para permitir peticiones desde cualquier origen ('*'),
// con métodos y cabeceras específicas, asegurando la comunicación con el frontend.
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
// Manejador explícito para las peticiones preflight (OPTIONS).
app.options('*', cors(corsOptions));

// 3. Middlewares para el parseo del cuerpo de la petición:
app.use(express.json()); // Habilita el parseo de cuerpos en formato JSON.
app.use(express.urlencoded({ extended: true })); // Habilita el parseo de cuerpos URL-encoded.

// 4. Middleware para servir archivos estáticos:
// Aunque las imágenes principales ahora se sirven desde Cloudinary, esta ruta se
// mantiene por si se necesita servir archivos desde el disco del servidor en el futuro.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ASIGNACIÓN DE RUTAS DE LA API ---
// Se montan los enrutadores importados en sus prefijos de ruta correspondientes.
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes);

// --- MANEJO DE ERRORES Y RUTAS NO ENCONTRADAS ---
// Middleware para manejo de errores. Captura cualquier error pasado a `next()`.
app.use((err, req, res, next) => {
  console.error(err.stack); // Loggea el error completo en la consola del servidor.
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

// Middleware "catch-all" para manejar peticiones a rutas no definidas (404 Not Found).
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// --- ARRANQUE CONTROLADO DEL SERVIDOR ---
const { checkConnection } = require('./config/database');

/**
 * Función asíncrona que encapsula la lógica de arranque del servidor.
 * Primero verifica la conexión a la base de datos y solo si es exitosa,
 * pone al servidor a escuchar peticiones.
 */
const startServer = async () => {
  console.log('Verificando conexión con la base de datos...');
  const isDbConnected = await checkConnection();

  if (isDbConnected) {
    console.log('La base de datos está lista.');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  } else {
    // Si la conexión a la BD falla, se termina el proceso para evitar un estado inestable.
    console.error('CRÍTICO: No se pudo conectar a la base de datos. El servidor no se iniciará.');
    process.exit(1);
  }
};

// Se invoca la función para iniciar el servidor.
startServer();