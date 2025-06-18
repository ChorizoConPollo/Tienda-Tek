/**
 * @file database.js
 * @author Bayron Cañas
 * @description Módulo central para la gestión de la conexión a la base de datos PostgreSQL.
 *              Este archivo configura y exporta un pool de conexiones que se adapta
 *              automáticamente al entorno de ejecución (desarrollo local o producción en la nube).
 */

const { Pool } = require('pg');

let pool;
let dbConfig = {};

// Detección automática del entorno para seleccionar la configuración de la base de datos.
// Si existe la variable de entorno DATABASE_URL, se asume un entorno de producción (ej. Render).
if (process.env.DATABASE_URL) {
  // Configuración para producción, utilizando la URL de conexión única.
  console.log('✅ Usando configuración de base de datos de PRODUCCIÓN.');
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Requerido para conexiones seguras en muchos proveedores cloud.
    }
  };
} else {
  // Configuración para desarrollo local, utilizando variables individuales del archivo .env.
  console.log('✅ Usando configuración de base de datos LOCAL.');
  dbConfig = {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  };
}

// Inicializa el pool de conexiones con la configuración determinada.
// El pool gestiona eficientemente múltiples conexiones simultáneas a la base de datos.
pool = new Pool(dbConfig);

// Listener global para errores en el pool. Si un cliente inactivo en el pool
// encuentra un error de red, este evento lo capturará y cerrará la aplicación
// para evitar un estado inconsistente.
pool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el cliente del pool de PostgreSQL', err);
  process.exit(-1);
});

/**
 * Verifica activamente la conexión con la base de datos intentando adquirir y
 * liberar un cliente del pool. Es crucial para el arranque controlado del servidor.
 * @returns {Promise<boolean>} Devuelve `true` si la conexión es exitosa, `false` en caso contrario.
 */
const checkConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('✅ ¡Conexión con PostgreSQL verificada exitosamente!');
    return true;
  } catch (err) {
    console.error('❌ Error al verificar la conexión con PostgreSQL:', err);
    return false;
  } finally {
    // Es fundamental liberar al cliente para devolverlo al pool después de su uso.
    if (client) {
      client.release();
    }
  }
};

// Se exporta un objeto con los métodos necesarios para interactuar con la base de datos
// desde otras partes de la aplicación.
module.exports = {
  /**
   * Ejecuta una consulta SQL parametrizada de forma segura.
   * @param {string} text - La consulta SQL con placeholders (ej: $1, $2).
   * @param {Array} params - Un array de valores para los placeholders.
   * @returns {Promise<QueryResult>} El resultado de la consulta.
   */
  query: (text, params) => pool.query(text, params),

  /**
   * Obtiene un cliente del pool, necesario para ejecutar transacciones.
   * @returns {Promise<PoolClient>} Una promesa que resuelve a un cliente de base de datos.
   */
  getClient: () => pool.connect(),

  // Se exporta la función de verificación para ser usada en el arranque del servidor.
  checkConnection,
};