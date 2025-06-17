// --- DEPENDENCIAS E INICIALIZACIÓN ---

// Carga las variables de entorno desde el archivo .env a process.env
// ¡Debe ser la primera línea para que las demás partes de la app tengan acceso a las variables!
require('dotenv').config();

// Framework principal para construir la API
const express = require('express');
// Middleware para permitir peticiones Cross-Origin (desde el frontend de Netlify al backend de Render)
const cors = require('cors');
// Middleware para añadir cabeceras de seguridad básicas (ayuda a proteger contra ataques comunes)
const helmet = require('helmet');
// Módulo 'path' para trabajar con rutas de archivos y directorios de forma compatible entre sistemas operativos
const path = require('path');

// --- IMPORTACIÓN DE RUTAS ---

// Importamos los módulos que definen los endpoints de nuestra API
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const logRoutes = require('./routes/logs');

// --- CONFIGURACIÓN DE LA APLICACIÓN EXPRESS ---

// Creamos la instancia principal de la aplicación Express
const app = express();
// Definimos el puerto. Usará el puerto definido en las variables de entorno (Render lo asigna automáticamente)
// o el puerto 3000 si no está definido (para desarrollo local).
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE MIDDLEWARES ---

// 1. Helmet: Añade varias cabeceras HTTP para mejorar la seguridad
app.use(helmet());

// 2. CORS (Cross-Origin Resource Sharing)
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5500',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 3. Middlewares para parsear el cuerpo de las peticiones
// Parsea las peticiones con cuerpo en formato JSON (ej: POST desde el frontend)
app.use(express.json());
// Parsea las peticiones con cuerpos 'x-www-form-urlencoded'
app.use(express.urlencoded({ extended: true }));

// 4. Middleware para servir archivos estáticos (imágenes de productos)
// Esto crea una ruta virtual '/uploads' que apunta a la carpeta física 'uploads' en el servidor.
// Permite que el frontend acceda a las imágenes con URLs como 'https://<tu-backend>/uploads/product-123.jpg'
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- ASIGNACIÓN DE RUTAS DE LA API ---

// Asigna los módulos de rutas a sus prefijos de URL correspondientes
// Todas las rutas en 'authRoutes' empezarán con '/api/auth'
app.use('/api/auth', authRoutes);
// Todas las rutas en 'productRoutes' empezarán con '/api/products'
app.use('/api/products', productRoutes);
// Todas las rutas en 'orderRoutes' empezarán con '/api/orders'
app.use('/api/orders', orderRoutes);
// Todas las rutas en 'logRoutes' empezarán con '/api/logs'
app.use('/api/logs', logRoutes);


// --- MANEJO DE ERRORES Y RUTAS NO ENCONTRADAS ---

// Middleware para capturar errores. Si cualquier ruta anterior llama a next(error), caerá aquí.
app.use((err, req, res, next) => {
  console.error(err.stack); // Muestra el error completo en la consola del servidor
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

// Middleware para capturar todas las demás peticiones que no coincidieron con ninguna ruta anterior (404 Not Found)
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});


// --- ARRANQUE DEL SERVIDOR ---

// Importamos la función para verificar la conexión a la BD desde nuestro archivo de configuración
const { checkConnection } = require('./config/database');

// Creamos una función asíncrona para controlar el arranque
const startServer = async () => {
  console.log('Verificando conexión con la base de datos...');
  
  // Llama a la función que intenta conectar con la base de datos
  const isDbConnected = await checkConnection();

  // Si la conexión a la base de datos es exitosa...
  if (isDbConnected) {
    console.log('La base de datos está lista.');
    
    // ...ponemos al servidor a escuchar peticiones en el puerto definido.
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  } else {
    // Si la conexión a la base de datos falla...
    console.error('CRÍTICO: No se pudo conectar a la base de datos. El servidor no se iniciará.');
    
    // ...terminamos el proceso de la aplicación para evitar que corra en un estado inconsistente.
    // Render intentará reiniciar el servicio automáticamente.
    process.exit(1);
  }
};

// Ejecutamos la función  para iniciar el proceso de arranque del servidor.
startServer();    