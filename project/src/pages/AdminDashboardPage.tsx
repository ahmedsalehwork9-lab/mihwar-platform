// =============================================================
// src/pages/AdminDashboardPage.tsx — مركز قيادة المنصة (أدمن المنصة فقط).
// أرقام دقيقة بلا سقف 1000 صف (عدّ بالخادم + ترحيل صفحات)، أخطاء ظاهرة، وأزرار تنقّل فعلية.
// =============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Store, Package, ShoppingCart, CheckCircle2, Plus, Users, Shield, Globe, Building2, Layers, Warehouse, GitBranch, ArrowRightLeft, RefreshCw, AlertTriangle, Inbox, UserX, KeyRound, TrendingUp, ChevronRight, Activity, Eye } from "lucide-react";
import { supabase } from "./lib/supabase";
import { useLang } from "../context/LanguageContext";
import { loadUsers } from "./admin/permApi";

type Props = { onNavigate?: (page: string) => void };
type Q = PromiseLike<{ count: number | null; error: { message: string } | null }>;
type OrdRow = { id: number; status: string | null; total_amount: number | null; created_at: string; from_shop: { shop_name: string } | null; to_shop: { shop_name: string } | null };
type ShopRow = { id: number; shop_name: string; is_active: boolean | null; created_at: string | null };
type Data = {
  shops: number; activeShops: number; products: number; orders: number; transfers: number; orgs: number; groups: number; warehouses: number; branches: number;
  byStatus: Record<string, number>; amount: number | null; top: { id: number; name: string; n: number }[];
  vis: { public: number; group: number; priv: number }; shopsNoGroup: number;
  newShops30: number; newUsers30: number; newReq: number | null;
  users: number | null; admins: number | null; restricted: number | null; noBranch: number | null; inactiveUsers: number | null;
  orders10: OrdRow[]; shops10: ShopRow[];
};
const STATUSES = ["pending", "approved", "partially_approved", "completed", "rejected"] as const;
const ST_LABEL: Record<string, [string, string]> = { pending: ["Pending", "معلّق"], approved: ["Approved", "مقبول"], partially_approved: ["Partially approved", "مقبول جزئياً"], completed: ["Completed", "مكتمل"], rejected: ["Rejected", "مرفوض"], other: ["Other", "أخرى"] };
const ST_CLS: Record<string, string> = { pending: "text-amber-300 bg-amber-500/10 border-amber-500/30", approved: "text-blue-300 bg-blue-500/10 border-blue-500/30", partially_approved: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30", completed: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30", rejected: "text-red-300 bg-red-500/10 border-red-500/30", other: "text-slate-300 bg-slate-500/10 border-slate-500/30" };
const CARD = "bg-slate-900 border border-slate-800 rounded-2xl";
const iso30 = () => new Date(Date.now() - 30 * 864e5).toISOString();

