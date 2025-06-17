const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

pool.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión con PostgreSQL', err.stack);
    } else {
        console.log('✅ ¡Conectado a PostgreSQL exitosamente!');
    }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};