// طلبات الاشتراك الواردة من صفحة الهبوط (للأدمن فقط): قائمة، بحث، فلترة، تغيير حالة، ملاحظة إدارية.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, RefreshCw, Search, Phone, Mail } from "lucide-react";
import { useLang } from "../../context/LanguageContext";
import { fetchRequests, updateRequest, STATUSES, SubRequest, SubStatus } from "../../components/landing/subscriptionApi";
import { ACTIVITIES, PLANS } from "../../components/landing/subscriptionLogic";
import { findCountry, cityLabel } from "../../components/landing/countries";

const ST: Record<SubStatus, { en: string; ar: string; cls: string }> = {
  new: { en: "New", ar: "جديد", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  contacted: { en: "Contacted", ar: "تم التواصل", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  converted: { en: "Converted", ar: "تم التفعيل", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejected: { en: "Rejected", ar: "مرفوض", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
};
export function activityLabel(code: string, lang: "ar" | "en"): string {
  if (code.startsWith("other:")) return code.slice(6);
  const a = ACTIVITIES.find((x) => x.id === code); return a ? a[lang] : code;
}

export default function SubscriptionRequestsPage() {
  const { t, lang, isRTL } = useLang();
  const [rows, setRows] = useState<SubRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<SubStatus | "all">("all");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); const r = await fetchRequests(); setRows(r.rows); setErr(r.error); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => { const c: Record<string, number> = { all: rows.length }; STATUSES.forEach((s) => { c[s] = rows.filter((r) => r.status === s).length; }); return c; }, [rows]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.status === filter) && (!k || [r.business_name, r.contact_name, r.phone, r.email].some((x) => x.toLowerCase().includes(k))));
  }, [rows, filter, q]);

  const save = async (r: SubRequest, patch: { status?: SubStatus; admin_note?: string | null }) => {
    setBusy(r.id); const res = await updateRequest(r.id, patch); setBusy(null);
    if (!res.ok) { setFlash(res.error ?? t("Update failed", "فشل التحديث")); return; }
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, ...patch, handled_at: patch.status && patch.status !== "new" ? new Date().toISOString() : x.handled_at } : x)));
    setFlash(t("Saved", "تم الحفظ"));
    window.dispatchEvent(new Event("mihwar:sub-requests-changed"));
  };
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 3000); return () => clearTimeout(id); }, [flash]);

  const fmt = (s: string) => new Date(s).toLocaleString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const planLabel = (id: string) => { const p = PLANS.find((x) => x.id === id); return p ? t(p.en, p.ar) : id; };

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir={isRTL ? "rtl" : "ltr"}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-white font-black text-2xl flex items-center gap-2"><Inbox size={24} className="text-blue-400" />{t("Subscription requests", "طلبات الاشتراك")}</h1>
            <p className="text-slate-500 text-sm mt-1">{t("Requests submitted from the public landing page", "الطلبات الواردة من صفحة الهبوط العامة")}</p>
          </div>
          <button onClick={() => void load()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-sm font-bold"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{t("Refresh", "تحديث")}</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {(["all", ...STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} data-testid={`sr-filter-${s}`} className={`rounded-xl border p-3 text-start transition ${filter === s ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}>
              <div className="text-2xl font-black text-white">{counts[s] ?? 0}</div>
              <div className="text-xs text-slate-400">{s === "all" ? t("All", "الكل") : t(ST[s].en, ST[s].ar)}</div>
            </button>
          ))}
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name, phone or email…", "ابحث بالاسم أو الجوال أو البريد…")} className="w-full rounded-xl bg-slate-900 border border-slate-800 ps-9 pe-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" />
        </div>

        {flash && <div className="mb-3 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-100" role="status">{flash}</div>}
        {err && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200" role="alert">
            {/42P01|PGRST205|does not exist|schema cache/i.test(err)
              ? t("The subscription_requests table has not been created yet. Run the provided SQL migration after review.", "جدول subscription_requests لم يُنشأ بعد. نفّذ ملف SQL المرفق بعد مراجعته.")
              : err}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400" data-testid="sr-empty">{t("No requests", "لا توجد طلبات")}</div>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <article key={r.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4" data-testid="sr-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-white font-extrabold">{r.business_name}</h3>
                    <p className="text-slate-400 text-sm">{r.contact_name} · {activityLabel(r.activity, lang)} · {t("Branches", "الفروع")}: {r.branches_count}{r.country ? ` · ${findCountry(r.country)?.[lang] ?? r.country}${r.city ? " – " + cityLabel(r.country, r.city, lang) : ""}` : ""}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${ST[r.status].cls}`}>{t(ST[r.status].en, ST[r.status].ar)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-300">
                  <a href={`tel:${r.phone}`} dir="ltr" className="inline-flex items-center gap-1.5 hover:text-blue-300"><Phone size={14} />{r.phone}</a>
                  <a href={`mailto:${r.email}`} dir="ltr" className="inline-flex items-center gap-1.5 hover:text-blue-300"><Mail size={14} />{r.email}</a>
                  <span>{planLabel(r.plan)}</span><span className="text-slate-500">{fmt(r.created_at)}</span>
                </div>
                {r.notes && <p className="mt-3 rounded-lg bg-slate-800/60 p-3 text-sm text-slate-300 whitespace-pre-wrap">{r.notes}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select value={r.status} disabled={busy === r.id} onChange={(e) => void save(r, { status: e.target.value as SubStatus })} aria-label={t("Status", "الحالة")} className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white">
                    {STATUSES.map((s) => <option key={s} value={s}>{t(ST[s].en, ST[s].ar)}</option>)}
                  </select>
                  <input value={notes[r.id] ?? r.admin_note ?? ""} onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))} maxLength={1000} placeholder={t("Admin note…", "ملاحظة إدارية…")} className="min-w-[180px] flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
                  <button disabled={busy === r.id || (notes[r.id] ?? r.admin_note ?? "") === (r.admin_note ?? "")} onClick={() => void save(r, { admin_note: (notes[r.id] ?? "").trim() || null })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40">{t("Save note", "حفظ الملاحظة")}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
