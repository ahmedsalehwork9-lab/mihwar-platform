// =============================================================
// src/pages/accounting/statements/AccountDrill.tsx
// نافذة حركة حساب (أو مجموعة) من داخل القائمة المالية — من الذاكرة بلا استعلام جديد،
// مع مطابقة صافي الحركة لرقم السطر في القائمة.
// =============================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { Download, FileText, Printer, X } from "lucide-react";
import type { GLAccount } from "../../lib/accountingDb";
import { useLang } from "../../../context/LanguageContext";
import { jvLabel } from "../ledger/ledgerLogic";
import type { DrillRow } from "./statementsLogic";
import { buildReportHTML, openPrint, type ReportCol } from "../shared/printReport";

const fmt = (n: number): string => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BTN = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors disabled:opacity-50";

export type DrillData = { title: string; code: string; rows: DrillRow[]; totalDebit: number; totalCredit: number; net: number; expected: number; periodTxt: string; cash: boolean; multi: boolean; from?: string; to?: string };
export type PrintHead = { orgName: string; taxNumber?: string | null; logoUrl?: string | null; address?: string | null };
type Props = { detail?: { label: string; node: ReactNode }; head?: PrintHead; data: DrillData; accById: Map<number, GLAccount>; typeLabel: (k: string | null) => string; nameOf: (a: GLAccount) => string; onClose: () => void };

