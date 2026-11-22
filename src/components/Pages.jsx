import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, Download, Pencil, Plus, Search, Target, Trash2,
} from 'lucide-react';
import { AccountIcon, CategoryIcon } from './CategoryIcon';
import { PeriodRangePicker } from './PeriodRangePicker';
import {
  CATEGORY_COLORS, accountTypeLabel, exportTransactionsCsv, formatMoney,
  groupTransactionsByDate, normalizeAccountType, rangeLabel, shortMonthLabel,
} from '../utils';

function PageHeader({ periodText, title, subtitle, range, setRange, actions }) {
  return (
    <div className="page-heading">
      <div>
        {periodText && <p className="page-kicker">{periodText}</p>}
        <h1>{title}</h1>
        <p className="subheading">{subtitle}</p>
      </div>
      <div className="heading-actions">
        {setRange && <PeriodRangePicker range={range} onChange={setRange} />}
        {actions}
      </div>
    </div>
  );
}

export function TransactionsPage({
  range, setRange, data, onAdd, onEdit, onDelete, busyId, initialFilter = null,
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState(initialFilter?.type || 'all');
  const [category, setCategory] = useState(initialFilter?.category || 'all');
  const [accountId, setAccountId] = useState(initialFilter?.accountId ? String(initialFilter.accountId) : 'all');

  useEffect(() => {
    if (!initialFilter) return;
    setType(initialFilter.type || 'all');
    setCategory(initialFilter.category || 'all');
    setAccountId(initialFilter.accountId ? String(initialFilter.accountId) : 'all');
  }, [initialFilter]);

  const hasActiveFilter = query.trim() !== '' || type !== 'all' || category !== 'all' || accountId !== 'all';

  function resetFilters() {
    setQuery('');
    setType('all');
    setCategory('all');
    setAccountId('all');
  }

  const transactions = data?.transactions || [];
  const accounts = data?.accounts || [];

  const categories = useMemo(() => {
    const set = new Set(transactions.map((t) => t.category));
    if (category !== 'all') set.add(category);
    return Array.from(set).sort();
  }, [transactions, category]);

  const filtered = useMemo(() => transactions.filter((item) => {
    if (type !== 'all' && item.type !== type) return false;
    if (category !== 'all' && item.category !== category) return false;
    if (accountId !== 'all' && String(item.account_id) !== accountId) return false;
    if (query.trim()) {
      const haystack = `${item.title} ${item.category} ${item.note} ${item.account_name || ''}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  }), [transactions, type, category, accountId, query]);

  const grouped = useMemo(() => groupTransactionsByDate(filtered), [filtered]);

  const totals = useMemo(() => {
    const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filtered]);

  return (
    <>
      <PageHeader
        periodText={rangeLabel(range.from, range.to)}
        title="Transaksi"
        subtitle="Semua pemasukan dan pengeluaran terkelompok per tanggal."
        range={range}
        setRange={setRange}
        actions={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => exportTransactionsCsv(filtered, `${range.from}_${range.to}`)}
              disabled={!filtered.length}
            >
              <Download size={16} aria-hidden="true" /> Ekspor CSV
            </button>
            <button type="button" className="primary-button" onClick={onAdd}>
              <Plus size={17} aria-hidden="true" /> Catat transaksi
            </button>
          </>
        }
      />

      <section className="summary-bar" aria-label="Ringkasan hasil filter">
        <div className="summary-cell">
          <span>Pemasukan</span>
          <strong className="tone-green">{formatMoney(totals.income)}</strong>
        </div>
        <div className="summary-cell">
          <span>Pengeluaran</span>
          <strong>{formatMoney(totals.expense)}</strong>
        </div>
        <div className="summary-cell">
          <span>Selisih bersih</span>
          <strong className={totals.net >= 0 ? 'tone-green' : 'tone-danger'}>
            {formatMoney(totals.net, false, true)}
          </strong>
        </div>
        <div className="summary-cell">
          <span>Total aktivitas</span>
          <strong>{filtered.length} transaksi</strong>
        </div>
      </section>

      <section className="surface-card">
        <div className="filter-bar">
          <div className="search-box wide">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Cari transaksi"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul, kategori, atau catatan"
            />
          </div>
          <div className="segmented-control compact" role="group" aria-label="Filter tipe">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'income', label: 'Masuk' },
              { id: 'expense', label: 'Keluar' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={type === item.id ? 'active' : ''}
                onClick={() => setType(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select
            className="filter-select"
            aria-label="Filter kategori"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Semua kategori</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            className="filter-select"
            aria-label="Filter akun"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="all">Semua akun</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={String(acc.id)}>{acc.name}</option>
            ))}
          </select>
          {hasActiveFilter && (
            <button type="button" className="text-link" onClick={resetFilters}>
              Reset filter
            </button>
          )}
        </div>

        {grouped.length === 0 ? (
          <div className="empty-state">
            <strong>{hasActiveFilter ? 'Tidak ada transaksi yang cocok' : 'Belum ada transaksi di periode ini'}</strong>
            <p>
              {hasActiveFilter
                ? 'Ubah kata kunci pencarian atau reset filter untuk melihat semua catatan.'
                : 'Catat pemasukan atau pengeluaran pertamamu untuk mulai memantau arus kas.'}
            </p>
            {hasActiveFilter ? (
              <button type="button" className="secondary-button" onClick={resetFilters}>Reset filter</button>
            ) : (
              <button type="button" className="primary-button" onClick={onAdd}>
                <Plus size={16} aria-hidden="true" /> Catat transaksi pertama
              </button>
            )}
          </div>
        ) : (
          <div className="date-groups">
            {grouped.map((group) => (
              <div className="date-group" key={group.date}>
                <div className="date-group-header">
                  <span>{group.label}</span>
                  <b className={group.dailyNet >= 0 ? 'tone-green' : ''}>
                    {formatMoney(group.dailyNet, false, true)}
                  </b>
                </div>
                <div className="activity-list">
                  {group.items.map((item) => {
                    const positive = item.type === 'income';
                    return (
                      <div className="activity-row" key={item.id}>
                        <button
                          type="button"
                          className="activity-main"
                          onClick={() => onEdit(item)}
                        >
                          <CategoryIcon category={item.category} type={item.type} size={17} />
                          <div className="activity-copy">
                            <strong>{item.title}</strong>
                            <span>
                              {item.category} · {item.account_name || `Akun #${item.account_id}`}
                              {item.note ? ` · ${item.note}` : ''}
                            </span>
                          </div>
                          <strong className={`activity-amount ${positive ? 'positive' : ''}`}>
                            {positive ? '+' : '-'}{formatMoney(item.amount)}
                          </strong>
                        </button>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-button sm"
                            onClick={() => onEdit(item)}
                            aria-label={`Edit ${item.title}`}
                            title="Edit"
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-button sm danger"
                            onClick={() => onDelete(item)}
                            disabled={busyId === `/api/transactions/${item.id}`}
                            aria-label={`Hapus ${item.title}`}
                            title="Hapus"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function BudgetsPage({
  range, setRange, data, onAddBudget, onEditBudget, onDeleteBudget, busyId,
}) {
  const budgets = data?.budgets || [];
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const remaining = totalBudget - totalSpent;
  const overallPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const overCount = budgets.filter((b) => b.spent > b.amount).length;

  return (
    <>
      <PageHeader
        periodText={rangeLabel(range.from, range.to)}
        title="Anggaran"
        subtitle="Tetapkan batas pengeluaran per kategori agar saldo tetap aman."
        range={range}
        setRange={setRange}
        actions={
          <button type="button" className="primary-button" onClick={onAddBudget}>
            <Plus size={17} aria-hidden="true" /> Tambah anggaran
          </button>
        }
      />

      <section className="summary-bar" aria-label="Ringkasan anggaran">
        <div className="summary-cell">
          <span>Total anggaran</span>
          <strong>{formatMoney(totalBudget)}</strong>
        </div>
        <div className="summary-cell">
          <span>Terpakai</span>
          <strong className={overallPct > 100 ? 'tone-danger' : ''}>{formatMoney(totalSpent)}</strong>
        </div>
        <div className="summary-cell">
          <span>Sisa batas</span>
          <strong className={remaining < 0 ? 'tone-danger' : 'tone-green'}>
            {formatMoney(remaining, false, true)}
          </strong>
        </div>
        <div className="summary-cell">
          <span>Status</span>
          <strong className={overCount > 0 ? 'tone-danger' : 'tone-green'}>
            {overCount > 0 ? `${overCount} melebihi batas` : `${overallPct}% terpakai`}
          </strong>
        </div>
      </section>

      {budgets.length === 0 ? (
        <section className="surface-card empty-state">
          <strong>Belum ada batas anggaran</strong>
          <p>Buat anggaran untuk kategori utama seperti Makanan atau Tagihan agar pengeluaran lebih terkontrol.</p>
          <button type="button" className="primary-button" onClick={onAddBudget}>
            <Plus size={16} aria-hidden="true" /> Buat anggaran pertama
          </button>
        </section>
      ) : (
        <section className="card-grid">
          {budgets.map((budget) => {
            const pct = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
            const isOver = budget.spent > budget.amount;
            const isWarn = !isOver && pct >= 80;
            const statusClass = isOver ? 'danger' : isWarn ? 'warn' : 'ok';
            const statusLabel = isOver ? 'Melebihi batas' : isWarn ? 'Hampir habis' : 'Terkendali';
            const diff = budget.amount - budget.spent;

            return (
              <article className="vault-card" key={budget.id}>
                <div className="vault-head">
                  <div className="vault-title">
                    <CategoryIcon category={budget.category} type="expense" size={18} />
                    <div>
                      <h2>{budget.category}</h2>
                      <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button sm"
                      onClick={() => onEditBudget(budget)}
                      title="Ubah batas"
                      aria-label={`Ubah batas ${budget.category}`}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button sm danger"
                      onClick={() => onDeleteBudget(budget)}
                      disabled={busyId === `/api/budgets/${budget.id}`}
                      title="Hapus anggaran"
                      aria-label={`Hapus anggaran ${budget.category}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="vault-numbers">
                  <div>
                    <span>Terpakai</span>
                    <strong>{formatMoney(budget.spent)}</strong>
                  </div>
                  <div className="align-right">
                    <span>Batas</span>
                    <strong>{formatMoney(budget.amount)}</strong>
                  </div>
                </div>

                <div className="progress-track">
                  <span
                    className={`progress-fill ${statusClass}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>

                <div className="vault-foot">
                  <span>{pct}% terpakai</span>
                  <b className={diff < 0 ? 'tone-danger' : ''}>
                    {diff < 0 ? `Lebih ${formatMoney(Math.abs(diff))}` : `Sisa ${formatMoney(diff)}`}
                  </b>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

export function GoalsPage({ data, onAddGoal, onFundGoal, onDeleteGoal, busyId }) {
  const goals = data?.goals || [];
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  return (
    <>
      <PageHeader
        periodText="Kantong tabungan"
        title="Target Finansial"
        subtitle="Sisihkan dana bertahap untuk setiap tujuan pentingmu."
        actions={
          <button type="button" className="primary-button" onClick={onAddGoal}>
            <Plus size={17} aria-hidden="true" /> Buat target
          </button>
        }
      />

      <section className="summary-bar" aria-label="Ringkasan target tabungan">
        <div className="summary-cell">
          <span>Total terkumpul</span>
          <strong className="tone-green">{formatMoney(totalSaved)}</strong>
        </div>
        <div className="summary-cell">
          <span>Total target</span>
          <strong>{formatMoney(totalTarget)}</strong>
        </div>
        <div className="summary-cell">
          <span>Sisa kebutuhan</span>
          <strong>{formatMoney(Math.max(0, totalTarget - totalSaved))}</strong>
        </div>
        <div className="summary-cell">
          <span>Progres</span>
          <strong>{overallPct}%</strong>
        </div>
      </section>

      {goals.length === 0 ? (
        <section className="surface-card empty-state">
          <strong>Belum ada target tabungan</strong>
          <p>Buat kantong tabungan pertamamu seperti dana darurat atau rencana liburan.</p>
          <button type="button" className="primary-button" onClick={onAddGoal}>
            <Plus size={16} aria-hidden="true" /> Buat target pertama
          </button>
        </section>
      ) : (
        <section className="card-grid">
          {goals.map((goal) => {
            const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
            const remaining = Math.max(0, goal.target - goal.saved);
            const done = remaining === 0;

            return (
              <article className="vault-card" key={goal.id}>
                <div className="vault-head">
                  <div className="vault-title">
                    <span className="cat-disc tone-green" aria-hidden="true">
                      <Target size={18} />
                    </span>
                    <div>
                      <h2>{goal.name}</h2>
                      <span className={`status-pill ${done ? 'ok' : 'neutral'}`}>
                        {done ? 'Tercapai' : `Kurang ${formatMoney(remaining, true)}`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button sm danger"
                    onClick={() => onDeleteGoal(goal)}
                    disabled={busyId === `/api/goals/${goal.id}`}
                    title="Hapus target"
                    aria-label={`Hapus target ${goal.name}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>

                <div className="vault-numbers">
                  <div>
                    <span>Terkumpul</span>
                    <strong>{formatMoney(goal.saved)}</strong>
                  </div>
                  <div className="align-right">
                    <span>Target</span>
                    <strong>{formatMoney(goal.target)}</strong>
                  </div>
                </div>

                <div className="progress-track">
                  <span className="progress-fill ok" style={{ width: `${pct}%` }} />
                </div>

                <div className="vault-foot">
                  <span>{pct}% tercapai</span>
                  <button type="button" className="mini-primary" onClick={() => onFundGoal(goal)}>
                    <Plus size={14} aria-hidden="true" /> Tambah dana
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <div key={entry.dataKey}>
          <i style={{ background: entry.color }} />
          {entry.name} <b>{formatMoney(entry.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function InsightsPage({ range, setRange, data }) {
  const transactions = data?.transactions || [];
  const budgets = data?.budgets || [];
  const summary = data?.summary || { income: 0, expense: 0, net: 0, savingsRate: 0 };
  const trend = (data?.trend || []).map((item) => ({
    ...item,
    label: shortMonthLabel(item.month),
  }));

  const categoryBreakdown = useMemo(() => {
    const map = {};
    transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], index) => ({
        name,
        value,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        pct: summary.expense > 0 ? Math.round((value / summary.expense) * 1000) / 10 : 0,
      }));
  }, [transactions, summary.expense]);

  const elapsedDays = data?.period?.days || 1;
  const dailyBurn = Math.round(summary.expense / elapsedDays);

  const overBudgets = budgets.filter((b) => b.spent > b.amount);
  const nearBudgets = budgets.filter((b) => b.spent <= b.amount && b.spent / b.amount >= 0.8);
  const savingsTarget = data?.profile?.savingsTarget || 20;

  const insights = [];
  if (summary.savingsRate >= savingsTarget) {
    insights.push({
      tone: 'ok',
      title: `Rasio tabungan di atas target (${summary.savingsRate}%)`,
      body: `Kamu menyisihkan ${formatMoney(summary.net)} pada periode ini, melampaui target ${savingsTarget}%.`,
    });
  } else if (summary.income > 0) {
    insights.push({
      tone: 'warn',
      title: `Rasio tabungan di bawah target (${summary.savingsRate}%)`,
      body: `Evaluasi kategori pengeluaran terbesar agar mendekati target tabungan ${savingsTarget}%.`,
    });
  }
  if (overBudgets.length > 0) {
    insights.push({
      tone: 'danger',
      title: `${overBudgets.length} kategori melebihi anggaran`,
      body: `Kategori ${overBudgets.map((b) => b.category).join(', ')} melewati batas yang ditetapkan.`,
    });
  } else if (nearBudgets.length > 0) {
    insights.push({
      tone: 'warn',
      title: `${nearBudgets.length} kategori mendekati batas`,
      body: `Kategori ${nearBudgets.map((b) => b.category).join(', ')} sudah terpakai di atas 80%.`,
    });
  } else if (budgets.length > 0) {
    insights.push({
      tone: 'ok',
      title: 'Semua anggaran masih terkendali',
      body: 'Belum ada kategori pengeluaran yang melampaui 80% batas anggaran.',
    });
  }
  if (summary.expenseChangePct !== null && summary.expenseChangePct !== undefined) {
    const higher = summary.expenseChangePct > 0;
    insights.push({
      tone: higher ? 'warn' : 'ok',
      title: `Pengeluaran ${higher ? 'naik' : 'turun'} ${Math.abs(summary.expenseChangePct)}% vs periode lalu`,
      body: `Periode sebelumnya ${formatMoney(summary.previousExpense)} dibanding ${formatMoney(summary.expense)} saat ini.`,
    });
  }

  return (
    <>
      <PageHeader
        periodText={rangeLabel(range.from, range.to)}
        title="Laporan Keuangan"
        subtitle="Analisis rasio tabungan, distribusi pengeluaran, dan tren 6 bulan."
        range={range}
        setRange={setRange}
        actions={
          <button
            type="button"
            className="secondary-button"
            onClick={() => exportTransactionsCsv(transactions, `${range.from}_${range.to}`)}
            disabled={!transactions.length}
          >
            <Download size={16} aria-hidden="true" /> Unduh CSV
          </button>
        }
      />

      <section className="summary-bar" aria-label="Metrik kesehatan finansial">
        <div className="summary-cell">
          <span>Rasio tabungan</span>
          <strong className={summary.savingsRate >= savingsTarget ? 'tone-green' : 'tone-warn'}>
            {summary.savingsRate}%
          </strong>
          <small>Target minimal {savingsTarget}%</small>
        </div>
        <div className="summary-cell">
          <span>Pengeluaran rata-rata / hari</span>
          <strong>{formatMoney(dailyBurn)}</strong>
          <small>Dalam {elapsedDays} hari</small>
        </div>
        <div className="summary-cell">
          <span>Pos pengeluaran terbesar</span>
          <strong>{categoryBreakdown[0]?.name || 'Belum ada'}</strong>
          <small>
            {categoryBreakdown[0]
              ? `${formatMoney(categoryBreakdown[0].value, true)} (${categoryBreakdown[0].pct}%)`
              : 'Belum ada transaksi keluar'}
          </small>
        </div>
        <div className="summary-cell">
          <span>Surplus / Defisit</span>
          <strong className={summary.net >= 0 ? 'tone-green' : 'tone-danger'}>
            {formatMoney(summary.net, false, true)}
          </strong>
          <small>{summary.net >= 0 ? 'Arus kas positif' : 'Pengeluaran melebihi pemasukan'}</small>
        </div>
      </section>

      <section className="analytics-grid">
        <div className="surface-card chart-panel">
          <div className="panel-head">
            <div>
              <h2>Pemasukan dibanding pengeluaran, 6 bulan terakhir</h2>
              <p>Tren arus kas bulanan hingga akhir periode terpilih.</p>
            </div>
            <div className="legend">
              <span><i className="legend-dot income-dot" /> Masuk</span>
              <span><i className="legend-dot expense-dot" /> Keluar</span>
            </div>
          </div>
          <div className="chart-wrap tall">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 14, right: 6, left: -12, bottom: 0 }} barGap={6}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 10 }}
                  tickFormatter={(v) => formatMoney(v, true)}
                />
                <Tooltip content={<TrendTooltip />} />
                <Bar dataKey="income" name="Pemasukan" fill="#16a34a" radius={[6, 6, 0, 0]} maxBarSize={26} />
                <Bar dataKey="expense" name="Pengeluaran" fill="#ea580c" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card chart-panel">
          <div className="panel-head">
            <div>
              <h2>Ke mana uang keluar?</h2>
              <p>Total {formatMoney(summary.expense)} dari {categoryBreakdown.length} kategori.</p>
            </div>
          </div>
          {categoryBreakdown.length === 0 ? (
            <div className="empty-state compact">
              <strong>Belum ada pengeluaran</strong>
              <p>Distribusi kategori akan muncul begitu kamu mencatat pengeluaran.</p>
            </div>
          ) : (
            <>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={168}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={74}
                      paddingAngle={3}
                    >
                      {categoryBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatMoney(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="breakdown-list">
                {categoryBreakdown.map((item) => (
                  <div className="breakdown-row" key={item.name}>
                    <i style={{ background: item.color }} aria-hidden="true" />
                    <span>{item.name}</span>
                    <small>{item.pct}%</small>
                    <b>{formatMoney(item.value, true)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {insights.length > 0 && (
        <section className="surface-card insights-block">
          <div className="panel-head">
            <div>
              <h2>Catatan kondisi keuangan</h2>
              <p>Ringkasan otomatis berdasarkan transaksi dan anggaran periode ini.</p>
            </div>
          </div>
          <div className="insight-grid">
            {insights.map((item, idx) => (
              <div className={`insight-item ${item.tone}`} key={idx}>
                <span className="insight-icon" aria-hidden="true">
                  {item.tone === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function AccountsPage({ data, onAddAccount, onDeleteAccount, onViewAccountTransactions, busyId }) {
  const accounts = data?.accounts || [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <PageHeader
        periodText="Dompet & rekening"
        title="Akun Keuangan"
        subtitle="Pantau saldo setiap rekening bank, e-wallet, dan kas tunai."
        actions={
          <button type="button" className="primary-button" onClick={onAddAccount}>
            <Plus size={17} aria-hidden="true" /> Tambah akun
          </button>
        }
      />

      <section className="summary-bar" aria-label="Ringkasan akun">
        <div className="summary-cell">
          <span>Total saldo likuid</span>
          <strong>{formatMoney(totalBalance)}</strong>
        </div>
        <div className="summary-cell">
          <span>Akun aktif</span>
          <strong>{accounts.length} akun</strong>
        </div>
      </section>

      <section className="card-grid">
        {accounts.map((acc) => {
          const norm = normalizeAccountType(acc.type);
          return (
            <article className={`wallet-card full type-${norm}`} key={acc.id}>
              <div className="wallet-card-top">
                <div className="vault-title">
                  <AccountIcon type={acc.type} size={18} />
                  <div>
                    <h2>{acc.name}</h2>
                    <span className="wallet-type-label">{accountTypeLabel(acc.type)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button sm danger"
                  onClick={() => onDeleteAccount(acc)}
                  disabled={busyId === `/api/accounts/${acc.id}`}
                  title="Hapus akun"
                  aria-label={`Hapus akun ${acc.name}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="wallet-card-balance">{formatMoney(acc.balance)}</div>
              <div className="vault-foot">
                <span>Saldo awal: {formatMoney(acc.opening_balance, true)}</span>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => onViewAccountTransactions?.(acc.id)}
                >
                  Lihat {acc.transaction_count ?? 0} transaksi
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
