export default function AlertsPage() {
    return (
      <div className="space-y-6">
  
        <div>
          <h1 className="text-3xl font-bold text-white">
            التنبيهات
          </h1>
  
          <p className="text-slate-400 mt-2">
            متابعة المخزون والطلبات المهمة
          </p>
        </div>
  
        {/* نفد المخزون */}
        <div className="bg-slate-900 border border-red-500/20 rounded-2xl p-6">
  
          <h2 className="text-red-400 font-bold text-xl mb-4">
            🚨 منتجات نفد مخزونها
          </h2>
  
          <div className="space-y-3">
  
            <div className="bg-slate-950 rounded-xl p-4">
              <div className="text-white">
                SR فلتر هواء لوري
              </div>
  
              <div className="text-red-400 text-sm mt-1">
                الكمية الحالية: 0
              </div>
            </div>
  
          </div>
  
        </div>
  
        {/* منخفض المخزون */}
        <div className="bg-slate-900 border border-yellow-500/20 rounded-2xl p-6">
  
          <h2 className="text-yellow-400 font-bold text-xl mb-4">
            ⚠ منتجات منخفضة المخزون
          </h2>
  
          <div className="space-y-3">
  
            <div className="bg-slate-950 rounded-xl p-4">
              <div className="text-white">
                فحمة كلتش
              </div>
  
              <div className="text-yellow-400 text-sm mt-1">
                الكمية الحالية: 1
              </div>
            </div>
  
            <div className="bg-slate-950 rounded-xl p-4">
              <div className="text-white">
                سير مكينة
              </div>
  
              <div className="text-yellow-400 text-sm mt-1">
                الكمية الحالية: 2
              </div>
            </div>
  
          </div>
  
        </div>
  
        {/* الطلبات */}
        <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6">
  
          <h2 className="text-blue-400 font-bold text-xl mb-4">
            📦 طلبات تحتاج متابعة
          </h2>
  
          <div className="space-y-3">
  
            <div className="bg-slate-950 rounded-xl p-4 flex justify-between">
  
              <span className="text-white">
                طلب #0036
              </span>
  
              <span className="text-yellow-400">
                معلق
              </span>
  
            </div>
  
            <div className="bg-slate-950 rounded-xl p-4 flex justify-between">
  
              <span className="text-white">
                طلب #0035
              </span>
  
              <span className="text-yellow-400">
                معلق
              </span>
  
            </div>
  
          </div>
  
        </div>
  
      </div>
    );
  }