// Importar la clase Pool del paquete 'pg'
const { Pool } = require('pg');

// Declarar una variable para el pool de conexiones
let pool;

// Comprobar si la variable de entorno DATABASE_URL existe.
// Esta variable es proporcionada automáticamente por plataformas de despliegue como Render o Heroku.
if (process.env.DATABASE_URL) {
  // --- CONFIGURACIÓN PARA PRODUCCIÓN (RENDER) ---
  // Si DATABASE_URL existe, estamos en un entorno de producción.
  pool = new Pool({
    // La connectionString contiene toda la información necesaria: usuario, contraseña, host, puerto y base de datos.
    connectionString: process.env.DATABASE_URL,
    // La mayoría de los proveedores de bases de datos en la nube requieren una conexión SSL.
    // 'rejectUnauthorized: false' es a menudo necesario en entornos de desarrollo/gratuitos
    // para evitar errores de certificados autofirmados.
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  // --- CONFIGURACIÓN PARA DESARROLLO (LOCAL) ---
  // Si no hay DATABASE_URL, asumimos que estamos en un entorno local.
  // Se utilizan las variables de entorno individuales definidas en el archivo .env.
  pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  });
}

// Intentar conectar al pool para verificar que la configuración es correcta al iniciar la aplicación.
pool.connect((err) => {
  if (err) {
    // Si hay un error, mostrarlo en la consola para un diagnóstico rápido.
    console.error('❌ Error de conexión con PostgreSQL:', err.stack);
  } else {
    // Si la conexión es exitosa, mostrar un mensaje de confirmación.
    console.log('✅ ¡Conectado a PostgreSQL exitosamente!');
  }
});

// Exportar un objeto con dos métodos para interactuar con la base de datos desde otras partes de la aplicación.
module.exports = {
  /**
   * Ejecuta una consulta simple.
   * @param {string} text - El texto de la consulta SQL (ej: "SELECT * FROM usuarios WHERE id = $1").
   * @param {Array} params - Un array de parámetros para la consulta, para prevenir inyecciones SQL.
   * @returns {Promise<QueryResult>} El resultado de la consulta.
   */
  query: (text, params) => pool.query(text, params),

  /**
   * Obtiene un cliente del pool. Esto es esencial para realizar transacciones
   * (varias consultas que deben tener éxito o fallar todas juntas).
   * @returns {Promise<PoolClient>} Un cliente de la base de datos.
   */
  getClient: () => pool.connect(),
};