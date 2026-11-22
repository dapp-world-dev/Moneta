import React from 'react';
import {
  ArrowLeftRight, Banknote, Briefcase, Building2, Car, Clapperboard,
  Gift, HeartPulse, Laptop, Receipt, ShoppingBag, Smartphone, Tag,
  TrendingUp, Utensils,
} from 'lucide-react';

const ICON_MAP = {
  Makanan: { Icon: Utensils, tone: 'amber' },
  Food: { Icon: Utensils, tone: 'amber' },
  Transportasi: { Icon: Car, tone: 'blue' },
  Transport: { Icon: Car, tone: 'blue' },
  Tagihan: { Icon: Receipt, tone: 'slate' },
  Bills: { Icon: Receipt, tone: 'slate' },
  Hiburan: { Icon: Clapperboard, tone: 'violet' },
  Entertainment: { Icon: Clapperboard, tone: 'violet' },
  Belanja: { Icon: ShoppingBag, tone: 'rose' },
  Shopping: { Icon: ShoppingBag, tone: 'rose' },
  Kesehatan: { Icon: HeartPulse, tone: 'teal' },
  Gaji: { Icon: Briefcase, tone: 'green' },
  Salary: { Icon: Briefcase, tone: 'green' },
  Freelance: { Icon: Laptop, tone: 'green' },
  Investasi: { Icon: TrendingUp, tone: 'teal' },
  Bonus: { Icon: Gift, tone: 'green' },
  Transfer: { Icon: ArrowLeftRight, tone: 'blue' },
  Lainnya: { Icon: Tag, tone: 'slate' },
};

export function CategoryIcon({ category, type, size = 16, className = '' }) {
  const entry = ICON_MAP[category] || { Icon: Tag, tone: 'slate' };
  const Icon = entry.Icon;
  const tone = type === 'income' ? 'green' : entry.tone;
  return (
    <span className={`cat-disc tone-${tone} ${className}`} aria-hidden="true">
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

export function AccountIcon({ type, size = 16, className = '' }) {
  const norm = type === 'e-wallet' || type === 'ewallet' ? 'ewallet' : type;
  const Icon = norm === 'bank' ? Building2 : norm === 'ewallet' ? Smartphone : Banknote;
  return (
    <span className={`account-disc type-${norm} ${className}`} aria-hidden="true">
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