export default function AccountDrill({ detail, head, data, accById, typeLabel, nameOf, onClose }: Props) {
  const { t, lang, isRTL } = useLang();
  const [showDetail, setShowDetail] = useState(false);
  const matches = Math.abs(data.net - data.expected) < 0.01;
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const th = "text-[10px] px-2 py-2.5 bg-slate-950 text-slate-400 whitespace-nowrap border-b border-slate-700 font-bold sticky top-0 z-10";
  const td = "px-2 py-2 text-xs border-b border-slate-800";
  const heads = useMemo(() => [t("Date", "التاريخ"), t("Entry", "القيد"), ...(data.multi ? [t("Account", "الحساب")] : []), t("Type", "النوع"), t("Description", "البيان"), t("Debit", "مدين"), t("Credit", "دائن"), data.cash ? t("Cash effect", "الأثر النقدي") : t("Balance", "الرصيد")], [t, data.multi, data.cash]);
  const numFrom = data.multi ? 5 : 4;
  const exportX = () => {
    const ws = XLSX.utils.aoa_to_sheet([[data.code, data.title, data.periodTxt], [], heads, ...data.rows.map((r) => { const a = accById.get(r.accountId); return [r.date, jvLabel(r.entryYear, r.entryNo ?? 0), ...(data.multi ? [a ? `${a.code} ${nameOf(a)}` : ""] : []), typeLabel(r.type), r.description, r.debit || "", r.credit || "", r.running]; }), [], [t("Totals", "الإجماليات"), "", ...(data.multi ? [""] : []), "", "", data.totalDebit, data.totalCredit, data.net]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Movements"); XLSX.writeFile(wb, `movements_${data.code || "group"}.xlsx`);
  };
  const printX = () => {
    const cols: ReportCol[] = [{ label: t("Date", "التاريخ"), mono: true }, { label: t("Entry", "القيد"), mono: true }, ...(data.multi ? [{ label: t("Account", "الحساب") }] : []), { label: t("Type", "النوع") }, { label: t("Description", "البيان") }, { label: t("Debit", "مدين"), mono: true, align: "end" }, { label: t("Credit", "دائن"), mono: true, align: "end" }, { label: t("Balance", "الرصيد"), mono: true, align: "end" }];
    const rows = data.rows.map((r) => { const a = accById.get(r.accountId);
      return [r.date, jvLabel(r.entryYear, r.entryNo ?? 0), ...(data.multi ? [a ? `${a.code} ${nameOf(a)}` : ""] : []), typeLabel(r.type) + (r.status === "draft" ? ` (${t("draft", "مسودة")})` : ""), r.description || "", r.debit || "", r.credit || "", r.running]; });
    const totals = [t("Totals", "الإجماليات"), ...Array(cols.length - 4).fill(""), data.totalDebit, data.totalCredit, ""];
    const ok = openPrint(buildReportHTML({ title: `${data.code ? data.code + " · " : ""}${data.title}`, subtitle: `${data.periodTxt} · ${t("Net movement", "صافي الحركة")} ${fmt(data.net)}`, orgName: head?.orgName || "", taxNumber: head?.taxNumber, logoUrl: head?.logoUrl, address: head?.address, dir: isRTL ? "rtl" : "ltr", lang: lang === "en" ? "en" : "ar", cols, rows, totals }));
    if (!ok) alert(t("Allow pop-ups to print.", "فعّل النوافذ المنبثقة للطباعة."));
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir={isRTL ? "rtl" : "ltr"} onClick={onClose} data-testid="drill">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <FileText size={17} className="text-blue-400" />
          <div className="min-w-0"><div className="text-sm font-bold text-white truncate" data-testid="drill-title"><span className="font-mono text-slate-400 me-2" dir="ltr">{data.code}</span>{data.title}</div>
            <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{data.periodTxt}{data.cash ? ` · ${t("entries touching cash only", "القيود التي تمس النقدية فقط")}` : ""}</div></div>
          {detail && <button type="button" onClick={() => setShowDetail((v) => !v)} className={`${BTN} ms-auto ${showDetail ? "!bg-blue-600 !text-white" : ""}`} data-testid="drill-detail-toggle">{showDetail ? t("Entries", "القيود") : detail.label}</button>}
          <button type="button" onClick={exportX} disabled={!data.rows.length || showDetail} className={`${BTN} ${detail ? "" : "ms-auto"}`} data-testid="drill-export"><Download size={13} /> Excel</button>
          <button type="button" onClick={printX} disabled={!data.rows.length} className={BTN} data-testid="drill-print"><Printer size={13} /> {t("Print", "طباعة")}</button>
          <button type="button" onClick={onClose} aria-label={t("Close", "إغلاق")} data-testid="drill-close" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"><X size={15} /></button>
        </div>
        <div className="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
          <span className="text-slate-400">{t("Net movement", "صافي الحركة")} <span className="font-mono font-bold text-white" dir="ltr" data-testid="drill-net">{fmt(data.net)}</span></span>
          <span className="text-slate-400">{t("In statement", "في القائمة")} <span className="font-mono text-slate-200" dir="ltr">{fmt(data.expected)}</span></span>
          <span className={matches ? "text-emerald-400" : "text-amber-400"} data-testid="drill-match">{matches ? t("Matches the statement ✓", "يطابق القائمة ✓") : t("Differs from the statement", "لا يطابق القائمة")}</span>
          <span className="text-slate-500 ms-auto" data-testid="drill-count">{data.rows.length} {t("movements", "حركة")}</span>
        </div>
        {showDetail && detail ? <div className="overflow-auto p-3" data-testid="drill-detail">{detail.node}</div> : <div className="overflow-auto">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead><tr>{heads.map((h, i) => <th key={i} dir={i >= numFrom ? "ltr" : undefined} className={`${th} ${i >= numFrom ? "text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r, i) => { const a = accById.get(r.accountId); return (
                <tr key={i} className={`hover:bg-white/[0.03] ${r.status === "draft" ? "opacity-60" : ""}`} data-testid="drill-row">
                  <td className={`${td} font-mono text-slate-400`} dir="ltr"><span className="block text-start">{r.date}</span></td>
                  <td className={`${td} font-mono text-blue-300`} dir="ltr"><span className="block text-start">{jvLabel(r.entryYear, r.entryNo ?? 0)}</span></td>
                  {data.multi && <td className={`${td} text-slate-300`}><span className="font-mono text-[10px] text-slate-500 me-1.5" dir="ltr">{a?.code}</span>{a ? nameOf(a) : ""}</td>}
                  <td className={td}><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 whitespace-nowrap">{typeLabel(r.type)}</span>{r.status === "draft" && <span className="text-[9px] text-amber-400 ms-1">{t("draft", "مسودة")}</span>}</td>
                  <td className={`${td} text-slate-300`}>{r.description || "—"}</td>
                  <td className={`${td} text-end font-mono text-emerald-400`} dir="ltr">{r.debit ? fmt(r.debit) : ""}</td>
                  <td className={`${td} text-end font-mono text-amber-400`} dir="ltr">{r.credit ? fmt(r.credit) : ""}</td>
                  <td className={`${td} text-end font-mono font-bold text-white`} dir="ltr">{fmt(r.running)}</td>
                </tr>); })}
              {data.rows.length === 0 && <tr><td colSpan={heads.length} className="p-8 text-center text-slate-500 text-sm" data-testid="drill-empty">{t("No movements.", "لا توجد حركات.")}</td></tr>}
            </tbody>
            {data.rows.length > 0 && <tfoot><tr className="bg-slate-950 font-bold"><td colSpan={heads.length - 3} className="px-2 py-2.5 text-xs text-slate-200 border-t border-slate-600 text-start">{t("Totals", "الإجماليات")}</td>
              <td className="px-2 py-2.5 text-end font-mono text-xs text-emerald-400 border-t border-slate-600" dir="ltr">{fmt(data.totalDebit)}</td><td className="px-2 py-2.5 text-end font-mono text-xs text-amber-400 border-t border-slate-600" dir="ltr">{fmt(data.totalCredit)}</td><td className="px-2 py-2.5 text-end font-mono text-xs text-white border-t border-slate-600" dir="ltr">{fmt(data.net)}</td></tr></tfoot>}
          </table>
        </div>}
      </div>
    </div>
  );
}
