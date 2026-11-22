import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Bell, CheckCircle2, ChevronDown,
  ChevronRight, CreditCard, Download, Eye, EyeOff, FileText, Home, LogOut, Menu, Pencil,
  Plus, Search, Settings, Sparkles, Target, Trash2, TrendingDown, TrendingUp,
  Wallet, X, Zap,
} from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import {
  AccountModal, BudgetModal, ConfirmModal, GoalContributeModal, GoalModal, ProfileModal, TransactionModal,
} from './components/Modals';
import {
  AccountsPage, BudgetsPage, GoalsPage, InsightsPage, TransactionsPage,
} from './components/Pages';
import { PeriodRangePicker } from './components/PeriodRangePicker';
import {
  CATEGORY_ICONS, accountTypeLabel, buildRangeChartData, currentMonthRange,
  exportTransactionsCsv, formatMoney, formatShortDate, greetingForNow,
  normalizeAccountType, rangeLabel, shortMonthLabel,
} from './utils';
import './styles.css';

const PAGE_LABELS = {
  Overview: 'Ringkasan',
  Transactions: 'Transaksi',
  Budgets: 'Anggaran',
  Goals: 'Target',
  Insights: 'Laporan',
  Accounts: 'Akun',
};

function App() {
  const [authState, setAuthState] = useState({ checked: false, authenticated: false, user: null });
  const [range, setRange] = useState(currentMonthRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('Overview');
  const [txInitialFilter, setTxInitialFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [overviewType, setOverviewType] = useState('all');
  const [chartMode, setChartMode] = useState('range');
  const [hideBalances, setHideBalances] = useState(false);
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Popover states
  const [openMenu, setOpenMenu] = useState(null); // null | 'notifications' | 'profile'
  const topbarActionsRef = useRef(null);

  // Modal states
  const [txModal, setTxModal] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalToFund, setGoalToFund] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((status) => setAuthState({ checked: true, authenticated: Boolean(status.authenticated), user: status.user || null }))
      .catch(() => setAuthState({ checked: true, authenticated: false, user: null }));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setOpenMenu(null);
    setData(null);
    setAuthState({ checked: true, authenticated: false, user: null });
  }

  async function loadData({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?from=${range.from}&to=${range.to}`);
      if (response.status === 401) {
        setAuthState({ checked: true, authenticated: false, user: null });
        return;
      }
      if (!response.ok) throw new Error('Gagal memuat data');
      setData(await response.json());
    } catch {
      setToast('Data belum tersedia. Periksa koneksi ke server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authState.checked && authState.authenticated) {
      loadData();
    }
  }, [range.from, range.to, authState.checked, authState.authenticated]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!openMenu) return undefined;
    function handleOutside(event) {
      if (topbarActionsRef.current && !topbarActionsRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openMenu]);

  async function mutate(url, method, body, successMessage) {
    setBusyId(url);
    try {
      const response = await fetch(url, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      if (response.status === 401) {
        setAuthState({ checked: true, authenticated: false, user: null });
        return false;
      }
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Perubahan gagal disimpan.');
      }
      setToast(successMessage);
      await loadData({ quiet: true });
      return true;
    } catch (error) {
      setToast(error.message || 'Perubahan gagal disimpan.');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function askDeleteTransaction(item) {
    setConfirmDelete({
      title: 'Hapus transaksi ini?',
      message: 'Transaksi yang dihapus tidak dapat dikembalikan dan akan memengaruhi saldo akun terkait.',
      detail: `${item.title} • ${item.type === 'income' ? '+' : '-'}${formatMoney(item.amount)}`,
      onConfirm: () => mutate(`/api/transactions/${item.id}`, 'DELETE', null, 'Transaksi dihapus.'),
    });
  }

  function askDeleteBudget(budget) {
    setConfirmDelete({
      title: 'Hapus anggaran kategori?',
      message: 'Batas pemantauan anggaran untuk kategori ini akan dihapus. Transaksi kamu tetap aman.',
      detail: `${budget.category} • Batas ${formatMoney(budget.amount)}`,
      onConfirm: () => mutate(`/api/budgets/${budget.id}`, 'DELETE', null, 'Anggaran dihapus.'),
    });
  }

  function askDeleteGoal(goal) {
    setConfirmDelete({
      title: 'Hapus target tabungan?',
      message: 'Target tabungan ini beserta progres pencatatannya akan dihapus permanen.',
      detail: `${goal.name} • Terkumpul ${formatMoney(goal.saved)} dari ${formatMoney(goal.target)}`,
      onConfirm: () => mutate(`/api/goals/${goal.id}`, 'DELETE', null, 'Target dihapus.'),
    });
  }

  function askDeleteAccount(account) {
    setConfirmDelete({
      title: 'Hapus akun keuangan?',
      message: 'Akun ini akan dihapus permanen. Akun yang masih memiliki transaksi tidak dapat dihapus.',
      detail: `${account.name} • Saldo ${formatMoney(account.balance)}`,
      onConfirm: () => mutate(`/api/accounts/${account.id}`, 'DELETE', null, 'Akun dihapus.'),
    });
  }

  function navigateTo(page, filter = null) {
    if (page === 'Transactions') {
      setTxInitialFilter(filter ? { ...filter, _ts: Date.now() } : { type: 'all', category: 'all', accountId: null, _ts: Date.now() });
    }
    setActivePage(page);
    setOpenMenu(null);
    setSidebarOpen(false);
  }

  const transactions = data?.transactions || [];
  const accounts = data?.accounts || [];
  const budgets = data?.budgets || [];
  const goals = data?.goals || [];
  const summary = data?.summary || { income: 0, expense: 0, net: 0, savingsRate: 0, netChangePct: null };
  const trend = data?.trend || [];
  const profile = data?.profile || authState.user || { name: 'Pengguna', username: '', savingsTarget: 20 };

  const totalBalance = accounts.reduce((sum, item) => sum + item.balance, 0);
  const overBudgetCount = budgets.filter((b) => b.spent > b.amount).length;

  const notifications = useMemo(() => {
    const items = [];
    budgets.forEach((b) => {
      const pct = b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0;
      if (b.spent > b.amount) {
        items.push({
          id: `budget-over-${b.id}`,
          tone: 'danger',
          title: `Anggaran ${b.category} terlampaui (${pct}%)`,
          detail: `Terpakai ${formatMoney(b.spent, true)} dari batas ${formatMoney(b.amount, true)}.`,
          page: 'Budgets',
        });
      } else if (pct >= 80) {
        items.push({
          id: `budget-warn-${b.id}`,
          tone: 'warn',
          title: `Anggaran ${b.category} hampir habis (${pct}%)`,
          detail: `Sisa ${formatMoney(b.amount - b.spent, true)} untuk bulan ini.`,
          page: 'Budgets',
        });
      }
    });
    if (summary.income > 0 && summary.savingsRate < profile.savingsTarget) {
      items.push({
        id: 'savings-low',
        tone: 'warn',
        title: `Rasio tabungan ${summary.savingsRate}% (target ${profile.savingsTarget}%)`,
        detail: 'Tinjau laporan keuangan untuk mengoptimalkan pengeluaran.',
        page: 'Insights',
      });
    }
    goals.forEach((g) => {
      const pct = Math.round((g.saved / g.target) * 100);
      if (pct >= 100) {
        items.push({
          id: `goal-done-${g.id}`,
          tone: 'ok',
          title: `Target "${g.name}" tercapai!`,
          detail: `Dana terkumpul ${formatMoney(g.saved, true)}.`,
          page: 'Goals',
        });
      }
    });
    return items;
  }, [budgets, goals, summary.income, summary.savingsRate, profile.savingsTarget]);

  const filteredOverviewTx = useMemo(() => transactions.filter((item) => {
    if (overviewType !== 'all' && item.type !== overviewType) return false;
    if (!query.trim()) return true;
    return `${item.title} ${item.category} ${item.note || ''}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [transactions, overviewType, query]);

  const categoryData = useMemo(() => {
    const totals = transactions
      .filter((item) => item.type === 'expense')
      .reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + item.amount;
        return acc;
      }, {});
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const chartData = useMemo(() => {
    if (chartMode === '6m') {
      return trend.map((item) => ({
        label: shortMonthLabel(item.month),
        in: item.income,
        out: item.expense,
      }));
    }
    return buildRangeChartData(transactions, range.from, range.to);
  }, [chartMode, trend, transactions, range.from, range.to]);

  const activeRangeLabel = rangeLabel(range.from, range.to);
  const rangeSlug = `${range.from}_${range.to}`;

  const profileName = profile.name || 'Daffa';
  const initials = profileName.slice(0, 1).toUpperCase();
  const masked = (val, short = false, signed = false) => (hideBalances ? 'Rp ••••••' : formatMoney(val, short, signed));

  if (!authState.checked) {
    return (
      <div className="login-page">
        <div className="login-loading">Memuat Moneta...</div>
      </div>
    );
  }

  if (!authState.authenticated) {
    return (
      <LoginScreen
        onSuccess={(user) => setAuthState({ checked: true, authenticated: true, user })}
      />
    );
  }

  return (
    <Shell
      activePage={activePage}
      onNavigate={navigateTo}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      toast={toast}
      overBudgetCount={overBudgetCount}
      profileName={profileName}
      onOpenSettings={() => setShowProfileModal(true)}
    >
      <div className="main-column">
        <header className="topbar">
          <button type="button" className="mobile-brand" onClick={() => navigateTo('Overview')}>
            <span className="brand-mark">M</span>
            <span>Moneta</span>
          </button>
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <button type="button" className="breadcrumb-link" onClick={() => navigateTo('Overview')}>
              Personal
            </button>
            <ChevronRight size={15} />
            <strong>{PAGE_LABELS[activePage] || activePage}</strong>
          </div>

          <div className="topbar-actions" ref={topbarActionsRef}>
            <div className="popover-anchor">
              <button
                type="button"
                className={`icon-button notification ${openMenu === 'notifications' ? 'is-open' : ''}`}
                aria-label="Notifikasi"
                aria-expanded={openMenu === 'notifications'}
                onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
              >
                <Bell size={19} />
                {notifications.some((n) => n.tone !== 'ok') && <i />}
              </button>
              {openMenu === 'notifications' && (
                <div className="popover-panel notifications-popover">
                  <div className="popover-head">
                    <strong>Notifikasi</strong>
                    <span>{notifications.length} info</span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="popover-empty">
                      <CheckCircle2 size={18} className="tone-green" />
                      <span>Semua anggaran dan target dalam kondisi aman.</span>
                    </div>
                  ) : (
                    <div className="popover-list">
                      {notifications.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`notif-item ${item.tone}`}
                          onClick={() => navigateTo(item.page)}
                        >
                          <span className="notif-icon">
                            {item.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                          </span>
                          <div>
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="popover-anchor">
              <button
                type="button"
                className={`profile-chip ${openMenu === 'profile' ? 'is-open' : ''}`}
                aria-expanded={openMenu === 'profile'}
                onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
              >
                <span className="avatar">{initials}</span>
                <span>{profileName}</span>
                <ChevronDown size={14} />
              </button>
              {openMenu === 'profile' && (
                <div className="popover-panel profile-popover">
                  <div className="popover-head">
                    <div>
                      <strong>{profileName}</strong>
                      {profile.username && <div className="popover-email">@{profile.username}</div>}
                    </div>
                    <span>Target {profile.savingsTarget}%</span>
                  </div>
                  <div className="popover-actions">
                    <button
                      type="button"
                      onClick={() => { setOpenMenu(null); setShowProfileModal(true); }}
                    >
                      <Settings size={15} /> Pengaturan profil &amp; target
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        if (transactions.length) exportTransactionsCsv(transactions, rangeSlug);
                        else setToast('Belum ada transaksi untuk diekspor pada periode ini.');
                      }}
                    >
                      <Download size={15} /> Ekspor laporan periode ini (CSV)
                    </button>
                    <button type="button" onClick={() => navigateTo('Accounts')}>
                      <CreditCard size={15} /> Kelola akun keuangan
                    </button>
                    <button type="button" className="danger-menu-item" onClick={handleLogout}>
                      <LogOut size={15} /> Keluar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`content ${loading ? 'is-loading' : ''}`}>
          {activePage === 'Overview' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{activeRangeLabel}</p>
                  <h1>{greetingForNow()}, {profileName} <span className="wave">✦</span></h1>
                  <p className="subheading">Ringkasan keuangan dan arus kasmu pada periode terpilih.</p>
                </div>
                <div className="heading-actions">
                  <PeriodRangePicker range={range} onChange={setRange} />
                  <button
                    className="secondary-button"
                    onClick={() => exportTransactionsCsv(transactions, rangeSlug)}
                    disabled={!transactions.length}
                    title="Ekspor transaksi periode ini ke CSV"
                  >
                    <Download size={16} /> CSV
                  </button>
                  <button className="primary-button" onClick={() => setTxModal({ mode: 'add' })}>
                    <Plus size={18} /> Tambah transaksi
                  </button>
                </div>
              </div>

              <section className="hero-grid">
                <div className="balance-card">
                  <div className="balance-card-top">
                    <div className="balance-label-row">
                      <span className="card-label">Total saldo bersih</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={hideBalances}
                        className={`eye-switch ${hideBalances ? 'is-hidden' : ''}`}
                        onClick={() => setHideBalances((v) => !v)}
                        aria-label={hideBalances ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
                        title={hideBalances ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
                      >
                        <span className="eye-switch-thumb">
                          <span className="eye-icon eye-open"><Eye size={12} /></span>
                          <span className="eye-icon eye-closed"><EyeOff size={12} /></span>
                        </span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className="card-status clickable"
                      onClick={() => navigateTo('Accounts')}
                    >
                      <span className="status-dot" /> {accounts.length} akun aktif
                    </button>
                  </div>
                  <div className={`balance-value ${hideBalances ? 'is-masked' : ''}`}>{masked(totalBalance)}</div>
                  <div className="balance-meta">
                    {summary.netChangePct !== null ? (
                      <>
                        <span className={summary.netChangePct >= 0 ? 'positive' : 'negative'}>
                          {summary.netChangePct >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                          {summary.netChangePct >= 0 ? '+' : ''}{summary.netChangePct}%
                        </span>
                        <span>arus kas bersih vs periode sebelumnya</span>
                      </>
                    ) : (
                      <span>Rasio tabungan periode ini: <b className="positive">{summary.savingsRate}%</b></span>
                    )}
                  </div>
                  <div className="balance-visual">
                    <div className="visual-grid" />
                    <div className="visual-line" />
                  </div>
                </div>

                <div className="stat-stack">
                  <Stat
                    label="Pemasukan"
                    value={masked(summary.income)}
                    delta={`Rasio tabungan ${summary.savingsRate}%`}
                    icon={<ArrowDownLeft size={17} />}
                    tone="green"
                    onClick={() => navigateTo('Transactions', { type: 'income' })}
                  />
                  <Stat
                    label="Pengeluaran"
                    value={masked(summary.expense)}
                    delta={overBudgetCount > 0 ? `${overBudgetCount} kategori over budget` : 'Semua anggaran aman'}
                    icon={<ArrowUpRight size={17} />}
                    tone="orange"
                    onClick={() => navigateTo('Transactions', { type: 'expense' })}
                  />
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>Ringkasan arus kas</h2>
                  <p>Pergerakan dana pada {activeRangeLabel}.</p>
                </div>
                <div className="legend">
                  <span><i className="legend-dot income-dot" /> Pemasukan</span>
                  <span><i className="legend-dot expense-dot" /> Pengeluaran</span>
                </div>
              </div>

              <section className="overview-grid">
                <div className="chart-card">
                  <div className="chart-header">
                    <div>
                      <span className="chart-title">Arus kas bersih</span>
                      <strong className={summary.net < 0 ? 'tone-danger' : ''}>
                        {masked(summary.net, false, true)}
                      </strong>
                      <span className="chart-caption">selisih pemasukan &amp; pengeluaran periode ini</span>
                    </div>
                    <div className="chart-toggle">
                      <button
                        className={chartMode === 'range' ? 'active' : ''}
                        onClick={() => setChartMode('range')}
                      >
                        Periode
                      </button>
                      <button
                        className={chartMode === '6m' ? 'active' : ''}
                        onClick={() => setChartMode('6m')}
                      >
                        6 Bulan
                      </button>
                    </div>
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 12, right: 4, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#d2f975" stopOpacity=".28" />
                            <stop offset="100%" stopColor="#d2f975" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ffb98d" stopOpacity=".2" />
                            <stop offset="100%" stopColor="#ffb98d" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#999d9a', fontSize: 11 }} />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#999d9a', fontSize: 10 }}
                          tickFormatter={(value) => formatMoney(value, true)}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="in"
                          stroke="#a9db48"
                          strokeWidth={2.5}
                          fill="url(#inFill)"
                          activeDot={{ r: 4, fill: '#a9db48', stroke: '#fff', strokeWidth: 2 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="out"
                          stroke="#e78350"
                          strokeWidth={2}
                          fill="url(#outFill)"
                          activeDot={{ r: 4, fill: '#e78350', stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <SpendingCard
                  categoryData={categoryData}
                  total={summary.expense}
                  hideBalances={hideBalances}
                  onSelectCategory={(category) => navigateTo('Transactions', { type: 'expense', category })}
                  onSeeDetails={() => navigateTo('Insights')}
                />
              </section>

              <section className="bottom-grid">
                <div className="transactions-card">
                  <div className="card-section-header">
                    <div>
                      <h2>Transaksi terbaru</h2>
                      <p>{transactions.length} aktivitas pada {activeRangeLabel}</p>
                    </div>
                    <div className="table-actions">
                      <div className="search-box">
                        <Search size={15} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Cari..."
                        />
                      </div>
                      <select
                        className="filter-select compact"
                        value={overviewType}
                        onChange={(e) => setOverviewType(e.target.value)}
                        aria-label="Filter tipe transaksi"
                      >
                        <option value="all">Semua</option>
                        <option value="income">Masuk</option>
                        <option value="expense">Keluar</option>
                      </select>
                    </div>
                  </div>
                  <div className="transaction-list">
                    {filteredOverviewTx.slice(0, 6).map((item) => (
                      <TransactionRow
                        key={item.id}
                        item={item}
                        hideBalances={hideBalances}
                        onEdit={() => setTxModal({ mode: 'edit', item })}
                        onDelete={() => askDeleteTransaction(item)}
                        busy={busyId === `/api/transactions/${item.id}`}
                      />
                    ))}
                    {!filteredOverviewTx.length && (
                      <div className="empty-inline">Tidak ada transaksi yang cocok.</div>
                    )}
                  </div>
                  <button className="view-all" onClick={() => navigateTo('Transactions')}>
                    Lihat semua transaksi <ChevronRight size={15} />
                  </button>
                </div>

                <div className="right-stack">
                  <GoalsWidget
                    goals={goals}
                    hideBalances={hideBalances}
                    onAdd={() => setShowGoalModal(true)}
                    onFund={(goal) => setGoalToFund(goal)}
                    onManage={() => navigateTo('Goals')}
                  />
                  <AccountsWidget
                    accounts={accounts}
                    hideBalances={hideBalances}
                    onAdd={() => setShowAccountModal(true)}
                    onSelectAccount={(accountId) => navigateTo('Transactions', { accountId })}
                    onManage={() => navigateTo('Accounts')}
                  />
                </div>
              </section>
            </>
          )}

          {activePage === 'Transactions' && (
            <TransactionsPage
              range={range}
              setRange={setRange}
              data={data}
              initialFilter={txInitialFilter}
              onAdd={() => setTxModal({ mode: 'add' })}
              onEdit={(item) => setTxModal({ mode: 'edit', item })}
              onDelete={askDeleteTransaction}
              busyId={busyId}
            />
          )}

          {activePage === 'Budgets' && (
            <BudgetsPage
              range={range}
              setRange={setRange}
              data={data}
              onAddBudget={() => setBudgetModal({ mode: 'add' })}
              onEditBudget={(item) => setBudgetModal({ mode: 'edit', item })}
              onDeleteBudget={askDeleteBudget}
              busyId={busyId}
            />
          )}

          {activePage === 'Goals' && (
            <GoalsPage
              data={data}
              onAddGoal={() => setShowGoalModal(true)}
              onFundGoal={(goal) => setGoalToFund(goal)}
              onDeleteGoal={askDeleteGoal}
              busyId={busyId}
            />
          )}

          {activePage === 'Insights' && (
            <InsightsPage range={range} setRange={setRange} data={data} />
          )}

          {activePage === 'Accounts' && (
            <AccountsPage
              data={data}
              onAddAccount={() => setShowAccountModal(true)}
              onDeleteAccount={askDeleteAccount}
              onViewAccountTransactions={(accountId) => navigateTo('Transactions', { accountId })}
              busyId={busyId}
            />
          )}
        </main>
      </div>

      {txModal && (
        <TransactionModal
          initial={txModal.mode === 'edit' ? txModal.item : null}
          accounts={accounts}
          saving={Boolean(busyId)}
          onClose={() => setTxModal(null)}
          onSubmit={(payload) => (
            txModal.mode === 'edit'
              ? mutate(`/api/transactions/${txModal.item.id}`, 'PUT', payload, 'Transaksi diperbarui.')
              : mutate('/api/transactions', 'POST', payload, 'Transaksi ditambahkan.')
          )}
        />
      )}

      {budgetModal && (
        <BudgetModal
          initial={budgetModal.mode === 'edit' ? budgetModal.item : null}
          existingCategories={budgets.map((b) => b.category)}
          saving={Boolean(busyId)}
          onClose={() => setBudgetModal(null)}
          onSubmit={(payload) => (
            budgetModal.mode === 'edit'
              ? mutate(`/api/budgets/${budgetModal.item.id}`, 'PUT', payload, 'Batas anggaran diperbarui.')
              : mutate('/api/budgets', 'POST', payload, 'Anggaran baru ditambahkan.')
          )}
        />
      )}

      {showGoalModal && (
        <GoalModal
          saving={Boolean(busyId)}
          onClose={() => setShowGoalModal(false)}
          onSubmit={(payload) => mutate('/api/goals', 'POST', payload, 'Target baru dibuat.')}
        />
      )}

      {goalToFund && (
        <GoalContributeModal
          goal={goalToFund}
          saving={Boolean(busyId)}
          onClose={() => setGoalToFund(null)}
          onSubmit={(amount) => mutate(
            `/api/goals/${goalToFund.id}/contribute`,
            'POST',
            { amount },
            `Dana ditambahkan ke ${goalToFund.name}.`,
          )}
        />
      )}

      {showAccountModal && (
        <AccountModal
          saving={Boolean(busyId)}
          onClose={() => setShowAccountModal(false)}
          onSubmit={(payload) => mutate('/api/accounts', 'POST', payload, 'Akun baru ditambahkan.')}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          profile={profile}
          saving={Boolean(busyId)}
          onClose={() => setShowProfileModal(false)}
          onSubmit={(payload) => mutate('/api/profile', 'PUT', payload, 'Pengaturan profil disimpan.')}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.title}
          message={confirmDelete.message}
          detail={confirmDelete.detail}
          busy={Boolean(busyId)}
          onClose={() => setConfirmDelete(null)}
          onConfirm={confirmDelete.onConfirm}
        />
      )}
    </Shell>
  );
}

function Shell({
  children, activePage, onNavigate, sidebarOpen, setSidebarOpen,
  toast, overBudgetCount, profileName, onOpenSettings,
}) {
  const primaryNav = [
    { id: 'Overview', label: 'Ringkasan', icon: <Home size={18} /> },
    { id: 'Transactions', label: 'Transaksi', icon: <FileText size={18} /> },
    { id: 'Budgets', label: 'Anggaran', icon: <Wallet size={18} />, alert: overBudgetCount > 0 ? overBudgetCount : null },
    { id: 'Goals', label: 'Target', icon: <Target size={18} /> },
  ];
  const secondaryNav = [
    { id: 'Insights', label: 'Laporan', icon: <Sparkles size={18} />, badge: 'NEW' },
    { id: 'Accounts', label: 'Akun', icon: <CreditCard size={18} /> },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button type="button" className="brand" onClick={() => onNavigate('Overview')}>
          <span className="brand-mark">M</span>
          <span>Moneta</span>
        </button>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu">
          <X size={19} />
        </button>
        <button type="button" className="workspace" onClick={() => { setSidebarOpen(false); onOpenSettings(); }}>
          <span className="workspace-avatar">{profileName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{profileName}</strong>
            <span>Ruang keuangan pribadi</span>
          </div>
          <Settings size={14} className="workspace-gear" />
        </button>
        <nav>
          {primaryNav.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? 'active' : ''}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.alert ? (
                <span className="alert-badge">{item.alert}</span>
              ) : (
                activePage === item.id && <span className="nav-pip" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <nav className="secondary-nav">
          {secondaryNav.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? 'active' : ''}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && activePage !== item.id && <span className="new-badge">{item.badge}</span>}
              {activePage === item.id && <span className="nav-pip" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            className="settings-nav-btn"
            onClick={() => { setSidebarOpen(false); onOpenSettings(); }}
          >
            <Settings size={17} />
            <span>Pengaturan</span>
          </button>
          <button className="upgrade" onClick={() => onNavigate('Insights')}>
            <Zap size={18} />
            <div>
              <strong>Pantau kesehatan finansial</strong>
              <span>Lihat laporan &amp; rasio tabungan</span>
            </div>
            <ChevronRight size={15} />
          </button>
          <div className="sidebar-footer">© 2026 Moneta <span>•</span> v1.2</div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" />}
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, delta, icon, tone, onClick }) {
  return (
    <button type="button" className={`stat-card ${tone}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{delta}</small>
      </div>
      <ChevronRight className="stat-arrow" size={16} />
    </button>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.dataKey}>
          <i style={{ background: item.color }} />
          {item.dataKey === 'in' ? 'Pemasukan' : 'Pengeluaran'} <b>{formatMoney(item.value)}</b>
        </div>
      ))}
    </div>
  );
}

function SpendingCard({ categoryData, total, hideBalances, onSelectCategory, onSeeDetails }) {
  return (
    <div className="spending-card">
      <div className="chart-header">
        <div>
          <span className="chart-title">Pengeluaran terbesar</span>
          <strong>{hideBalances ? 'Rp ••••••' : formatMoney(total, true)}</strong>
          <span className="chart-caption">klik kategori untuk lihat transaksinya</span>
        </div>
      </div>
      <div className="category-bars">
        {categoryData.slice(0, 4).map(([category, amount], index) => {
          const share = total > 0 ? Math.round((amount / total) * 100) : 0;
          return (
            <button
              type="button"
              className="category-row clickable"
              key={category}
              onClick={() => onSelectCategory(category)}
            >
              <div className="category-label">
                <span className={`category-icon color-${index}`}>
                  {CATEGORY_ICONS[category] || '•'}
                </span>
                <span>{category}</span>
                <small className="category-share">{share}%</small>
                <b>{hideBalances ? '••••' : formatMoney(amount, true)}</b>
              </div>
              <div className="meter">
                <span
                  style={{ width: `${Math.max(7, (amount / (categoryData[0]?.[1] || amount)) * 100)}%` }}
                  className={`meter-fill color-${index}`}
                />
              </div>
            </button>
          );
        })}
        {categoryData.length === 0 && (
          <div className="empty-inline">Belum ada pengeluaran bulan ini.</div>
        )}
      </div>
      <button className="view-all muted" onClick={onSeeDetails}>
        Lihat rincian laporan <ChevronRight size={15} />
      </button>
    </div>
  );
}

function TransactionRow({ item, hideBalances, onEdit, onDelete, busy }) {
  const positive = item.type === 'income';
  return (
    <div className="transaction-row clickable" onClick={onEdit} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
      <div className={`transaction-icon ${positive ? 'income' : ''}`}>
        {CATEGORY_ICONS[item.category] || '•'}
      </div>
      <div className="transaction-info">
        <strong>{item.title}</strong>
        <span>
          {item.category} <i /> {formatShortDate(item.date)}
          {item.account_name ? <> <i /> {item.account_name}</> : null}
        </span>
      </div>
      <strong className={`transaction-amount ${positive ? 'positive' : ''}`}>
        {hideBalances ? '••••••' : `${positive ? '+' : '-'} ${formatMoney(item.amount)}`}
      </strong>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button sm" onClick={onEdit} aria-label="Edit transaksi" title="Edit">
          <Pencil size={14} />
        </button>
        <button
          className="icon-button sm danger"
          onClick={onDelete}
          disabled={busy}
          aria-label="Hapus transaksi"
          title="Hapus"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function GoalsWidget({ goals, hideBalances, onAdd, onFund, onManage }) {
  return (
    <div className="goals-card">
      <div className="card-section-header">
        <div>
          <h2>Target</h2>
          <p>Klik target untuk tambah dana.</p>
        </div>
        <button className="icon-button" onClick={onAdd} aria-label="Tambah target" title="Tambah target">
          <Plus size={17} />
        </button>
      </div>
      {goals.slice(0, 3).map((goal) => {
        const percentage = Math.min(100, Math.round((goal.saved / goal.target) * 100));
        return (
          <button type="button" className="goal-row clickable" key={goal.id} onClick={() => onFund(goal)}>
            <div className="goal-row-top">
              <div className="goal-icon"><Target size={17} /></div>
              <div>
                <strong>{goal.name}</strong>
                <span>
                  {hideBalances
                    ? '•••• dari ••••'
                    : `${formatMoney(goal.saved, true)} dari ${formatMoney(goal.target, true)}`}
                </span>
              </div>
              <b>{percentage}%</b>
            </div>
            <div className="goal-meter"><span style={{ width: `${percentage}%` }} /></div>
          </button>
        );
      })}
      {goals.length === 0 && <div className="empty-inline">Belum ada target tabungan.</div>}
      <button className="view-all muted" onClick={onManage}>
        Kelola target <ChevronRight size={15} />
      </button>
    </div>
  );
}

function AccountsWidget({ accounts, hideBalances, onAdd, onSelectAccount, onManage }) {
  return (
    <div className="accounts-card">
      <div className="card-section-header">
        <div>
          <h2>Akun kamu</h2>
          <p>Klik akun untuk filter transaksi.</p>
        </div>
        <button className="icon-button" onClick={onAdd} aria-label="Tambah akun" title="Tambah akun">
          <Plus size={17} />
        </button>
      </div>
      {accounts.map((account) => {
        const norm = normalizeAccountType(account.type);
        return (
          <button
            type="button"
            className="account-row clickable"
            key={account.id}
            onClick={() => onSelectAccount(account.id)}
          >
            <span className={`account-logo ${norm}`}>
              {norm === 'bank' ? 'B' : norm === 'ewallet' ? '◉' : '◒'}
            </span>
            <div>
              <strong>{account.name}</strong>
              <span>{accountTypeLabel(account.type)}</span>
            </div>
            <b>{hideBalances ? '••••••' : formatMoney(account.balance, true)}</b>
          </button>
        );
      })}
      <button className="view-all muted" onClick={onManage}>
        Kelola akun <ChevronRight size={15} />
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
