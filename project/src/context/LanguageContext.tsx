import { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'ar';

type LanguageContextType = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (en: string, ar: string) => string;
  isRTL: boolean;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

// ══════════════════════════════════════════════════════════════════════
// إعادة تسمية "محل/محلات" -> "فرع/فروع"  و  "Shop/Shops" -> "Branch/Branches"
// تُطبَّق مركزيًا على كل نص يمرّ عبر t()، فتغطّي التطبيق كله من مكان واحد.
// - الإنجليزية: استبدال بحدود الكلمات (لا يمسّ workshop..).
// - العربية: الجمع (محلات/المحلات) آمن عالميًا؛ أما المفرد (محل/المحل)
//   فيُستبدل فقط حين يكون النص متعلقًا بالمحلات (الإنجليزية فيها shop/store/branch)
//   حتى لا نلمس كلمات مثل "المخزون المحلي" (local).
// ══════════════════════════════════════════════════════════════════════
function renameShopToBranch(en: string, ar: string): { en: string; ar: string } {
  const outEn = String(en)
    .replace(/\bShops\b/g, 'Branches')
    .replace(/\bShop\b/g, 'Branch')
    .replace(/\bStores\b/g, 'Branches')
    .replace(/\bStore\b/g, 'Branch')
    .replace(/\bshops\b/g, 'branches')
    .replace(/\bshop\b/g, 'branch');

  let outAr = String(ar)
    .replace(/المحلات/g, 'الفروع')
    .replace(/محلات/g, 'فروع');

  if (/shop|store|branch/i.test(en)) {
    outAr = outAr.replace(/المحل/g, 'الفرع').replace(/محل/g, 'فرع');
  }

  return { en: outEn, ar: outAr };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('ar');

  const t = (en: string, ar: string) => {
    const r = renameShopToBranch(en, ar);
    return lang === 'ar' ? r.ar : r.en;
  };
  const isRTL = lang === 'ar';

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      <div dir={isRTL ? 'rtl' : 'ltr'} className={isRTL ? 'font-arabic' : ''}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}
