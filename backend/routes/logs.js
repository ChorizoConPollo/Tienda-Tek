/**
 * @file logs.js
 * @author Bayron Cañas
 * @description Define la ruta de la API para acceder al historial de actividades del sistema.
 *              Esta ruta está protegida y solo es accesible para usuarios con rol de empleado.
 */

const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/logs
 * @desc    Obtiene los últimos 100 registros del historial de actividades.
 *          Realiza un JOIN con la tabla de usuarios para obtener el nombre del empleado
 *          que realizó cada acción.
 * @access  Private (solo para empleados)
 */
router.get('/', authenticateToken, requireEmployee, async (req, res) => {
    try {
        // La consulta SQL une la tabla de historial con la de usuarios para obtener
        // el nombre del empleado, ordena los resultados por fecha descendente para
        // mostrar los más recientes primero, y limita el resultado a 100 registros
        // para mantener un buen rendimiento.
        const queryText = `
            SELECT h.idhistorial, h.accion, h.detalles, h.fecha, u.nombre as nombre_empleado
            FROM historialactividades h
            JOIN usuarios u ON h.idusuario = u.idusuario
            ORDER BY h.fecha DESC
            LIMIT 100;
        `;
        
        const { rows } = await db.query(queryText);
        
        // Devuelve la lista de registros de actividad.
        res.json({ success: true, logs: rows });
    } catch (error) {
        console.error('Error obteniendo historial de actividades:', error);
        res.status(500).json({ success: false, message: 'Error obteniendo historial de actividades' });
    }
});

module.exports = router;