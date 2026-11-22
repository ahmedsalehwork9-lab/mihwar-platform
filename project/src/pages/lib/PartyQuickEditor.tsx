import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Phone, FileText, CreditCard, BookOpen, StickyNote, X, Maximize2 } from "lucide-react";
import * as DB from "./accountingDb";
import type { GLAccount, GLParty, PartyType } from "./accountingDb";

type Props = {
  open: boolean;
  onClose: () => void;
  orgId: number;
  branchId: number | null;
  type: PartyType;
  accounts: GLAccount[];
  party?: GLParty | null;
  onSaved: (party: GLParty) => void;
};

type TabKey = "contacts" | "commercial" | "accounting" | "notes";

const field =
  "w-full border-0 border-b border-slate-700 bg-transparent px-2 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500";
const label = "mb-1 block text-xs font-semibold text-slate-400";
const panel = "rounded-xl border border-slate-700/80 bg-slate-950/45 p-4";
const tabItems: { key: TabKey; title: string; icon: typeof Building2 }[] = [
  { key: "contacts", title: "جهات الاتصال", icon: Building2 },
  { key: "commercial", title: "المبيعات والمشتريات", icon: CreditCard },
  { key: "accounting", title: "المحاسبة", icon: BookOpen },
  { key: "notes", title: "ملاحظات", icon: StickyNote },
];

