const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const EXPENSE_CATEGORIES = [
  'Makanan',
  'Transportasi',
  'Tagihan',
  'Hiburan',
  'Belanja',
  'Kesehatan',
  'Lainnya',
];

export const INCOME_CATEGORIES = [
  'Gaji',
  'Freelance',
  'Investasi',
  'Bonus',
  'Lainnya',
];

export const CATEGORY_COLORS = [
  '#84cc16',
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#10b981',
  '#f97316',
  '#64748b',
];

export const PERIOD_PRESETS = [
  { id: 'this_month', label: 'Bulan ini' },
  { id: 'last_month', label: 'Bulan lalu' },
  { id: 'last_30d', label: '30 hari terakhir' },
  { id: 'last_90d', label: '3 bulan terakhir' },
  { id: 'this_year', label: 'Tahun ini' },
];

export const THEMES = [
  { id: 'modern', name: 'Modern', desc: 'Terang & aksen limau', swatches: ['#ffffff', '#f3f4f2', '#c8f35b'] },
  { id: 'dark', name: 'Dark', desc: 'Mode gelap tenang', swatches: ['#111317', '#181b21', '#2563eb'] },
  { id: 'cool', name: 'Cool', desc: 'Biru modern & segar', swatches: ['#ffffff', '#f1f5f9', '#0075eb'] },
  { id: 'calm', name: 'Calm', desc: 'Hijau sage & hangat', swatches: ['#fffdf9', '#f5f2eb', '#2f855a'] },
  { id: 'cute', name: 'Cute', desc: 'Nuansa pink lembut', swatches: ['#ffffff', '#fdf2f6', '#ec4899'] },
  { id: 'lavender', name: 'Lavender', desc: 'Ungu pastel elegan', swatches: ['#ffffff', '#f5f3ff', '#7c3aed'] },
];

export function formatMoney(value, short = false, signed = false) {
  const num = Number(value) || 0;
  const prefix = num < 0 ? '-' : signed && num > 0 ? '+' : '';
  const body = short ? `Rp ${compact.format(Math.abs(num))}` : IDR.format(Math.abs(num));
  return `${prefix}${body}`;
}

export function monthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

export function shortMonthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID', {
    month: 'short',
  });
}

export function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso() {
  return toIsoDate(new Date());
}

export function relativeDateHeading(isoDate) {
  const now = new Date();
  const today = toIsoDate(now);
  const yesterday = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (isoDate === today) return 'Hari ini';
  if (isoDate === yesterday) return 'Kemarin';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function groupTransactionsByDate(transactions) {
  const map = new Map();
  for (const item of transactions) {
    if (!map.has(item.date)) {
      map.set(item.date, {
        date: item.date,
        label: relativeDateHeading(item.date),
        items: [],
        dailyNet: 0,
      });
    }
    const group = map.get(item.date);
    group.items.push(item);
    group.dailyNet += item.type === 'income' ? item.amount : -item.amount;
  }
  return Array.from(map.values());
}

export function monthRangeFor(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

export function currentMonthRange() {
  const now = new Date();
  return monthRangeFor(now.getFullYear(), now.getMonth());
}

export function presetRange(presetId) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (presetId === 'this_month') return monthRangeFor(y, m);
  if (presetId === 'last_month') return monthRangeFor(y, m - 1);
  if (presetId === 'last_30d') {
    return { from: toIsoDate(new Date(y, m, d - 29)), to: toIsoDate(now) };
  }
  if (presetId === 'last_90d') {
    return { from: toIsoDate(new Date(y, m - 2, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
  }
  if (presetId === 'this_year') {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return currentMonthRange();
}

export function detectPreset(range) {
  for (const preset of PERIOD_PRESETS) {
    const candidate = presetRange(preset.id);
    if (candidate.from === range.from && candidate.to === range.to) {
      return preset.id;
    }
  }
  return 'custom';
}

export function rangeLabel(from, to) {
  if (!from || !to) return '';
  if (from === to) return formatDate(from);
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const lastDayOfFromMonth = new Date(fy, fm, 0).getDate();
  if (fy === ty && fm === tm && fd === 1 && td === lastDayOfFromMonth) {
    return monthLabel(`${fy}-${String(fm).padStart(2, '0')}`);
  }
  if (fy === ty && fm === tm) {
    return `${fd} - ${formatDate(to)}`;
  }
  if (fy === ty) {
    return `${formatShortDate(from)} - ${formatDate(to)}`;
  }
  return `${formatDate(from)} - ${formatDate(to)}`;
}

export function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function accountTypeLabel(type) {
  if (type === 'bank') return 'Rekening Bank';
  if (type === 'e-wallet' || type === 'ewallet') return 'E-Wallet';
  return 'Tunai';
}

export function normalizeAccountType(type) {
  if (type === 'e-wallet' || type === 'ewallet') return 'ewallet';
  return type;
}

export function buildRangeChartData(transactions, from, to) {
  const startMs = Date.parse(`${from}T00:00:00Z`);
  const endMs = Date.parse(`${to}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
  const steps = Math.min(totalDays, 6);

  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const ratio = steps === 1 ? 1 : i / (steps - 1);
    const pointMs = startMs + Math.round(ratio * (endMs - startMs));
    const cutoff = new Date(pointMs).toISOString().slice(0, 10);
    const items = transactions.filter((item) => item.date <= cutoff);
    points.push({
      label: formatShortDate(cutoff),
      in: items.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0),
      out: items.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0),
    });
  }
  return points;
}

export function exportTransactionsCsv(transactions, periodLabel) {
  const headers = ['Tanggal', 'Judul', 'Tipe', 'Kategori', 'Akun', 'Nominal (IDR)', 'Catatan'];
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const rows = transactions.map((item) => [
    item.date,
    item.title,
    item.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    item.category,
    item.account_name || item.account_id,
    item.type === 'income' ? item.amount : -item.amount,
    item.note || '',
  ].map(escape).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `moneta-laporan-${periodLabel}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
