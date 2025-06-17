const { Pool } = require('pg');

let pool;
let dbConfig = {}; // Objeto para guardar la configuración

if (process.env.DATABASE_URL) {
  // --- CONFIGURACIÓN PARA PRODUCCIÓN (RENDER) ---
  console.log('✅ Usando configuración de base de datos de PRODUCCIÓN.');
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else {
  // --- CONFIGURACIÓN PARA DESARROLLO (LOCAL) ---
  console.log('✅ Usando configuración de base de datos LOCAL.');
  dbConfig = {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  };
}

// Creamos el pool con la configuración decidida, pero no conectamos aún.
pool = new Pool(dbConfig);

// Añadimos un listener para los errores del pool.
// Esto es útil para capturar errores de conexión que ocurren después del inicio.
pool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el cliente del pool de PostgreSQL', err);
  process.exit(-1);
});

// Función para verificar la conexión.
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
    if (client) {
      client.release(); // Siempre libera el cliente después de usarlo.
    }
  }
};

// Exportamos los métodos y la función de verificación.
module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  checkConnection, // Exportamos para poder usarla si es necesario
};