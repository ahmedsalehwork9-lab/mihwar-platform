import { Truck } from 'lucide-react';

type LandingNavProps = {
  onLogin?: () => void;
};

export default function LandingNav({ onLogin }: LandingNavProps) {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0A1220]/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Truck size={20} className="text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">مِحور</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-blue-400 transition-colors">المميزات</a>
          <a href="#how-it-works" className="hover:text-blue-400 transition-colors">كيف يعمل</a>
          <a href="#pricing" className="hover:text-blue-400 transition-colors">الأسعار</a>
        </div>

        <button 
          onClick={() => onLogin?.()}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
        >
          تسجيل الدخول
        </button>
      </div>
    </nav>
  );
}