import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { authRouter } from './auth.js';
import { inventoryRouter } from './inventory.js';

export const app = express();

function camelizeKeys(value) {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
    camelizeKeys(item)
  ]));
}

const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((_request, response, next) => {
  const sendJson = response.json.bind(response);
  response.json = (body) => sendJson(camelizeKeys(body));
  next();
});

app.get(['/health', '/api/health'], async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (_error) {
    response.status(503).json({
      status: 'error',
      database: 'unavailable',
      message: 'PostgreSQL is unavailable. Check DATABASE_URL and ensure the database is running.'
    });
  }
});

app.use('/api/auth', authRouter);
app.use('/api', inventoryRouter);

app.use((_request, _response, next) => {
  const error = new Error('Route not found.');
  error.status = 404;
  error.expose = true;
  next(error);
});

app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Invalid JSON request body.' });
  }
  if (error.message === 'Origin is not allowed by CORS.') {
    return response.status(403).json({ error: error.message });
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', '57P01', '57P03', '08000', '08003', '08006'].includes(error.code)) {
    return response.status(503).json({
      error: 'Database unavailable',
      message: 'PostgreSQL is unavailable. Check DATABASE_URL and ensure the database is running.'
    });
  }
  if (error.code === '42P01' || error.code === '3F000') {
    return response.status(503).json({
      error: 'Database schema unavailable',
      message: 'The database schema is not installed. Run npm run migrate.'
    });
  }
  if (error.code === '23505') {
    return response.status(409).json({ error: 'A record with that value already exists.' });
  }
  if (error.code === '23503') {
    return response.status(400).json({ error: 'The request references a record that does not exist or is still in use.' });
  }
  if (error.code === '23514' || error.code === '22P02' || error.code === '22007' || error.code === '22003') {
    return response.status(400).json({ error: 'The request contains an invalid value.' });
  }
  if (error.code === '40001' || error.code === '40P01') {
    return response.status(409).json({ error: 'The operation conflicted with another update. Please retry.' });
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  return response.status(status).json({
    error: status >= 500 ? 'Internal server error.' : (error.expose ? error.message : 'Request failed.'),
    ...(status >= 500 && process.env.NODE_ENV !== 'production' ? { detail: error.message } : {})
  });
});
