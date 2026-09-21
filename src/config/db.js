const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const config = require('./env');

neonConfig.webSocketConstructor = ws;

let pool = null;
let readyPromise = null;

function getPool() {
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Set it to your Neon Postgres connection string.'
    );
  }

  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });
  }

  return pool;
}

function createClientApi(client) {
  return {
    async query(text, params = []) {
      return client.query(text, params);
    },
    async one(text, params = []) {
      const result = await client.query(text, params);
      return result.rows[0];
    },
    async many(text, params = []) {
      const result = await client.query(text, params);
      return result.rows;
    },
    async execute(text, params = []) {
      const result = await client.query(text, params);
      return { rowCount: result.rowCount, rows: result.rows };
    },
  };
}

const db = {
  async ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        const activePool = getPool();
        await activePool.query('SELECT 1');
        return db;
      })().catch((error) => {
        readyPromise = null;
        throw error;
      });
    }
    return readyPromise;
  },

  async query(text, params = []) {
    return getPool().query(text, params);
  },

  async one(text, params = []) {
    const result = await getPool().query(text, params);
    return result.rows[0];
  },

  async many(text, params = []) {
    const result = await getPool().query(text, params);
    return result.rows;
  },

  async execute(text, params = []) {
    const result = await getPool().query(text, params);
    return { rowCount: result.rowCount, rows: result.rows };
  },

  async transaction(fn) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(createClientApi(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackError) {
        // Prefer the original error.
      }
      throw error;
    } finally {
      client.release();
    }
  },

  async end() {
    if (pool) {
      await pool.end();
      pool = null;
      readyPromise = null;
    }
  },
};

module.exports = db;
