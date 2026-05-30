export default function ReportsPage() {
    return (
      <div className="space-y-6">
  
        <div>
          <h1 className="text-3xl font-bold text-white">
            التقارير
          </h1>
          <p className="text-slate-400 mt-2">
            ملخص أداء المحل والمخزون
          </p>
        </div>
  
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
  
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm">
              إجمالي المنتجات
            </p>
  
            <h2 className="text-3xl font-bold text-white mt-3">
              101
            </h2>
          </div>
  
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm">
              إجمالي الكمية
            </p>
  
            <h2 className="text-3xl font-bold text-white mt-3">
              419
            </h2>
          </div>
  
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm">
              قيمة المخزون
            </p>
  
            <h2 className="text-3xl font-bold text-green-400 mt-3">
              58,956 ر.س
            </h2>
          </div>
  
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-400 text-sm">
              منخفض المخزون
            </p>
  
            <h2 className="text-3xl font-bold text-yellow-400 mt-3">
              74
            </h2>
          </div>
  
        </div>
  
        {/* Tables */}
  
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
  
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
  
            <h3 className="text-xl font-bold text-white mb-4">
              أكثر المنتجات حركة
            </h3>
  
            <table className="w-full">
  
              <thead>
                <tr className="text-slate-400 text-right border-b border-slate-800">
                  <th className="pb-3">المنتج</th>
                  <th className="pb-3">الحركات</th>
                </tr>
              </thead>
  
              <tbody>
  
                <tr className="border-b border-slate-800">
                  <td className="py-3 text-white">
                    فلتر زيت
                  </td>
  
                  <td className="py-3 text-blue-400">
                    35
                  </td>
                </tr>
  
                <tr className="border-b border-slate-800">
                  <td className="py-3 text-white">
                    بوجيه
                  </td>
  
                  <td className="py-3 text-blue-400">
                    22
                  </td>
                </tr>
  
                <tr>
                  <td className="py-3 text-white">
                    سير مكينة
                  </td>
  
                  <td className="py-3 text-blue-400">
                    18
                  </td>
                </tr>
  
              </tbody>
  
            </table>
  
          </div>
  
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
  
            <h3 className="text-xl font-bold text-white mb-4">
              منتجات تحتاج إعادة طلب
            </h3>
  
            <div className="space-y-4">
  
              <div className="bg-slate-950 rounded-xl p-4">
                <p className="text-white">
                  فلتر هواء لوري
                </p>
  
                <p className="text-red-400 text-sm">
                  الكمية: 0
                </p>
              </div>
  
              <div className="bg-slate-950 rounded-xl p-4">
                <p className="text-white">
                  فحمة كلتش
                </p>
  
                <p className="text-yellow-400 text-sm">
                  الكمية: 1
                </p>
              </div>
  
            </div>
  
          </div>
  
        </div>
  
      </div>
    );
  }