import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool, inTransaction } from './db.js';
import { validateBody, registerSchema, loginSchema, forgotSchema, resetSchema, profileSchema } from './validation.js';

export const authRouter = Router();

function tokenSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    const error = new Error('JWT_SECRET must be configured with at least 24 characters.');
    error.status = 503;
    error.expose = true;
    throw error;
  }
  return process.env.JWT_SECRET;
}

function createToken(user) {
  const tokenId = crypto.randomUUID();
  const expiresIn = process.env.JWT_EXPIRES_IN || '12h';
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, jti: tokenId },
    tokenSecret(),
    { expiresIn }
  );
  const decoded = jwt.decode(token);
  return { token, tokenId, expiresAt: new Date(decoded.exp * 1000) };
}

export async function requireAuth(request, _response, next) {
  try {
    const header = request.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      const error = new Error('A bearer token is required.');
      error.status = 401;
      error.expose = true;
      throw error;
    }
    const payload = jwt.verify(match[1], tokenSecret());
    if (!payload.jti || !payload.sub) {
      const error = new Error('Invalid authentication token.');
      error.status = 401;
      error.expose = true;
      throw error;
    }
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at
       FROM users u
       WHERE u.id = $1
         AND NOT EXISTS (SELECT 1 FROM revoked_tokens r WHERE r.token_id = $2)`,
      [payload.sub, payload.jti]
    );
    if (!result.rowCount) {
      const error = new Error('Authentication token is invalid or has been revoked.');
      error.status = 401;
      error.expose = true;
      throw error;
    }
    request.user = result.rows[0];
    request.tokenPayload = payload;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.status = 401;
      error.expose = true;
      error.message = error.name === 'TokenExpiredError' ? 'Authentication token has expired.' : 'Invalid authentication token.';
    }
    return next(error);
  }
}

authRouter.post('/register', validateBody(registerSchema), async (request, response, next) => {
  try {
    tokenSecret();
    const { name, email, password } = request.body;
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, lower($2), $3)
       RETURNING id, name, email, role, created_at`,
      [name, email, await bcrypt.hash(password, 12)]
    );
    const user = result.rows[0];
    const session = createToken(user);
    response.status(201).json({ user, token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt });
  } catch (error) { next(error); }
});

authRouter.post('/login', validateBody(loginSchema), async (request, response, next) => {
  try {
    const { email, password } = request.body;
    const result = await pool.query(
      'SELECT id, name, email, role, password_hash, created_at FROM users WHERE lower(email) = lower($1)',
      [email]
    );
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
      const error = new Error('Email or password is incorrect.');
      error.status = 401;
      error.expose = true;
      throw error;
    }
    const { password_hash: _passwordHash, ...user } = result.rows[0];
    const session = createToken(user);
    response.json({ user, token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt });
  } catch (error) { next(error); }
});

authRouter.post(['/forgot-password', '/reset/request'], validateBody(forgotSchema), async (request, response, next) => {
  try {
    const email = request.body.email.toLowerCase();
    const userResult = await pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
    const body = { message: 'If the account exists, a password reset code has been created.' };
    if (userResult.rowCount) {
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      const minutes = Math.max(1, Math.min(60, Number(process.env.OTP_EXPIRY_MINUTES || 10)));
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, otp_hash, expires_at)
         VALUES ($1, $2, now() + ($3::text || ' minutes')::interval)
         ON CONFLICT (user_id) DO UPDATE
         SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, created_at = now()`,
        [userResult.rows[0].id, otpHash, minutes]
      );
      if (process.env.NODE_ENV !== 'production') body.otp = otp;
    }
    response.json(body);
  } catch (error) { next(error); }
});

authRouter.post(['/verify-otp', '/reset/verify'], validateBody(forgotSchema.extend({ otp: resetSchema.shape.otp })), async (request, response, next) => {
  try {
    const { email, otp } = request.body;
    const result = await pool.query(
      `SELECT t.otp_hash FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE lower(u.email) = lower($1) AND t.expires_at > now()`,
      [email]
    );
    const supplied = crypto.createHash('sha256').update(otp).digest();
    const expected = result.rowCount ? Buffer.from(result.rows[0].otp_hash, 'hex') : Buffer.alloc(32);
    const valid = crypto.timingSafeEqual(supplied, expected) && result.rowCount > 0;
    response.status(valid ? 200 : 400).json({ valid, message: valid ? 'OTP is valid.' : 'OTP is invalid or expired.' });
  } catch (error) { next(error); }
});

authRouter.post(['/reset-password', '/reset/confirm'], validateBody(resetSchema), async (request, response, next) => {
  try {
    const { email, otp, newPassword } = request.body;
    await inTransaction(async (client) => {
      const result = await client.query(
        `SELECT u.id, t.otp_hash FROM users u
         JOIN password_reset_tokens t ON t.user_id = u.id
         WHERE lower(u.email) = lower($1) AND t.expires_at > now()
         FOR UPDATE OF t`,
        [email]
      );
      const supplied = crypto.createHash('sha256').update(otp).digest();
      const expected = result.rowCount ? Buffer.from(result.rows[0].otp_hash, 'hex') : Buffer.alloc(32);
      if (!result.rowCount || !crypto.timingSafeEqual(supplied, expected)) {
        const error = new Error('OTP is invalid or expired.');
        error.status = 400;
        error.expose = true;
        throw error;
      }
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
        [result.rows[0].id, await bcrypt.hash(newPassword, 12)]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [result.rows[0].id]);
    });
    response.json({ message: 'Password has been reset successfully.' });
  } catch (error) { next(error); }
});

authRouter.get(['/profile', '/me'], requireAuth, (request, response) => response.json({ user: request.user }));

authRouter.patch('/profile', requireAuth, validateBody(profileSchema), async (request, response, next) => {
  try {
    const { name, email } = request.body;
    const result = await pool.query(
      `UPDATE users SET name = COALESCE($2, name), email = COALESCE(lower($3), email), updated_at = now()
       WHERE id = $1 RETURNING id, name, email, role, created_at`,
      [request.user.id, name, email]
    );
    response.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

authRouter.post('/logout', requireAuth, async (request, response, next) => {
  try {
    await pool.query(
      `INSERT INTO revoked_tokens (token_id, expires_at) VALUES ($1, to_timestamp($2))
       ON CONFLICT (token_id) DO NOTHING`,
      [request.tokenPayload.jti, request.tokenPayload.exp]
    );
    response.json({ message: 'Logged out successfully.' });
  } catch (error) { next(error); }
});
