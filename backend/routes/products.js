const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

// --- Configuración de Multer para la subida de imágenes ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/';
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `product-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen'), false);
}});

// Función de utilidad para registrar actividad
async function logActivity(userId, action, details) {
    try {
        await db.query('INSERT INTO historialactividades(idusuario, accion, detalles) VALUES($1, $2, $3)', [userId, action, details]);
    } catch (logError) { console.error("Fallo al registrar actividad:", logError); }
}

// --- Rutas Públicas (CON LÓGICA DE FILTRADO CORREGIDA) ---
router.get('/', async (req, res) => {
    try {
        let queryText = 'SELECT * FROM productos';
        const { categoria, search } = req.query;
        const conditions = [];
        const queryParams = [];
        let paramIndex = 1;

        conditions.push('stock > 0'); // Por defecto, solo mostrar productos con stock

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
        console.error("Error obteniendo productos:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor al obtener productos." });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT DISTINCT categoria FROM productos WHERE stock > 0 ORDER BY categoria');
        res.json({ success: true, categories: rows.map(r => r.categoria) });
    } catch (error) {
        console.error("Error obteniendo categorías:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor al obtener categorías." });
    }
});


// --- Rutas de Empleado (CRUD Final con subida de imágenes) ---
router.post('/', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, descripcion, preciounitario, stock, categoria } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const query = 'INSERT INTO productos(nombre, descripcion, preciounitario, stock, categoria, imagen_url) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
        const { rows } = await db.query(query, [nombre, descripcion, preciounitario, stock, categoria, imageUrl]);
        await logActivity(req.user.IdUsuario, 'CREAR_PRODUCTO', `Producto '${nombre}' creado.`);
        res.status(201).json({ success: true, product: rows[0] });
    } catch (error) { res.status(500).json({ success: false, message: "Error creando producto" }); }
});

router.put('/:id', authenticateToken, requireEmployee, upload.single('imagen'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, preciounitario, stock, categoria, imagen_url } = req.body;
        let newImageUrl = imagen_url;
        if (req.file) newImageUrl = `/uploads/${req.file.filename}`;
        
        const query = 'UPDATE productos SET nombre=$1, descripcion=$2, preciounitario=$3, stock=$4, categoria=$5, imagen_url=$6 WHERE idproducto=$7 RETURNING *';
        const { rows } = await db.query(query, [nombre, descripcion, preciounitario, stock, categoria, newImageUrl, id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        
        await logActivity(req.user.IdUsuario, 'EDITAR_PRODUCTO', `Producto '${nombre}' (ID: ${id}) actualizado.`);
        res.json({ success: true, product: rows[0] });
    } catch (error) { res.status(500).json({ success: false, message: "Error editando producto" }); }
});

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