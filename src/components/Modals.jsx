import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, THEMES, formatMoney, todayIso } from '../utils';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function useModalA11y(modalRef, onClose, disabled = false) {
  const [previousFocus] = useState(() => (typeof document !== 'undefined' ? document.activeElement : null));

  useEffect(() => () => {
    if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
      requestAnimationFrame(() => previousFocus.focus());
    }
  }, [previousFocus]);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape' && !disabled) {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusables = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [modalRef, onClose, disabled]);
}

export function TransactionModal({ onClose, onSubmit, accounts, initial = null, saving = false }) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, saving);
  const isEdit = Boolean(initial);
  const defaultType = initial?.type || 'expense';
  const [form, setForm] = useState({
    title: initial?.title || '',
    amount: initial?.amount ? String(initial.amount) : '',
    type: defaultType,
    category: initial?.category || (defaultType === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]),
    account_id: initial?.account_id || accounts[0]?.id || 1,
    date: initial?.date || todayIso(),
    note: initial?.note || '',
  });
  const [error, setError] = useState('');

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const categoryOptions = categories.includes(form.category)
    ? categories
    : [form.category, ...categories];

  function selectType(nextType) {
    const nextCategories = nextType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setForm((prev) => ({
      ...prev,
      type: nextType,
      category: nextCategories.includes(prev.category) ? prev.category : nextCategories[0],
    }));
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const amountNum = Math.round(Number(form.amount));
    if (!Number.isSafeInteger(amountNum) || amountNum <= 0) {
      setError('Nominal harus berupa angka bulat lebih dari 0.');
      return;
    }
    const ok = await onSubmit({
      ...form,
      amount: amountNum,
      account_id: Number(form.account_id),
    });
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form ref={modalRef} className="modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="tx-modal-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">{isEdit ? 'Ubah transaksi' : 'Catat arus kas'}</span>
            <h2 id="tx-modal-title">{isEdit ? 'Edit transaksi' : 'Transaksi baru'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="segmented-control modal-segment" role="group" aria-label="Tipe transaksi">
          <button
            type="button"
            className={form.type === 'expense' ? 'active' : ''}
            onClick={() => selectType('expense')}
          >
            Pengeluaran
          </button>
          <button
            type="button"
            className={form.type === 'income' ? 'active' : ''}
            onClick={() => selectType('income')}
          >
            Pemasukan
          </button>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <label>
          Judul transaksi
          <input
            required
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder={form.type === 'income' ? 'Nama sumber pemasukan' : 'Nama transaksi atau merchant'}
            autoFocus
          />
        </label>

        <div className="form-grid">
          <label>
            Nominal (IDR)
            <input
              required
              min="1"
              step="1"
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="0"
            />
          </label>
          <label>
            Kategori
            <select name="category" value={form.category} onChange={handleChange}>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label>
            Akun
            <select name="account_id" value={form.account_id} onChange={handleChange}>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatMoney(acc.balance, true)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Tanggal
            <input required type="date" name="date" value={form.date} onChange={handleChange} />
          </label>
        </div>

        <label>
          Catatan <span className="optional">(opsional)</span>
          <textarea
            name="note"
            value={form.note}
            onChange={handleChange}
            rows="2"
            placeholder="Tambahkan keterangan singkat jika perlu"
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : isEdit ? 'Simpan perubahan' : 'Simpan transaksi'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BudgetModal({ onClose, onSubmit, existingCategories = [], initial = null, saving = false }) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, saving);
  const isEdit = Boolean(initial);
  const availableCategories = EXPENSE_CATEGORIES.filter((c) => !existingCategories.includes(c));
  const [category, setCategory] = useState(initial?.category || availableCategories[0] || 'Lainnya');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const amountNum = Math.round(Number(amount));
    if (!Number.isSafeInteger(amountNum) || amountNum <= 0) {
      setError('Batas anggaran harus lebih dari 0.');
      return;
    }
    const ok = await onSubmit(isEdit ? { amount: amountNum } : { category: category.trim(), amount: amountNum });
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form ref={modalRef} className="modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="budget-modal-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Anggaran periode</span>
            <h2 id="budget-modal-title">{isEdit ? `Ubah batas ${initial.category}` : 'Tambah anggaran'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!isEdit && (
          <label>
            Kategori pengeluaran
            {availableCategories.length > 0 ? (
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            ) : (
              <input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Nama kategori"
              />
            )}
          </label>
        )}
        <label>
          Batas anggaran (IDR)
          <input
            required
            min="1"
            step="1"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan anggaran'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function GoalModal({ onClose, onSubmit, saving = false }) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, saving);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('0');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const targetNum = Math.round(Number(target));
    const savedNum = Math.round(Number(saved || 0));
    if (!Number.isSafeInteger(targetNum) || targetNum <= 0) {
      setError('Target dana harus lebih dari 0.');
      return;
    }
    if (!Number.isSafeInteger(savedNum) || savedNum < 0) {
      setError('Dana awal tidak boleh negatif.');
      return;
    }
    const ok = await onSubmit({ name: name.trim(), target: targetNum, saved: savedNum });
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form ref={modalRef} className="modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="goal-modal-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Kantong tabungan</span>
            <h2 id="goal-modal-title">Buat target baru</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <label>
          Nama target
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama tujuan tabungan"
            autoFocus
          />
        </label>
        <div className="form-grid">
          <label>
            Target dana (IDR)
            <input
              required
              min="1"
              step="1"
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            Dana terkumpul awal
            <input
              min="0"
              step="1"
              type="number"
              value={saved}
              onChange={(e) => setSaved(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Buat target'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function GoalContributeModal({ goal, onClose, onSubmit, saving = false }) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, saving);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const remaining = Math.max(0, goal.target - goal.saved);
  const presets = [250000, 500000, 1000000, ...(remaining > 0 ? [remaining] : [])];

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const amountNum = Math.round(Number(amount));
    if (!Number.isSafeInteger(amountNum) || amountNum <= 0) {
      setError('Nominal setoran harus lebih dari 0.');
      return;
    }
    const ok = await onSubmit(amountNum);
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form ref={modalRef} className="modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="fund-modal-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Tambah dana target</span>
            <h2 id="fund-modal-title">{goal.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="goal-modal-summary">
          <div>
            <span>Terkumpul</span>
            <strong>{formatMoney(goal.saved)}</strong>
          </div>
          <div>
            <span>Sisa target</span>
            <strong>{formatMoney(remaining)}</strong>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <label>
          Nominal tambahan (IDR)
          <input
            required
            min="1"
            step="1"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </label>
        <div className="chip-row">
          {presets.map((val, idx) => (
            <button
              key={`${val}-${idx}`}
              type="button"
              className="quick-chip"
              onClick={() => setAmount(String(val))}
            >
              {idx === 3 && remaining > 0 ? `Lunasi (${formatMoney(val, true)})` : `+${formatMoney(val, true)}`}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Tambah dana'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AccountModal({ onClose, onSubmit, saving = false }) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, saving);
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const balanceNum = Math.round(Number(openingBalance || 0));
    if (!Number.isSafeInteger(balanceNum)) {
      setError('Saldo awal harus berupa angka bulat.');
      return;
    }
    const ok = await onSubmit({ name: name.trim(), type, opening_balance: balanceNum });
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form ref={modalRef} className="modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="acc-modal-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Dompet dan rekening</span>
            <h2 id="acc-modal-title">Tambah akun baru</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <label>
          Nama akun
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama rekening atau dompet"
            autoFocus
          />
        </label>
        <div className="form-grid">
          <label>
            Jenis akun
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="bank">Rekening Bank</option>
              <option value="e-wallet">E-Wallet</option>
              <option value="cash">Tunai</option>
            </select>
          </label>
          <label>
            Saldo awal (IDR)
            <input
              step="1"
              type="number"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan akun'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProfileModal({ profile, theme, onSelectTheme, onClose, onSubmit, saving = false }) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, saving);
  const [name, setName] = useState(profile?.name || '');
  const [savingsTarget, setSavingsTarget] = useState(String(profile?.savingsTarget || 20));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const targetNum = Math.round(Number(savingsTarget));
    if (!name.trim()) {
      setError('Nama tampilan tidak boleh kosong.');
      return;
    }
    if (!Number.isInteger(targetNum) || targetNum < 1 || targetNum > 95) {
      setError('Target rasio tabungan harus antara 1% hingga 95%.');
      return;
    }
    const ok = await onSubmit({ name: name.trim(), savingsTarget: targetNum });
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form ref={modalRef} className="modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Pengaturan</span>
            <h2 id="profile-modal-title">Profil &amp; Tampilan</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <label>
          Nama tampilan
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama tampilan"
          />
        </label>
        <label>
          Target rasio tabungan bulanan (%)
          <input
            required
            min="1"
            max="95"
            step="1"
            type="number"
            value={savingsTarget}
            onChange={(e) => setSavingsTarget(e.target.value)}
            placeholder="20"
          />
        </label>
        <div className="theme-section">
          <span className="theme-section-label">Tema tampilan</span>
          <div className="theme-grid">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`theme-option ${theme === item.id ? 'active' : ''}`}
                aria-pressed={theme === item.id}
                onClick={() => onSelectTheme(item.id)}
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
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan pengaturan'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConfirmModal({
  title,
  message,
  detail,
  confirmLabel = 'Ya, hapus',
  onClose,
  onConfirm,
  busy = false,
}) {
  const modalRef = useRef(null);
  useModalA11y(modalRef, onClose, busy);

  useEffect(() => {
    modalRef.current?.querySelector('button.secondary-button')?.focus();
  }, []);

  async function handleConfirm() {
    const ok = await onConfirm();
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={modalRef} className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="confirm-head">
          <span className="confirm-icon" aria-hidden="true">
            <AlertTriangle size={20} />
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <h2 id="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        {detail && <div className="confirm-detail">{detail}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className="danger-button" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Menghapus...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
