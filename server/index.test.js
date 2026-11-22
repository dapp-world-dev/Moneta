import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from './index.js';

let server;
let baseUrl;
let userACookie;
let userAAccountId;

async function request(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    data: text ? JSON.parse(text) : null,
    setCookie: res.headers.get('set-cookie'),
  };
}

before(async () => {
  const app = createApp({ dbPath: ':memory:', databaseUrl: null, authSecret: 'test-secret-key' });
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('Moneta Multi-User Auth & API', () => {
  it('blocks unauthenticated access, registers a new user, and logs in', async () => {
    const blocked = await request('/api/dashboard');
    assert.equal(blocked.status, 401);

    const reg = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'daffa', password: 'password123' },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.username, 'daffa');
    assert.ok(reg.setCookie?.includes('moneta_session='));
    userACookie = reg.setCookie.split(';')[0];

    const dup = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'daffa', password: 'password123' },
    });
    assert.equal(dup.status, 400);

    const me = await request('/api/auth/me', { cookie: userACookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.authenticated, true);
    assert.equal(me.data.user.username, 'daffa');

    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'daffa', password: 'wrong' },
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'daffa', password: 'password123' },
    });
    assert.equal(goodLogin.status, 200);
    assert.equal(goodLogin.data.user.username, 'daffa');
  });

  it('creates starter accounts and returns dashboard with 6-month trend', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const res = await request(`/api/dashboard?month=${month}`, { cookie: userACookie });
    assert.equal(res.status, 200);
    assert.equal(res.data.accounts.length, 3);
    userAAccountId = res.data.accounts[0].id;
    assert.equal(res.data.trend.length, 6);
  });

  it('supports transaction create, update, delete, and date-range queries', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const created = await request('/api/transactions', {
      method: 'POST',
      cookie: userACookie,
      body: {
        title: 'Makan malam',
        amount: 120000,
        type: 'expense',
        category: 'Makanan',
        account_id: userAAccountId,
        date: today,
        note: 'Bersama teman',
      },
    });
    assert.equal(created.status, 201);

    const rangeRes = await request(`/api/dashboard?from=${today}&to=${today}`, { cookie: userACookie });
    assert.equal(rangeRes.status, 200);
    assert.equal(rangeRes.data.period.days, 1);
    assert.equal(rangeRes.data.transactions.length, 1);

    const updated = await request(`/api/transactions/${created.data.id}`, {
      method: 'PUT',
      cookie: userACookie,
      body: {
        title: 'Makan malam spesial',
        amount: 150000,
        type: 'expense',
        category: 'Makanan',
        account_id: userAAccountId,
        date: today,
        note: 'Revisi',
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.amount, 150000);

    const deleted = await request(`/api/transactions/${created.data.id}`, { method: 'DELETE', cookie: userACookie });
    assert.equal(deleted.status, 204);
  });

  it('supports budgets, goals, accounts, and profile updates', async () => {
    const bud = await request('/api/budgets', {
      method: 'POST',
      cookie: userACookie,
      body: { category: 'Makanan', amount: 2000000 },
    });
    assert.equal(bud.status, 201);

    const goal = await request('/api/goals', {
      method: 'POST',
      cookie: userACookie,
      body: { name: 'Dana Darurat', target: 10000000, saved: 1000000 },
    });
    assert.equal(goal.status, 201);

    const funded = await request(`/api/goals/${goal.data.id}/contribute`, {
      method: 'POST',
      cookie: userACookie,
      body: { amount: 500000 },
    });
    assert.equal(funded.status, 200);
    assert.equal(funded.data.saved, 1500000);

    const prof = await request('/api/profile', {
      method: 'PUT',
      cookie: userACookie,
      body: { name: 'Daffa R.', savingsTarget: 30 },
    });
    assert.equal(prof.status, 200);
    assert.equal(prof.data.savingsTarget, 30);
  });

  it('isolates data completely between different users', async () => {
    const regB = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'budi', password: 'password456' },
    });
    assert.equal(regB.status, 201);
    const userBCookie = regB.setCookie.split(';')[0];

    const month = new Date().toISOString().slice(0, 7);
    const dashB = await request(`/api/dashboard?month=${month}`, { cookie: userBCookie });
    assert.equal(dashB.status, 200);
    assert.equal(dashB.data.profile.username, 'budi');
    assert.equal(dashB.data.budgets.length, 0);
    assert.equal(dashB.data.goals.length, 0);
    assert.equal(dashB.data.transactions.length, 0);

    // User B cannot delete User A's account
    const crossDelete = await request(`/api/accounts/${userAAccountId}`, {
      method: 'DELETE',
      cookie: userBCookie,
    });
    assert.equal(crossDelete.status, 400);
  });
});
