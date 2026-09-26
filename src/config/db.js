const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('./env');

const absoluteDbPath = path.isAbsolute(config.dbPath)
  ? config.dbPath
  : path.join(__dirname, '../../', config.dbPath);

fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

let SQL = null;
let rawDb = null;
let readyPromise = null;
let txDepth = 0;

function persist() {
  if (txDepth > 0 || !rawDb) return;
  const data = rawDb.export();
  const tempPath = `${absoluteDbPath}.tmp`;
  fs.writeFileSync(tempPath, Buffer.from(data));
  fs.renameSync(tempPath, absoluteDbPath);
}

function mapParams(params) {
  return params.map((value) => (value === undefined ? null : value));
}

function rowsFromStatement(stmt) {
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  return rows;
}

function createStatement(sql) {
  return {
    run(...params) {
      const stmt = rawDb.prepare(sql);
      try {
        stmt.bind(mapParams(params));
        stmt.step();
      } finally {
        stmt.free();
      }

      const changes = rawDb.getRowsModified();
      persist();
      return { changes };
    },
    get(...params) {
      const stmt = rawDb.prepare(sql);
      try {
        stmt.bind(mapParams(params));
        return stmt.step() ? stmt.getAsObject() : undefined;
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      const stmt = rawDb.prepare(sql);
      try {
        stmt.bind(mapParams(params));
        return rowsFromStatement(stmt);
      } finally {
        stmt.free();
      }
    },
  };
}

const db = {
  async ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        SQL = await initSqlJs();
        if (fs.existsSync(absoluteDbPath)) {
          const fileBuffer = fs.readFileSync(absoluteDbPath);
          rawDb = new SQL.Database(fileBuffer);
        } else {
          rawDb = new SQL.Database();
          persist();
        }
        rawDb.run('PRAGMA foreign_keys = ON;');
        return db;
      })();
    }
    return readyPromise;
  },

  exec(sql) {
    rawDb.exec(sql);
    persist();
  },

  prepare(sql) {
    return createStatement(sql);
  },

  transaction(fn) {
    return (...args) => {
      rawDb.run('BEGIN');
      txDepth += 1;
      try {
        const result = fn(...args);
        rawDb.run('COMMIT');
        txDepth -= 1;
        persist();
        return result;
      } catch (error) {
        try {
          rawDb.run('ROLLBACK');
        } catch (_rollbackError) {
          // ignore — original error is more useful
        }
        txDepth = Math.max(0, txDepth - 1);
        throw error;
      }
    };
  },

  get path() {
    return absoluteDbPath;
  },
};

module.exports = db;
