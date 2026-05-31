import { Truck } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="bg-slate-950 border-t border-slate-900 pt-20 pb-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-blue-600 p-1.5 rounded-lg">
                <Truck size={20} className="text-white" />
              </div>
              <span className="text-white font-bold text-xl uppercase">مِحور</span>
            </div>
            <p className="text-slate-500 max-w-sm leading-relaxed">
              منصة ذكية لإدارة المخزون والطلبات بين محلات قطع الغيار.
            </p>
          </div>
          
          <div>
            <h4 className="text-white font-bold mb-6">روابط سريعة</h4>
            <ul className="space-y-4 text-slate-500 text-sm">
              <li><a href="#features" className="hover:text-blue-400 transition-colors">المميزات</a></li>
              <li><a href="#pricing" className="hover:text-blue-400 transition-colors">الأسعار</a></li>
              <li><a href="#faq" className="hover:text-blue-400 transition-colors">الأسئلة الشائعة</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6">القانونية</h4>
            <ul className="space-y-4 text-slate-500 text-sm">
              <li><a href="#" className="hover:text-blue-400 transition-colors">سياسة الخصوصية</a></li>
              <li><a href="#" className="hover:text-blue-400 transition-colors">شروط الخدمة</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-slate-900 text-center text-slate-600 text-sm">
          <p>© {new Date().getFullYear()} MIHWAR | مِحور. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
}