import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, CreditCard, Download,
  Pencil, PiggyBank, Plus, Search, Sparkles, Target, Trash2, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import {
  CATEGORY_COLORS, CATEGORY_ICONS, accountTypeLabel, exportTransactionsCsv,
  formatDate, formatMoney, normalizeAccountType, rangeLabel, shortMonthLabel,
} from '../utils';
import { PeriodRangePicker } from './PeriodRangePicker';

function PageHeader({ eyebrow, title, subtitle, range, setRange, actions }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
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

  const totals = useMemo(() => {
    const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filtered]);

  return (
    <>
      <PageHeader
        eyebrow={rangeLabel(range.from, range.to)}
        title="Transaksi"
        subtitle="Catatan lengkap pemasukan dan pengeluaran yang bisa difilter serta diekspor."
        range={range}
        setRange={setRange}
        actions={
          <>
            <button
              className="secondary-button"
              onClick={() => exportTransactionsCsv(filtered, `${range.from}_${range.to}`)}
              disabled={!filtered.length}
            >
              <Download size={16} /> Ekspor CSV
            </button>
            <button className="primary-button" onClick={onAdd}>
              <Plus size={17} /> Tambah transaksi
            </button>
          </>
        }
      />

      <section className="kpi-strip">
        <div className="kpi-card">
          <span>Pemasukan (terfilter)</span>
          <strong className="tone-green">{formatMoney(totals.income)}</strong>
        </div>
        <div className="kpi-card">
          <span>Pengeluaran (terfilter)</span>
          <strong className="tone-orange">{formatMoney(totals.expense)}</strong>
        </div>
        <div className="kpi-card">
          <span>Arus kas bersih</span>
          <strong className={totals.net >= 0 ? 'tone-green' : 'tone-danger'}>
            {formatMoney(totals.net, false, true)}
          </strong>
        </div>
        <div className="kpi-card">
          <span>Jumlah aktivitas</span>
          <strong>{filtered.length} transaksi</strong>
        </div>
      </section>

      <section className="panel-card">
        <div className="filter-bar">
          <div className="search-box wide">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari judul, kategori, atau catatan..."
            />
          </div>
          <div className="pill-group">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'income', label: 'Pemasukan' },
              { id: 'expense', label: 'Pengeluaran' },
            ].map((item) => (
              <button
                key={item.id}
                className={`filter-pill ${type === item.id ? 'active' : ''}`}
                onClick={() => setType(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Semua kategori</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select className="filter-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Semua akun</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={String(acc.id)}>{acc.name}</option>
            ))}
          </select>
          {hasActiveFilter && (
            <button type="button" className="reset-link" onClick={resetFilters}>
              Reset filter
            </button>
          )}
        </div>

        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-inline">Tidak ada transaksi yang cocok dengan filter saat ini.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaksi</th>
                  <th>Kategori</th>
                  <th>Akun</th>
                  <th>Tanggal</th>
                  <th className="align-right">Nominal</th>
                  <th className="align-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const positive = item.type === 'income';
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="table-tx">
                          <span className={`transaction-icon sm ${positive ? 'income' : ''}`}>
                            {CATEGORY_ICONS[item.category] || '•'}
                          </span>
                          <div>
                            <strong>{item.title}</strong>
                            {item.note && <small>{item.note}</small>}
                          </div>
                        </div>
                      </td>
                      <td><span className="tag">{item.category}</span></td>
                      <td className="muted-cell">{item.account_name || `#${item.account_id}`}</td>
                      <td className="muted-cell">{formatDate(item.date)}</td>
                      <td className={`align-right num ${positive ? 'tone-green' : ''}`}>
                        {positive ? '+' : '-'} {formatMoney(item.amount)}
                      </td>
                      <td className="align-right">
                        <div className="row-actions">
                          <button
                            className="icon-button sm"
                            onClick={() => onEdit(item)}
                            aria-label={`Edit ${item.title}`}
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button sm danger"
                            onClick={() => onDelete(item)}
                            disabled={busyId === `/api/transactions/${item.id}`}
                            aria-label={`Hapus ${item.title}`}
                            title="Hapus"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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
        eyebrow={rangeLabel(range.from, range.to)}
        title="Anggaran"
        subtitle="Pantau pemakaian anggaran tiap kategori pada rentang periode yang dipilih."
        range={range}
        setRange={setRange}
        actions={
          <button className="primary-button" onClick={onAddBudget}>
            <Plus size={17} /> Tambah anggaran
          </button>
        }
      />

      <section className="kpi-strip">
        <div className="kpi-card">
          <span>Total anggaran</span>
          <strong>{formatMoney(totalBudget)}</strong>
        </div>
        <div className="kpi-card">
          <span>Total terpakai</span>
          <strong className={overallPct > 100 ? 'tone-danger' : 'tone-orange'}>
            {formatMoney(totalSpent)}
          </strong>
        </div>
        <div className="kpi-card">
          <span>Sisa anggaran</span>
          <strong className={remaining < 0 ? 'tone-danger' : 'tone-green'}>
            {formatMoney(remaining, false, true)}
          </strong>
        </div>
        <div className="kpi-card">
          <span>Status pemakaian</span>
          <strong className={overCount > 0 ? 'tone-danger' : 'tone-green'}>
            {overCount > 0 ? `${overCount} melebihi batas` : `${overallPct}% terpakai`}
          </strong>
        </div>
      </section>

      <section className="card-grid">
        {budgets.map((budget) => {
          const pct = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
          const isOver = budget.spent > budget.amount;
          const isWarn = !isOver && pct >= 80;
          const statusClass = isOver ? 'danger' : isWarn ? 'warn' : 'ok';
          const statusLabel = isOver ? 'Melebihi batas' : isWarn ? 'Hampir habis' : 'Terkendali';
          const diff = budget.amount - budget.spent;

          return (
            <div className="budget-card" key={budget.id}>
              <div className="budget-card-head">
                <div className="budget-title">
                  <span className="category-icon">{CATEGORY_ICONS[budget.category] || '•'}</span>
                  <div>
                    <strong>{budget.category}</strong>
                    <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className="icon-button sm"
                    onClick={() => onEditBudget(budget)}
                    title="Ubah batas"
                    aria-label={`Ubah batas ${budget.category}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button sm danger"
                    onClick={() => onDeleteBudget(budget)}
                    disabled={busyId === `/api/budgets/${budget.id}`}
                    title="Hapus anggaran"
                    aria-label={`Hapus anggaran ${budget.category}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="budget-amounts">
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

              <div className="budget-foot">
                <span>{pct}% digunakan</span>
                <b className={diff < 0 ? 'tone-danger' : ''}>
                  {diff < 0 ? `Lebih ${formatMoney(Math.abs(diff))}` : `Sisa ${formatMoney(diff)}`}
                </b>
              </div>
            </div>
          );
        })}
        {budgets.length === 0 && (
          <div className="panel-card empty-inline">
            Belum ada anggaran bulanan. Klik &ldquo;Tambah anggaran&rdquo; untuk mulai memantau pengeluaran.
          </div>
        )}
      </section>
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
        eyebrow="Perencanaan"
        title="Target Finansial"
        subtitle="Alokasikan tabungan secara rutin untuk mewujudkan rencana jangka pendek dan panjang."
        actions={
          <button className="primary-button" onClick={onAddGoal}>
            <Plus size={17} /> Buat target baru
          </button>
        }
      />

      <section className="kpi-strip">
        <div className="kpi-card">
          <span>Total terkumpul</span>
          <strong className="tone-green">{formatMoney(totalSaved)}</strong>
        </div>
        <div className="kpi-card">
          <span>Total target</span>
          <strong>{formatMoney(totalTarget)}</strong>
        </div>
        <div className="kpi-card">
          <span>Sisa kebutuhan</span>
          <strong>{formatMoney(Math.max(0, totalTarget - totalSaved))}</strong>
        </div>
        <div className="kpi-card">
          <span>Progres keseluruhan</span>
          <strong>{overallPct}%</strong>
        </div>
      </section>

      <section className="card-grid">
        {goals.map((goal) => {
          const pct = Math.min(100, Math.round((goal.saved / goal.target) * 100));
          const remaining = Math.max(0, goal.target - goal.saved);
          const done = remaining === 0;

          return (
            <div className="budget-card" key={goal.id}>
              <div className="budget-card-head">
                <div className="budget-title">
                  <span className="goal-icon"><Target size={17} /></span>
                  <div>
                    <strong>{goal.name}</strong>
                    <span className={`status-pill ${done ? 'ok' : 'neutral'}`}>
                      {done ? 'Tercapai' : `Kurang ${formatMoney(remaining, true)}`}
                    </span>
                  </div>
                </div>
                <button
                  className="icon-button sm danger"
                  onClick={() => onDeleteGoal(goal)}
                  disabled={busyId === `/api/goals/${goal.id}`}
                  title="Hapus target"
                  aria-label={`Hapus target ${goal.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="budget-amounts">
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

              <div className="budget-foot">
                <span>{pct}% tercapai</span>
                <button className="mini-primary" onClick={() => onFundGoal(goal)}>
                  <Plus size={14} /> Tambah dana
                </button>
              </div>
            </div>
          );
        })}
        {goals.length === 0 && (
          <div className="panel-card empty-inline">
            Belum ada target tabungan. Buat target pertamamu sekarang.
          </div>
        )}
      </section>
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
      title: `Rasio tabungan sehat (${summary.savingsRate}%)`,
      body: `Kamu berhasil menyisihkan ${formatMoney(summary.net)} dari pemasukan periode ini. Pertahankan di atas target ${savingsTarget}%.`,
    });
  } else if (summary.income > 0) {
    insights.push({
      tone: 'warn',
      title: `Rasio tabungan di bawah target (${summary.savingsRate}%)`,
      body: `Coba tinjau kategori pengeluaran terbesar agar bisa mencapai target tabungan ${savingsTarget}% pemasukan.`,
    });
  }
  if (overBudgets.length > 0) {
    insights.push({
      tone: 'danger',
      title: `${overBudgets.length} kategori melebihi anggaran`,
      body: `Perhatikan kategori ${overBudgets.map((b) => b.category).join(', ')} yang sudah melampaui batas.`,
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
      title: 'Semua anggaran masih dalam batas aman',
      body: 'Belum ada kategori pengeluaran yang melampaui 80% batas anggaran.',
    });
  }
  if (summary.expenseChangePct !== null && summary.expenseChangePct !== undefined) {
    const higher = summary.expenseChangePct > 0;
    insights.push({
      tone: higher ? 'warn' : 'ok',
      title: `Pengeluaran ${higher ? 'naik' : 'turun'} ${Math.abs(summary.expenseChangePct)}% vs periode sebelumnya`,
      body: `Pengeluaran periode sebelumnya ${formatMoney(summary.previousExpense)} dibanding ${formatMoney(summary.expense)} periode ini.`,
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Laporan & Monitoring"
        title="Laporan Keuangan"
        subtitle={`Analisis performa arus kas & efisiensi anggaran untuk ${rangeLabel(range.from, range.to)}.`}
        range={range}
        setRange={setRange}
        actions={
          <button
            className="secondary-button"
            onClick={() => exportTransactionsCsv(transactions, `${range.from}_${range.to}`)}
            disabled={!transactions.length}
          >
            <Download size={16} /> Unduh laporan CSV
          </button>
        }
      />

      <section className="kpi-strip">
        <div className="kpi-card">
          <span>Rasio tabungan (Savings rate)</span>
          <strong className={summary.savingsRate >= savingsTarget ? 'tone-green' : 'tone-orange'}>
            {summary.savingsRate}%
          </strong>
          <small>Target ideal ≥ {savingsTarget}%</small>
        </div>
        <div className="kpi-card">
          <span>Rata-rata pengeluaran / hari</span>
          <strong>{formatMoney(dailyBurn)}</strong>
          <small>Dihitung dari {elapsedDays} hari</small>
        </div>
        <div className="kpi-card">
          <span>Kategori terbesar</span>
          <strong>{categoryBreakdown[0]?.name || '—'}</strong>
          <small>
            {categoryBreakdown[0]
              ? `${formatMoney(categoryBreakdown[0].value, true)} (${categoryBreakdown[0].pct}%)`
              : 'Belum ada pengeluaran'}
          </small>
        </div>
        <div className="kpi-card">
          <span>Surplus / Defisit</span>
          <strong className={summary.net >= 0 ? 'tone-green' : 'tone-danger'}>
            {formatMoney(summary.net, false, true)}
          </strong>
          <small>{summary.net >= 0 ? 'Arus kas positif' : 'Pengeluaran melebihi pemasukan'}</small>
        </div>
      </section>

      <section className="overview-grid">
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <span className="chart-title">Tren 6 bulan terakhir</span>
              <strong>Pemasukan vs Pengeluaran</strong>
              <span className="chart-caption">Perbandingan arus kas bulanan</span>
            </div>
            <div className="legend">
              <span><i className="legend-dot income-dot" /> Masuk</span>
              <span><i className="legend-dot expense-dot" /> Keluar</span>
            </div>
          </div>
          <div className="chart-wrap tall">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 14, right: 6, left: -14, bottom: 0 }} barGap={6}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8f9692', fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#8f9692', fontSize: 10 }}
                  tickFormatter={(v) => formatMoney(v, true)}
                />
                <Tooltip content={<TrendTooltip />} />
                <Bar dataKey="income" name="Pemasukan" fill="#a9db48" radius={[6, 6, 0, 0]} maxBarSize={26} />
                <Bar dataKey="expense" name="Pengeluaran" fill="#e78350" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="spending-card">
          <div className="chart-header">
            <div>
              <span className="chart-title">Distribusi pengeluaran</span>
              <strong>{formatMoney(summary.expense, true)}</strong>
              <span className="chart-caption">{categoryBreakdown.length} kategori aktif</span>
            </div>
          </div>
          {categoryBreakdown.length === 0 ? (
            <div className="empty-inline">Belum ada pengeluaran di bulan ini.</div>
          ) : (
            <>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
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
                    <i style={{ background: item.color }} />
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

      <section className="panel-card insights-panel">
        <div className="card-section-header flush">
          <div>
            <h2>Ringkasan & Rekomendasi Otomatis</h2>
            <p>Dihasilkan langsung dari data transaksi dan anggaranmu bulan ini.</p>
          </div>
          <Sparkles size={18} className="tone-green" />
        </div>
        <div className="insight-grid">
          {insights.map((item, idx) => (
            <div className={`insight-item ${item.tone}`} key={idx}>
              <div className="insight-icon">
                {item.tone === 'ok' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
              </div>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function AccountsPage({ data, onAddAccount, onDeleteAccount, onViewAccountTransactions, busyId }) {
  const accounts = data?.accounts || [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <PageHeader
        eyebrow="Dompet & Rekening"
        title="Akun Keuangan"
        subtitle="Kelola rekening bank, e-wallet, dan uang tunai dalam satu tempat."
        actions={
          <button className="primary-button" onClick={onAddAccount}>
            <Plus size={17} /> Tambah akun
          </button>
        }
      />

      <section className="kpi-strip">
        <div className="kpi-card">
          <span>Total kekayaan likuid</span>
          <strong>{formatMoney(totalBalance)}</strong>
        </div>
        <div className="kpi-card">
          <span>Jumlah akun aktif</span>
          <strong>{accounts.length} akun</strong>
        </div>
      </section>

      <section className="card-grid">
        {accounts.map((acc) => {
          const norm = normalizeAccountType(acc.type);
          return (
            <div className="budget-card" key={acc.id}>
              <div className="budget-card-head">
                <div className="budget-title">
                  <span className={`account-logo ${norm}`}>
                    {norm === 'bank' ? 'B' : norm === 'ewallet' ? '◉' : '◒'}
                  </span>
                  <div>
                    <strong>{acc.name}</strong>
                    <span className="status-pill neutral">{accountTypeLabel(acc.type)}</span>
                  </div>
                </div>
                <button
                  className="icon-button sm danger"
                  onClick={() => onDeleteAccount(acc)}
                  disabled={busyId === `/api/accounts/${acc.id}`}
                  title="Hapus akun"
                  aria-label={`Hapus akun ${acc.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="account-balance-big">{formatMoney(acc.balance)}</div>
              <div className="budget-foot">
                <span>Saldo awal: {formatMoney(acc.opening_balance, true)}</span>
                <button
                  type="button"
                  className="reset-link"
                  onClick={() => onViewAccountTransactions?.(acc.id)}
                >
                  {acc.transaction_count ?? 0} transaksi →
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
