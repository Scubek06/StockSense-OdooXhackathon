import 'dotenv/config';
import { app } from './app.js';
import { pool } from './db.js';

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`StockSense API listening on port ${port}; PostgreSQL connects on demand.`);
});

function shutdown(signal) {
  console.log(`${signal} received; closing server.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