export default function AdminDashboardPage({ onNavigate }: Props) {
  const { t, lang, isRTL } = useLang();
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ shop_name: "", phone: "", city: "", whatsapp: "" });
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const nf = useMemo(() => new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US"), [lang]);
  const go = (p: string) => onNavigate?.(p);

  const load = useCallback(async () => {
    setLoading(true);
    const bad: string[] = [];
    const cnt = async (label: string, q: Q): Promise<number> => { try { const r = await q; if (r.error) { bad.push(label); return 0; } return r.count ?? 0; } catch { bad.push(label); return 0; } };
    const head = (tbl: string) => supabase.from(tbl).select("*", { count: "exact", head: true });
    const since = iso30();
    // ترحيل صفحات الطلبات لحساب الإجمالي وأعلى المحلات بلا سقف 1000
    const allOrders = async () => {
      const rows: { total_amount: number | null; from_shop_id: number | null; to_shop_id: number | null }[] = [];
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await supabase.from("orders").select("total_amount, from_shop_id, to_shop_id").order("id", { ascending: true }).range(from, from + 999);
        if (error) throw error; rows.push(...(data ?? [])); if (!data || data.length < 1000) break;
      }
      return rows;
    };
    const [shops, activeShops, products, orders, transfers, orgs, groups, warehouses, branches, newShops30, newUsers30, shopsWithGroup, vPub, vGrp, vPriv] = await Promise.all([
      cnt("shops", head("shops")), cnt("shops", head("shops").eq("is_active", true)), cnt("products", head("products")), cnt("orders", head("orders")), cnt("transfers", head("inventory_transfers")),
      cnt("organizations", head("organizations")), cnt("groups", head("organization_groups")), cnt("shops", head("shops").eq("type", "warehouse")), cnt("shops", head("shops").eq("type", "branch")),
      cnt("shops", head("shops").gte("created_at", since)), cnt("users", head("profiles").gte("created_at", since)), cnt("shops", head("shops").not("group_id", "is", null)),
      cnt("products", head("products").eq("visibility_scope", "public")), cnt("products", head("products").eq("visibility_scope", "group")), cnt("products", head("products").eq("visibility_scope", "private")),
    ]);
    const stCounts = await Promise.all(STATUSES.map((s) => cnt("orders", head("orders").eq("status", s))));
    const byStatus: Record<string, number> = {}; STATUSES.forEach((s, i) => { byStatus[s] = stCounts[i]; });
    const other = orders - stCounts.reduce((a, b) => a + b, 0); if (other > 0) byStatus.other = other;

    let amount: number | null = null; let top: Data["top"] = [];
    try {
      const rows = await allOrders(); amount = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
      const m = new Map<number, number>(); rows.forEach((r) => { if (r.from_shop_id) m.set(r.from_shop_id, (m.get(r.from_shop_id) ?? 0) + 1); if (r.to_shop_id) m.set(r.to_shop_id, (m.get(r.to_shop_id) ?? 0) + 1); });
      const ids = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (ids.length) { const { data } = await supabase.from("shops").select("id, shop_name").in("id", ids.map((x) => x[0])); const nm = new Map((data ?? []).map((s: { id: number; shop_name: string }) => [s.id, s.shop_name])); top = ids.map(([id, n]) => ({ id, name: nm.get(id) ?? `#${id}`, n })); }
    } catch { bad.push("orders"); }

    let newReq: number | null = null;
    try { const r = await supabase.from("subscription_requests").select("*", { count: "exact", head: true }).eq("status", "new"); newReq = r.error ? null : r.count ?? 0; } catch { newReq = null; }
    let users: number | null = null, admins: number | null = null, restricted: number | null = null, noBranch: number | null = null, inactiveUsers: number | null = null;
    try { const u = await loadUsers(); users = u.users.length; admins = u.users.filter((x) => x.is_admin).length; inactiveUsers = u.users.filter((x) => !x.is_active).length; restricted = u.users.filter((x) => !x.is_admin && (x.access.pages !== null || x.access.actions !== null)).length; noBranch = u.users.filter((x) => !x.is_admin && x.store_id == null && x.branches.length === 0).length; } catch { bad.push("users"); }
    const [o10, s10] = await Promise.all([
      supabase.from("orders").select("id, status, total_amount, created_at, from_shop:shops!orders_from_shop_id_fkey(shop_name), to_shop:shops!orders_to_shop_id_fkey(shop_name)").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(8),
      supabase.from("shops").select("id, shop_name, is_active, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6),
    ]);
    if (o10.error) bad.push("orders"); if (s10.error) bad.push("shops");
    setD({ shops, activeShops, products, orders, transfers, orgs, groups, warehouses, branches, byStatus, amount, top, vis: { public: vPub, group: vGrp, priv: vPriv }, shopsNoGroup: Math.max(0, shops - shopsWithGroup), newShops30, newUsers30, newReq, users, admins, restricted, noBranch, inactiveUsers, orders10: (o10.data as unknown as OrdRow[]) ?? [], shops10: (s10.data as ShopRow[]) ?? [] });
    setFailed([...new Set(bad)]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createShop = async () => {
    if (!form.shop_name.trim() || !form.phone.trim()) { setFormMsg({ ok: false, text: t("Shop name and phone are required.", "اسم المحل والجوال مطلوبان.") }); return; }
    setCreating(true); setFormMsg(null);
    const { error } = await supabase.from("shops").insert({ shop_name: form.shop_name.trim(), phone: form.phone.trim(), city: form.city.trim() || null, whatsapp: form.whatsapp.trim() || null, is_active: true });
    setCreating(false);
    if (error) { setFormMsg({ ok: false, text: t("Could not create the shop: ", "تعذّر إنشاء المحل: ") + error.message }); return; }
    setFormMsg({ ok: true, text: t("Shop created.", "تم إنشاء المحل.") }); setForm({ shop_name: "", phone: "", city: "", whatsapp: "" }); void load();
  };

  const n = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));
  const dt = (s: string | null) => (s ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium" }).format(new Date(s)) : "—");
  const kpi = (id: string, label: string, v: number | null, Icon: typeof Store, tone: string, sub?: string) => (
    <div key={id} data-testid={`ak-${id}`} className={`${CARD} p-4`}><div className="flex items-start justify-between"><span className={`w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center ${tone}`}><Icon size={17} /></span>{sub && <span className="text-[11px] text-slate-400">{sub}</span>}</div>
      <div className="mt-3 text-2xl font-black text-white tabular-nums" data-testid={`ak-${id}-v`}>{n(v)}</div><div className="text-xs text-slate-400 mt-0.5">{label}</div></div>);
  const attn = (id: string, label: string, v: number | null, Icon: typeof Store, page: string, tone: string) => (
    <button key={id} data-testid={`at-${id}`} onClick={() => go(page)} className={`text-start ${CARD} p-4 hover:border-slate-600 flex items-center gap-3 ${v ? "" : "opacity-70"}`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center bg-slate-800/60 ${v ? tone : "text-slate-500"}`}><Icon size={18} /></span>
      <span className="flex-1"><span className="block text-xl font-black tabular-nums text-white" data-testid={`at-${id}-v`}>{n(v)}</span><span className="block text-[11px] text-slate-400">{label}</span></span>
      <ChevronRight size={15} className={`text-slate-600 ${isRTL ? "rotate-180" : ""}`} /></button>);
  const qa = (id: string, label: string, desc: string, Icon: typeof Store, tone: string, onClick: () => void) => (
    <button key={id} data-testid={`qa-${id}`} onClick={onClick} className={`text-start ${CARD} p-4 hover:border-slate-600`}><span className={`w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center mb-2 ${tone}`}><Icon size={17} /></span><span className="block text-sm font-bold text-white">{label}</span><span className="block text-[11px] text-slate-400 mt-0.5">{desc}</span></button>);
  const inp = "w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white";
  const totalVis = d ? d.vis.public + d.vis.group + d.vis.priv : 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return (
    <div data-rpt data-testid="admin-page" dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-slate-950 text-white pb-12">
      <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800/50 pb-5">
          <div><div className="text-[11px] font-bold text-emerald-300 tracking-widest">{t("PLATFORM ADMIN", "إدارة المنصة")}</div><h1 className="text-3xl font-black mt-1">{t("Platform command center", "مركز قيادة المنصة")}</h1><p className="text-xs text-slate-400 mt-1">{t("Shops, users, permissions and orders at a glance — counts are computed server-side, not from a capped list.", "المحلات والمستخدمون والصلاحيات والطلبات في نظرة — الأرقام تُحسب من الخادم لا من قائمة مقيّدة.")}</p></div>
          <button data-testid="admin-refresh" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-300 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{t("Refresh", "تحديث")}</button>
        </header>

        {failed.length > 0 && <div data-testid="admin-error" role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /><span>{t("Some figures could not be loaded and show 0 or —: ", "تعذّر تحميل بعض الأرقام وتظهر 0 أو —: ")}{failed.join("، ")}</span></div>}
        {loading && !d && <p data-testid="admin-loading" className="text-xs text-slate-500">{t("Loading…", "جارٍ التحميل…")}</p>}

        {d && (<>
          <section aria-label={t("Needs attention", "يحتاج متابعة")}>
            <h2 className="text-sm font-black mb-2">{t("Needs attention", "يحتاج متابعة")}</h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {attn("req", t("New subscription requests", "طلبات اشتراك جديدة"), d.newReq, Inbox, "subscription-requests", "text-blue-400")}
              {attn("pending", t("Pending orders", "طلبات معلّقة"), d.byStatus.pending ?? 0, ShoppingCart, "global-orders", "text-amber-400")}
              {attn("nobranch", t("Users without a branch", "مستخدمون بلا فرع"), d.noBranch, UserX, "permissions", "text-purple-400")}
              {attn("inactive", t("Inactive shops", "محلات غير نشطة"), Math.max(0, d.shops - d.activeShops), Store, "shops", "text-red-400")}
            </div>
          </section>

          <section aria-label={t("Key figures", "المؤشرات")}><div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {kpi("shops", t("Shops", "المحلات"), d.shops, Store, "text-blue-400", `${pct(d.activeShops, d.shops)}% ${t("active", "نشط")}`)}
            {kpi("users", t("Users", "المستخدمون"), d.users, Users, "text-violet-400", d.inactiveUsers ? `${n(d.inactiveUsers)} ${t("inactive", "معطّل")}` : undefined)}
            {kpi("admins", t("Admins", "الأدمن"), d.admins, Shield, "text-red-400")}
            {kpi("restricted", t("Restricted users", "صلاحيات مقيّدة"), d.restricted, KeyRound, "text-amber-400")}
            {kpi("products", t("Products", "المنتجات"), d.products, Package, "text-amber-400")}
            {kpi("orders", t("Orders", "الطلبات"), d.orders, ShoppingCart, "text-pink-400")}
          </div></section>

          <section className="grid lg:grid-cols-3 gap-4">
            <div className={`${CARD} p-5 lg:col-span-2`}><h3 className="text-sm font-black mb-3">{t("Orders by status", "الطلبات حسب الحالة")}</h3>
              <div className="space-y-2">{Object.entries(d.byStatus).map(([k, v]) => (
                <div key={k} data-testid="st-row" className="flex items-center gap-3"><span className={`w-36 text-[11px] font-bold px-2 py-1 rounded-lg border ${ST_CLS[k] ?? ST_CLS.other}`}>{t(...(ST_LABEL[k] ?? ST_LABEL.other))}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-slate-400" style={{ width: `${pct(v, d.orders)}%` }} /></div><span className="w-14 text-end text-xs tabular-nums text-slate-200" data-testid={`st-${k}`}>{n(v)}</span></div>))}</div>
              <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">{t("Total order value", "إجمالي قيمة الطلبات")}: <span data-testid="ord-amount" className="font-black text-white tabular-nums">{d.amount == null ? "—" : nf.format(Math.round(d.amount))}</span> {t("SAR", "ر.س")}</div></div>
            <div className={`${CARD} p-5`}><h3 className="text-sm font-black mb-3 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-400" />{t("Last 30 days", "آخر 30 يوماً")}</h3>
              <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">{t("New shops", "محلات جديدة")}</span><b data-testid="g-shops" className="tabular-nums">{n(d.newShops30)}</b></div><div className="flex justify-between"><span className="text-slate-400">{t("New users", "مستخدمون جدد")}</span><b data-testid="g-users" className="tabular-nums">{n(d.newUsers30)}</b></div></div></div>
          </section>

          <section><h2 className="text-sm font-black mb-2">{t("Platform structure", "هيكل المنصة")}</h2><div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpi("orgs", t("Organizations", "المنظمات"), d.orgs, Building2, "text-cyan-400")}{kpi("groups", t("Groups", "المجموعات"), d.groups, Layers, "text-indigo-400", d.shopsNoGroup ? `${n(d.shopsNoGroup)} ${t("shops ungrouped", "محل بلا مجموعة")}` : undefined)}
            {kpi("wh", t("Warehouses", "المستودعات"), d.warehouses, Warehouse, "text-orange-400")}{kpi("br", t("Branches", "الفروع"), d.branches, GitBranch, "text-teal-400")}
            {kpi("tr", t("Transfers", "تحويلات المخزون"), d.transfers, ArrowRightLeft, "text-fuchsia-400")}
            <div data-testid="ak-vis" className={`${CARD} p-4`}><span className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-300"><Eye size={17} /></span><div className="mt-3 text-[11px] text-slate-300 space-y-0.5"><div className="flex justify-between"><span>{t("Public", "عام")}</span><b className="tabular-nums">{n(d.vis.public)}</b></div><div className="flex justify-between"><span>{t("Group", "مجموعة")}</span><b className="tabular-nums">{n(d.vis.group)}</b></div><div className="flex justify-between"><span>{t("Private", "خاص")}</span><b className="tabular-nums">{n(d.vis.priv)}</b></div></div><div className="text-[11px] text-slate-500 mt-1">{t("Product visibility", "ظهور المنتجات")} · {n(totalVis)}</div></div>
          </div></section>

          <section><h2 className="text-sm font-black mb-2">{t("Quick actions", "إجراءات سريعة")}</h2><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {qa("add", t("Add shop", "إضافة محل"), t("Quick form below", "نموذج سريع بالأسفل"), Plus, "text-blue-400", () => document.getElementById("create-shop-section")?.scrollIntoView({ behavior: "smooth" }))}
            {qa("shops", t("Shops", "المحلات"), t("View and edit shops", "عرض وتعديل المحلات"), Store, "text-emerald-400", () => go("shops"))}
            {qa("users", t("Users", "المستخدمون"), t("Accounts and emails", "الحسابات والإيميلات"), Users, "text-violet-400", () => go("users"))}
            {qa("perm", t("Permissions", "الصلاحيات"), t("Pages, actions, branches", "صفحات وإجراءات وفروع"), Shield, "text-rose-400", () => go("permissions"))}
            {qa("inv", t("Global inventory", "المخزون العالمي"), t("Products across shops", "منتجات كل المحلات"), Globe, "text-amber-400", () => go("global-inventory"))}
            {qa("ord", t("Global orders", "الطلبات العالمية"), t("All platform orders", "كل طلبات المنصة"), ShoppingCart, "text-pink-400", () => go("global-orders"))}
          </div></section>

          <section className="grid lg:grid-cols-3 gap-4">
            <div className={`${CARD} p-5 lg:col-span-2`}><h3 className="text-sm font-black mb-3 flex items-center gap-2"><Activity size={15} className="text-slate-400" />{t("Latest orders", "آخر الطلبات")}</h3>
              {d.orders10.length === 0 ? <p data-testid="no-orders" className="text-xs text-slate-500">{t("No orders yet.", "لا توجد طلبات بعد.")}</p> : <div className="overflow-x-auto"><table className="w-full text-xs min-w-[34rem]"><thead><tr className="text-[11px] text-slate-500 border-b border-slate-800"><th scope="col" className="text-start py-2">#</th><th scope="col" className="text-start">{t("From → To", "من ← إلى")}</th><th scope="col" className="text-start">{t("Status", "الحالة")}</th><th scope="col" className="text-end">{t("Amount", "المبلغ")}</th><th scope="col" className="text-end">{t("Date", "التاريخ")}</th></tr></thead>
                <tbody>{d.orders10.map((o) => { const s = o.status ?? "other"; return (<tr key={o.id} data-testid="ord-row" className="border-b border-slate-800/60 last:border-0"><td className="py-2 font-mono text-slate-400">{o.id}</td><td className="text-slate-200">{o.from_shop?.shop_name ?? "—"} <span className="text-slate-600">→</span> {o.to_shop?.shop_name ?? "—"}</td><td><span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${ST_CLS[s] ?? ST_CLS.other}`}>{t(...(ST_LABEL[s] ?? ST_LABEL.other))}</span></td><td className="text-end tabular-nums text-slate-100">{nf.format(Number(o.total_amount ?? 0))}</td><td className="text-end text-slate-400">{dt(o.created_at)}</td></tr>); })}</tbody></table></div>}</div>
            <div className="space-y-4">
              <div className={`${CARD} p-5`}><h3 className="text-sm font-black mb-3">{t("Most active shops", "أنشط المحلات")}</h3>{d.top.length === 0 ? <p className="text-xs text-slate-500">—</p> : <ol className="space-y-2">{d.top.map((s, i) => (<li key={s.id} data-testid="top-row" className="flex items-center justify-between text-xs"><span className="text-slate-200">{i + 1}. {s.name}</span><span className="tabular-nums text-slate-400">{n(s.n)} {t("orders", "طلب")}</span></li>))}</ol>}</div>
              <div className={`${CARD} p-5`}><h3 className="text-sm font-black mb-3">{t("Newest shops", "أحدث المحلات")}</h3><ul className="space-y-2">{d.shops10.map((s) => (<li key={s.id} data-testid="shop-row" className="flex items-center justify-between text-xs"><span className="text-slate-200">{s.shop_name}</span><span className={s.is_active ? "text-emerald-400" : "text-slate-500"}>{s.is_active ? t("Active", "نشط") : t("Inactive", "غير نشط")}</span></li>))}</ul></div>
            </div>
          </section>

          <section id="create-shop-section" className={`${CARD} p-5`}><h3 className="text-sm font-black mb-3 flex items-center gap-2"><CheckCircle2 size={15} className="text-blue-400" />{t("Add a shop", "إضافة محل")}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div><label htmlFor="cs-name" className="block text-[11px] font-bold text-slate-400 mb-1">{t("Shop name *", "اسم المحل *")}</label><input id="cs-name" data-testid="cs-name" value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} className={inp} /></div>
              <div><label htmlFor="cs-phone" className="block text-[11px] font-bold text-slate-400 mb-1">{t("Phone *", "الجوال *")}</label><input id="cs-phone" data-testid="cs-phone" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} /></div>
              <div><label htmlFor="cs-city" className="block text-[11px] font-bold text-slate-400 mb-1">{t("City", "المدينة")}</label><input id="cs-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inp} /></div>
              <div><label htmlFor="cs-wa" className="block text-[11px] font-bold text-slate-400 mb-1">{t("WhatsApp", "واتساب")}</label><input id="cs-wa" dir="ltr" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className={inp} /></div>
            </div>
            <div className="flex items-center gap-3 mt-3"><button data-testid="cs-save" onClick={() => void createShop()} disabled={creating} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black disabled:opacity-50">{creating ? t("Saving…", "جارٍ الحفظ…") : t("Create shop", "إنشاء المحل")}</button>
              {formMsg && <span data-testid="cs-msg" role="status" className={`text-xs ${formMsg.ok ? "text-emerald-300" : "text-red-300"}`}>{formMsg.text}</span>}</div></section>
        </>)}
      </div>
    </div>
  );
}
