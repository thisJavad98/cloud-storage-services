const app = require('../src/app');
const db = require('../src/config/db');
const migrate = require('../src/db/migrate');

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.ready();
      await migrate({ quiet: true });
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

module.exports = async function handler(req, res) {
  await ensureReady();
  return app(req, res);
};
