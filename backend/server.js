require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Rutas
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const logRoutes = require('./routes/logs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para servir archivos estáticos de la carpeta 'uploads'
// Esto hace que las imágenes sean accesibles desde el frontend.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Asignación de rutas
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes);

// Manejo de errores y 404
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
});
app.use('*', (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada' }));

app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));