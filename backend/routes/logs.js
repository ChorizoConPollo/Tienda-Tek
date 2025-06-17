const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireEmployee } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, requireEmployee, async (req, res) => {
    try {
        const queryText = `
            SELECT h.idhistorial, h.accion, h.detalles, h.fecha, u.nombre as nombre_empleado
            FROM historialactividades h
            JOIN usuarios u ON h.idusuario = u.idusuario
            ORDER BY h.fecha DESC
            LIMIT 100;
        `;
        const { rows } = await db.query(queryText);
        res.json({ success: true, logs: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error obteniendo historial' });
    }
});

module.exports = router;