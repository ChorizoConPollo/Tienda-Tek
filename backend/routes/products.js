const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

// --- Configuración de Cloudinary ---
// Toma las credenciales de las variables de entorno que pusiste en Render.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- Configuración de Multer para manejar archivos en la memoria ---
// No guardamos las imágenes en el disco del servidor, se procesan en memoria.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Función de utilidad para registrar actividad.
async function logActivity(userId, action, details) {
    try {
        await db.query('INSERT INTO historialactividades(idusuario, accion, detalles) VALUES($1, $2, $3)', [userId, action, details]);
    } catch (logError) { console.error("Fallo al registrar actividad:", logError); }
}

// --- Ruta GET para obtener productos (CON LÓGICA DE FILTRADO Y BÚSQUEDA) ---
// Esta ruta es pública y puede ser filtrada por categoría o término de búsqueda.
router.get('/', async (req, res) => {
    try {
        let queryText = 'SELECT * FROM productos';
        const { categoria, search, stock } = req.query; // Capturamos los posibles filtros de la URL.
        const conditions = [];
        const queryParams = [];
        let paramIndex = 1;

        // Por defecto, para los clientes, solo mostramos productos con stock.
        // A menos que explícitamente se pida 'all' (usado en el panel de empleado).
        if (stock !== 'all') {
            conditions.push('stock > 0');
        }

        // Si se proporciona una categoría, la añadimos como condición a la consulta.
        if (categoria) {
            conditions.push(`categoria = $${paramIndex++}`);
            queryParams.push(categoria);
        }
        
        // Si se proporciona un término de búsqueda, lo añadimos como condición.
        // ILIKE hace la búsqueda insensible a mayúsculas/minúsculas.
        if (search) {
            conditions.push(`nombre ILIKE $${paramIndex++}`);
            queryParams.push(`%${search}%`);
        }

        // Si hemos añadido condiciones, las unimos con 'AND' y las agregamos a la consulta principal.
        if (conditions.length > 0) {
            queryText += ' WHERE ' + conditions.join(' AND ');
        }
        
        // Ordenamos los resultados alfabéticamente por nombre.
        queryText += ' ORDER BY nombre';

        // Ejecutamos la consulta final, pasando los valores de forma segura.
        const { rows } = await db.query(queryText, queryParams);
        res.json({ success: true, products: rows });
    } catch (error) {
        console.error("Error obteniendo productos con filtros:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor al obtener productos." });
    }
});


// --- Ruta GET para obtener todas las categorías distintas ---
// Es pública y se usa para poblar el menú de categorías.
router.get('/categories', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT DISTINCT categoria FROM productos WHERE stock > 0 ORDER BY categoria');
        res.json({ success: true, categories: rows.map(r => r.categoria) });
    } catch (error) {
        console.error("Error obteniendo categorías:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor al obtener categorías." });
    }
});


// --- Ruta POST para crear un nuevo producto (Protegida) ---
// Sube la imagen a Cloudinary si existe.
router.post('/', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, descripcion, preciounitario, stock, categoria } = req.body;
        let imageUrl = null;

        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error) reject(error);
                    resolve(result);
                });
                uploadStream.end(req.file.buffer);
            });
            imageUrl = result.secure_url;
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


// --- Ruta PUT para actualizar un producto existente (Protegida) ---
// Sube una nueva imagen a Cloudinary si se proporciona una.
router.put('/:id', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, preciounitario, stock, categoria, imagen_url } = req.body;
        let newImageUrl = imagen_url;

        if (req.file) {
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


// --- Ruta DELETE para eliminar un producto (Protegida) ---
router.delete('/:id', authenticateToken, requireEmployee, async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await db.query('DELETE FROM productos WHERE idproducto = $1 RETURNING nombre', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        await logActivity(req.user.IdUsuario, 'ELIMINAR_PRODUCTO', `Producto '${rows[0].nombre}' (ID: ${id}) eliminado.`);
        res.json({ success: true, message: 'Producto eliminado' });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ success: false, message: "Error al eliminar. El producto puede estar asociado a ventas existentes." });
    }
});

module.exports = router;