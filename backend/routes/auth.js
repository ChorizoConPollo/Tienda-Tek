/**
 * @file auth.js
 * @author Bayron Cañas
 * @description Define las rutas de la API para la autenticación de usuarios.
 *              Incluye los endpoints para el registro de nuevas cuentas,
 *              el inicio de sesión y la verificación de tokens.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Registra un nuevo usuario en la base de datos.
 *          Valida los datos de entrada, verifica si el correo ya existe,
 *          hashea la contraseña y asigna un rol de 'cliente' o 'empleado'.
 * @access  Public
 */
router.post('/register', async (req, res) => {
    try {
        const { nombre, correo, contraseña, esEmpleado, codigoEmpleado } = req.body;

        // Validación básica de campos requeridos.
        if (!nombre || !correo || !contraseña) {
            return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
        }

        // Asignación de rol basada en la entrada del formulario.
        let rolFinal = 'cliente';
        if (esEmpleado === true) {
            // Se requiere un código secreto para registrarse como empleado.
            if (codigoEmpleado !== '2004') { // Código de empleado hardcodeado.
                return res.status(401).json({ success: false, message: 'Código de empleado incorrecto.' });
            }
            rolFinal = 'empleado';
        }

        // Verifica que el correo electrónico no esté ya en uso.
        const existingUser = await db.query('SELECT idusuario FROM usuarios WHERE correo = $1', [correo]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'El correo ya está registrado' });
        }

        // Hashea la contraseña antes de guardarla para mayor seguridad.
        const hashedPassword = await bcrypt.hash(contraseña, 10);
        
        // Inserta el nuevo usuario en la base de datos.
        const queryText = 'INSERT INTO usuarios(nombre, correo, contraseña, rol) VALUES($1, $2, $3, $4) RETURNING idusuario';
        await db.query(queryText, [nombre, correo, hashedPassword, rolFinal]);
        
        res.status(201).json({ success: true, message: 'Usuario registrado exitosamente' });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    Autentica un usuario existente y, si las credenciales son válidas,
 *          genera y devuelve un JSON Web Token (JWT) para la gestión de sesiones.
 * @access  Public
 */
router.post('/login', async (req, res) => {
    try {
        const { correo, contraseña } = req.body;
        if (!correo || !contraseña) {
            return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos' });
        }

        // Busca al usuario por su correo en la base de datos.
        const { rows } = await db.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' }); // Mensaje genérico por seguridad.
        }

        const user = rows[0];
        // Compara la contraseña proporcionada con el hash almacenado en la base de datos.
        const isValidPassword = await bcrypt.compare(contraseña, user.contraseña);
        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        }
        
        // Genera el JWT si la autenticación es exitosa.
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET no definida');
        
        const token = jwt.sign(
            // Payload del token: información no sensible del usuario.
            { userId: user.idusuario, correo: user.correo, rol: user.rol },
            secret, 
            // Opciones del token: expira en 24 horas.
            { expiresIn: '24h' }
        );

        // Devuelve el token y los datos básicos del usuario al frontend.
        res.json({
            success: true, 
            token,
            user: { id: user.idusuario, nombre: user.nombre, correo: user.correo, rol: user.rol }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

/**
 * @route   GET /api/auth/verify
 * @desc    Ruta protegida para verificar la validez de un token existente.
 *          El middleware `authenticateToken` hace todo el trabajo. Si la petición llega
 *          a este punto, el token es válido.
 * @access  Private
 */
router.get('/verify', authenticateToken, (req, res) => {
    // Devuelve los datos del usuario que fueron adjuntados por el middleware a la petición.
    res.json({ success: true, user: req.user });
});

module.exports = router;