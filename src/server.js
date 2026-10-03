const app = require('./app');
const db = require('./db');
const config = require('./config');
const { ensureSchema } = require('./schema');

// The DB container can take a few seconds to accept connections, so retry on startup
async function connectWithRetry(retries = 10, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await ensureSchema(db);
      return;
    } catch (err) {
      console.log(`DB not ready (attempt ${i}/${retries}): ${err.code || err.message}`);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

connectWithRetry()
  .then(() => app.listen(config.port, () => console.log(`urlshort listening on :${config.port}`)))
  .catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
  });
