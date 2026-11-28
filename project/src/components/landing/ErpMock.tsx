// =============================================================
// ErpMock.tsx — واجهات ERP مرسومة بالكود (ليست صورًا) لعرض شكل النظام: لوحة تحكم، فروع، تقارير.
// الأرقام توضيحية فقط وتُعرَض بوسم «بيانات توضيحية».
// =============================================================
import { ReactNode } from "react";
import { LayoutDashboard, ShoppingCart, ShoppingBag, Boxes, Calculator, Building2, BarChart3, Bell, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Wallet, Search } from "lucide-react";
import { useLang } from "../../context/LanguageContext";
import { BrandMark } from "../brand/BrandLogo";

const BLUE = "#007BFF", CYAN = "#00C2FF", GREEN = "#16a34a", AMBER = "#f59e0b";

function spark(vals: number[], w = 80, h = 24): { line: string; area: string } {
  const mx = Math.max(...vals), mn = Math.min(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 2 - ((v - mn) / r) * (h - 4)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w},${h} L0,${h} Z` };
}
function Spark({ vals, color }: { vals: number[]; color: string }) {
  const s = spark(vals);
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true">
      <path d={s.area} fill={color} opacity="0.12" /><path d={s.line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Kpi({ label, value, delta, up, vals, color, icon }: { label: string; value: string; delta: string; up: boolean; vals: number[]; color: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E6E8ED] bg-[#ffffff] p-2.5 sm:p-3">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-[#5b6a8a] sm:text-[11px]"><span>{label}</span><span style={{ color }}>{icon}</span></div>
      <div className="text-base font-black leading-none text-[#0B1F44] sm:text-lg" dir="ltr" style={{ textAlign: "start" }}>{value}</div>
      <div className="mt-2 flex items-end justify-between">
        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${up ? "bg-[#16a34a1a] text-[#15803d]" : "bg-[#e5484d1a] text-[#b42318]"}`} dir="ltr">{up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{delta}</span>
        <Spark vals={vals} color={color} />
      </div>
    </div>
  );
}