export default function PartyQuickEditor({
  open, onClose, orgId, branchId, type, accounts, party, onSaved,
}: Props) {
  const isCustomer = type === "customer";
  const title = isCustomer ? "عميل" : "مورد";
  const expected = isCustomer ? "asset" : "liability";
  const parentCode = isCustomer ? "1103" : "2101";
  const parentLabel = isCustomer ? "العملاء (مدينون)" : "الموردون (دائنون)";

  // The parent account is intentionally allowed to be a group account.
  // It is the control account in the chart of accounts, not a posting leaf.
  const parentAccount = useMemo(
    () =>
      accounts.find(
        (a) =>
          String(a.code).trim() === parentCode &&
          a.type === expected &&
          a.is_active !== false
      ) ||
      accounts.find(
        (a) =>
          a.type === expected &&
          a.is_active !== false &&
          (isCustomer ? /العملاء|مدينون/.test(a.name) : /الموردون|دائنون/.test(a.name))
      ),
    [accounts, parentCode, expected, isCustomer]
  );

  const [tab, setTab] = useState<TabKey>("contacts");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [creditDays, setCreditDays] = useState("0");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const clearForm = () => {
    setName("");
    setPhone("");
    setAddress("");
    setTaxNumber("");
    setCreditDays("0");
    setNotes("");
    setActive(true);
    setTab("contacts");
  };

  useEffect(() => {
    if (!open) return;
    setTab("contacts");
    setName(party?.name || "");
    setPhone(party?.phone || "");
    setAddress(party?.address || "");
    setTaxNumber(party?.tax_number || "");
    setCreditDays(String(party?.credit_days ?? 0));
    setNotes(party?.notes || "");
    setActive(party?.is_active !== false);
  }, [open, party]);

  if (!open) return null;

  const save = async (andNew = false) => {
    if (!name.trim()) {
      setTab("contacts");
      alert(`أدخل اسم ${isCustomer ? "العميل" : "المورد"}.`);
      return;
    }
    if (!parentAccount) {
      setTab("accounting");
      alert(`تعذر العثور على حساب الأب «${parentLabel}» في دليل الحسابات.`);
      return;
    }

    setBusy(true);
    const payload: Partial<GLParty> = {
      organization_id: orgId,
      branch_id: party?.branch_id ?? branchId,
      type,
      name: name.trim(),
      account_id: parentAccount.id,
      credit_days: Math.max(0, Number(creditDays) || 0),
      phone: phone.trim() || null,
      address: address.trim() || null,
      tax_number: taxNumber.trim() || null,
      parent_id: party?.parent_id ?? null,
      notes: notes.trim() || null,
      is_active: active,
    };
    if (party?.id) payload.id = party.id;

    const result = await DB.upsertParty(payload);
    if (!result.ok) {
      setBusy(false);
      alert("تعذر حفظ الطرف: " + (result.error || "حدث خطأ غير معروف"));
      return;
    }

    const all = await DB.fetchParties(orgId);
    const saved =
      all.find((item) => item.id === party?.id) ||
      all.find(
        (item) =>
          item.type === type &&
          item.name === name.trim() &&
          item.account_id === parentAccount.id
      );

    setBusy(false);
    if (!saved) {
      alert("تم الحفظ، لكن تعذر استرجاع الطرف. حدّث قائمة الأطراف.");
      if (!andNew) onClose();
      return;
    }

    onSaved(saved);
    if (andNew && !party) {
      clearForm();
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 p-2 sm:p-4"
      dir="rtl"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${party ? "تحرير" : "إنشاء"} ${title}`}
        className={`flex max-h-[96vh] flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-2xl transition-all ${
          expanded ? "h-[96vh] w-full" : "w-full max-w-5xl"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-5 py-4 sm:px-7">
          <h2 className="text-lg font-bold text-white">
            {party ? "تحرير" : "إنشاء"} {isCustomer ? "عميل" : "مورد"}
          </h2>
          <div className="flex items-center gap-3 text-slate-400">
            <button
              type="button"
              title={expanded ? "تصغير" : "تكبير"}
              onClick={() => setExpanded((value) => !value)}
              className="rounded-md p-1.5 hover:bg-slate-800 hover:text-white"
            >
              <Maximize2 size={17} />
            </button>
            <button
              type="button"
              title="إغلاق"
              disabled={busy}
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <X size={21} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[160px_minmax(0,1fr)]">
            <div className="flex items-start justify-center">
              <div className="flex h-36 w-36 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-500">
                {isCustomer ? <Building2 size={54} strokeWidth={1.2} /> : <FileText size={54} strokeWidth={1.2} />}
              </div>
            </div>

            <div className="min-w-0">
              <label className="sr-only" htmlFor="party-name">اسم الطرف</label>
              <input
                id="party-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={isCustomer ? "اسم العميل" : "اسم المورد"}
                className="w-full border-0 border-b border-cyan-600 bg-transparent px-1 py-2 text-2xl font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-400 sm:text-3xl"
              />

              <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <Phone size={15} />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-slate-500" />
                </label>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-md bg-slate-800 px-2 py-1">{isCustomer ? "Customer" : "Vendor"}</span>
                  <span>ملف {isCustomer ? "عميل" : "مورد"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><MapPin size={16} /> العنوان</h3>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder={"الشارع، الحي، المدينة، المنطقة"}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
              />
              <label className="block">
                <span className={label}>الرقم الضريبي (VAT Number)</span>
                <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="الرقم الضريبي" className={field} />
              </label>
            </div>
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><CreditCard size={16} /> بيانات التعامل</h3>
              <label className="block">
                <span className={label}>مدة السداد (بالأيام)</span>
                <input type="number" min="0" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} className={field} />
              </label>
              <label className="flex items-center gap-2 pt-2 text-sm text-slate-300">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-cyan-500" />
                نشط
              </label>
            </div>
          </div>

          <div className="mt-7 border-b border-slate-700">
            <nav className="flex flex-wrap gap-1" aria-label="أقسام بيانات الطرف">
              {tabItems.map((item) => {
                const Icon = item.icon;
                const selected = tab === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                      selected
                        ? "border-cyan-500 bg-slate-800/70 text-cyan-300"
                        : "border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                    }`}
                  >
                    <Icon size={15} />
                    {item.title}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="min-h-36 py-5">
            {tab === "contacts" && (
              <div className={`${panel} grid grid-cols-1 gap-4 md:grid-cols-2`}>
                <div>
                  <span className={label}>نوع الطرف</span>
                  <div className="rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-200">{isCustomer ? "عميل" : "مورد"}</div>
                </div>
                <div>
                  <span className={label}>رقم الهاتف</span>
                  <div className="rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-200">{phone || "لم يتم إدخال رقم الهاتف"}</div>
                </div>
                <div className="md:col-span-2">
                  <span className={label}>العنوان الكامل</span>
                  <div className="min-h-10 rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-200">{address || "لم يتم إدخال العنوان"}</div>
                </div>
              </div>
            )}
            {tab === "commercial" && (
              <div className={`${panel} grid grid-cols-1 gap-4 md:grid-cols-2`}>
                <label>
                  <span className={label}>مدة السداد الافتراضية (أيام)</span>
                  <input type="number" min="0" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} className={field} />
                </label>
                <p className="self-end pb-2 text-xs leading-6 text-slate-400">تُستخدم مدة السداد كبيان افتراضي للطرف عند التعامل معه في المستندات.</p>
              </div>
            )}
            {tab === "accounting" && (
              <div className={`${panel} space-y-3`}>
                <div>
                  <span className={label}>حساب الأب في دليل الحسابات *</span>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
                    <span className="text-sm font-semibold text-white">
                      {parentAccount ? `${parentAccount.code} — ${parentAccount.name}` : `غير موجود: ${parentLabel}`}
                    </span>
                    <span className={`text-xs font-bold ${parentAccount ? "text-emerald-400" : "text-red-400"}`}>{parentAccount ? "مرتبط" : "غير متاح"}</span>
                  </div>
                </div>
                <p className="text-xs leading-6 text-slate-400">سيتم ربط {isCustomer ? "العميل" : "المورد"} بحساب الأب المحدد في دليل الحسابات. لا يتم إنشاء حساب مكرر لكل طرف.</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>نوع الحساب المتوقع:</span>
                  <span className="rounded bg-slate-800 px-2 py-1">{isCustomer ? "الأصول / الذمم المدينة" : "الالتزامات / الذمم الدائنة"}</span>
                </div>
              </div>
            )}
            {tab === "notes" && (
              <div className={panel}>
                <label>
                  <span className={label}>ملاحظات داخلية</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="أضف أي ملاحظات تخص هذا الطرف..." className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500" />
                </label>
              </div>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-900 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50">إلغاء</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {!party && (
              <button type="button" disabled={busy || !parentAccount} onClick={() => void save(true)} className="rounded-lg border border-cyan-700 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-950/50 disabled:opacity-50">
                {busy ? "جارٍ الحفظ..." : "حفظ وإنشاء جديد"}
              </button>
            )}
            <button type="button" disabled={busy || !parentAccount} onClick={() => void save(false)} className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50">
              {busy ? "جارٍ الحفظ..." : "حفظ"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
