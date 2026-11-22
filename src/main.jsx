import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, Bell, CheckCircle2,
  ChevronDown, ChevronRight, CreditCard, Download, Eye, EyeOff, FileText, Home,
  LogOut, Menu, Palette, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RefreshCw,
  Search, Settings, Target, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from 'lucide-react';
import { AccountIcon, CategoryIcon } from './components/CategoryIcon';
import { LoginScreen } from './components/LoginScreen';
import {
  AccountModal, BudgetModal, ConfirmModal, GoalContributeModal, GoalModal,
  ProfileModal, TransactionModal,
} from './components/Modals';
import {
  AccountsPage, BudgetsPage, GoalsPage, InsightsPage, TransactionsPage,
} from './components/Pages';
import { PeriodRangePicker } from './components/PeriodRangePicker';
import {
  THEMES, accountTypeLabel, buildRangeChartData, currentMonthRange,
  exportTransactionsCsv, formatMoney, greetingForNow, groupTransactionsByDate,
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

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const KEEPALIVE_INTERVAL_MS = 3 * 60 * 1000;

function App() {
  const [authState, setAuthState] = useState({ checked: false, authenticated: false, user: null });
  const [sessionNotice, setSessionNotice] = useState('');
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('moneta_theme');
      return THEMES.some((t) => t.id === saved) ? saved : 'modern';
    } catch { return 'modern'; }
  });
  const [range, setRange] = useState(currentMonthRange);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activePage, setActivePage] = useState('Overview');
  const [heroAccountId, setHeroAccountId] = useState('all');
  const [txInitialFilter, setTxInitialFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [overviewType, setOverviewType] = useState('all');
  const [chartMode, setChartMode] = useState('range');
  const [hideBalances, setHideBalances] = useState(false);
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [openMenu, setOpenMenu] = useState(null);
  const topbarActionsRef = useRef(null);
  const heroMenuRef = useRef(null);
  const mobileMenuTriggerRef = useRef(null);

  function closeSidebar(restoreFocus = false) {
    setSidebarOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus());
    }
  }

  const [txModal, setTxModal] = useState(null);
  const [budgetModal, setBudgetModal] = useState(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalToFund, setGoalToFund] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('moneta_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((status) => setAuthState({ checked: true, authenticated: Boolean(status.authenticated), user: status.user || null }))
      .catch(() => setAuthState({ checked: true, authenticated: false, user: null }));
  }, []);

  async function handleLogout(notice = '') {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setOpenMenu(null);
    setSidebarOpen(false);
    setData(null);
    setSessionNotice(notice);
    setAuthState({ checked: true, authenticated: false, user: null });
  }

  useEffect(() => {
    if (!authState.authenticated) return undefined;

    let lastActivity = Date.now();
    let lastKeepAlive = Date.now();

    function markActivity() {
      const now = Date.now();
      if (now - lastActivity >= IDLE_TIMEOUT_MS) {
        handleLogout('Sesi berakhir karena tidak ada aktivitas selama 10 menit. Silakan login kembali.');
        return;
      }
      lastActivity = now;
      if (now - lastKeepAlive >= KEEPALIVE_INTERVAL_MS) {
        lastKeepAlive = now;
        fetch('/api/auth/me')
          .then((res) => res.json())
          .then((status) => {
            if (!status.authenticated) {
              handleLogout('Sesi berakhir karena tidak ada aktivitas selama 10 menit. Silakan login kembali.');
            }
          })
          .catch(() => {});
      }
    }

    function checkIdle() {
      if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        handleLogout('Sesi berakhir karena tidak ada aktivitas selama 10 menit. Silakan login kembali.');
      }
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));
    document.addEventListener('visibilitychange', checkIdle);
    const interval = setInterval(checkIdle, 15000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markActivity));
      document.removeEventListener('visibilitychange', checkIdle);
      clearInterval(interval);
    };
  }, [authState.authenticated]);

  async function loadData({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const response = await fetch(`/api/dashboard?from=${range.from}&to=${range.to}`);
      if (response.status === 401) {
        setSessionNotice('Sesi berakhir karena tidak ada aktivitas selama 10 menit. Silakan login kembali.');
        setAuthState({ checked: true, authenticated: false, user: null });
        return;
      }
      if (!response.ok) throw new Error('Gagal memuat data dari server.');
      setData(await response.json());
    } catch {
      setLoadError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
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
    if (!openMenu && !sidebarOpen) return undefined;
    function handleOutside(event) {
      if (openMenu === 'heroAccount') {
        if (heroMenuRef.current && !heroMenuRef.current.contains(event.target)) {
          setOpenMenu(null);
        }
        return;
      }
      if (openMenu && topbarActionsRef.current && !topbarActionsRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    }
    function handleEsc(event) {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        if (sidebarOpen) closeSidebar(true);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openMenu, sidebarOpen]);

  async function mutate(url, method, body, successMessage) {
    setBusyId(url);
    try {
      const response = await fetch(url, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      if (response.status === 401) {
        setSessionNotice('Sesi berakhir karena tidak ada aktivitas selama 10 menit. Silakan login kembali.');
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
      detail: `${item.title} · ${item.type === 'income' ? '+' : '-'}${formatMoney(item.amount)}`,
      onConfirm: () => mutate(`/api/transactions/${item.id}`, 'DELETE', null, 'Transaksi dihapus.'),
    });
  }

  function askDeleteBudget(budget) {
    setConfirmDelete({
      title: 'Hapus anggaran kategori?',
      message: 'Batas pemantauan anggaran untuk kategori ini akan dihapus. Transaksi kamu tetap aman.',
      detail: `${budget.category} · Batas ${formatMoney(budget.amount)}`,
      onConfirm: () => mutate(`/api/budgets/${budget.id}`, 'DELETE', null, 'Anggaran dihapus.'),
    });
  }

  function askDeleteGoal(goal) {
    setConfirmDelete({
      title: 'Hapus target tabungan?',
      message: 'Target tabungan ini beserta progres pencatatannya akan dihapus permanen.',
      detail: `${goal.name} · Terkumpul ${formatMoney(goal.saved)} dari ${formatMoney(goal.target)}`,
      onConfirm: () => mutate(`/api/goals/${goal.id}`, 'DELETE', null, 'Target dihapus.'),
    });
  }

  function askDeleteAccount(account) {
    setConfirmDelete({
      title: 'Hapus akun keuangan?',
      message: 'Akun ini akan dihapus permanen. Akun yang masih memiliki transaksi tidak dapat dihapus.',
      detail: `${account.name} · Saldo ${formatMoney(account.balance)}`,
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
  const selectedHeroAccount = heroAccountId === 'all'
    ? null
    : accounts.find((a) => String(a.id) === String(heroAccountId)) || null;
  const displayedHeroBalance = selectedHeroAccount ? selectedHeroAccount.balance : totalBalance;
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
          detail: `Sisa ${formatMoney(b.amount - b.spent, true)} untuk periode ini.`,
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
          title: `Target "${g.name}" tercapai`,
          detail: `Dana terkumpul ${formatMoney(g.saved, true)}.`,
          page: 'Goals',
        });
      }
    });
    return items;
  }, [budgets, goals, summary.income, summary.savingsRate, profile.savingsTarget]);

  const filteredOverviewTx = useMemo(() => transactions.filter((item) => {
    if (selectedHeroAccount && String(item.account_id) !== String(selectedHeroAccount.id)) return false;
    if (overviewType !== 'all' && item.type !== overviewType) return false;
    if (!query.trim()) return true;
    return `${item.title} ${item.category} ${item.note || ''}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [transactions, selectedHeroAccount, overviewType, query]);

  const groupedOverviewTx = useMemo(
    () => groupTransactionsByDate(filteredOverviewTx.slice(0, 8)),
    [filteredOverviewTx],
  );

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
  const profileName = profile.name || 'Pengguna';
  const initials = profileName.slice(0, 1).toUpperCase();
  const masked = (val, short = false, signed = false) => (hideBalances ? 'Rp ••••••' : formatMoney(val, short, signed));

  if (!authState.checked) {
    return (
      <main className="login-page">
        <div className="login-loading">Memuat sesi Moneta...</div>
      </main>
    );
  }

  if (!authState.authenticated) {
    return (
      <LoginScreen
        notice={sessionNotice}
        onSuccess={(user) => {
          setSessionNotice('');
          setAuthState({ checked: true, authenticated: true, user });
        }}
      />
    );
  }

  return (
    <Shell
      activePage={activePage}
      onNavigate={navigateTo}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      onCloseSidebar={() => closeSidebar(true)}
      mobileMenuTriggerRef={mobileMenuTriggerRef}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
      toast={toast}
      overBudgetCount={overBudgetCount}
      profileName={profileName}
      username={profile.username}
      onOpenSettings={() => setShowProfileModal(true)}
      onLogout={() => handleLogout('')}
    >
      <div className="main-column">
        <header className="topbar">
          <button type="button" className="mobile-brand" onClick={() => navigateTo('Overview')}>
            <span className="brand-mark" aria-hidden="true">M</span>
            <span>Moneta</span>
          </button>

          <div className="breadcrumb">
            <button type="button" className="breadcrumb-link" onClick={() => navigateTo('Overview')}>
              Personal
            </button>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{PAGE_LABELS[activePage] || activePage}</strong>
          </div>

          <div className="topbar-actions" ref={topbarActionsRef}>
            <div className="popover-anchor">
              <button
                type="button"
                className={`icon-button ${openMenu === 'theme' ? 'is-open' : ''}`}
                aria-label="Pilih tema tampilan"
                aria-expanded={openMenu === 'theme'}
                title="Tema tampilan"
                onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
              >
                <Palette size={19} aria-hidden="true" />
              </button>
              {openMenu === 'theme' && (
                <div className="popover-panel theme-popover">
                  <div className="popover-head">
                    <strong>Tema tampilan</strong>
                    <span>{THEMES.find((t) => t.id === theme)?.name}</span>
                  </div>
                  <div className="theme-grid compact">
                    {THEMES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`theme-option ${theme === item.id ? 'active' : ''}`}
                        aria-pressed={theme === item.id}
                        onClick={() => { setTheme(item.id); setOpenMenu(null); }}
                      >
                        <span className="theme-swatches" aria-hidden="true">
                          {item.swatches.map((hex, i) => (
                            <i key={i} style={{ background: hex }} />
                          ))}
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="popover-anchor">
              <button
                type="button"
                className={`icon-button notification ${openMenu === 'notifications' ? 'is-open' : ''}`}
                aria-label="Notifikasi"
                aria-expanded={openMenu === 'notifications'}
                onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
              >
                <Bell size={19} aria-hidden="true" />
                {notifications.some((n) => n.tone !== 'ok') && <i aria-hidden="true" />}
              </button>
              {openMenu === 'notifications' && (
                <div className="popover-panel notifications-popover">
                  <div className="popover-head">
                    <strong>Notifikasi</strong>
                    <span>{notifications.length} info</span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="popover-empty">
                      <CheckCircle2 size={18} className="tone-green" aria-hidden="true" />
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
                          <span className="notif-icon" aria-hidden="true">
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
                aria-label="Menu profil"
                onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
              >
                <span className="avatar" aria-hidden="true">{initials}</span>
                <span className="profile-chip-name">{profileName}</span>
                <ChevronDown size={14} aria-hidden="true" />
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
                      <Settings size={15} aria-hidden="true" /> Pengaturan profil &amp; tema
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        if (transactions.length) exportTransactionsCsv(transactions, rangeSlug);
                        else setToast('Belum ada transaksi untuk diekspor pada periode ini.');
                      }}
                    >
                      <Download size={15} aria-hidden="true" /> Ekspor laporan CSV
                    </button>
                    <button type="button" onClick={() => navigateTo('Accounts')}>
                      <CreditCard size={15} aria-hidden="true" /> Kelola akun keuangan
                    </button>
                    <button type="button" className="danger-menu-item" onClick={() => handleLogout('')}>
                      <LogOut size={15} aria-hidden="true" /> Keluar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className={`content ${loading && data ? 'is-loading' : ''}`}>
          {loadError && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{loadError}</span>
              <button type="button" className="secondary-button sm" onClick={() => loadData()}>
                <RefreshCw size={14} aria-hidden="true" /> Coba lagi
              </button>
            </div>
          )}

          {loading && !data ? (
            <DashboardSkeleton />
          ) : (
            <div className="page-stage" key={activePage}>
              {activePage === 'Overview' && (
                <>
                  <div className="page-heading">
                    <div>
                      <p className="page-kicker">{activeRangeLabel}</p>
                      <h1>{greetingForNow()}, {profileName}</h1>
                    </div>
                    <div className="heading-actions">
                      <PeriodRangePicker range={range} onChange={setRange} />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => exportTransactionsCsv(transactions, rangeSlug)}
                        disabled={!transactions.length}
                        title="Ekspor transaksi periode ini ke CSV"
                      >
                        <Download size={16} aria-hidden="true" /> CSV
                      </button>
                    </div>
                  </div>

                  {/* Revolut Wallet Hero Stage */}
                  <section className="wallet-hero-grid">
                    <div className="wallet-hero-card">
                      <div className="wallet-hero-top">
                        <div className="popover-anchor" ref={heroMenuRef}>
                          <button
                            type="button"
                            className="account-scope-pill"
                            aria-expanded={openMenu === 'heroAccount'}
                            onClick={() => setOpenMenu(openMenu === 'heroAccount' ? null : 'heroAccount')}
                          >
                            <span className="currency-dot" aria-hidden="true">Rp</span>
                            <span>{selectedHeroAccount ? selectedHeroAccount.name : `Semua akun (${accounts.length})`}</span>
                            <ChevronDown size={14} aria-hidden="true" />
                          </button>
                          {openMenu === 'heroAccount' && (
                            <div className="popover-panel scope-popover">
                              <button
                                type="button"
                                className={heroAccountId === 'all' ? 'active' : ''}
                                onClick={() => { setHeroAccountId('all'); setOpenMenu(null); }}
                              >
                                <span>Semua akun</span>
                                <b>{masked(totalBalance, true)}</b>
                              </button>
                              {accounts.map((acc) => (
                                <button
                                  type="button"
                                  key={acc.id}
                                  className={String(heroAccountId) === String(acc.id) ? 'active' : ''}
                                  onClick={() => { setHeroAccountId(String(acc.id)); setOpenMenu(null); }}
                                >
                                  <span>{acc.name}</span>
                                  <b>{masked(acc.balance, true)}</b>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={hideBalances}
                          className={`eye-switch ${hideBalances ? 'is-hidden' : ''}`}
                          onClick={() => setHideBalances((v) => !v)}
                          aria-label={hideBalances ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
                          title={hideBalances ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
                        >
                          <span className="eye-switch-thumb" aria-hidden="true">
                            <span className="eye-icon eye-open"><Eye size={12} /></span>
                            <span className="eye-icon eye-closed"><EyeOff size={12} /></span>
                          </span>
                        </button>
                      </div>

                      <div className={`wallet-balance-figure ${hideBalances ? 'is-masked' : ''}`}>
                        {masked(displayedHeroBalance)}
                      </div>

                      <div className="wallet-balance-meta">
                        {selectedHeroAccount ? (
                          <span className="meta-caption">
                            {accountTypeLabel(selectedHeroAccount.type)} · {selectedHeroAccount.transaction_count ?? 0} transaksi tercatat
                          </span>
                        ) : summary.netChangePct !== null ? (
                          <>
                            <span className={`delta-chip ${summary.netChangePct >= 0 ? 'up' : 'down'}`}>
                              {summary.netChangePct >= 0
                                ? <TrendingUp size={13} aria-hidden="true" />
                                : <TrendingDown size={13} aria-hidden="true" />}
                              {summary.netChangePct >= 0 ? '+' : ''}{summary.netChangePct}%
                            </span>
                            <span className="meta-caption">arus kas bersih vs periode lalu</span>
                          </>
                        ) : (
                          <span className="meta-caption">
                            Rasio tabungan periode ini: <strong>{summary.savingsRate}%</strong>
                          </span>
                        )}
                      </div>

                      {/* Signature Revolut Circular Quick Actions */}
                      <div className="quick-actions-row" role="group" aria-label="Aksi cepat">
                        <button
                          type="button"
                          className="quick-action primary"
                          onClick={() => setTxModal({ mode: 'add' })}
                        >
                          <span className="qa-circle" aria-hidden="true"><Plus size={20} /></span>
                          <span>Catat</span>
                        </button>
                        <button
                          type="button"
                          className="quick-action"
                          onClick={() => navigateTo('Budgets')}
                        >
                          <span className="qa-circle" aria-hidden="true">
                            <Wallet size={19} />
                            {overBudgetCount > 0 && <i className="qa-dot" />}
                          </span>
                          <span>Anggaran</span>
                        </button>
                        <button
                          type="button"
                          className="quick-action"
                          onClick={() => navigateTo('Goals')}
                        >
                          <span className="qa-circle" aria-hidden="true"><Target size={19} /></span>
                          <span>Target</span>
                        </button>
                        <button
                          type="button"
                          className="quick-action"
                          onClick={() => navigateTo('Insights')}
                        >
                          <span className="qa-circle" aria-hidden="true"><BarChart3 size={19} /></span>
                          <span>Laporan</span>
                        </button>
                      </div>
                    </div>

                    <div className="cashflow-side-stack">
                      <button
                        type="button"
                        className="flow-card"
                        onClick={() => navigateTo('Transactions', { type: 'income' })}
                      >
                        <span className="cat-disc tone-green" aria-hidden="true">
                          <ArrowDownLeft size={18} />
                        </span>
                        <div className="flow-copy">
                          <span>Pemasukan</span>
                          <strong>{masked(summary.income)}</strong>
                          <small>Rasio tabungan {summary.savingsRate}%</small>
                        </div>
                        <ChevronRight className="flow-arrow" size={16} aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        className="flow-card"
                        onClick={() => navigateTo('Transactions', { type: 'expense' })}
                      >
                        <span className="cat-disc tone-rose" aria-hidden="true">
                          <ArrowUpRight size={18} />
                        </span>
                        <div className="flow-copy">
                          <span>Pengeluaran</span>
                          <strong>{masked(summary.expense)}</strong>
                          <small>{overBudgetCount > 0 ? `${overBudgetCount} kategori lewat batas` : 'Semua anggaran aman'}</small>
                        </div>
                        <ChevronRight className="flow-arrow" size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </section>

                  {/* Tactile Wallet Accounts Strip */}
                  <section className="section-block" aria-label="Dompet dan rekening">
                    <div className="section-bar">
                      <h2>Dompet &amp; rekening</h2>
                      <button type="button" className="text-link" onClick={() => navigateTo('Accounts')}>
                        Kelola semua
                      </button>
                    </div>
                    <div className="wallet-cards-strip">
                      {accounts.map((acc) => {
                        const norm = normalizeAccountType(acc.type);
                        return (
                          <button
                            type="button"
                            key={acc.id}
                            className={`wallet-card type-${norm}`}
                            onClick={() => navigateTo('Transactions', { accountId: acc.id })}
                          >
                            <div className="wallet-card-top">
                              <AccountIcon type={acc.type} size={17} />
                              <span className="wallet-type-label">{accountTypeLabel(acc.type)}</span>
                            </div>
                            <div className="wallet-card-name">{acc.name}</div>
                            <div className="wallet-card-balance">{masked(acc.balance, true)}</div>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="wallet-card add-card"
                        onClick={() => setShowAccountModal(true)}
                      >
                        <span className="add-card-circle" aria-hidden="true"><Plus size={18} /></span>
                        <span>Tambah akun</span>
                      </button>
                    </div>
                  </section>

                  {/* Cash Flow & Spending Analytics */}
                  <section className="analytics-grid">
                    <div className="surface-card chart-panel">
                      <div className="panel-head">
                        <div>
                          <h2>Ke mana arus kas bergerak?</h2>
                          <p>
                            Selisih bersih:{' '}
                            <strong className={summary.net < 0 ? 'tone-danger' : 'tone-green'}>
                              {masked(summary.net, false, true)}
                            </strong>
                          </p>
                        </div>
                        <div className="segmented-control compact" role="group" aria-label="Rentang grafik">
                          <button
                            type="button"
                            className={chartMode === 'range' ? 'active' : ''}
                            onClick={() => setChartMode('range')}
                          >
                            Periode
                          </button>
                          <button
                            type="button"
                            className={chartMode === '6m' ? 'active' : ''}
                            onClick={() => setChartMode('6m')}
                          >
                            6 Bulan
                          </button>
                        </div>
                      </div>
                      <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 12, right: 6, left: -14, bottom: 0 }}>
                            <defs>
                              <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#16a34a" stopOpacity="0.22" />
                                <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                              </linearGradient>
                              <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.16" />
                                <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'var(--muted)', fontSize: 10 }}
                              tickFormatter={(value) => formatMoney(value, true)}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="in"
                              stroke="#16a34a"
                              strokeWidth={2.5}
                              fill="url(#inFill)"
                              activeDot={{ r: 4, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
                            />
                            <Area
                              type="monotone"
                              dataKey="out"
                              stroke="#ea580c"
                              strokeWidth={2}
                              fill="url(#outFill)"
                              activeDot={{ r: 4, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
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

                  {/* Date-Grouped Activity + Goals Vaults */}
                  <section className="activity-grid">
                    <div className="surface-card activity-panel">
                      <div className="panel-head">
                        <div>
                          <h2>Aktivitas terbaru</h2>
                          <p>
                            {filteredOverviewTx.length} transaksi
                            {selectedHeroAccount ? ` di ${selectedHeroAccount.name}` : ` pada ${activeRangeLabel}`}
                          </p>
                        </div>
                        <div className="table-actions">
                          <div className="search-box">
                            <Search size={15} aria-hidden="true" />
                            <input
                              aria-label="Cari aktivitas terbaru"
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

                      {groupedOverviewTx.length === 0 ? (
                        <div className="empty-state compact">
                          <strong>Belum ada aktivitas di sini</strong>
                          <p>Catat pemasukan atau pengeluaran untuk melihat riwayat arus kasmu.</p>
                          <button type="button" className="primary-button sm" onClick={() => setTxModal({ mode: 'add' })}>
                            <Plus size={15} aria-hidden="true" /> Catat transaksi
                          </button>
                        </div>
                      ) : (
                        <div className="date-groups">
                          {groupedOverviewTx.map((group) => (
                            <div className="date-group" key={group.date}>
                              <div className="date-group-header">
                                <span>{group.label}</span>
                                <b className={group.dailyNet >= 0 ? 'tone-green' : ''}>
                                  {masked(group.dailyNet, true, true)}
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
                                        onClick={() => setTxModal({ mode: 'edit', item })}
                                      >
                                        <CategoryIcon category={item.category} type={item.type} size={17} />
                                        <div className="activity-copy">
                                          <strong>{item.title}</strong>
                                          <span>
                                            {item.category}
                                            {item.account_name ? ` · ${item.account_name}` : ''}
                                          </span>
                                        </div>
                                        <strong className={`activity-amount ${positive ? 'positive' : ''}`}>
                                          {hideBalances ? '••••••' : `${positive ? '+' : '-'}${formatMoney(item.amount)}`}
                                        </strong>
                                      </button>
                                      <div className="row-actions">
                                        <button
                                          type="button"
                                          className="icon-button sm"
                                          onClick={() => setTxModal({ mode: 'edit', item })}
                                          aria-label={`Edit ${item.title}`}
                                          title="Edit"
                                        >
                                          <Pencil size={14} aria-hidden="true" />
                                        </button>
                                        <button
                                          type="button"
                                          className="icon-button sm danger"
                                          onClick={() => askDeleteTransaction(item)}
                                          disabled={busyId === `/api/transactions/${item.id}`}
                                          aria-label={`Hapus ${item.title}`}
                                          title="Hapus"
                                        >
                                          <Trash2 size={14} aria-hidden="true" />
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

                      {filteredOverviewTx.length > 0 && (
                        <button type="button" className="panel-footer-link" onClick={() => navigateTo('Transactions')}>
                          Lihat semua transaksi <ChevronRight size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <GoalsWidget
                      goals={goals}
                      hideBalances={hideBalances}
                      onAdd={() => setShowGoalModal(true)}
                      onFund={(goal) => setGoalToFund(goal)}
                      onManage={() => navigateTo('Goals')}
                    />
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
            </div>
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
          theme={theme}
          onSelectTheme={setTheme}
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
  children, activePage, onNavigate, sidebarOpen, setSidebarOpen, onCloseSidebar,
  mobileMenuTriggerRef, sidebarCollapsed, setSidebarCollapsed, toast, overBudgetCount,
  profileName, username, onOpenSettings, onLogout,
}) {
  const primaryNav = [
    { id: 'Overview', label: 'Ringkasan', icon: Home },
    { id: 'Transactions', label: 'Transaksi', icon: FileText },
    { id: 'Budgets', label: 'Anggaran', icon: Wallet, alert: overBudgetCount > 0 ? overBudgetCount : null },
    { id: 'Goals', label: 'Target', icon: Target },
  ];
  const secondaryNav = [
    { id: 'Insights', label: 'Laporan', icon: BarChart3 },
    { id: 'Accounts', label: 'Akun', icon: CreditCard },
  ];

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Navigasi utama">
        <div className="sidebar-top">
          <button type="button" className="brand" onClick={() => onNavigate('Overview')} aria-label="Beranda Moneta">
            <span className="brand-mark" aria-hidden="true">M</span>
            <span className="brand-text">Moneta</span>
          </button>
          <button
            type="button"
            className="collapse-btn"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Perluas navigasi' : 'Ringkas navigasi'}
            title={sidebarCollapsed ? 'Perluas menu' : 'Ringkas menu'}
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Tutup menu"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <nav className="nav-group" aria-label="Menu utama">
          <span className="nav-group-label">Utama</span>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={isActive ? 'active' : ''}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
                {item.alert && <span className="alert-badge">{item.alert}</span>}
              </button>
            );
          })}
        </nav>

        <nav className="nav-group" aria-label="Analisis dan dompet">
          <span className="nav-group-label">Analisis</span>
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={isActive ? 'active' : ''}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="sidebar-action"
            aria-label="Pengaturan"
            title={sidebarCollapsed ? 'Pengaturan' : undefined}
            onClick={() => { setSidebarOpen(false); onOpenSettings(); }}
          >
            <Settings size={18} aria-hidden="true" />
            <span className="nav-label">Pengaturan</span>
          </button>
          <button
            type="button"
            className="sidebar-user"
            aria-label="Keluar dari akun"
            title={sidebarCollapsed ? `${profileName} (Keluar)` : undefined}
            onClick={onLogout}
          >
            <span className="avatar sm" aria-hidden="true">{profileName.slice(0, 1).toUpperCase()}</span>
            <div className="nav-label">
              <strong>{profileName}</strong>
              <span>{username ? `@${username}` : 'Personal'}</span>
            </div>
            <LogOut size={15} className="nav-label user-logout-ico" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={onCloseSidebar}
          aria-label="Tutup menu"
        />
      )}

      {children}

      {/* Mobile Revolut-style Bottom Tab Bar */}
      <nav className="mobile-bottom-nav" aria-label="Navigasi cepat seluler">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              type="button"
              key={item.id}
              className={isActive ? 'active' : ''}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="tab-ico-wrap" aria-hidden="true">
                <Icon size={20} />
                {item.alert && <i className="tab-dot" />}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          ref={mobileMenuTriggerRef}
          type="button"
          className={activePage === 'Insights' || activePage === 'Accounts' ? 'active' : ''}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
          aria-label="Buka menu lainnya"
        >
          <Menu size={20} aria-hidden="true" />
          <span>Lainnya</span>
        </button>
      </nav>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-check" aria-hidden="true">✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-stage" aria-busy="true" aria-label="Memuat data keuangan">
      <div className="skeleton-block h-title" />
      <div className="wallet-hero-grid">
        <div className="skeleton-block h-hero" />
        <div className="cashflow-side-stack">
          <div className="skeleton-block h-flow" />
          <div className="skeleton-block h-flow" />
        </div>
      </div>
      <div className="analytics-grid">
        <div className="skeleton-block h-chart" />
        <div className="skeleton-block h-chart" />
      </div>
    </div>
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
    <div className="surface-card chart-panel">
      <div className="panel-head">
        <div>
          <h2>Pengeluaran terbesar</h2>
          <p>{hideBalances ? 'Rp ••••••' : formatMoney(total)} total pengeluaran periode ini</p>
        </div>
      </div>
      <div className="category-bars">
        {categoryData.slice(0, 4).map(([category, amount], index) => {
          const share = total > 0 ? Math.round((amount / total) * 100) : 0;
          return (
            <button
              type="button"
              className="category-row"
              key={category}
              onClick={() => onSelectCategory(category)}
            >
              <div className="category-label">
                <CategoryIcon category={category} type="expense" size={15} className="sm" />
                <span className="cat-name">{category}</span>
                <small className="category-share">{share}%</small>
                <b>{hideBalances ? '••••' : formatMoney(amount, true)}</b>
              </div>
              <div className="meter">
                <span
                  style={{ width: `${Math.max(8, (amount / (categoryData[0]?.[1] || amount)) * 100)}%` }}
                  className={`meter-fill color-${index}`}
                />
              </div>
            </button>
          );
        })}
        {categoryData.length === 0 && (
          <div className="empty-state compact">
            <strong>Belum ada pengeluaran</strong>
            <p>Kategori pengeluaran terbesarmu akan tampil di sini.</p>
          </div>
        )}
      </div>
      <button type="button" className="panel-footer-link" onClick={onSeeDetails}>
        Lihat laporan lengkap <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function GoalsWidget({ goals, hideBalances, onAdd, onFund, onManage }) {
  return (
    <div className="surface-card goals-panel">
      <div className="panel-head">
        <div>
          <h2>Kantong target</h2>
          <p>Klik target untuk menambah dana.</p>
        </div>
        <button
          type="button"
          className="icon-button sm"
          onClick={onAdd}
          aria-label="Buat target baru"
          title="Buat target baru"
        >
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="goal-widget-list">
        {goals.slice(0, 3).map((goal) => {
          const percentage = Math.min(100, Math.round((goal.saved / goal.target) * 100));
          return (
            <button type="button" className="goal-item" key={goal.id} onClick={() => onFund(goal)}>
              <div className="goal-item-top">
                <span className="cat-disc tone-green sm" aria-hidden="true">
                  <Target size={15} />
                </span>
                <div className="goal-item-copy">
                  <strong>{goal.name}</strong>
                  <span>
                    {hideBalances
                      ? '•••• dari ••••'
                      : `${formatMoney(goal.saved, true)} dari ${formatMoney(goal.target, true)}`}
                  </span>
                </div>
                <b>{percentage}%</b>
              </div>
              <div className="progress-track sm">
                <span className="progress-fill ok" style={{ width: `${percentage}%` }} />
              </div>
            </button>
          );
        })}
        {goals.length === 0 && (
          <div className="empty-state compact">
            <strong>Belum ada target</strong>
            <p>Buat kantong tabungan agar tujuan finansial lebih terarah.</p>
            <button type="button" className="secondary-button sm" onClick={onAdd}>
              <Plus size={14} aria-hidden="true" /> Buat target
            </button>
          </div>
        )}
      </div>
      <button type="button" className="panel-footer-link" onClick={onManage}>
        Kelola semua target <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
