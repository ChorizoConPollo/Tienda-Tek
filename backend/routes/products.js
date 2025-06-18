/**
 * @file products.js
 * @author Bayron Cañas
 * @description Define las rutas de la API para la gestión completa de productos (CRUD).
 *              Incluye endpoints públicos para la visualización y endpoints protegidos
 *              para la administración, así como la integración con Cloudinary para el
 *              almacenamiento persistente de imágenes.
 */

const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

// --- Configuración de Cloudinary ---
// Se inicializa el SDK de Cloudinary con las credenciales obtenidas de las variables de entorno.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- Configuración de Multer ---
// Se configura Multer para procesar los archivos en memoria (MemoryStorage) en lugar de
// guardarlos en el disco del servidor. Esto es más eficiente y seguro para luego
// transmitir el buffer del archivo directamente a Cloudinary.
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Registra una acción realizada por un empleado en el historial de actividades.
 * @param {number} userId - ID del usuario que realiza la acción.
 * @param {string} action - Tipo de acción (ej. 'CREAR_PRODUCTO').
 * @param {string} details - Descripción de la acción.
 */
async function logActivity(userId, action, details) {
    try {
        await db.query('INSERT INTO historialactividades(idusuario, accion, detalles) VALUES($1, $2, $3)', [userId, action, details]);
    } catch (logError) { 
        console.error("Fallo al registrar actividad:", logError); 
    }
}

/**
 * @route   GET /api/products
 * @desc    Obtiene una lista de productos. Permite filtrar por categoría y/o buscar por nombre.
 *          Construye la consulta SQL dinámicamente para ser flexible.
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        let queryText = 'SELECT * FROM productos';
        const { categoria, search, stock } = req.query;
        const conditions = [], queryParams = [];
        let paramIndex = 1;

        // Por defecto, solo se muestran productos con stock, a menos que se especifique lo contrario.
        if (stock !== 'all') {
            conditions.push('stock > 0');
        }
        if (categoria) {
            conditions.push(`categoria = $${paramIndex++}`);
            queryParams.push(categoria);
        }
        if (search) {
            conditions.push(`nombre ILIKE $${paramIndex++}`);
            queryParams.push(`%${search}%`);
        }
        if (conditions.length > 0) {
            queryText += ' WHERE ' + conditions.join(' AND ');
        }
        queryText += ' ORDER BY nombre';

        const { rows } = await db.query(queryText, queryParams);
        res.json({ success: true, products: rows });
    } catch (error) {
        console.error("Error obteniendo productos con filtros:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor al obtener productos." });
    }
});

/**
 * @route   GET /api/products/categories
 * @desc    Obtiene una lista de todas las categorías de productos únicas y disponibles.
 * @access  Public
 */
router.get('/categories', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT DISTINCT categoria FROM productos WHERE stock > 0 ORDER BY categoria');
        res.json({ success: true, categories: rows.map(r => r.categoria) });
    } catch (error) {
        console.error("Error obteniendo categorías:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor al obtener categorías." });
    }
});

/**
 * @route   POST /api/products
 * @desc    Crea un nuevo producto. Si se adjunta una imagen en la petición (multipart/form-data),
 *          ésta se sube a Cloudinary y la URL resultante se guarda en la base de datos.
 * @access  Private (solo para empleados)
 */
router.post('/', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, descripcion, preciounitario, stock, categoria } = req.body;
        let imageUrl = null;

        if (req.file) {
            // Se crea una promesa para manejar la subida asíncrona a Cloudinary.
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error) reject(error);
                    resolve(result);
                });
                uploadStream.end(req.file.buffer); // Se envía el buffer del archivo.
            });
            imageUrl = result.secure_url; // Se obtiene la URL segura (https).
        }
        
        const query = 'INSERT INTO productos(nombre, descripcion, preciounitario, stock, categoria, imagen_url) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
        const { rows } = await db.query(query, [nombre, descripcion, preciounitario, stock, categoria, imageUrl]);
        await logActivity(req.user.IdUsuario, 'CREAR_PRODUCTO', `Producto '${nombre}' creado.`);
        res.status(201).json({ success: true, product: rows[0] });
    } catch (error) { 
        console.error("Error creando producto con Cloudinary:", error);
        res.status(500).json({ success: false, message: "Error creando producto" }); 
    }
});

/**
 * @route   PUT /api/products/:id
 * @desc    Actualiza un producto existente. Si se proporciona una nueva imagen,
 *          se sube a Cloudinary y se reemplaza la URL anterior.
 * @access  Private (solo para empleados)
 */
router.put('/:id', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, preciounitario, stock, categoria, imagen_url } = req.body;
        let newImageUrl = imagen_url; // Se conserva la URL existente por defecto.

        if (req.file) {
            // Si hay un archivo nuevo, se sube y se reemplaza la URL.
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error) reject(error);
                    resolve(result);
                });
                uploadStream.end(req.file.buffer);
            });
            newImageUrl = result.secure_url;
        }
        
        const query = 'UPDATE productos SET nombre=$1, descripcion=$2, preciounitario=$3, stock=$4, categoria=$5, imagen_url=$6 WHERE idproducto=$7 RETURNING *';
        const { rows } = await db.query(query, [nombre, descripcion, preciounitario, stock, categoria, newImageUrl, id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        
        await logActivity(req.user.IdUsuario, 'EDITAR_PRODUCTO', `Producto '${nombre}' (ID: ${id}) actualizado.`);
        res.json({ success: true, product: rows[0] });
    } catch (error) { 
        console.error("Error editando producto con Cloudinary:", error);
        res.status(500).json({ success: false, message: "Error editando producto" }); 
    }
});

/**
 * @route   DELETE /api/products/:id
 * @desc    Elimina un producto de la base de datos.
 * @access  Private (solo para empleados)
 */
router.delete('/:id', authenticateToken, requireEmployee, async (req, res) => {
    try {
        const { id } = req.params;
        // Se usa RETURNING para obtener el nombre del producto eliminado y registrarlo en el log.
        const { rows } = await db.query('DELETE FROM productos WHERE idproducto = $1 RETURNING nombre', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        
        await logActivity(req.user.IdUsuario, 'ELIMINAR_PRODUCTO', `Producto '${rows[0].nombre}' (ID: ${id}) eliminado.`);
        res.json({ success: true, message: 'Producto eliminado' });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        // Se maneja el caso de que un producto no pueda ser borrado por tener referencias en 'detalleventas'.
        res.status(500).json({ success: false, message: "Error al eliminar. El producto puede estar asociado a ventas existentes." });
    }
});

module.exports = router;