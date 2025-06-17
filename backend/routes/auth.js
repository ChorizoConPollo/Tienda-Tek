const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { nombre, correo, contraseña, esEmpleado, codigoEmpleado } = req.body;
        if (!nombre || !correo || !contraseña) return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });

        let rolFinal = 'cliente';
        if (esEmpleado === true) {
            if (codigoEmpleado !== '2004') {
                return res.status(401).json({ success: false, message: 'Código de empleado incorrecto.' });
            }
            rolFinal = 'empleado';
        }

        const existingUser = await db.query('SELECT idusuario FROM usuarios WHERE correo = $1', [correo]);
        if (existingUser.rows.length > 0) return res.status(400).json({ success: false, message: 'El correo ya está registrado' });

        const hashedPassword = await bcrypt.hash(contraseña, 10);
        const queryText = 'INSERT INTO usuarios(nombre, correo, contraseña, rol) VALUES($1, $2, $3, $4) RETURNING idusuario';
        await db.query(queryText, [nombre, correo, hashedPassword, rolFinal]);
        
        res.status(201).json({ success: true, message: 'Usuario registrado exitosamente' });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { correo, contraseña } = req.body;
        if (!correo || !contraseña) return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos' });

        const { rows } = await db.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'Credenciales inválidas' });

        const user = rows[0];
        const isValidPassword = await bcrypt.compare(contraseña, user.contraseña);
        if (!isValidPassword) return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET no definida');
        
        const token = jwt.sign(
            { userId: user.idusuario, correo: user.correo, rol: user.rol },
            secret, { expiresIn: '24h' }
        );

        res.json({
            success: true, token,
            user: { id: user.idusuario, nombre: user.nombre, correo: user.correo, rol: user.rol }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

router.get('/verify', authenticateToken, (req, res) => res.json({ success: true, user: req.user }));

module.exports = router;