export function ErpDashboardMock() {
  const { t } = useLang();
  const nav = [
    { i: <LayoutDashboard size={15} />, l: t("Dashboard", "الرئيسية"), a: true }, { i: <ShoppingCart size={15} />, l: t("Sales", "المبيعات") }, { i: <ShoppingBag size={15} />, l: t("Purchases", "المشتريات") },
    { i: <Boxes size={15} />, l: t("Inventory", "المخزون") }, { i: <Calculator size={15} />, l: t("Accounting", "الحسابات") }, { i: <Building2 size={15} />, l: t("Branches", "الفروع") }, { i: <BarChart3 size={15} />, l: t("Reports", "التقارير") },
  ];
  const sales = [28, 34, 31, 42, 39, 51, 47, 58, 54, 66, 61, 74], buys = [20, 24, 26, 25, 31, 30, 36, 34, 40, 38, 44, 47];
  const area = spark(sales, 300, 100), line2 = spark(buys, 300, 100);
  const rows = [
    { n: "INV-1042", c: t("Al Noor Trading", "مؤسسة النور التجارية"), v: "12,450.00", s: t("Paid", "مدفوعة"), ok: true },
    { n: "INV-1041", c: t("Gulf Parts Co.", "شركة الخليج للقطع"), v: "8,900.00", s: t("Partial", "جزئي"), ok: false },
    { n: "INV-1040", c: t("Riyadh Garage", "ورشة الرياض"), v: "3,275.50", s: t("Paid", "مدفوعة"), ok: true },
  ];
  return (
    <div className="relative" data-testid="erp-mock">
      <div className="overflow-hidden rounded-2xl border border-[#ffffff30] bg-[#F4F6FA] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex min-h-[360px]">
          <aside className="hidden w-[132px] shrink-0 flex-col bg-[#0B1F44] p-2.5 sm:flex">
            <div className="mb-3 flex items-center gap-1.5 px-1 pt-1"><BrandMark size={22} onDark /><span className="text-[10px] font-black leading-tight text-[#ffffff]">MIHWAR<br /><span className="text-[#00C2FF]">CLOUD ERP</span></span></div>
            <ul className="space-y-0.5">
              {nav.map((n) => (
                <li key={n.l} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${n.a ? "bg-[#007BFF] text-[#ffffff]" : "text-[#9fb2d6]"}`}>{n.i}<span className="truncate">{n.l}</span></li>
              ))}
            </ul>
          </aside>
          <div className="min-w-0 flex-1 p-2.5 sm:p-3.5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><div className="text-sm font-black text-[#0B1F44]">{t("Control panel", "لوحة التحكم")}</div><div className="text-[10px] text-[#5b6a8a]">{t("Main branch · This month", "الفرع الرئيسي · هذا الشهر")}</div></div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1 rounded-lg border border-[#E6E8ED] bg-[#ffffff] px-2 py-1 text-[10px] text-[#5b6a8a] md:flex"><Search size={11} />{t("Search…", "بحث…")}</span>
                <span className="relative rounded-lg border border-[#E6E8ED] bg-[#ffffff] p-1.5 text-[#0B1F44]"><Bell size={13} /><span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#e5484d]" /></span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi label={t("Sales", "المبيعات")} value="248,300" delta="+12.4%" up vals={sales} color={BLUE} icon={<ShoppingCart size={13} />} />
              <Kpi label={t("Purchases", "المشتريات")} value="161,750" delta="+4.1%" up vals={buys} color={CYAN} icon={<ShoppingBag size={13} />} />
              <Kpi label={t("Net profit", "صافي الربح")} value="52,940" delta="+18.2%" up vals={[3, 4, 4, 6, 5, 7, 8, 8, 10]} color={GREEN} icon={<TrendingUp size={13} />} />
              <Kpi label={t("Cash", "السيولة")} value="96,120" delta="-2.3%" up={false} vals={[9, 8, 9, 7, 8, 7, 6, 7, 6]} color={AMBER} icon={<Wallet size={13} />} />
            </div>
            <div className="mt-2.5 grid gap-2.5 md:grid-cols-[1.6fr_1fr]">
              <div className="rounded-xl border border-[#E6E8ED] bg-[#ffffff] p-3">
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-[#0B1F44]"><span>{t("Sales vs purchases", "المبيعات مقابل المشتريات")}</span>
                  <span className="flex gap-2 text-[10px] font-semibold text-[#5b6a8a]"><i className="inline-block h-1.5 w-3 self-center rounded-full" style={{ background: BLUE }} />{t("Sales", "مبيعات")}<i className="inline-block h-1.5 w-3 self-center rounded-full" style={{ background: CYAN }} />{t("Purchases", "مشتريات")}</span></div>
                <svg viewBox="0 0 300 100" className="h-24 w-full" preserveAspectRatio="none" aria-hidden="true">
                  {[25, 50, 75].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="#E6E8ED" strokeWidth="1" />)}
                  <path d={area.area} fill={BLUE} opacity="0.10" /><path d={area.line} fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinejoin="round" />
                  <path d={line2.line} fill="none" stroke={CYAN} strokeWidth="2.2" strokeLinejoin="round" strokeDasharray="4 3" />
                </svg>
              </div>
              <div className="rounded-xl border border-[#E6E8ED] bg-[#ffffff] p-3">
                <div className="mb-2 text-[11px] font-bold text-[#0B1F44]">{t("Expenses", "توزيع المصروفات")}</div>
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90 shrink-0" aria-hidden="true">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#E6E8ED" strokeWidth="6" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke={BLUE} strokeWidth="6" strokeDasharray="44 88" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke={CYAN} strokeWidth="6" strokeDasharray="26 88" strokeDashoffset="-44" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke={AMBER} strokeWidth="6" strokeDasharray="18 88" strokeDashoffset="-70" />
                  </svg>
                  <ul className="space-y-1 text-[10px] font-semibold text-[#4b5b78]">
                    <li><i className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: BLUE }} />{t("Rent & salaries", "إيجار ورواتب")}</li>
                    <li><i className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: CYAN }} />{t("Operations", "تشغيل")}</li>
                    <li><i className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ background: AMBER }} />{t("Other", "أخرى")}</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-2.5 overflow-hidden rounded-xl border border-[#E6E8ED] bg-[#ffffff]">
              <div className="border-b border-[#E6E8ED] px-3 py-2 text-[11px] font-bold text-[#0B1F44]">{t("Latest sales invoices", "آخر فواتير المبيعات")}</div>
              <table className="w-full text-[10px] sm:text-[11px]">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n} className="border-b border-[#f0f2f7] last:border-0">
                      <td className="px-3 py-1.5 font-bold text-[#007BFF]" dir="ltr">{r.n}</td>
                      <td className="px-2 py-1.5 text-[#4b5b78]">{r.c}</td>
                      <td className="px-2 py-1.5 font-bold text-[#0B1F44]" dir="ltr">{r.v}</td>
                      <td className="px-3 py-1.5 text-end"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.ok ? "bg-[#16a34a1a] text-[#15803d]" : "bg-[#f59e0b24] text-[#b45309]"}`}>{r.s}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -top-8 start-6 hidden items-center gap-2 rounded-xl bg-[#ffffff] px-3 py-2 text-[11px] font-bold text-[#0B1F44] shadow-xl sm:flex" aria-hidden="true"><CheckCircle2 size={16} className="text-[#16a34a]" />{t("Invoice INV-1042 posted", "تم ترحيل الفاتورة INV-1042")}</div>
      <div className="absolute -bottom-6 end-6 hidden items-center gap-2 rounded-xl bg-[#ffffff] px-3 py-2 text-[11px] font-bold text-[#0B1F44] shadow-xl sm:flex" aria-hidden="true"><AlertTriangle size={16} className="text-[#f59e0b]" />{t("3 items below minimum stock", "3 أصناف تحت حدّ المخزون")}</div>
    </div>
  );
}

export function ErpBranchesMock() {
  const { t } = useLang();
  const br = [
    { n: t("Main branch", "الفرع الرئيسي"), c: t("Riyadh", "الرياض"), v: 78, s: "96,400" },
    { n: t("North branch", "فرع الشمال"), c: t("Riyadh", "الرياض"), v: 54, s: "61,250" },
    { n: t("Eastern branch", "الفرع الشرقي"), c: t("Dammam", "الدمام"), v: 41, s: "47,900" },
  ];
  return (
    <div className="rounded-2xl border border-[#E6E8ED] bg-[#F4F6FA] p-4 shadow-[0_30px_80px_-20px_rgba(11,31,68,0.35)] sm:p-5" data-testid="erp-branches">
      <div className="mx-auto max-w-sm rounded-xl bg-[#0B1F44] p-3.5 text-center">
        <div className="mb-2 flex items-center justify-center gap-2 text-sm font-black text-[#ffffff]"><Building2 size={16} className="text-[#00C2FF]" />{t("Company · central settings", "الشركة · الإعدادات المركزية")}</div>
        <div className="flex flex-wrap justify-center gap-1.5 text-[10px] font-bold text-[#c9d6ee]">{[t("Tax", "الضريبة"), t("Currency", "العملة"), t("Print templates", "قوالب الطباعة"), t("Permissions", "الصلاحيات")].map((x) => <span key={x} className="rounded-full border border-[#ffffff30] px-2 py-0.5">{x}</span>)}</div>
      </div>
      <div className="mx-auto h-5 w-px bg-[#007BFF]" aria-hidden="true" />
      <div className="mx-auto hidden h-px w-[66%] bg-[#007BFF] sm:block" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-3">
        {br.map((b) => (
          <div key={b.n} className="relative rounded-xl border border-[#E6E8ED] bg-[#ffffff] p-3">
            <span className="absolute -top-3 start-1/2 hidden h-3 w-px bg-[#007BFF] sm:block" aria-hidden="true" />
            <div className="flex items-center justify-between"><span className="text-sm font-extrabold text-[#0B1F44]">{b.n}</span><span className="rounded-full bg-[#16a34a1a] px-2 py-0.5 text-[10px] font-bold text-[#15803d]">{t("Active", "نشط")}</span></div>
            <div className="mt-0.5 text-[11px] text-[#5b6a8a]">{b.c}</div>
            <div className="mt-3 text-[10px] font-semibold text-[#5b6a8a]">{t("Today's sales", "مبيعات اليوم")}</div>
            <div className="text-lg font-black text-[#0B1F44]" dir="ltr" style={{ textAlign: "start" }}>{b.s}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E6E8ED]"><div className="h-full rounded-full bg-gradient-to-r from-[#007BFF] to-[#00C2FF]" style={{ width: `${b.v}%` }} /></div>
            <div className="mt-2 flex gap-1.5 text-[10px] font-bold text-[#4b5b78]"><span className="rounded bg-[#F4F6FA] px-1.5 py-0.5">{t("2 warehouses", "مخزنان")}</span><span className="rounded bg-[#F4F6FA] px-1.5 py-0.5">POS</span></div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-[#5b6a8a]">{t("Illustrative data", "بيانات توضيحية")}</p>
    </div>
  );
}

export function ErpReportsMock() {
  const { t } = useLang();
  const months = [t("Jun", "يونيو"), t("Jul", "يوليو"), t("Aug", "أغسطس"), t("Sep", "سبتمبر"), t("Oct", "أكتوبر"), t("Nov", "نوفمبر")];
  const rev = [52, 61, 58, 72, 80, 91], cost = [38, 42, 41, 50, 54, 58];
  const lines = [
    { a: t("Revenue", "الإيرادات"), v: "248,300", d: "+12.4%", up: true }, { a: t("Cost of sales", "تكلفة المبيعات"), v: "161,750", d: "+4.1%", up: false },
    { a: t("Gross profit", "مجمل الربح"), v: "86,550", d: "+27.9%", up: true }, { a: t("Operating expenses", "المصروفات التشغيلية"), v: "33,610", d: "+1.8%", up: false },
  ];
  return (
    <div className="rounded-2xl bg-[#ffffff] p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] sm:p-5" data-testid="erp-reports">
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        {[t("Income statement", "قائمة الدخل"), t("Balance sheet", "الميزانية"), t("Cash flows", "التدفقات النقدية")].map((x, i) => <span key={x} className={`rounded-full px-3 py-1 ${i === 0 ? "bg-[#0B1F44] text-[#ffffff]" : "bg-[#F4F6FA] text-[#4b5b78]"}`}>{x}</span>)}
        <span className="ms-auto text-[10px] font-semibold text-[#5b6a8a]">{t("vs previous period", "مقارنة بالفترة السابقة")}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <svg viewBox="0 0 240 110" className="h-32 w-full" aria-hidden="true" style={{ direction: "ltr" }}>
            {[20, 45, 70, 95].map((y) => <line key={y} x1="0" x2="240" y1={y} y2={y} stroke="#E6E8ED" />)}
            {months.map((m, i) => (
              <g key={m}>
                <rect x={8 + i * 39} y={95 - rev[i]} width="14" height={rev[i]} rx="3" fill={BLUE} />
                <rect x={24 + i * 39} y={95 - cost[i]} width="14" height={cost[i]} rx="3" fill={CYAN} />
                <text x={23 + i * 39} y="107" fontSize="7" textAnchor="middle" fill="#5b6a8a">{m.slice(0, 3)}</text>
              </g>
            ))}
          </svg>
          <div className="mt-1 flex gap-3 text-[10px] font-semibold text-[#5b6a8a]"><span><i className="me-1 inline-block h-2 w-2 rounded-sm" style={{ background: BLUE }} />{t("Revenue", "الإيرادات")}</span><span><i className="me-1 inline-block h-2 w-2 rounded-sm" style={{ background: CYAN }} />{t("Costs", "التكاليف")}</span></div>
        </div>
        <table className="w-full self-start text-[11px]">
          <tbody>
            {lines.map((l) => (
              <tr key={l.a} className="border-b border-[#f0f2f7] last:border-0">
                <td className="py-2 font-semibold text-[#4b5b78]">{l.a}</td>
                <td className="py-2 font-black text-[#0B1F44]" dir="ltr" style={{ textAlign: "end" }}>{l.v}</td>
                <td className="py-2 text-end"><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${l.up ? "bg-[#16a34a1a] text-[#15803d]" : "bg-[#f59e0b24] text-[#b45309]"}`} dir="ltr">{l.d}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-[11px] text-[#5b6a8a]">{t("Illustrative data", "بيانات توضيحية")}</p>
    </div>
  );
}
