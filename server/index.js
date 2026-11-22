import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth, hashPassword, verifyPassword } from './auth.js';
import { createStore, monthBounds } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envPath); } catch { /* ignore */ }
}

const defaultDbPath = path.join(__dirname, 'data', 'moneta.db');
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

const isIntegerAmount = (value) => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const isRealDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const isMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const requiredString = (value) => typeof value === 'string' && value.trim().length > 0;
const isUsername = (value) => typeof value === 'string' && /^[a-zA-Z0-9._-]{3,30}$/.test(value.trim());
const ACCOUNT_TYPES = new Set(['bank', 'e-wallet', 'cash']);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateTransaction(body, accountIds) {
  if (!body || typeof body !== 'object') throw badRequest('Request body must be a JSON object');
  const { title, amount, type, category, account_id: accountId, date, note = '' } = body;
  if (!requiredString(title)) throw badRequest('title is required');
  if (!isIntegerAmount(amount)) throw badRequest('amount must be a positive integer IDR amount');
  if (type !== 'income' && type !== 'expense') throw badRequest("type must be 'income' or 'expense'");
  if (!requiredString(category)) throw badRequest('category is required');
  if (!Number.isInteger(accountId) || !accountIds.has(accountId)) throw badRequest('account_id must reference an existing account');
  if (!isRealDate(date)) throw badRequest('date must be a real calendar date in YYYY-MM-DD format');
  if (typeof note !== 'string') throw badRequest('note must be a string');
  return { title: title.trim(), amount, type, category: category.trim(), accountId, date, note: note.trim() };
}

function validateId(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1) throw badRequest('id must be a positive integer');
  return Number(value);
}

