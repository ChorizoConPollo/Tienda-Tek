/**
 * @file auth.js
 * @author Bayron Cañas
 * @description Módulo que contiene los middlewares de Express para gestionar la
 *              autenticación y autorización en la aplicación. Estos middlewares
 *              se utilizan para proteger las rutas que requieren acceso restringido.
 */

const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Middleware para autenticar peticiones mediante un JSON Web Token (JWT).
 * Extrae el token de la cabecera 'Authorization', lo verifica y, si es válido,
 * recupera los datos del usuario de la base de datos y los adjunta al objeto `req`.
 *
 * @param {object} req - El objeto de la petición de Express.
 * @param {object} res - El objeto de la respuesta de Express.
 * @param {function} next - La función para pasar el control al siguiente middleware.
 */
const authenticateToken = async (req, res, next) => {
    // Extrae el token del formato 'Bearer <token>'
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Si no se proporciona un token, se deniega el acceso.
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token de acceso requerido' });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            // Error de configuración del servidor si el secreto no está definido.
            throw new Error('JWT_SECRET no definida en las variables de entorno.');
        }

        // Verifica la firma y la expiración del token. Si no es válido, lanza un error.
        const decoded = jwt.verify(token, secret);
        
        // Aunque el token sea válido, se verifica que el usuario aún exista en la base de datos.
        // Esto previene el acceso si el usuario ha sido eliminado después de la emisión del token.
        const { rows } = await db.query('SELECT idusuario, nombre, correo, rol FROM usuarios WHERE idusuario = $1', [decoded.userId]);
        
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario asociado al token no encontrado' });
        }
        
        // Adjunta la información del usuario al objeto `req` para que las rutas posteriores puedan usarla.
        req.user = {
            IdUsuario: rows[0].idusuario,
            Nombre: rows[0].nombre,
            Correo: rows[0].correo,
            Rol: rows[0].rol
        };

        // Pasa el control al siguiente middleware o a la ruta principal.
        next();
    } catch (error) {
        // Captura errores de `jwt.verify` (ej. token expirado, firma inválida)
        // o el error de `JWT_SECRET` no definida.
        return res.status(403).json({ success: false, message: 'Token no válido o expirado' });
    }
};

/**
 * Middleware para autorizar el acceso solo a usuarios con rol de 'empleado' o 'admin'.
 * Este middleware DEBE ejecutarse después de `authenticateToken`, ya que depende de `req.user`.
 *
 * @param {object} req - El objeto de la petición de Express, debe contener `req.user`.
 * @param {object} res - El objeto de la respuesta de Express.
 * @param {function} next - La función para pasar el control al siguiente middleware.
 */
const requireEmployee = (req, res, next) => {
    // Verifica que el objeto `req.user` exista y que el rol sea el adecuado.
    if (req.user && (req.user.Rol === 'empleado' || req.user.Rol === 'admin')) {
        // Si cumple los requisitos, permite el acceso.
        next();
    } else {
        // Si no, deniega el acceso con un estado 403 Forbidden.
        res.status(403).json({ success: false, message: 'Acceso denegado. Se requieren permisos de empleado.' });
    }
};

module.exports = { 
    authenticateToken, 
    requireEmployee 
};