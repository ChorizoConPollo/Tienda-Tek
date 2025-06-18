const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

// --- Configuración de Cloudinary ---
// Toma las credenciales de las variables de entorno que pusiste en Render
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- Configuración de Multer para manejar archivos en la memoria ---
// Ya no guardamos las imágenes en el disco del servidor, las procesamos en memoria.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Función de utilidad para registrar actividad (si la estás usando)
async function logActivity(userId, action, details) {
    try {
        await db.query('INSERT INTO historialactividades(idusuario, accion, detalles) VALUES($1, $2, $3)', [userId, action, details]);
    } catch (logError) { console.error("Fallo al registrar actividad:", logError); }
}

// --- Rutas Públicas (sin cambios) ---
router.get('/', async (req, res) => {
    try {
        // ... (código existente de esta ruta, no necesita cambios)
        let queryText = 'SELECT * FROM productos WHERE stock > 0 ORDER BY nombre';
        const { rows } = await db.query(queryText);
        res.json({ success: true, products: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error obteniendo productos." });
    }
});

router.get('/categories', async (req, res) => {
    try {
        // ... (código existente de esta ruta, no necesita cambios)
        const { rows } = await db.query('SELECT DISTINCT categoria FROM productos WHERE stock > 0 ORDER BY categoria');
        res.json({ success: true, categories: rows.map(r => r.categoria) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error obteniendo categorías." });
    }
});

// --- Ruta POST para crear producto (¡Modificada para usar Cloudinary!) ---
router.post('/', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, descripcion, preciounitario, stock, categoria } = req.body;
        let imageUrl = null; // Por defecto no hay imagen

        if (req.file) {
            // Si el usuario subió un archivo, lo enviamos a Cloudinary
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error) reject(error);
                    resolve(result);
                });
                uploadStream.end(req.file.buffer);
            });
            imageUrl = result.secure_url; // Guardamos la URL segura que nos da Cloudinary
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

// --- Ruta PUT para editar producto (¡Modificada para usar Cloudinary!) ---
router.put('/:id', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, preciounitario, stock, categoria, imagen_url } = req.body;
        let newImageUrl = imagen_url; // Mantenemos la URL vieja por si no se sube una nueva

        if (req.file) {
            // Si se sube un nuevo archivo, lo enviamos a Cloudinary
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error) reject(error);
                    resolve(result);
                });
                uploadStream.end(req.file.buffer);
            });
            newImageUrl = result.secure_url; // Actualizamos a la nueva URL de Cloudinary
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

// --- Ruta DELETE (sin cambios) ---
router.delete('/:id', authenticateToken, requireEmployee, async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await db.query('DELETE FROM productos WHERE idproducto = $1 RETURNING nombre', [id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        await logActivity(req.user.IdUsuario, 'ELIMINAR_PRODUCTO', `Producto '${rows[0].nombre}' (ID: ${id}) eliminado.`);
        res.json({ success: true, message: 'Producto eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error al eliminar. El producto puede estar asociado a ventas existentes." });
    }
});

module.exports = router;