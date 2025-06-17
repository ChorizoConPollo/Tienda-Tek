// --- DEPENDENCIAS E INICIALIZACIÓN ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const helmet = require('helmet'); // Desactivado temporalmente para diagnóstico
const path = require('path');

// --- IMPORTACIÓN DE RUTAS ---
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const logRoutes = require('./routes/logs');

// --- CONFIGURACIÓN DE LA APLICACIÓN EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE MIDDLEWARES ---

// 1. Helmet: ¡DESACTIVADO TEMPORALMENTE PARA DIAGNÓSTICO!
// app.use(helmet(...)); // La línea original está comentada.

// 2. CORS (Cross-Origin Resource Sharing)
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
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
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

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

startServer();