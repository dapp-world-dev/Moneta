import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, formatMoney, todayIso } from '../utils';

export function TransactionModal({ onClose, onSubmit, accounts, initial = null, saving = false }) {
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

  function handleChange(event) {
    const { name, value } = event.target;
    if (name === 'type') {
      const nextCategories = value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      setForm((prev) => ({
        ...prev,
        type: value,
        category: nextCategories.includes(prev.category) ? prev.category : nextCategories[0],
      }));
      return;
    }
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isEdit ? 'Ubah transaksi' : 'Arus kas'}</span>
            <h2>{isEdit ? 'Edit transaksi' : 'Tambah transaksi'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <label>
          Judul transaksi
          <input
            required
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="cth. Makan siang tim"
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
              placeholder="250000"
            />
          </label>
          <label>
            Tipe
            <select name="type" value={form.type} onChange={handleChange}>
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </select>
          </label>
          <label>
            Kategori
            <select name="category" value={form.category} onChange={handleChange}>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          <label>
            Tanggal
            <input required type="date" name="date" value={form.date} onChange={handleChange} />
          </label>
        </div>
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
          Catatan <span className="optional">opsional</span>
          <textarea
            name="note"
            value={form.note}
            onChange={handleChange}
            rows="2"
            placeholder="Tambahkan konteks singkat..."
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : isEdit ? 'Simpan perubahan' : 'Simpan transaksi'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BudgetModal({ onClose, onSubmit, existingCategories = [], initial = null, saving = false }) {
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Anggaran bulanan</span>
            <h2>{isEdit ? `Ubah batas ${initial.category}` : 'Tambah anggaran'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
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
          Batas bulanan (IDR)
          <input
            required
            min="1"
            step="1"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2000000"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan anggaran'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function GoalModal({ onClose, onSubmit, saving = false }) {
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Target tabungan</span>
            <h2>Buat target baru</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <label>
          Nama target
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Laptop baru, Dana darurat"
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
              placeholder="15000000"
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
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Buat target'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function GoalContributeModal({ goal, onClose, onSubmit, saving = false }) {
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Tambah dana target</span>
            <h2>{goal.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
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
        {error && <div className="form-error">{error}</div>}
        <label>
          Nominal tambahan (IDR)
          <input
            required
            min="1"
            step="1"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500000"
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
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Tambah dana'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AccountModal({ onClose, onSubmit, saving = false }) {
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Dompet & rekening</span>
            <h2>Tambah akun baru</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <label>
          Nama akun
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Mandiri, OVO, Dompet Utama"
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
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan akun'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProfileModal({ profile, onClose, onSubmit, saving = false }) {
  const [name, setName] = useState(profile?.name || 'Daffa');
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Pengaturan</span>
            <h2>Profil &amp; Target Tabungan</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <label>
          Nama tampilan
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama kamu"
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
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Batal</button>
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
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);

  async function handleConfirm() {
    const ok = await onConfirm();
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="confirm-head">
          <span className="confirm-icon">
            <AlertTriangle size={20} />
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup"
          >
            <X size={18} />
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
