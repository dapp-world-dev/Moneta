import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from './auth.js';

const { Pool } = pg;

export function shiftMonth(month, delta) {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function monthBounds(month) {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function shiftDate(isoDate, deltaDays) {
  const [year, mon, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1, day + deltaDays));
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function pctChange(current, previous) {
  if (!previous) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export const DEFAULT_CATEGORIES = {
  expense: ['Makanan', 'Transportasi', 'Tagihan', 'Hiburan', 'Belanja', 'Kesehatan', 'Lainnya'],
  income: ['Gaji', 'Freelance', 'Investasi', 'Bonus', 'Lainnya'],
};

const STARTER_ACCOUNTS = [
  ['Bank Utama', 'bank', 0],
  ['E-Wallet', 'e-wallet', 0],
  ['Tunai', 'cash', 0],
];

function createSqliteAdapter(dbPath) {
  let dbPromise = null;

  async function getDb() {
    if (!dbPromise) {
      dbPromise = (async () => {
        const { DatabaseSync } = await import('node:sqlite');
        if (dbPath !== ':memory:') {
          fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        }
        const db = new DatabaseSync(dbPath);
        db.exec('PRAGMA foreign_keys = OFF;');

        // Migrate legacy single-user DB if accounts table exists without user_id
        const accCols = db.prepare('PRAGMA table_info(accounts)').all();
        const isLegacy = accCols.length > 0 && !accCols.some((c) => c.name === 'user_id');

        if (isLegacy) {
          db.exec(`
            ALTER TABLE accounts RENAME TO _old_accounts;
            ALTER TABLE transactions RENAME TO _old_transactions;
            ALTER TABLE budgets RENAME TO _old_budgets;
            ALTER TABLE goals RENAME TO _old_goals;
          `);
        }

        db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            savings_target INTEGER NOT NULL DEFAULT 20,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            opening_balance INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            amount INTEGER NOT NULL CHECK (amount > 0),
            type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
            category TEXT NOT NULL,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            date TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT ''
          );
          CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            amount INTEGER NOT NULL CHECK (amount > 0),
            UNIQUE(user_id, category)
          );
          CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            target INTEGER NOT NULL CHECK (target > 0),
            saved INTEGER NOT NULL DEFAULT 0 CHECK (saved >= 0)
          );
        `);

        // Migrate users.email -> users.username if an existing DB was created before username switch
        const userCols = db.prepare('PRAGMA table_info(users)').all();
        if (userCols.some((c) => c.name === 'email') && !userCols.some((c) => c.name === 'username')) {
          db.exec('ALTER TABLE users RENAME COLUMN email TO username;');
          db.prepare("UPDATE users SET username = 'daffa' WHERE username = 'daffa@moneta.app'").run();
        }

        if (isLegacy) {
          const demoHash = hashPassword('moneta123');
          const res = db.prepare(
            'INSERT INTO users (name, username, password_hash, savings_target) VALUES (?, ?, ?, ?)',
          ).run('Daffa', 'daffa', demoHash, 20);
          const uid = Number(res.lastInsertRowid);
          db.prepare('INSERT INTO accounts (id, user_id, name, type, opening_balance) SELECT id, ?, name, type, opening_balance FROM _old_accounts').run(uid);
          db.prepare('INSERT INTO transactions (id, user_id, title, amount, type, category, account_id, date, note) SELECT id, ?, title, amount, type, category, account_id, date, note FROM _old_transactions').run(uid);
          db.prepare('INSERT INTO budgets (id, user_id, category, amount) SELECT id, ?, category, amount FROM _old_budgets').run(uid);
          db.prepare('INSERT INTO goals (id, user_id, name, target, saved) SELECT id, ?, name, target, saved FROM _old_goals').run(uid);
          db.exec(`
            DROP TABLE _old_transactions;
            DROP TABLE _old_budgets;
            DROP TABLE _old_goals;
            DROP TABLE _old_accounts;
          `);
        }

        db.exec('PRAGMA foreign_keys = ON;');
        return db;
      })();
    }
    return dbPromise;
  }

  async function rangeTotals(db, userId, from, to) {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE user_id = ? AND date BETWEEN ? AND ?
    `).get(userId, from, to);
    const income = Number(row.income);
    const expense = Number(row.expense);
    return { income, expense, net: income - expense };
  }

  return {
    engine: 'sqlite',
    async findUserByUsername(username) {
      const db = await getDb();
      return db.prepare('SELECT id, name, username, password_hash, savings_target FROM users WHERE lower(username) = lower(?)').get(username) || null;
    },
    async findUserById(id) {
      const db = await getDb();
      const row = db.prepare('SELECT id, name, username, savings_target FROM users WHERE id = ?').get(id);
      if (!row) return null;
      return { id: Number(row.id), name: row.name, username: row.username, savingsTarget: Number(row.savings_target) };
    },
    async createUser({ name, username, passwordHash }) {
      const db = await getDb();
      const cleanUsername = username.toLowerCase();
      const res = db.prepare(
        'INSERT INTO users (name, username, password_hash, savings_target) VALUES (?, ?, ?, 20)',
      ).run(name, cleanUsername, passwordHash);
      const userId = Number(res.lastInsertRowid);
      const insAcc = db.prepare('INSERT INTO accounts (user_id, name, type, opening_balance) VALUES (?, ?, ?, ?)');
      for (const [accName, type, opening] of STARTER_ACCOUNTS) {
        insAcc.run(userId, accName, type, opening);
      }
      return { id: userId, name, username: cleanUsername, savingsTarget: 20 };
    },
    async getDashboard(userId, { from, to }) {
      const db = await getDb();
      const user = await this.findUserById(userId);
      const days = diffDaysInclusive(from, to);
      const prevTo = shiftDate(from, -1);
      const prevFrom = shiftDate(prevTo, -(days - 1));

      const accounts = db.prepare(`
        SELECT a.id, a.name, a.type, a.opening_balance,
          a.opening_balance + COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) AS balance,
          COUNT(t.id) AS transaction_count
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = a.user_id
        WHERE a.user_id = ?
        GROUP BY a.id
        ORDER BY a.id
      `).all(userId);

      const transactions = db.prepare(`
        SELECT t.id, t.title, t.amount, t.type, t.category, t.account_id, a.name AS account_name, t.date, t.note
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE t.user_id = ? AND t.date BETWEEN ? AND ?
        ORDER BY t.date DESC, t.id DESC
      `).all(userId, from, to);

      const budgets = db.prepare(`
        SELECT b.id, b.category, b.amount,
          COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS spent
        FROM budgets b LEFT JOIN transactions t
          ON t.user_id = b.user_id AND t.category = b.category AND t.date BETWEEN ? AND ?
        WHERE b.user_id = ?
        GROUP BY b.id ORDER BY b.id
      `).all(from, to, userId);

      const goals = db.prepare('SELECT id, name, target, saved FROM goals WHERE user_id = ? ORDER BY id').all(userId);
      const currentTotals = await rangeTotals(db, userId, from, to);
      const previousTotals = await rangeTotals(db, userId, prevFrom, prevTo);
      const savingsRate = currentTotals.income > 0
        ? Math.round(((currentTotals.income - currentTotals.expense) / currentTotals.income) * 1000) / 10
        : 0;

      const endMonth = to.slice(0, 7);
      const trend = [];
      for (let offset = -5; offset <= 0; offset += 1) {
        const targetMonth = shiftMonth(endMonth, offset);
        const bounds = monthBounds(targetMonth);
        trend.push({ month: targetMonth, ...(await rangeTotals(db, userId, bounds.from, bounds.to)) });
      }

      return {
        period: { from, to, days, prevFrom, prevTo },
        accounts,
        transactions,
        budgets,
        goals,
        summary: {
          ...currentTotals,
          previousIncome: previousTotals.income,
          previousExpense: previousTotals.expense,
          previousNet: previousTotals.net,
          savingsRate,
          incomeChangePct: pctChange(currentTotals.income, previousTotals.income),
          expenseChangePct: pctChange(currentTotals.expense, previousTotals.expense),
          netChangePct: pctChange(currentTotals.net, previousTotals.net),
        },
        trend,
        categories: DEFAULT_CATEGORIES,
        profile: {
          name: user?.name || 'Pengguna',
          username: user?.username || '',
          savingsTarget: user?.savingsTarget || 20,
        },
      };
    },
    async getMonths(userId) {
      const db = await getDb();
      return db.prepare('SELECT DISTINCT substr(date, 1, 7) AS month FROM transactions WHERE user_id = ? ORDER BY month DESC').all(userId).map((r) => r.month);
    },
    async getAccountIds(userId) {
      const db = await getDb();
      return new Set(db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(userId).map((r) => r.id));
    },
    async createTransaction(userId, tx) {
      const db = await getDb();
      const res = db.prepare(`
        INSERT INTO transactions (user_id, title, amount, type, category, account_id, date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, tx.title, tx.amount, tx.type, tx.category, tx.accountId, tx.date, tx.note);
      return db.prepare('SELECT id, title, amount, type, category, account_id, date, note FROM transactions WHERE id = ? AND user_id = ?').get(Number(res.lastInsertRowid), userId);
    },
    async updateTransaction(userId, id, tx) {
      const db = await getDb();
      const res = db.prepare(`
        UPDATE transactions
        SET title = ?, amount = ?, type = ?, category = ?, account_id = ?, date = ?, note = ?
        WHERE id = ? AND user_id = ?
      `).run(tx.title, tx.amount, tx.type, tx.category, tx.accountId, tx.date, tx.note, id, userId);
      if (res.changes === 0) return null;
      return db.prepare('SELECT id, title, amount, type, category, account_id, date, note FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
    },
    async deleteTransaction(userId, id) {
      const db = await getDb();
      return db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
    },
    async findBudgetByCategory(userId, category) {
      const db = await getDb();
      return db.prepare('SELECT id FROM budgets WHERE user_id = ? AND lower(category) = lower(?)').get(userId, category);
    },
    async createBudget(userId, { category, amount }) {
      const db = await getDb();
      const res = db.prepare('INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)').run(userId, category, amount);
      return db.prepare('SELECT id, category, amount FROM budgets WHERE id = ? AND user_id = ?').get(Number(res.lastInsertRowid), userId);
    },
    async updateBudget(userId, id, amount) {
      const db = await getDb();
      const res = db.prepare('UPDATE budgets SET amount = ? WHERE id = ? AND user_id = ?').run(amount, id, userId);
      if (res.changes === 0) return null;
      return db.prepare('SELECT id, category, amount FROM budgets WHERE id = ? AND user_id = ?').get(id, userId);
    },
    async deleteBudget(userId, id) {
      const db = await getDb();
      return db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
    },
    async createGoal(userId, { name, target, saved }) {
      const db = await getDb();
      const res = db.prepare('INSERT INTO goals (user_id, name, target, saved) VALUES (?, ?, ?, ?)').run(userId, name, target, saved);
      return db.prepare('SELECT id, name, target, saved FROM goals WHERE id = ? AND user_id = ?').get(Number(res.lastInsertRowid), userId);
    },
    async contributeGoal(userId, id, amount) {
      const db = await getDb();
      const res = db.prepare('UPDATE goals SET saved = saved + ? WHERE id = ? AND user_id = ?').run(amount, id, userId);
      if (res.changes === 0) return null;
      return db.prepare('SELECT id, name, target, saved FROM goals WHERE id = ? AND user_id = ?').get(id, userId);
    },
    async deleteGoal(userId, id) {
      const db = await getDb();
      return db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
    },
    async createAccount(userId, { name, type, openingBalance }) {
      const db = await getDb();
      const res = db.prepare('INSERT INTO accounts (user_id, name, type, opening_balance) VALUES (?, ?, ?, ?)').run(userId, name, type, openingBalance);
      return db.prepare('SELECT id, name, type, opening_balance FROM accounts WHERE id = ? AND user_id = ?').get(Number(res.lastInsertRowid), userId);
    },
    async countAccountTransactions(userId, id) {
      const db = await getDb();
      return Number(db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE account_id = ? AND user_id = ?').get(id, userId).count);
    },
    async deleteAccount(userId, id) {
      const db = await getDb();
      return db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
    },
    async updateProfile(userId, { name, savingsTarget }) {
      const db = await getDb();
      db.prepare('UPDATE users SET name = ?, savings_target = ? WHERE id = ?').run(name, savingsTarget, userId);
      return { name, savingsTarget };
    },
  };
}

function createPostgresAdapter(databaseUrl) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
    max: 5,
  });

  let readyPromise = null;

  async function ensureReady() {
    if (!readyPromise) {
      readyPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            savings_target INTEGER NOT NULL DEFAULT 20,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            opening_balance BIGINT NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            amount BIGINT NOT NULL CHECK (amount > 0),
            type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
            category TEXT NOT NULL,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            date TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT ''
          );
          CREATE TABLE IF NOT EXISTS budgets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            amount BIGINT NOT NULL CHECK (amount > 0),
            UNIQUE(user_id, category)
          );
          CREATE TABLE IF NOT EXISTS goals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            target BIGINT NOT NULL CHECK (target > 0),
            saved BIGINT NOT NULL DEFAULT 0 CHECK (saved >= 0)
          );
        `);
      })().catch((err) => {
        readyPromise = null;
        throw err;
      });
    }
    return readyPromise;
  }

  async function rangeTotals(userId, from, to) {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE user_id = $1 AND date BETWEEN $2 AND $3
    `, [userId, from, to]);
    const income = Number(rows[0].income);
    const expense = Number(rows[0].expense);
    return { income, expense, net: income - expense };
  }

  return {
    engine: 'postgres',
    async findUserByUsername(username) {
      await ensureReady();
      const { rows } = await pool.query(
        'SELECT id, name, username, password_hash, savings_target FROM users WHERE lower(username) = lower($1)',
        [username],
      );
      if (!rows[0]) return null;
      return { ...rows[0], id: Number(rows[0].id), savings_target: Number(rows[0].savings_target) };
    },
    async findUserById(id) {
      await ensureReady();
      const { rows } = await pool.query('SELECT id, name, username, savings_target FROM users WHERE id = $1', [id]);
      if (!rows[0]) return null;
      return { id: Number(rows[0].id), name: rows[0].name, username: rows[0].username, savingsTarget: Number(rows[0].savings_target) };
    },
    async createUser({ name, username, passwordHash }) {
      await ensureReady();
      const cleanUsername = username.toLowerCase();
      const { rows } = await pool.query(
        'INSERT INTO users (name, username, password_hash, savings_target) VALUES ($1, $2, $3, 20) RETURNING id, name, username, savings_target',
        [name, cleanUsername, passwordHash],
      );
      const userId = Number(rows[0].id);
      for (const [accName, type, opening] of STARTER_ACCOUNTS) {
        await pool.query(
          'INSERT INTO accounts (user_id, name, type, opening_balance) VALUES ($1, $2, $3, $4)',
          [userId, accName, type, opening],
        );
      }
      return { id: userId, name: rows[0].name, username: rows[0].username, savingsTarget: Number(rows[0].savings_target) };
    },
    async getDashboard(userId, { from, to }) {
      await ensureReady();
      const user = await this.findUserById(userId);
      const days = diffDaysInclusive(from, to);
      const prevTo = shiftDate(from, -1);
      const prevFrom = shiftDate(prevTo, -(days - 1));

      const [accRes, txRes, budRes, goalRes, currentTotals, previousTotals] = await Promise.all([
        pool.query(`
          SELECT a.id, a.name, a.type, a.opening_balance,
            a.opening_balance + COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) AS balance,
            COUNT(t.id) AS transaction_count
          FROM accounts a
          LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = a.user_id
          WHERE a.user_id = $1
          GROUP BY a.id
          ORDER BY a.id
        `, [userId]),
        pool.query(`
          SELECT t.id, t.title, t.amount, t.type, t.category, t.account_id, a.name AS account_name, t.date, t.note
          FROM transactions t
          LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
          ORDER BY t.date DESC, t.id DESC
        `, [userId, from, to]),
        pool.query(`
          SELECT b.id, b.category, b.amount,
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS spent
          FROM budgets b LEFT JOIN transactions t
            ON t.user_id = b.user_id AND t.category = b.category AND t.date BETWEEN $1 AND $2
          WHERE b.user_id = $3
          GROUP BY b.id ORDER BY b.id
        `, [from, to, userId]),
        pool.query('SELECT id, name, target, saved FROM goals WHERE user_id = $1 ORDER BY id', [userId]),
        rangeTotals(userId, from, to),
        rangeTotals(userId, prevFrom, prevTo),
      ]);

      const endMonth = to.slice(0, 7);
      const trendMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(endMonth, i - 5));
      const trend = await Promise.all(
        trendMonths.map(async (targetMonth) => {
          const bounds = monthBounds(targetMonth);
          return { month: targetMonth, ...(await rangeTotals(userId, bounds.from, bounds.to)) };
        }),
      );

      const savingsRate = currentTotals.income > 0
        ? Math.round(((currentTotals.income - currentTotals.expense) / currentTotals.income) * 1000) / 10
        : 0;

      return {
        period: { from, to, days, prevFrom, prevTo },
        accounts: accRes.rows.map((r) => ({
          id: Number(r.id),
          name: r.name,
          type: r.type,
          opening_balance: Number(r.opening_balance),
          balance: Number(r.balance),
          transaction_count: Number(r.transaction_count),
        })),
        transactions: txRes.rows.map((r) => ({
          ...r,
          id: Number(r.id),
          amount: Number(r.amount),
          account_id: Number(r.account_id),
        })),
        budgets: budRes.rows.map((r) => ({
          id: Number(r.id),
          category: r.category,
          amount: Number(r.amount),
          spent: Number(r.spent),
        })),
        goals: goalRes.rows.map((r) => ({
          id: Number(r.id),
          name: r.name,
          target: Number(r.target),
          saved: Number(r.saved),
        })),
        summary: {
          ...currentTotals,
          previousIncome: previousTotals.income,
          previousExpense: previousTotals.expense,
          previousNet: previousTotals.net,
          savingsRate,
          incomeChangePct: pctChange(currentTotals.income, previousTotals.income),
          expenseChangePct: pctChange(currentTotals.expense, previousTotals.expense),
          netChangePct: pctChange(currentTotals.net, previousTotals.net),
        },
        trend,
        categories: DEFAULT_CATEGORIES,
        profile: {
          name: user?.name || 'Pengguna',
          username: user?.username || '',
          savingsTarget: user?.savingsTarget || 20,
        },
      };
    },
    async getMonths(userId) {
      await ensureReady();
      const { rows } = await pool.query('SELECT DISTINCT substr(date, 1, 7) AS month FROM transactions WHERE user_id = $1 ORDER BY month DESC', [userId]);
      return rows.map((r) => r.month);
    },
    async getAccountIds(userId) {
      await ensureReady();
      const { rows } = await pool.query('SELECT id FROM accounts WHERE user_id = $1', [userId]);
      return new Set(rows.map((r) => Number(r.id)));
    },
    async createTransaction(userId, tx) {
      await ensureReady();
      const { rows } = await pool.query(`
        INSERT INTO transactions (user_id, title, amount, type, category, account_id, date, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, title, amount, type, category, account_id, date, note
      `, [userId, tx.title, tx.amount, tx.type, tx.category, tx.accountId, tx.date, tx.note]);
      const r = rows[0];
      return { ...r, id: Number(r.id), amount: Number(r.amount), account_id: Number(r.account_id) };
    },
    async updateTransaction(userId, id, tx) {
      await ensureReady();
      const { rows } = await pool.query(`
        UPDATE transactions
        SET title = $1, amount = $2, type = $3, category = $4, account_id = $5, date = $6, note = $7
        WHERE id = $8 AND user_id = $9
        RETURNING id, title, amount, type, category, account_id, date, note
      `, [tx.title, tx.amount, tx.type, tx.category, tx.accountId, tx.date, tx.note, id, userId]);
      if (!rows[0]) return null;
      const r = rows[0];
      return { ...r, id: Number(r.id), amount: Number(r.amount), account_id: Number(r.account_id) };
    },
    async deleteTransaction(userId, id) {
      await ensureReady();
      const res = await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rowCount > 0;
    },
    async findBudgetByCategory(userId, category) {
      await ensureReady();
      const { rows } = await pool.query('SELECT id FROM budgets WHERE user_id = $1 AND lower(category) = lower($2)', [userId, category]);
      return rows[0] || null;
    },
    async createBudget(userId, { category, amount }) {
      await ensureReady();
      const { rows } = await pool.query(
        'INSERT INTO budgets (user_id, category, amount) VALUES ($1, $2, $3) RETURNING id, category, amount',
        [userId, category, amount],
      );
      return { id: Number(rows[0].id), category: rows[0].category, amount: Number(rows[0].amount) };
    },
    async updateBudget(userId, id, amount) {
      await ensureReady();
      const { rows } = await pool.query(
        'UPDATE budgets SET amount = $1 WHERE id = $2 AND user_id = $3 RETURNING id, category, amount',
        [amount, id, userId],
      );
      if (!rows[0]) return null;
      return { id: Number(rows[0].id), category: rows[0].category, amount: Number(rows[0].amount) };
    },
    async deleteBudget(userId, id) {
      await ensureReady();
      const res = await pool.query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rowCount > 0;
    },
    async createGoal(userId, { name, target, saved }) {
      await ensureReady();
      const { rows } = await pool.query(
        'INSERT INTO goals (user_id, name, target, saved) VALUES ($1, $2, $3, $4) RETURNING id, name, target, saved',
        [userId, name, target, saved],
      );
      return { id: Number(rows[0].id), name: rows[0].name, target: Number(rows[0].target), saved: Number(rows[0].saved) };
    },
    async contributeGoal(userId, id, amount) {
      await ensureReady();
      const { rows } = await pool.query(
        'UPDATE goals SET saved = saved + $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, target, saved',
        [amount, id, userId],
      );
      if (!rows[0]) return null;
      return { id: Number(rows[0].id), name: rows[0].name, target: Number(rows[0].target), saved: Number(rows[0].saved) };
    },
    async deleteGoal(userId, id) {
      await ensureReady();
      const res = await pool.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rowCount > 0;
    },
    async createAccount(userId, { name, type, openingBalance }) {
      await ensureReady();
      const { rows } = await pool.query(
        'INSERT INTO accounts (user_id, name, type, opening_balance) VALUES ($1, $2, $3, $4) RETURNING id, name, type, opening_balance',
        [userId, name, type, openingBalance],
      );
      return { id: Number(rows[0].id), name: rows[0].name, type: rows[0].type, opening_balance: Number(rows[0].opening_balance) };
    },
    async countAccountTransactions(userId, id) {
      await ensureReady();
      const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM transactions WHERE account_id = $1 AND user_id = $2', [id, userId]);
      return rows[0].count;
    },
    async deleteAccount(userId, id) {
      await ensureReady();
      const res = await pool.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rowCount > 0;
    },
    async updateProfile(userId, { name, savingsTarget }) {
      await ensureReady();
      await pool.query('UPDATE users SET name = $1, savings_target = $2 WHERE id = $3', [name, savingsTarget, userId]);
      return { name, savingsTarget };
    },
  };
}

export function createStore({ dbPath, databaseUrl } = {}) {
  if (databaseUrl) {
    return createPostgresAdapter(databaseUrl);
  }
  return createSqliteAdapter(dbPath);
}

export const monthFor = (date) => date.slice(0, 7);
