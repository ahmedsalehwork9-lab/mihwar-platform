import { ChevronLeft, Play } from 'lucide-react';

type HeroSectionProps = {
  onStart?: () => void;
  onLogin?: () => void;
};

export default function HeroSection({ onStart }: HeroSectionProps) {
  return (
    <section className="relative pt-32 pb-20 px-4">
      <div className="max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="text-blue-400 text-xs font-bold uppercase tracking-wider">نظام مِحور الجديد 2.0</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">
          شبكة تجارة <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-blue-400 to-indigo-500">قطع الغيار الذكية</span>
        </h1>
        
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          منصة ذكية لإدارة المنتجات والمخزون والطلبات بين محلات قطع الغيار من مكان واحد.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button 
            onClick={() => onStart?.()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-slate-950 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-100 transition-all group"
          >
            ابدأ تجربتك المجانية
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 text-white border border-slate-800 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all">
            <Play size={18} fill="currentColor" />
            شاهد العرض التجريبي
          </button>
        </div>
      </div>
    </section>
  );
}