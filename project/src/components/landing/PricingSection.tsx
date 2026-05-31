import { Check } from 'lucide-react';

type PricingSectionProps = {
  onStart?: () => void;
};

export default function PricingSection({ onStart }: PricingSectionProps) {
  const features = [
    'إدارة المنتجات',
    'إدارة المخزون',
    'إدارة الطلبات',
    'إدارة المستخدمين',
    'التقارير',
    'الدعم الفني',
    'بدون رسوم تأسيس',
    'بدون بطاقة ائتمانية',
  ];

  return (
    <section id="pricing" className="py-24 px-4 bg-slate-950">
      <div className="max-w-7xl mx-auto text-center">
        <div className="mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">عرض الإطلاق</h2>
          <p className="text-blue-400 text-2xl font-bold">3 أشهر مجانية بالكامل</p>
        </div>
        
        <div className="max-w-xl mx-auto">
          <div className="p-8 md:p-12 rounded-[2.5rem] border border-blue-500/30 bg-blue-500/5 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-6 py-1.5 rounded-bl-2xl uppercase tracking-widest">
              Limited Time
            </div>
            
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 text-right">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-slate-300">
                  <Check size={18} className="text-blue-500 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button 
              onClick={() => onStart?.()}
              className="w-full py-5 rounded-2xl font-black text-xl bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20"
            >
              ابدأ مجاناً
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}