import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ClipboardCheck, Plus, Search, Package, Calendar, ArrowRight, Save, RotateCcw, ArrowUpDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as DB from "../lib/accountingDb";
import type { POSProduct, GLStockMove, GLAccount } from "../lib/accountingDb";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

export default function StockAdjustmentsPage() {
  const { ownedShopId, user } = (useAuth() as any) ?? {};
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [list, setList] = useState<GLStockMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  const [mode, setMode] = useState<"list" | "new">("list");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // form
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<POSProduct | null>(null);
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [postGl, setPostGl] = useState(false);
  const [counterAcc, setCounterAcc] = useState<number | "">("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const o = await DB.getOrgForBranch(ownedShopId ?? null);
      if (!alive) return;
      setOrg(o);
      if (o) setAccounts(await DB.fetchAccounts(o.id));
      if (ownedShopId) setProducts(await DB.fetchProducts(Number(ownedShopId)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownedShopId]);

  const inventoryAcc = useMemo(() => accounts.find((a) => a.code === "1104" && !a.is_group) ?? accounts.find((a) => a.type === "asset" && !a.is_group && /مخزون/.test(a.name)), [accounts]);
  const counterOptions = useMemo(() => accounts.filter((a) => !a.is_group && (a.type === "expense" || a.type === "income" || /تسوي|عجز|فائض|تالف/.test(a.name))), [accounts]);
  useEffect(() => {
    if (postGl && !counterAcc) {
      const def = accounts.find((a) => !a.is_group && /تسوي(ة|ات) المخزون|تسوية مخزون/.test(a.name)) ?? counterOptions[0];
      if (def) setCounterAcc(def.id);
    }
  }, [postGl, accounts, counterOptions, counterAcc]);

  const loadList = useCallback(async () => {
    if (!org) return;
    setList(await DB.fetchStockAdjustments(org.id, from, to, ownedShopId ? Number(ownedShopId) : null));
  }, [org, from, to, ownedShopId]);
  useEffect(() => { loadList(); }, [loadList]);

  const prodName = useCallback((id: number) => products.find((p) => p.id === id)?.product_name ?? `#${id}`, [products]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 8);
    return products.filter((p) => p.product_name.toLowerCase().includes(s) || (p.barcode || "").includes(s) || (p.product_code || "").toLowerCase().includes(s)).slice(0, 8);
  }, [q, products]);

  const delta = sel ? r3((Number(newQty) || 0) - (Number(sel.quantity) || 0)) : 0;

  const openNew = () => { setSel(null); setQ(""); setNewQty(""); setReason(""); setPostGl(false); setCounterAcc(""); setErr(null); setMode("new"); window.scrollTo(0, 0); };
  const closeNew = () => { if (!saving) { setMode("list"); setErr(null); } };
  const pick = (p: POSProduct) => { setSel(p); setQ(""); setNewQty(String(p.quantity)); };

  const save = async () => {
    if (!org || !sel) { setErr("اختر الصنف."); return; }
    if (reason.trim() === "") { setErr("اكتب سبب التسوية."); return; }
    if (newQty === "" || Number.isNaN(Number(newQty))) { setErr("أدخل الرصيد الجديد."); return; }
    if (postGl && (!inventoryAcc || !counterAcc)) { setErr("للترحيل المحاسبي اختر حساب التسوية (وتأكّد من وجود حساب المخزون 1104)."); return; }
    setErr(null); setSaving(true);
    const res = await DB.createStockAdjustment(org.id, {
      product_id: sel.id, branch_id: ownedShopId ? Number(ownedShopId) : null,
      new_qty: Number(newQty), reason: reason.trim(), user_id: user?.id ?? null,
      product_name: sel.product_name,
      post_gl: postGl,
      inventory_account_id: postGl ? (inventoryAcc?.id ?? null) : null,
      counter_account_id: postGl ? (counterAcc ? Number(counterAcc) : null) : null,
    });
    setSaving(false);
    if (!res.ok) { setErr(res.error || "تعذّر حفظ التسوية."); return; }
    setOk(`تمت تسوية «${sel.product_name}» (${res.delta! > 0 ? "+" : ""}${res.delta}) إلى ${res.newQty}.`);
    setMode("list");
    if (ownedShopId) setProducts(await DB.fetchProducts(Number(ownedShopId)));
    loadList();
    setTimeout(() => setOk(null), 4000);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ══════════════ NEW ADJUSTMENT ══════════════
  if (mode === "new") {
    return (
      <div className="min-h-screen" dir="rtl">
        <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800">
          <div className="max-w-3xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={closeNew} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm shrink-0"><ArrowRight size={18} /> رجوع</button>
              <div className="h-5 w-px bg-slate-700" />
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0"><ClipboardCheck size={16} /></div>
                <h1 className="text-base font-black text-white truncate">تسوية مخزون</h1>
              </div>
            </div>
            {sel && (
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] font-bold px-5 py-2 rounded-xl text-sm shrink-0">
                <Save size={16} /> {saving ? "جارٍ…" : "حفظ التسوية"}
              </button>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-5 space-y-4">
          {err && <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">{err}</div>}

          {!sel ? (
            <Section title="اختر الصنف">
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mb-3">
                <Search size={15} className="text-slate-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الكود أو الباركود…" className="bg-transparent text-sm text-white outline-none w-full" autoFocus />
              </div>
              <div className="divide-y divide-slate-800 max-h-[55vh] overflow-y-auto">
                {matches.length === 0 && <div className="text-center text-slate-600 py-8 text-sm">لا توجد أصناف مطابقة.</div>}
                {matches.map((p) => (
                  <button key={p.id} onClick={() => pick(p)} className="w-full text-right px-2 py-3 hover:bg-slate-800/40 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-white font-semibold truncate">{p.product_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{p.product_code || "—"}</div>
                    </div>
                    <div className="text-left shrink-0"><div className="text-sm text-white font-bold">{p.quantity}</div><div className="text-[11px] text-slate-500">الرصيد</div></div>
                  </button>
                ))}
              </div>
            </Section>
          ) : (
            <>
              <Section title="الصنف" action={<button onClick={() => { setSel(null); setNewQty(""); }} className="text-xs text-slate-400 hover:text-white">تغيير</button>}>
                <div className="flex items-center justify-between">
                  <div><div className="text-white font-bold">{sel.product_name}</div><div className="text-xs text-slate-500 font-mono">{sel.product_code || "—"}</div></div>
                  <div className="text-left"><div className="text-lg font-black text-white">{sel.quantity}</div><div className="text-[11px] text-slate-500">الرصيد الحالي</div></div>
                </div>
              </Section>

              <Section title="الرصيد الفعلي بعد الجرد">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <Field label="الرصيد الجديد">
                    <input value={newQty} onChange={(e) => setNewQty(e.target.value)} inputMode="decimal" className={inp} autoFocus />
                  </Field>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <div className={`flex-1 text-center rounded-xl py-3 border ${delta === 0 ? "border-slate-700 text-slate-400" : delta > 0 ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5" : "border-red-500/40 text-red-400 bg-red-500/5"}`}>
                      <div className="text-[11px] text-slate-500 mb-0.5 flex items-center justify-center gap-1"><ArrowUpDown size={11} /> الفرق</div>
                      <div className="text-lg font-black">{delta > 0 ? "+" : ""}{delta}</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[-1, +1, -5, +5].map((d) => (
                    <button key={d} type="button" onClick={() => setNewQty(String(r3((Number(newQty) || 0) + d)))} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-indigo-500">{d > 0 ? `+${d}` : d}</button>
                  ))}
                  <button type="button" onClick={() => setNewQty("0")} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-indigo-500">صفر</button>
                </div>
              </Section>

              <Section title="سبب التسوية (مطلوب)">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="جرد دوري / تالف / عجز / فائض / خطأ إدخال…" className={inp} />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {["جرد دوري", "تالف", "عجز", "فائض", "خطأ إدخال"].map((r) => (
                    <button key={r} type="button" onClick={() => setReason(r)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-indigo-500">{r}</button>
                  ))}
                </div>
              </Section>

              <Section title="الترحيل المحاسبي (اختياري)">
                <label className="flex items-center gap-2 cursor-pointer mb-1">
                  <input type="checkbox" className="accent-indigo-500" checked={postGl} onChange={(e) => setPostGl(e.target.checked)} />
                  <span className="text-sm text-slate-300">ترحيل قيد عجز/فائض مخزون إلى القوائم المالية</span>
                </label>
                {postGl && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="حساب المخزون">
                      <input value={inventoryAcc ? `${inventoryAcc.code} · ${inventoryAcc.name}` : "— غير موجود (1104) —"} disabled className={`${inp} opacity-70`} />
                    </Field>
                    <Field label="حساب التسوية (عجز/فائض)">
                      <select value={counterAcc} onChange={(e) => setCounterAcc(e.target.value ? Number(e.target.value) : "")} className={inp}>
                        <option value="">— اختر —</option>
                        {counterOptions.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                      </select>
                    </Field>
                    <p className="md:col-span-2 text-[11px] text-slate-500">
                      {delta > 0 ? "فائض: مدين المخزون / دائن حساب التسوية" : "عجز: مدين حساب التسوية / دائن المخزون"} · القيمة = {Math.abs(delta)} × التكلفة.
                    </p>
                  </div>
                )}
              </Section>

              <div className="flex items-center justify-end gap-2 pb-6">
                <button onClick={closeNew} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white">إلغاء</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] font-bold px-6 py-2.5 rounded-xl text-sm">
                  <Save size={16} /> {saving ? "جارٍ…" : "حفظ التسوية"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ══════════════ LIST ══════════════
  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center"><ClipboardCheck size={22} /></div>
          <div>
            <h1 className="text-xl font-black text-white">الجرد والتسويات</h1>
            <p className="text-xs text-slate-500">{org?.name ?? "—"} · تعديل الأرصدة بحركة موثّقة (سبب + مستخدم + تاريخ)</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-[#fff] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus size={18} /> تسوية جديدة
        </button>
      </div>

      {ok && <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3 text-sm">{ok}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-900/60 border border-slate-800 rounded-xl p-2.5">
        <Calendar size={16} className="text-slate-500" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <span className="text-slate-600 text-sm">←</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white" />
        <button onClick={loadList} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-sm"><RotateCcw size={14} /> تحديث</button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-800 bg-slate-900">
                <th className="text-right font-semibold px-3 py-2.5">التاريخ</th>
                <th className="text-right font-semibold px-3 py-2.5">الصنف</th>
                <th className="text-center font-semibold px-3 py-2.5">الفرق</th>
                <th className="text-right font-semibold px-3 py-2.5">السبب</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-600 py-10"><Package size={30} className="mx-auto mb-2 opacity-40" />لا توجد تسويات في هذه الفترة.</td></tr>
              )}
              {list.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 text-slate-400">{(m.created_at || "").slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-white">{prodName(m.product_id)}</td>
                  <td className={`px-3 py-2.5 text-center font-bold font-mono ${m.qty >= 0 ? "text-emerald-400" : "text-red-400"}`}>{m.qty >= 0 ? "+" : ""}{m.qty}</td>
                  <td className="px-3 py-2.5 text-slate-400">{m.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-200">{title}</h3>{action}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-400 mb-1">{label}</span>{children}</label>;
}
