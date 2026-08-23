// ThemeToggle.tsx
// زر تبديل الثيم بثلاثة أشكال — اختر الشكل عبر خاصية variant.
//   <ThemeToggle />                 → الافتراضي "segmented"
//   <ThemeToggle variant="icon" />  → زر دائري بأيقونة
//   <ThemeToggle variant="switch"/> → مفتاح منزلق
// كلها تعمل فعليًا وتبدّل ثيم اللوحة بالكامل عبر useTheme().

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

type Variant = 'segmented' | 'icon' | 'switch';

export function ThemeToggle({
  variant = 'segmented',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  const { theme, toggleTheme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  // ── الشكل 1: قطعتان (فاتح | داكن) — يشبه زر English عندك ──
  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex items-center gap-1 p-1 rounded-2xl border border-slate-800 bg-slate-900 ${className}`}
        role="group"
        aria-label="تبديل الثيم"
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            !isDark ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-pressed={!isDark}
        >
          <Sun size={14} /> فاتح
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            isDark ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-pressed={isDark}
        >
          <Moon size={14} /> داكن
        </button>
      </div>
    );
  }

  // ── الشكل 2: زر دائري بأيقونة واحدة ──
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
        aria-label="تبديل الثيم"
        className={`relative w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-all flex items-center justify-center active:scale-95 ${className}`}
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} className="text-amber-500" />}
      </button>
    );
  }

  // ── الشكل 3: مفتاح منزلق ──
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title="تبديل الثيم"
      aria-label="تبديل الثيم"
      aria-pressed={isDark}
      className={`relative w-16 h-9 rounded-full border transition-colors flex items-center px-1 ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-blue-100 border-blue-200'
      } ${className}`}
    >
      {/* المقبض المنزلق — RTL: داكن على اليمين، فاتح على الشمال */}
      <span
        className={`absolute top-1 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center transition-all duration-300 ${
          isDark ? 'right-1' : 'right-8'
        }`}
      >
        {isDark ? <Moon size={15} className="text-slate-700" /> : <Sun size={15} className="text-amber-500" />}
      </span>
    </button>
  );
}
