const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

// --- RUTA PARA QUE UN CLIENTE CREE UN PEDIDO ---
router.post('/', authenticateToken, async (req, res) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { items } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'El carrito está vacío' });

        // Se crea una única venta para todo el pedido
        let total = 0;
        for (const item of items) {
            const productResult = await client.query('SELECT preciounitario, stock FROM productos WHERE idproducto = $1', [item.IdProducto]);
            const product = productResult.rows[0];
            if (product.stock < item.Cantidad) throw new Error(`Stock insuficiente.`);
            total += product.preciounitario * item.Cantidad;
        }
        
        const ventaQuery = 'INSERT INTO ventas(total, idusuario) VALUES($1, $2) RETURNING idventa';
        const ventaResult = await client.query(ventaQuery, [total, req.user.IdUsuario]);
        const ventaId = ventaResult.rows[0].idventa;

        // Se insertan los detalles y se actualiza el stock para cada item
        for (const item of items) {
            const productResult = await client.query('SELECT preciounitario FROM productos WHERE idproducto = $1', [item.IdProducto]);
            await client.query('INSERT INTO detalleventas(idventa, idproducto, cantidad, preciounitario) VALUES($1, $2, $3, $4)', [ventaId, item.IdProducto, item.Cantidad, productResult.rows[0].preciounitario]);
            await client.query('UPDATE productos SET stock = stock - $1 WHERE idproducto = $2', [item.Cantidad, item.IdProducto]);
        }
        
        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Pedido creado exitosamente' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error creando pedido:", error.message);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        client.release();
    }
});

// --- RUTA PARA QUE UN CLIENTE VEA SU PROPIO HISTORIAL ---
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const queryText = `
            SELECT v.idventa, v.fecha, v.total, p.nombre, dv.cantidad, dv.preciounitario
            FROM ventas v
            JOIN detalleventas dv ON v.idventa = dv.idventa
            JOIN productos p ON dv.idproducto = p.idproducto
            WHERE v.idusuario = $1 ORDER BY v.fecha DESC`;
        const { rows } = await db.query(queryText, [req.user.IdUsuario]);
        
        const orders = {};
        rows.forEach(row => {
            if (!orders[row.idventa]) {
                orders[row.idventa] = { id: row.idventa, fecha: row.fecha, total: row.total, items: [] };
            }
            orders[row.idventa].items.push({ nombre: row.nombre, cantidad: row.cantidad, precioUnitario: row.preciounitario });
        });
        res.json({ success: true, orders: Object.values(orders) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error obteniendo historial' });
    }
});

// --- RUTA PARA QUE UN EMPLEADO VEA TODAS LAS VENTAS ---
router.get('/all', authenticateToken, requireEmployee, async (req, res) => {
    try {
        const query = `
            SELECT v.idventa, v.fecha, v.total, u.nombre as nombre_cliente,
                   json_agg(json_build_object('nombre', p.nombre, 'cantidad', dv.cantidad)) as items
            FROM ventas v
            JOIN usuarios u ON v.idusuario = u.idusuario
            JOIN detalleventas dv ON v.idventa = dv.idventa
            JOIN productos p ON dv.idproducto = p.idproducto
            GROUP BY v.idventa, u.nombre
            ORDER BY v.fecha DESC`;
        const { rows } = await db.query(query);
        res.json({ success: true, sales: rows });
    } catch (error) {
        console.error("Error obteniendo todas las ventas:", error);
        res.status(500).json({ success: false, message: 'Error obteniendo ventas' });
    }
});

module.exports = router;