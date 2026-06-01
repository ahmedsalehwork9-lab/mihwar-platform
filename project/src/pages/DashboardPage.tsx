// ... (Imports and Types remain unchanged)

export default function DashboardPage() {
  // ... (Logic remains unchanged)

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-3 md:space-y-4 p-3 md:p-6 text-white">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-3 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 md:gap-4">

          {/* Greeting */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Store size={18} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white leading-tight">
                {isArabic ? 'مرحباً،' : 'Welcome,'}{' '}
                <span className="text-blue-400">{shop?.shop_name || user?.email?.split('@')[0]}</span>
              </h1>
              <p className="text-slate-500 text-[10px] md:text-xs mt-0.5">
                {isArabic ? 'أداء متجرك اليوم' : "Today's store performance"}
              </p>
            </div>
          </div>

          {/* Account info pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: <User size={12} />, label: user?.email?.split('@')[0], color: 'text-blue-400' },
              { icon: <Mail size={12} />, label: user?.email, color: 'text-purple-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-lg px-2 py-1 md:px-3 md:py-1.5">
                <span className={item.color}>{item.icon}</span>
                <span className="text-slate-300 text-[10px] md:text-xs font-medium truncate max-w-[120px] md:max-w-[160px]">{item.label}</span>
              </div>
            ))}
            <button
              onClick={loadDashboard}
              className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 hover:border-slate-500 rounded-lg px-2 py-1 md:px-3 md:py-1.5 transition-colors"
            >
              <RefreshCw size={11} className="text-slate-400" />
              <span className="text-slate-400 text-[10px] md:text-xs">{isArabic ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── STATS CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">

        {[
          {
            icon: <Package size={14} className="text-blue-400" />,
            bg: 'bg-blue-500/10 border-blue-500/20',
            value: stats.totalProducts,
            label: isArabic ? 'المنتجات' : 'Products',
            sub: isArabic ? 'إجمالي الأصناف' : 'Total SKUs',
            badge: '↑ 12%',
            badgeColor: 'text-emerald-400 bg-emerald-500/10',
          },
          {
            icon: <Boxes size={14} className="text-emerald-400" />,
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            value: stats.totalInventory.toLocaleString(),
            label: isArabic ? 'الوحدات' : 'Units',
            sub: isArabic ? 'إجمالي الكميات' : 'Total quantities',
            badge: '↑ 8%',
            badgeColor: 'text-emerald-400 bg-emerald-500/10',
          },
          {
            icon: <DollarSign size={14} className="text-amber-400" />,
            bg: 'bg-amber-500/10 border-amber-500/20',
            value: stats.totalValue.toLocaleString(),
            label: isArabic ? 'القيمة' : 'Value',
            sub: isArabic ? 'ريال سعودي' : 'SAR',
            badge: '↑ 15%',
            badgeColor: 'text-emerald-400 bg-emerald-500/10',
          },
          {
            icon: <ShieldAlert size={14} className="text-red-400" />,
            bg: 'bg-red-500/10 border-red-500/20',
            value: stats.lowStock,
            label: isArabic ? 'تنبيهات' : 'Alerts',
            sub: isArabic ? 'تحتاج تجديد' : 'Restock',
            badge: stats.lowStock > 0 ? `${stats.lowStock}` : '✓',
            badgeColor: stats.lowStock > 0 ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10',
          },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col gap-2 md:gap-3">
            <div className="flex items-center justify-between">
              <div className={`p-1.5 rounded-lg border ${card.bg}`}>{card.icon}</div>
              <span className={`text-[9px] md:text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${card.badgeColor}`}>
                {card.badge}
              </span>
            </div>
            <div>
              <div className="text-xl md:text-2xl font-black text-white leading-none">{card.value}</div>
              <div className="text-slate-400 text-[10px] md:text-xs mt-1">{card.label}</div>
              <div className="text-slate-600 text-[9px] md:text-[10px] mt-0.5">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CHARTS ROW ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">

        {/* Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Activity size={12} className="text-blue-400" />
            </div>
            <h2 className="font-semibold text-white text-xs md:text-sm">
              {isArabic ? 'حركة المخزون الأسبوعية' : 'Weekly Stock Movement'}
            </h2>
          </div>

          <div className="flex items-end gap-1.5 h-32 md:h-36">
            {['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'].map((day, i) => {
              const inventory = [180, 220, 160, 200, 240, 190, 210][i];
              const sales = [80, 120, 60, 140, 100, 90, 130][i];
              const maxVal = 300;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-px h-24 md:h-28">
                    <div
                      className="flex-1 bg-blue-500/50 hover:bg-blue-500 rounded-t transition-all"
                      style={{ height: `${(inventory / maxVal) * 100}%` }}
                    />
                    <div
                      className="flex-1 bg-emerald-500/50 hover:bg-emerald-500 rounded-t transition-all"
                      style={{ height: `${(sales / maxVal) * 100}%` }}
                    />
                  </div>
                  <div className="text-slate-600 text-[8px] md:text-[9px] text-center leading-none">{day.slice(0, 3)}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-2 md:mt-3 pt-2 md:pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-blue-500/50" />
              <span className="text-slate-500 text-[10px] md:text-xs">{isArabic ? 'وارد' : 'In'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-emerald-500/50" />
              <span className="text-slate-500 text-[10px] md:text-xs">{isArabic ? 'مبيعات' : 'Sales'}</span>
            </div>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <TrendingUp size={12} className="text-purple-400" />
            </div>
            <h2 className="font-semibold text-white text-xs md:text-sm">
              {isArabic ? 'توزيع الفئات' : 'By Brand'}
            </h2>
          </div>

          {topBrands.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-slate-600 text-xs">
              {isArabic ? 'لا توجد بيانات' : 'No data'}
            </div>
          ) : (
            <div className="flex items-center gap-4 md:gap-5">
              <div className="relative shrink-0 scale-90 md:scale-100">
                <svg width="100" height="100" viewBox="0 0 120 120" className="md:w-[120px] md:h-[120px]">
                  {/* (SVG logic remains identical) */}
                  {(() => {
                    let offset = 0;
                    const r = 44, cx = 60, cy = 60;
                    const circ = 2 * Math.PI * r;
                    return topBrands.map(([brand, count], i) => {
                      const pct = count / totalBrands;
                      const dash = pct * circ;
                      const gap = circ - dash;
                      const el = (
                        <circle
                          key={brand}
                          cx={cx} cy={cy} r={r}
                          fill="none"
                          stroke={brandColors[i]}
                          strokeWidth="18"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset}
                          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
                        />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-lg md:text-xl font-black text-white">{stats.totalProducts}</div>
                  <div className="text-slate-500 text-[8px] md:text-[10px]">{isArabic ? 'صنف' : 'items'}</div>
                </div>
              </div>

              <div className="space-y-1.5 md:space-y-2 flex-1 min-w-0">
                {topBrands.map(([brand, count], i) => (
                  <div key={brand} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: brandColors[i] }} />
                      <span className="text-slate-400 text-[10px] md:text-xs truncate">{brand}</span>
                    </div>
                    <span className="text-white text-[10px] md:text-xs font-bold shrink-0">
                      {Math.round((count / totalBrands) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM ROW ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">

        {/* Low Stock */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={12} className="text-amber-400" />
            </div>
            <h2 className="font-semibold text-white text-xs md:text-sm">
              {isArabic ? 'نقص المخزون' : 'Low Stock'}
            </h2>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-slate-600 text-xs">
              ✅ {isArabic ? 'المخزون جيد' : 'Stock OK'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {lowStockProducts.map(p => (
                <div key={p.id} className="grid grid-cols-4 items-center gap-1 border-b border-slate-800/50 pb-1.5 last:border-0 last:pb-0">
                  <div className="col-span-2 text-white text-[11px] md:text-xs truncate">{p.part_name}</div>
                  <div className="text-center font-bold text-xs text-white">{p.quantity}</div>
                  <div className="flex justify-end">
                    {p.quantity === 0 ? (
                      <span className="text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        {isArabic ? 'نفد' : 'Out'}
                      </span>
                    ) : (
                      <span className="text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {isArabic ? 'منخفض' : 'Low'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Added */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Activity size={12} className="text-blue-400" />
            </div>
            <h2 className="font-semibold text-white text-xs md:text-sm">
              {isArabic ? 'أضيف حديثاً' : 'Recently Added'}
            </h2>
          </div>

          {products.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-slate-600 text-xs">
              {isArabic ? 'لا توجد منتجات' : 'No products'}
            </div>
          ) : (
            <div className="space-y-2">
              {products.slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 md:gap-3">
                  <div
                    className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: brandColors[i % 5] + '18', color: brandColors[i % 5] }}
                  >
                    {p.brand?.charAt(0) || 'P'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[11px] md:text-xs font-medium truncate">{p.part_name}</div>
                    <div className="text-slate-600 text-[8px] md:text-[10px] font-mono leading-none">{p.part_number}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-emerald-400 text-[11px] md:text-xs font-bold leading-none">
                      {p.price} <span className="text-[8px] font-normal">{isArabic ? 'ر.س' : 'SAR'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}