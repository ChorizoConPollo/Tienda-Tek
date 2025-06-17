// --- DEPENDENCIAS E INICIALIZACIÓN ---

// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

const express = require('express');
const cors = require('cors'); // Middleware para Cross-Origin Resource Sharing
const helmet = require('helmet'); // Middleware para seguridad
const path = require('path'); // Módulo para trabajar con rutas de archivos

// --- IMPORTACIÓN DE RUTAS ---
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const logRoutes = require('./routes/logs');

// --- CONFIGURACIÓN DE LA APLICACIÓN EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE MIDDLEWARES ---

// 1. Helmet: Añade cabeceras de seguridad
app.use(helmet());

// 2. CORS (Cross-Origin Resource Sharing) - CONFIGURACIÓN ROBUSTA Y EXPLÍCITA
// Esta configuración es muy permisiva y está diseñada para diagnosticar y resolver el problema.
// Permite peticiones desde CUALQUIER origen.
const corsOptions = {
  origin: '*', // El comodín '*' permite peticiones de cualquier dominio.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos HTTP permitidos.
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeceras permitidas en las peticiones.
  optionsSuccessStatus: 204 // Código de estado para peticiones 'preflight' exitosas.
};
// Aplicamos el middleware de CORS con nuestra configuración.
app.use(cors(corsOptions));
// Añadimos un manejador explícito para las peticiones OPTIONS (preflight)
// para máxima compatibilidad y para asegurarnos de que se manejen correctamente.
app.options('*', cors(corsOptions));

// 3. Middlewares para parsear el cuerpo de las peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Middleware para servir archivos estáticos (imágenes de productos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ASIGNACIÓN DE RUTAS DE LA API ---
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes);

// --- MANEJO DE ERRORES Y RUTAS NO ENCONTRADAS ---
// Middleware para capturar errores.
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

// Middleware para capturar rutas no encontradas (404).
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// --- ARRANQUE DEL SERVIDOR ---
const { checkConnection } = require('./config/database');

const startServer = async () => {
  console.log('Verificando conexión con la base de datos...');
  const isDbConnected = await checkConnection();

  if (isDbConnected) {
    console.log('La base de datos está lista.');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  } else {
    console.error('CRÍTICO: No se pudo conectar a la base de datos. El servidor no se iniciará.');
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();