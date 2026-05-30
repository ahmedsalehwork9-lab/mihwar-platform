import { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'ar';

type LanguageContextType = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (en: string, ar: string) => string;
  isRTL: boolean;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en');

  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
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