export function createApp(options = {}) {
  const opts = typeof options === 'string' ? { dbPath: options } : options;
  const dbPath = opts.dbPath ?? defaultDbPath;
  const databaseUrl = opts.databaseUrl !== undefined ? opts.databaseUrl : process.env.DATABASE_URL;
  const authSecret = opts.authSecret !== undefined ? opts.authSecret : process.env.AUTH_SECRET;

  const store = createStore({ dbPath, databaseUrl });
  const auth = createAuth({ secret: authSecret });

  const app = express();
  app.use(express.json({ limit: '32kb' }));

  // Auth routes (public)
  async function handleAuthStatus(req, res, next) {
    try {
      const session = auth.getSession(req);
      if (!session) return res.json({ authenticated: false, user: null });
      const user = await store.findUserById(session.userId);
      if (!user) {
        auth.clearSessionCookie(res);
        return res.json({ authenticated: false, user: null });
      }
      return res.json({ authenticated: true, user });
    } catch (error) { return next(error); }
  }

  app.get('/api/auth/me', handleAuthStatus);
  app.get('/api/auth/status', handleAuthStatus);

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object') throw badRequest('Request body must be a JSON object');
      const { username, password, name } = req.body;
      if (!isUsername(username)) {
        throw badRequest('Username harus 3–30 karakter (huruf, angka, titik, underscore, atau strip tanpa spasi).');
      }
      if (typeof password !== 'string' || password.length < 6) {
        throw badRequest('Password minimal 6 karakter.');
      }
      const cleanUsername = username.trim().toLowerCase();
      const displayName = requiredString(name) ? name.trim() : username.trim();
      const existing = await store.findUserByUsername(cleanUsername);
      if (existing) {
        throw badRequest('Username ini sudah dipakai. Silakan pilih username lain atau masuk.');
      }
      const user = await store.createUser({
        name: displayName,
        username: cleanUsername,
        passwordHash: hashPassword(password),
      });
      auth.setSessionCookie(res, user.id);
      res.status(201).json({ authenticated: true, user });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object') throw badRequest('Request body must be a JSON object');
      const { username, password } = req.body;
      if (!requiredString(username) || typeof password !== 'string' || !password) {
        return res.status(401).json({ error: 'Username atau password salah.' });
      }
      const userRecord = await store.findUserByUsername(username.trim().toLowerCase());
      if (!userRecord || !verifyPassword(password, userRecord.password_hash)) {
        return res.status(401).json({ error: 'Username atau password salah.' });
      }
      auth.setSessionCookie(res, userRecord.id);
      return res.json({
        authenticated: true,
        user: {
          id: Number(userRecord.id),
          name: userRecord.name,
          username: userRecord.username,
          savingsTarget: Number(userRecord.savings_target),
        },
      });
    } catch (error) { return next(error); }
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.clearSessionCookie(res);
    res.json({ authenticated: false, user: null });
  });

  // Require login for all data API routes
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    return auth.requireAuth(req, res, next);
  });

  app.get('/api/dashboard', async (req, res, next) => {
    try {
      const { from, to, month } = req.query;
      if (from !== undefined || to !== undefined) {
        if (!isRealDate(from) || !isRealDate(to)) {
          throw badRequest('from and to must be real calendar dates in YYYY-MM-DD format');
        }
        if (from > to) {
          throw badRequest('from date must be on or before to date');
        }
        return res.json(await store.getDashboard(req.userId, { from, to }));
      }
      const selectedMonth = month ?? new Date().toISOString().slice(0, 7);
      if (!isMonth(selectedMonth)) throw badRequest('month must use YYYY-MM format');
      return res.json(await store.getDashboard(req.userId, monthBounds(selectedMonth)));
    } catch (error) { return next(error); }
  });

  app.get('/api/months', async (req, res, next) => {
    try {
      res.json(await store.getMonths(req.userId));
    } catch (error) { next(error); }
  });

  // Transactions
  app.post('/api/transactions', async (req, res, next) => {
    try {
      const accountIds = await store.getAccountIds(req.userId);
      const transaction = validateTransaction(req.body, accountIds);
      const created = await store.createTransaction(req.userId, transaction);
      res.status(201).json(created);
    } catch (error) { next(error); }
  });

  app.put('/api/transactions/:id', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      const accountIds = await store.getAccountIds(req.userId);
      const transaction = validateTransaction(req.body, accountIds);
      const updated = await store.updateTransaction(req.userId, id, transaction);
      if (!updated) throw badRequest('transaction not found');
      res.json(updated);
    } catch (error) { next(error); }
  });

  app.delete('/api/transactions/:id', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      const deleted = await store.deleteTransaction(req.userId, id);
      if (!deleted) throw badRequest('transaction not found');
      res.status(204).end();
    } catch (error) { next(error); }
  });

  // Budgets
  app.post('/api/budgets', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object') throw badRequest('Request body must be a JSON object');
      const { category, amount } = req.body;
      if (!requiredString(category)) throw badRequest('category is required');
      if (!isIntegerAmount(amount)) throw badRequest('amount must be a positive integer IDR amount');
      const cleanCategory = category.trim();
      const existing = await store.findBudgetByCategory(req.userId, cleanCategory);
      if (existing) throw badRequest('Anggaran untuk kategori ini sudah ada');
      const created = await store.createBudget(req.userId, { category: cleanCategory, amount });
      res.status(201).json(created);
    } catch (error) { next(error); }
  });

  app.put('/api/budgets/:id', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      if (!req.body || !isIntegerAmount(req.body.amount)) throw badRequest('amount must be a positive integer IDR amount');
      const updated = await store.updateBudget(req.userId, id, req.body.amount);
      if (!updated) throw badRequest('budget not found');
      res.json(updated);
    } catch (error) { next(error); }
  });

  app.delete('/api/budgets/:id', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      const deleted = await store.deleteBudget(req.userId, id);
      if (!deleted) throw badRequest('budget not found');
      res.status(204).end();
    } catch (error) { next(error); }
  });

  // Goals
  app.post('/api/goals', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object') throw badRequest('Request body must be a JSON object');
      const { name, target, saved = 0 } = req.body;
      if (!requiredString(name)) throw badRequest('name is required');
      if (!isIntegerAmount(target)) throw badRequest('target must be a positive integer IDR amount');
      if (!isNonNegativeInteger(saved)) throw badRequest('saved must be a non-negative integer IDR amount');
      const created = await store.createGoal(req.userId, { name: name.trim(), target, saved });
      res.status(201).json(created);
    } catch (error) { next(error); }
  });

  app.post('/api/goals/:id/contribute', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      if (!req.body || !isIntegerAmount(req.body.amount)) throw badRequest('amount must be a positive integer IDR amount');
      const updated = await store.contributeGoal(req.userId, id, req.body.amount);
      if (!updated) throw badRequest('goal not found');
      res.json(updated);
    } catch (error) { next(error); }
  });

  app.delete('/api/goals/:id', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      const deleted = await store.deleteGoal(req.userId, id);
      if (!deleted) throw badRequest('goal not found');
      res.status(204).end();
    } catch (error) { next(error); }
  });

  // Accounts
  app.post('/api/accounts', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object') throw badRequest('Request body must be a JSON object');
      const { name, type, opening_balance: openingBalance = 0 } = req.body;
      if (!requiredString(name)) throw badRequest('name is required');
      if (!ACCOUNT_TYPES.has(type)) throw badRequest("type must be 'bank', 'e-wallet', or 'cash'");
      if (!Number.isSafeInteger(openingBalance)) throw badRequest('opening_balance must be an integer IDR amount');
      const created = await store.createAccount(req.userId, { name: name.trim(), type, openingBalance });
      res.status(201).json(created);
    } catch (error) { next(error); }
  });

  app.delete('/api/accounts/:id', async (req, res, next) => {
    try {
      const id = validateId(req.params.id);
      const txCount = await store.countAccountTransactions(req.userId, id);
      if (txCount > 0) throw badRequest('Akun masih memiliki transaksi, hapus transaksinya terlebih dahulu');
      const deleted = await store.deleteAccount(req.userId, id);
      if (!deleted) throw badRequest('account not found');
      res.status(204).end();
    } catch (error) { next(error); }
  });

  // Profile / Settings
  app.put('/api/profile', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object') throw badRequest('Request body must be a JSON object');
      const { name, savingsTarget } = req.body;
      if (!requiredString(name)) throw badRequest('Nama profil wajib diisi');
      const targetNum = Number(savingsTarget);
      if (!Number.isInteger(targetNum) || targetNum < 1 || targetNum > 95) {
        throw badRequest('Target rasio tabungan harus bilangan bulat antara 1% dan 95%');
      }
      res.json(await store.updateProfile(req.userId, { name: name.trim(), savingsTarget: targetNum }));
    } catch (error) { next(error); }
  });

  const distDir = path.join(rootDir, 'dist');
  if (!process.env.VERCEL && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'), (error) => error && next(error));
    });
  }

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    next();
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : error instanceof SyntaxError && 'body' in error ? 400 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Internal server error' : status === 400 && error instanceof SyntaxError ? 'Invalid JSON body' : error.message });
  });
  return app;
}

export const app = createApp();
export default app;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) app.listen(PORT, HOST, () => console.log(`Moneta server listening at http://${HOST}:${PORT}`));
