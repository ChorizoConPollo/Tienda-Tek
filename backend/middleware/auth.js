const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token de acceso requerido' });

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET no definida');
        const decoded = jwt.verify(token, secret);
        
        const { rows } = await db.query('SELECT * FROM usuarios WHERE idusuario = $1', [decoded.userId]);
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'Usuario no válido' });
        
        req.user = {
            IdUsuario: rows[0].idusuario,
            Nombre: rows[0].nombre,
            Correo: rows[0].correo,
            Rol: rows[0].rol
        };
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Token no válido o expirado' });
    }
};

const requireEmployee = (req, res, next) => {
    if (req.user && (req.user.Rol === 'empleado' || req.user.Rol === 'admin')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Acceso denegado. Se requieren permisos de empleado.' });
    }
};

module.exports = { authenticateToken, requireEmployee };