/**
 * @file orders.js
 * @author Bayron Cañas
 * @description Define las rutas de la API para la gestión de pedidos y ventas.
 *              Incluye la creación de nuevos pedidos, y la consulta de historiales
 *              tanto para clientes como para empleados.
 */

const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Crea un nuevo pedido a partir de los ítems del carrito de un cliente.
 *          Esta operación se ejecuta dentro de una transacción de base de datos para
 *          garantizar la atomicidad: o todas las operaciones tienen éxito, o todas se revierten.
 * @access  Private (solo para clientes autenticados)
 */
router.post('/', authenticateToken, async (req, res) => {
    // Se obtiene un cliente del pool de conexiones para manejar la transacción.
    const client = await db.getClient();
    try {
        // Inicia la transacción.
        await client.query('BEGIN');

        const { items } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'El carrito está vacío' });
        }

        // 1. Calcular el total y verificar el stock de todos los productos antes de cualquier inserción.
        let total = 0;
        for (const item of items) {
            const productResult = await client.query('SELECT preciounitario, stock FROM productos WHERE idproducto = $1 FOR UPDATE', [item.IdProducto]);
            const product = productResult.rows[0];
            // Bloquea las filas seleccionadas (FOR UPDATE) para prevenir condiciones de carrera.
            if (!product || product.stock < item.Cantidad) {
                throw new Error(`Stock insuficiente para el producto ID ${item.IdProducto}.`);
            }
            total += product.preciounitario * item.Cantidad;
        }
        
        // 2. Insertar la cabecera de la venta en la tabla 'ventas'.
        const ventaQuery = 'INSERT INTO ventas(total, idusuario) VALUES($1, $2) RETURNING idventa';
        const ventaResult = await client.query(ventaQuery, [total, req.user.IdUsuario]);
        const ventaId = ventaResult.rows[0].idventa;

        // 3. Iterar sobre cada ítem para insertarlo en 'detalleventas' y actualizar el stock en 'productos'.
        for (const item of items) {
            const productResult = await client.query('SELECT preciounitario FROM productos WHERE idproducto = $1', [item.IdProducto]);
            // Inserta el detalle de la venta.
            await client.query(
                'INSERT INTO detalleventas(idventa, idproducto, cantidad, preciounitario) VALUES($1, $2, $3, $4)', 
                [ventaId, item.IdProducto, item.Cantidad, productResult.rows[0].preciounitario]
            );
            // Actualiza (resta) el stock del producto correspondiente.
            await client.query(
                'UPDATE productos SET stock = stock - $1 WHERE idproducto = $2', 
                [item.Cantidad, item.IdProducto]
            );
        }
        
        // Si todas las operaciones fueron exitosas, se confirman los cambios en la base de datos.
        await client.query('COMMIT');
        res.status(201).json({ success: true, message: 'Pedido creado exitosamente' });

    } catch (error) {
        // Si ocurre cualquier error durante la transacción, se revierten todos los cambios.
        await client.query('ROLLBACK');
        console.error("Error creando pedido:", error.message);
        res.status(500).json({ success: false, message: error.message || 'Error interno del servidor al procesar el pedido.' });
    } finally {
        // Es fundamental liberar al cliente para devolverlo al pool, sin importar si la transacción tuvo éxito o no.
        client.release();
    }
});

/**
 * @route   GET /api/orders/history
 * @desc    Obtiene el historial de pedidos del cliente actualmente autenticado.
 * @access  Private (solo para clientes autenticados)
 */
router.get('/history', authenticateToken, async (req, res) => {
    try {
        // Consulta que une ventas, detalles y productos para obtener la información completa de cada pedido.
        const queryText = `
            SELECT v.idventa, v.fecha, v.total, p.nombre, dv.cantidad, dv.preciounitario
            FROM ventas v
            JOIN detalleventas dv ON v.idventa = dv.idventa
            JOIN productos p ON dv.idproducto = p.idproducto
            WHERE v.idusuario = $1 ORDER BY v.fecha DESC`;
        
        const { rows } = await db.query(queryText, [req.user.IdUsuario]);
        
        // Agrupa los resultados por ID de venta para formatear la respuesta.
        const orders = {};
        rows.forEach(row => {
            if (!orders[row.idventa]) {
                orders[row.idventa] = { id: row.idventa, fecha: row.fecha, total: row.total, items: [] };
            }
            orders[row.idventa].items.push({ nombre: row.nombre, cantidad: row.cantidad, precioUnitario: row.preciounitario });
        });
        
        res.json({ success: true, orders: Object.values(orders) });
    } catch (error) {
        console.error("Error obteniendo historial de cliente:", error);
        res.status(500).json({ success: false, message: 'Error obteniendo historial de pedidos' });
    }
});

/**
 * @route   GET /api/orders/all
 * @desc    Obtiene un resumen de todas las ventas realizadas en la tienda.
 * @access  Private (solo para empleados)
 */
router.get('/all', authenticateToken, requireEmployee, async (req, res) => {
    try {
        // Consulta avanzada que utiliza funciones de agregación de JSON de PostgreSQL (json_agg, json_build_object)
        // para agrupar los ítems de cada venta en un array JSON directamente desde la base de datos.
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
        res.status(500).json({ success: false, message: 'Error obteniendo el resumen de ventas' });
    }
});

module.exports = router;