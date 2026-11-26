import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck, Plus, Search, Package, CalendarDays, Save, RefreshCw,
  Upload, Printer, Check, AlertTriangle, TrendingUp, TrendingDown, Scale,
  Boxes, X, ClipboardList, Warehouse, Clock3, Ban, Download, BookOpen,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LanguageContext";
import * as DB from "../lib/accountingDb";
import { supabase } from "../lib/supabase";
import type { GLAccount, GLWarehouse } from "../lib/accountingDb";

type SessionStatus = "draft" | "in_review" | "approved" | "rejected";
type CountSession = {
  id: number; organization_id: number; branch_id: number; warehouse_id: number;
  reference_no: string; count_date: string; status: SessionStatus; description: string | null;
  notes: string | null; accounting_entry_id: number | null; accounting_status: string;
  created_at: string; approved_at?: string | null; rejection_reason?: string | null;
};
type CountItem = {
  id: number; session_id: number; product_id: number; product_code: string | null;
  product_name: string; category: string | null; unit_name: string;
  system_quantity: number; physical_quantity: number | null; difference: number;
  unit_cost: number; difference_value: number; notes: string | null;
};
type CountEvent = { id: number; action: string; from_status: string | null; to_status: string | null; notes: string | null; actor_id: string | null; created_at: string };
type Notice = { kind: "success" | "error" | "info"; text: string };
type ImportPreviewRow = { itemId: number; code: string; productName: string; quantity: number; systemQuantity: number; difference: number };
type ImportPreview = { rows: ImportPreviewRow[]; missing: string[]; totalRows: number };

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number, digits = 2) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const normalizeSearch = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15";

export default function StockAdjustmentsPage() {
  const { ownedShopId } = useAuth();
  const { lang, t, isRTL } = useLang();
  const [org, setOrg] = useState<{ id: number; name: string } | null>(null);
  const [branchName, setBranchName] = useState("");
  const [warehouses, setWarehouses] = useState<GLWarehouse[]>([]);
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [sessions, setSessions] = useState<CountSession[]>([]);
  const [items, setItems] = useState<CountItem[]>([]);
  const [events, setEvents] = useState<CountEvent[]>([]);
  const [selected, setSelected] = useState<CountSession | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newDate, setNewDate] = useState(today());
  const [newDescription, setNewDescription] = useState("");
  const [newWarehouse, setNewWarehouse] = useState<number | "">("");
  const [itemSearch, setItemSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [differenceFilter, setDifferenceFilter] = useState("all");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [surplusAccount, setSurplusAccount] = useState<number | "">("");
  const [shortageAccount, setShortageAccount] = useState<number | "">("");
  const [inventoryAccount, setInventoryAccount] = useState<number | "">("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBase = useCallback(async () => {
    if (!ownedShopId) { setLoading(false); return; }
    setLoading(true);
    const branchId = Number(ownedShopId);
    const o = await DB.getOrgForBranch(branchId);
    if (!o) { setOrg(null); setLoading(false); return; }
    const [ws, shop, accountRows] = await Promise.all([
      DB.fetchWarehouses(o.id),
      supabase.from("shops").select("shop_name").eq("id", branchId).maybeSingle(),
      DB.fetchAccounts(o.id),
    ]);
    setOrg(o);
    setWarehouses(ws.filter((w) => w.branch_id === branchId));
    setBranchName(shop.data?.shop_name || t("Current branch", "الفرع الحالي"));
    setAccounts(accountRows);
    const inv = accountRows.find((a) => a.code === "1104" && !a.is_group) ?? accountRows.find((a) => a.type === "asset" && !a.is_group && /inventory|مخزون/i.test(a.name));
    const sur = accountRows.find((a) => !a.is_group && /surplus|فائض/i.test(a.name));
    const sh = accountRows.find((a) => !a.is_group && /shortage|عجز|تالف/i.test(a.name));
    setInventoryAccount(inv?.id ?? ""); setSurplusAccount(sur?.id ?? ""); setShortageAccount(sh?.id ?? "");
    if (ws.length) setWarehouseId((current) => current || ws.find((w) => w.branch_id === branchId && w.is_default)?.id || ws.find((w) => w.branch_id === branchId)?.id || "");
    setLoading(false);
  }, [ownedShopId, t]);

  const loadSessions = useCallback(async () => {
    if (!org || !ownedShopId) return;
    let query = supabase.from("inventory_count_sessions").select("*")
      .eq("organization_id", org.id).eq("branch_id", Number(ownedShopId))
      .order("created_at", { ascending: false }).limit(250);
    if (fromDate) query = query.gte("count_date", fromDate);
    if (toDate) query = query.lte("count_date", toDate);
    if (warehouseId) query = query.eq("warehouse_id", Number(warehouseId));
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) { setNotice({ kind: "error", text: translateBackendError(error.message) }); return; }
    setSessions((data || []) as CountSession[]);
  }, [org, ownedShopId, fromDate, toDate, warehouseId, statusFilter]);

  const loadDetail = useCallback(async (session: CountSession) => {
    setSelected(session); setDetailLoading(true);
    const [itemResult, eventResult] = await Promise.all([
      supabase.from("inventory_count_items").select("*").eq("session_id", session.id).order("product_name"),
      supabase.from("inventory_count_events").select("*").eq("session_id", session.id).order("created_at", { ascending: false }),
    ]);
    if (itemResult.error) setNotice({ kind: "error", text: translateBackendError(itemResult.error.message) });
    else setItems((itemResult.data || []) as CountItem[]);
    if (!eventResult.error) setEvents((eventResult.data || []) as CountEvent[]);
    setDetailLoading(false);
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { setSelected(null); setItems([]); setEvents([]); setSessions([]); setWarehouseId(""); }, [ownedShopId]);
  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const currentWarehouse = warehouses.find((w) => w.id === (selected?.warehouse_id ?? warehouseId));
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter((v): v is string => Boolean(v)))).sort(), [items]);
  const filteredItems = useMemo(() => {
    const q = normalizeSearch(itemSearch);
    return items.filter((i) => {
      const matchesSearch = !q || [i.product_name, i.product_code || "", i.category || ""].some((v) => normalizeSearch(v).includes(q));
      const matchesCategory = categoryFilter === "all" || i.category === categoryFilter;
      const difference = i.physical_quantity === null ? null : Number(i.physical_quantity) - Number(i.system_quantity);
      const matchesDifference = differenceFilter === "all" ||
        (differenceFilter === "pending" && difference === null) ||
        (differenceFilter === "surplus" && difference !== null && difference > 0) ||
        (differenceFilter === "shortage" && difference !== null && difference < 0) ||
        (differenceFilter === "none" && difference === 0);
      return matchesSearch && matchesCategory && matchesDifference;
    });
  }, [items, itemSearch, categoryFilter, differenceFilter]);
  const summary = useMemo(() => {
    const counted = items.filter((i) => i.physical_quantity !== null).length;
    const surplus = items.filter((i) => i.physical_quantity !== null && Number(i.physical_quantity) > Number(i.system_quantity));
    const shortage = items.filter((i) => i.physical_quantity !== null && Number(i.physical_quantity) < Number(i.system_quantity));
    const noDiff = items.filter((i) => i.physical_quantity !== null && Number(i.physical_quantity) === Number(i.system_quantity)).length;
    const surplusValue = round2(surplus.reduce((s, i) => s + Math.abs(Number(i.difference_value) || ((Number(i.physical_quantity) - Number(i.system_quantity)) * Number(i.unit_cost))), 0));
    const shortageValue = round2(shortage.reduce((s, i) => s + Math.abs(Number(i.difference_value) || ((Number(i.physical_quantity) - Number(i.system_quantity)) * Number(i.unit_cost))), 0));
    return {
      total: items.length, counted, surplusCount: surplus.length, shortageCount: shortage.length, noDiff,
      surplusQty: round3(surplus.reduce((s, i) => s + Math.max(0, Number(i.physical_quantity) - Number(i.system_quantity)), 0)),
      shortageQty: round3(shortage.reduce((s, i) => s + Math.max(0, Number(i.system_quantity) - Number(i.physical_quantity)), 0)),
      surplusValue, shortageValue, net: round2(surplusValue - shortageValue),
    };
  }, [items]);

  const createSession = async () => {
    if (!org || !ownedShopId || !newWarehouse) return;
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc("create_inventory_count_session", {
      p_org_id: org.id, p_branch_id: Number(ownedShopId), p_warehouse_id: Number(newWarehouse),
      p_count_date: newDate, p_description: newDescription || null, p_product_ids: null, p_category: null,
    });
    setBusy(false);
    if (error || !(data as any)?.ok) { setNotice({ kind: "error", text: translateBackendError(error?.message || (data as any)?.error || t("Could not create count session.", "تعذر إنشاء جلسة الجرد.")) }); return; }
    setShowCreate(false); setNewDescription(""); setWarehouseId(Number(newWarehouse));
    await loadSessions();
    const { data: created } = await supabase.from("inventory_count_sessions").select("*").eq("id", Number((data as any).id)).single();
    if (created) await loadDetail(created as CountSession);
    setNotice({ kind: "success", text: `${t("Count session created", "تم إنشاء جلسة الجرد")}: ${(data as any).reference_no} · ${(data as any).items_count} ${t("items", "صنف")}` });
  };

  const updateItem = (id: number, patch: Partial<CountItem>) => {
    setItems((old) => old.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.physical_quantity !== undefined) {
        const physical = patch.physical_quantity === null ? null : Math.round(Number(patch.physical_quantity));
        next.physical_quantity = physical;
        next.difference = physical === null ? 0 : round3(physical - Number(item.system_quantity));
        next.difference_value = physical === null ? 0 : round2(next.difference * Number(item.unit_cost));
      }
      return next;
    }));
  };

  const saveDraft = async (silent = false) => {
    if (!selected) return false;
    setBusy(true);
    const payload = items.filter((i) => i.physical_quantity !== null || (i.notes || "").trim()).map((i) => ({
      product_id: i.product_id, physical_quantity: i.physical_quantity, notes: i.notes,
    }));
    const { data, error } = await supabase.rpc("save_inventory_count_items", { p_session_id: selected.id, p_items: payload });
    setBusy(false);
    if (error || !(data as any)?.ok) { setNotice({ kind: "error", text: translateBackendError(error?.message || t("Could not save draft.", "تعذر حفظ المسودة.")) }); return false; }
    if (!silent) setNotice({ kind: "success", text: t("Draft saved successfully.", "تم حفظ المسودة بنجاح.") });
    const { data: refreshed } = await supabase.from("inventory_count_items").select("*").eq("session_id", selected.id).order("product_name");
    if (refreshed) setItems(refreshed as CountItem[]);
    await loadSessions();
    return true;
  };

  const submitForReview = async () => {
    if (!selected) return;
    if (summary.counted !== summary.total) { setNotice({ kind: "error", text: t("Enter physical quantities for all items first.", "أدخل الكمية الفعلية (عدد صحيح) لجميع الأصناف أولًا.") }); return; }
    if (!(await saveDraft(true))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_inventory_count_for_review", { p_session_id: selected.id });
    setBusy(false);
    if (error || !(data as any)?.ok) { setNotice({ kind: "error", text: translateBackendError(error?.message || t("Could not submit for review.", "تعذر إرسال الجرد للمراجعة.")) }); return; }
    const next = { ...selected, status: "in_review" as SessionStatus };
    setSelected(next); await loadSessions();
    setNotice({ kind: "success", text: t("Count submitted for review.", "تم إرسال الجرد للمراجعة.") });
  };

  const approveSession = async () => {
    if (!selected) return;
    const confirmText = t("Approve this count and post stock movements? This cannot be undone from this screen.", "هل تعتمد الجرد وترحّل حركات المخزون؟ لا يمكن التراجع من هذه الشاشة.");
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("approve_inventory_count", { p_session_id: selected.id });
    setBusy(false);
    if (error || !(data as any)?.ok) { setNotice({ kind: "error", text: translateBackendError(error?.message || t("Approval failed.", "فشل اعتماد الجرد.")) }); return; }
    const hasFinancialDifference = Number((data as any)?.surplus_value || 0) > 0 || Number((data as any)?.shortage_value || 0) > 0;
    const next = { ...selected, status: "approved" as SessionStatus, approved_at: new Date().toISOString(), accounting_status: hasFinancialDifference ? "not_posted" : "not_required" };
    setSelected(next); await loadSessions();
    const { data: refreshed } = await supabase.from("inventory_count_items").select("*").eq("session_id", selected.id).order("product_name");
    if (refreshed) setItems(refreshed as CountItem[]);
    setNotice({ kind: "success", text: t("Inventory quantities and stock movements were posted successfully.", "تم اعتماد كميات الجرد وترحيل حركات المخزون بنجاح.") });
  };

  const rejectSession = async () => {
    if (!selected) return;
    const reason = window.prompt(t("Enter the rejection reason:", "اكتب سبب الرفض:"));
    if (!reason?.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reject_inventory_count", { p_session_id: selected.id, p_reason: reason.trim() });
    setBusy(false);
    if (error || !(data as any)?.ok) { setNotice({ kind: "error", text: translateBackendError(error?.message || t("Rejection failed.", "تعذر رفض الجرد.")) }); return; }
    setSelected({ ...selected, status: "rejected", rejection_reason: reason.trim() }); await loadSessions();
    setNotice({ kind: "info", text: t("Count session rejected.", "تم رفض جلسة الجرد.") });
  };

  const postAccounting = async () => {
    if (!selected) return;
    if (!inventoryAccount || (summary.surplusValue > 0 && !surplusAccount) || (summary.shortageValue > 0 && !shortageAccount)) {
      setNotice({ kind: "error", text: t("Select the inventory, surplus and shortage accounts before posting.", "اختر حساب المخزون وحساب الفائض وحساب العجز قبل الترحيل.") }); return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("post_inventory_count_journal", {
      p_session_id: selected.id,
      p_inventory_account_id: Number(inventoryAccount),
      p_surplus_account_id: surplusAccount === "" ? null : Number(surplusAccount),
      p_shortage_account_id: shortageAccount === "" ? null : Number(shortageAccount),
      p_description: `${t("Inventory count adjustment", "تسوية فروق جرد المخزون")} — ${selected.reference_no}`,
    });
    setBusy(false);
    if (error || !(data as any)?.ok) {
      setNotice({ kind: "error", text: translateBackendError(error?.message || t("Accounting journal posting failed.", "فشل ترحيل القيد المحاسبي.")) });
      return;
    }
    if ((data as any).not_required) {
      setSelected({ ...selected, accounting_status: "not_required" });
      setNotice({ kind: "info", text: t("No financial difference exists; no journal entry is required.", "لا توجد فروق مالية؛ لا يلزم إنشاء قيد محاسبي.") });
      return;
    }
    const entryId = Number((data as any).entry_id);
    setSelected({ ...selected, accounting_entry_id: entryId, accounting_status: "posted" });
    await loadSessions();
    setNotice({ kind: "success", text: `${t("Accounting entry posted", "تم ترحيل القيد المحاسبي")}: ${entryId} · ${(data as any).entry_no}/${(data as any).entry_year}` });
  };

  const fillRemaining = () => setItems((old) => old.map((i) => i.physical_quantity === null ? { ...i, physical_quantity: Number(i.system_quantity), difference: 0, difference_value: 0 } : i));

  const exportCsv = () => {
    const headers = [t("Product Code", "كود الصنف"), t("Product Name", "اسم الصنف"), t("Unit", "الوحدة"), t("System Quantity", "الكمية الدفترية"), t("Physical Quantity (whole units)", "كمية الجرد الفعلية"), t("Difference", "الفرق"), t("Difference Value (SAR)", "قيمة الفرق (ر.س)"), t("Notes", "ملاحظات")];
    const rows = items.map((i) => [i.product_code || "", i.product_name, i.unit_name, i.system_quantity, i.physical_quantity ?? "", i.difference, i.difference_value, i.notes || ""]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${selected?.reference_no || "inventory-count"}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string) => {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    const parseLine = (line: string) => line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.map((v) => v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
    if (lines.length < 2) return [] as Array<{ code: string; qty: number }>;
    const headers = parseLine(lines[0]).map(normalizeHeader);
    const codeIndex = headers.findIndex((h) => ["productcode", "code", "sku", "barcode", "كودالصنف", "رمزالصنف", "باركود"].includes(h));
    const qtyIndex = headers.findIndex((h) => ["physicalquantity", "countedquantity", "quantity", "qty", "الجردالفعلي", "الكميةالفعلية", "الكمية"].includes(h));
    if (codeIndex < 0 || qtyIndex < 0) throw new Error(t("CSV must include Product Code and Physical Quantity (whole units) columns.", "يجب أن يحتوي CSV على عمودي كود الصنف والكمية الفعلية (عدد صحيح)."));
    return lines.slice(1).map((line) => { const cols = parseLine(line); return { code: (cols[codeIndex] || "").trim(), qty: Number((cols[qtyIndex] || "").replace(/,/g, "")) }; }).filter((r) => r.code && Number.isFinite(r.qty) && r.qty >= 0 && Number.isInteger(r.qty));
  };
  const normalizeHeader = (v: string) => v.toLocaleLowerCase().replace(/[\s_\-()]/g, "").replace(/[ًٌٍَُِّْٰ]/g, "");

  const readXlsx = async (file: File): Promise<Array<{ code: string; qty: number }>> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error(t("Invalid XLSX file.", "ملف XLSX غير صالح."));
    const entries = view.getUint16(eocd + 10, true); let cursor = view.getUint32(eocd + 16, true);
    const files = new Map<string, Uint8Array>();
    for (let n = 0; n < entries; n++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const method = view.getUint16(cursor + 10, true), compressedSize = view.getUint32(cursor + 20, true);
      const nameLen = view.getUint16(cursor + 28, true), extraLen = view.getUint16(cursor + 30, true), commentLen = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
      const localNameLen = view.getUint16(localOffset + 26, true), localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      let content = compressed;
      if (method === 8) {
        const compressedBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
        const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as any));
        content = new Uint8Array(await new Response(stream).arrayBuffer());
      } else if (method !== 0) throw new Error(t("Unsupported XLSX compression method.", "طريقة ضغط ملف XLSX غير مدعومة."));
      files.set(name, content);
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    const xml = (name: string) => { const v = files.get(name); return v ? new DOMParser().parseFromString(new TextDecoder().decode(v), "application/xml") : null; };
    const workbook = xml("xl/workbook.xml"); const rels = xml("xl/_rels/workbook.xml.rels");
    const firstSheet = workbook?.getElementsByTagName("sheet")[0];
    const relId = firstSheet?.getAttribute("r:id");
    const rel = relId ? Array.from(rels?.getElementsByTagName("Relationship") || []).find((r) => r.getAttribute("Id") === relId) : null;
    const target = rel?.getAttribute("Target") || "worksheets/sheet1.xml";
    const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const sheet = xml(sheetPath); const sharedDoc = xml("xl/sharedStrings.xml");
    const shared = Array.from(sharedDoc?.getElementsByTagName("si") || []).map((si) => Array.from(si.getElementsByTagName("t")).map((x) => x.textContent || "").join(""));
    if (!sheet) throw new Error(t("Could not read the first worksheet.", "تعذر قراءة ورقة العمل الأولى."));
    const rows = Array.from(sheet.getElementsByTagName("row")).map((row) => Array.from(row.getElementsByTagName("c")).map((cell) => {
      const ref = cell.getAttribute("r") || "A1"; const col = ref.match(/^[A-Z]+/)?.[0] || "A";
      const value = cell.getElementsByTagName("v")[0]?.textContent || "";
      const type = cell.getAttribute("t");
      const text = type === "s" ? (shared[Number(value)] || "") : type === "inlineStr" ? (cell.getElementsByTagName("t")[0]?.textContent || "") : value;
      let idx = 0; for (const ch of col) idx = idx * 26 + ch.charCodeAt(0) - 64; return [idx - 1, text] as const;
    }).reduce((arr, [idx, value]) => { arr[idx] = value; return arr; }, [] as string[]));
    if (rows.length < 2) return [];
    const headers = rows[0].map(normalizeHeader);
    const codeIndex = headers.findIndex((h) => ["productcode", "code", "sku", "barcode", "كودالصنف", "رمزالصنف", "باركود"].includes(h));
    const qtyIndex = headers.findIndex((h) => ["physicalquantity", "countedquantity", "quantity", "qty", "الجردالفعلي", "الكميةالفعلية", "الكمية"].includes(h));
    if (codeIndex < 0 || qtyIndex < 0) throw new Error(t("XLSX must include Product Code and Physical Quantity (whole units) columns.", "يجب أن يحتوي Excel على عمودي كود الصنف والكمية الفعلية (عدد صحيح)."));
    return rows.slice(1).map((r) => ({ code: String(r[codeIndex] || "").trim(), qty: Number(String(r[qtyIndex] || "").replace(/,/g, "")) })).filter((r) => r.code && Number.isFinite(r.qty) && r.qty >= 0 && Number.isInteger(r.qty));
  };

  const importFile = async (file?: File) => {
    if (!file || !selected || selected.status !== "draft") return;
    setBusy(true); setNotice(null);
    try {
      const rows = file.name.toLowerCase().endsWith(".csv") ? parseCsv(await file.text()) : await readXlsx(file);
      const byCode = new Map<string, CountItem>(items.filter((i) => i.product_code).map((i) => [String(i.product_code).toLowerCase(), i] as const));
      const byName = new Map<string, CountItem>(items.map((i) => [i.product_name.toLowerCase(), i] as const));
      const matchedRows: ImportPreviewRow[] = []; const missing: string[] = []; const seen = new Set<string>();
      for (const row of rows) {
        const key = row.code.toLowerCase();
        if (seen.has(key)) { missing.push(`${row.code} (${t("duplicate row", "صف مكرر")})`); continue; }
        seen.add(key);
        const item = byCode.get(key) || byName.get(key);
        if (!item) { missing.push(row.code); continue; }
        matchedRows.push({ itemId: item.id, code: row.code, productName: item.product_name, quantity: Math.round(row.qty), systemQuantity: Number(item.system_quantity), difference: round3(row.qty - Number(item.system_quantity)) });
      }
      setImportPreview({ rows: matchedRows, missing, totalRows: rows.length });
      setNotice({ kind: "info", text: t("Import preview is ready. Review matched and unmatched rows before applying.", "معاينة الاستيراد جاهزة. راجع الأصناف المطابقة وغير المطابقة قبل التطبيق.") });
    } catch (e: any) { setNotice({ kind: "error", text: e?.message || t("Import failed.", "فشل الاستيراد.") }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const applyImportPreview = () => {
    if (!importPreview) return;
    const updates = new Map(importPreview.rows.map((row) => [row.itemId, row.quantity] as const));
    setItems((old) => old.map((item) => {
      if (!updates.has(item.id)) return item;
      const physical = updates.get(item.id)!;
      const difference = round3(physical - item.system_quantity);
      return { ...item, physical_quantity: physical, difference, difference_value: round2(difference * item.unit_cost) };
    }));
    setNotice({ kind: importPreview.missing.length ? "info" : "success", text: `${t("Applied", "تم تطبيق")} ${importPreview.rows.length} ${t("rows", "صفوف")}. ${importPreview.missing.length ? `${t("Unmatched / duplicate rows", "صفوف غير مطابقة أو مكررة")}: ${importPreview.missing.slice(0, 8).join(", ")}` : ""}` });
    setImportPreview(null);
  };

  const printReport = () => window.print();
  const statusLabel = (status: SessionStatus) => ({ draft: t("Draft", "مسودة"), in_review: t("Under Review", "قيد المراجعة"), approved: t("Approved", "معتمد"), rejected: t("Rejected", "مرفوض") }[status]);
  const statusClass = (status: SessionStatus) => ({ draft: "bg-slate-700/70 text-slate-200", in_review: "bg-amber-500/15 text-amber-300", approved: "bg-emerald-500/15 text-emerald-300", rejected: "bg-red-500/15 text-red-300" }[status]);
  const translateBackendError = (message: string) => {
    if (lang !== "en") return message;
    const dictionary: Array<[string, string]> = [
      ["غير مصرح بإنشاء جلسة جرد لهذا الفرع", "You are not authorized to create a count session for this branch."],
      ["المستودع لا يتبع المؤسسة والفرع المحددين", "The selected warehouse does not belong to this organization and branch."],
      ["لا توجد أصناف مطابقة لإنشاء جلسة الجرد", "No matching products were found for this count session."],
      ["جلسة الجرد غير موجودة", "The inventory count session was not found."],
      ["غير مصرح بتعديل جلسة الجرد", "You are not authorized to edit this count session."],
      ["لا يمكن تعديل جلسة ليست مسودة", "Only draft sessions can be edited."],
      ["صيغة تفاصيل الجرد غير صحيحة", "The inventory count details payload is invalid."],
      ["الكمية الفعلية (عدد صحيح) يجب أن تكون صفرًا أو أكبر", "Physical quantity must be zero or greater."],
      ["يجب إدخال الكمية الفعلية (عدد صحيح) لجميع الأصناف قبل الإرسال للمراجعة", "Enter physical quantities for all products before submitting for review."],
      ["الجلسة ليست في حالة مسودة", "The session is not in Draft status."],
      ["غير مصرح بإرسال الجرد للمراجعة", "You are not authorized to submit this count for review."],
      ["يمكن رفض الجلسات قيد المراجعة فقط", "Only sessions under review can be rejected."],
      ["سبب الرفض مطلوب", "A rejection reason is required."],
      ["غير مصرح برفض جلسة الجرد", "You are not authorized to reject this count session."],
      ["يمكن اعتماد الجلسات قيد المراجعة فقط", "Only sessions under review can be approved."],
      ["غير مصرح باعتماد جلسة الجرد", "You are not authorized to approve this count session."],
      ["توجد أصناف لم يتم جردها", "Some products have not been counted."],
      ["تغير رصيد الصنف", "A product balance changed after the count started. Refresh the count and review it again."],
      ["تعذر مزامنة رصيد الفرع للصنف", "The branch stock balance could not be synchronized."],
      ["يجب اعتماد الجرد قبل إنشاء القيد", "Approve the inventory count before creating its journal entry."],
      ["يوجد حجز سابق لإنشاء القيد", "A journal posting reservation already exists. Verify the journal before retrying."],
      ["لا يوجد حجز قيد صالح لهذه الجلسة", "There is no valid journal reservation for this session."],
    ];
    const match = dictionary.find(([ar]) => message.includes(ar));
    return match ? match[1] : message;
  };
  const eventLabel = (action: string) => ({
    created: t("Session created", "تم إنشاء الجلسة"),
    draft_saved: t("Draft saved", "تم حفظ المسودة"),
    submitted: t("Submitted for review", "تم الإرسال للمراجعة"),
    rejected: t("Session rejected", "تم رفض الجلسة"),
    approved: t("Stock adjustment approved", "تم اعتماد تسوية المخزون"),
    journal_posted: t("Accounting journal posted", "تم ترحيل القيد المحاسبي"),
  }[action] || action);
  const kpis = [
    { label: t("Count Status", "حالة الجرد"), value: selected ? statusLabel(selected.status) : t("Sessions", "جلسات الجرد"), sub: selected?.reference_no || `${sessions.length} ${t("sessions", "جلسة")}`, icon: Check, tone: "emerald" },
    { label: t("Counted Items", "الأصناف المجردة"), value: `${summary.counted} / ${summary.total}`, sub: t("Physical quantities entered", "الكميات الفعلية المدخلة"), icon: ClipboardCheck, tone: "blue" },
    { label: t("Surplus Items", "أصناف بزيادة"), value: summary.surplusCount, sub: `+${fmt(summary.surplusValue)} SAR`, icon: TrendingUp, tone: "amber" },
    { label: t("Shortage Items", "أصناف بعجز"), value: summary.shortageCount, sub: `-${fmt(summary.shortageValue)} SAR`, icon: TrendingDown, tone: "red" },
    { label: t("Difference Value", "قيمة الفروق"), value: `${fmt(summary.net)} ${t("SAR", "ر.س")}`, sub: t("Net surplus / shortage", "صافي الزيادة أو العجز"), icon: Scale, tone: "violet" },
  ];

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center bg-[#030817]"><div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;
  if (!ownedShopId || !org) return <div className="p-8 text-center text-slate-400">{t("Select an active branch to manage inventory counts.", "اختر فرعًا نشطًا لإدارة الجرد.")}</div>;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="stock-count-page min-h-full space-y-5 bg-[#020b1c] p-4 text-slate-100 lg:p-6">
      <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />

      <style>{`
        .stock-count-page { color-scheme: dark; }
        .stock-count-page .sc-panel { background:linear-gradient(145deg,rgba(10,25,48,.98),rgba(5,15,32,.98)); border:1px solid rgba(67,100,145,.34); box-shadow:0 12px 32px rgba(0,0,0,.12); }
        .stock-count-page .sc-control { min-height:42px; border:1px solid rgba(100,126,164,.35); background:#101e34; color:#e5edf9; border-radius:11px; padding:9px 12px; outline:none; }
        .stock-count-page .sc-control:focus { border-color:#2584ff; box-shadow:0 0 0 3px rgba(37,132,255,.13); }
        .stock-count-page .sc-table th { background:#10223b; color:#c8d8ee; font-weight:700; white-space:nowrap; }
        .stock-count-page .sc-table td,.stock-count-page .sc-table th { border-bottom:1px solid rgba(75,103,143,.24); padding:11px 10px; }
        .stock-count-page .sc-table tbody tr:hover { background:rgba(31,76,132,.16); }
        .stock-count-page .sc-primary { background:linear-gradient(135deg,#147cff,#0757df); box-shadow:0 8px 20px rgba(0,91,230,.22); }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/15 text-blue-300"><Boxes size={24} /></div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500">{org.name} <span className="mx-1 text-slate-700">/</span> {branchName} <span className="mx-1 text-slate-700">/</span> {t("Inventory", "المخزون")}</div>
            <h1 className="text-2xl font-black tracking-tight text-white">{t("Inventory Count & Reconciliation", "الجرد والتسويات")}</h1>
            <p className="mt-1 text-xs text-slate-400">{t("Physical stock count, variance review and controlled inventory adjustment", "إجراء جرد فعلي ومراجعة الفروق واعتماد تسويات المخزون")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={printReport} disabled={!selected} className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-[#12223a] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"><Printer size={16}/>{t("Print", "طباعة")}</button>
          <button onClick={() => fileRef.current?.click()} disabled={!selected || selected.status !== "draft"} className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-[#12223a] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"><Upload size={16}/>{t("Import file", "استيراد من ملف")}</button>
          <button onClick={() => { setNewWarehouse(warehouseId || ""); setShowCreate(true); }} className="sc-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-white"><Plus size={18}/>{t("New Count", "جرد جديد")}</button>
        </div>
      </div>

      {notice && <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-300" : notice.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span className="flex-1">{notice.text}</span><button onClick={() => setNotice(null)}><X size={15}/></button></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon;
          const styles: Record<string,string> = { emerald:"border-emerald-500/50 bg-gradient-to-br from-emerald-950/80 to-emerald-900/20 text-emerald-300", blue:"border-sky-500/50 bg-gradient-to-br from-blue-950/80 to-blue-900/20 text-sky-300", amber:"border-amber-500/50 bg-gradient-to-br from-amber-950/80 to-amber-900/20 text-amber-300", red:"border-red-500/50 bg-gradient-to-br from-red-950/80 to-red-900/20 text-red-300", violet:"border-violet-500/50 bg-gradient-to-br from-violet-950/80 to-violet-900/20 text-violet-300" };
          return <div key={k.label} className={`flex min-h-[104px] items-center justify-between gap-3 rounded-2xl border p-4 ${styles[k.tone]}`}><div className="min-w-0"><div className="text-xs font-semibold opacity-80">{k.label}</div><div className="mt-2 truncate text-2xl font-black tabular-nums text-white">{k.value}</div><div className="mt-1 text-[11px] opacity-65">{k.sub}</div></div><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/20"><Icon size={24}/></div></div>;
        })}
      </div>

      <section className="sc-panel rounded-2xl p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="font-extrabold text-white">{t("Count workflow", "مراحل الجرد")}</div><div className="text-xs text-slate-400">{selected?.reference_no || t("Select an existing session or create a new count", "اختر جلسة قائمة أو أنشئ جردًا جديدًا")}</div></div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            {label:t("Count details", "بيانات الجرد"), icon:ClipboardList, done:!!selected},
            {label:t("Enter quantities", "إدخال الكميات"), icon:Package, done:!!selected && summary.counted > 0},
            {label:t("Review variances", "مراجعة الفروق"), icon:Scale, done:!!selected && (selected.status === "in_review" || selected.status === "approved")},
            {label:t("Approve adjustment", "اعتماد التسوية"), icon:Check, done:selected?.status === "approved"},
          ].map((step,index) => { const StepIcon=step.icon; return <div key={step.label} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${step.done ? "border-emerald-500/50 bg-emerald-500/10" : "border-slate-700/70 bg-[#0b1930]"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400"}`}>{step.done ? <Check size={17}/> : <StepIcon size={16}/>}</span><div><div className="text-[10px] text-slate-500">{t("STEP", "المرحلة")} {index+1}</div><div className={`text-xs font-bold ${step.done ? "text-emerald-300" : "text-slate-300"}`}>{step.label}</div></div></div>; })}
        </div>
      </section>

      <section className="sc-panel flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><Warehouse size={16}/>{t("Warehouse", "المستودع")}</div>
        <select value={warehouseId} onChange={(e)=>{setWarehouseId(e.target.value?Number(e.target.value):"");setSelected(null);setItems([]);}} className="sc-control min-w-[190px] text-sm"><option value="">{t("Select warehouse", "اختر المستودع")}</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><CalendarDays size={15}/>{t("Date", "التاريخ")}</div>
        <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="sc-control text-sm" aria-label={t("From date", "من تاريخ")}/>
        <span className="text-slate-500">—</span>
        <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="sc-control text-sm" aria-label={t("To date", "إلى تاريخ")}/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} className="sc-control text-sm"><option value="all">{t("All statuses", "كل الحالات")}</option><option value="draft">{t("Draft", "مسودة")}</option><option value="in_review">{t("Under review", "قيد المراجعة")}</option><option value="approved">{t("Approved", "معتمد")}</option><option value="rejected">{t("Rejected", "مرفوض")}</option></select>
        <button onClick={()=>void loadSessions()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm font-bold hover:bg-slate-700"><RefreshCw size={15}/>{t("Refresh", "تحديث")}</button>
      </section>

      {!selected ? <section className="sc-panel overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-4"><div className="flex items-center gap-2 font-extrabold"><ClipboardList size={18} className="text-blue-400"/>{t("Inventory count sessions", "جلسات الجرد")}</div><div className="relative w-full max-w-sm"><Search size={15} className={`absolute top-1/2 -translate-y-1/2 text-slate-500 ${isRTL?"right-3":"left-3"}`}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search by session number or description", "ابحث برقم الجلسة أو الوصف")} className={`sc-control w-full ${isRTL?"pr-9":"pl-9"}`}/></div></div>
        <div className="overflow-x-auto"><table className="sc-table w-full min-w-[760px] text-sm"><thead><tr><th className="text-start">{t("Session no.", "رقم الجرد")}</th><th className="text-start">{t("Date", "التاريخ")}</th><th className="text-start">{t("Warehouse", "المستودع")}</th><th className="text-start">{t("Description", "الوصف")}</th><th className="text-center">{t("Status", "الحالة")}</th><th className="text-center">{t("Action", "الإجراء")}</th></tr></thead><tbody>{sessions.filter(s=>normalizeSearch(`${s.reference_no} ${s.description||""}`).includes(normalizeSearch(search))).map(s=><tr key={s.id}><td className="font-mono text-sky-300">{s.reference_no}</td><td className="text-slate-300">{s.count_date}</td><td>{warehouses.find(w=>w.id===s.warehouse_id)?.name||`#${s.warehouse_id}`}</td><td className="max-w-[260px] truncate text-slate-400">{s.description||"—"}</td><td className="text-center"><span className={`rounded-full px-3 py-1 text-[11px] font-bold ${statusClass(s.status)}`}>{statusLabel(s.status)}</span></td><td className="text-center"><button onClick={()=>void loadDetail(s)} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-500/20">{t("Open session", "فتح الجلسة")}</button></td></tr>)}{sessions.length===0&&<tr><td colSpan={6} className="py-16 text-center text-slate-500"><Package size={30} className="mx-auto mb-2 opacity-40"/>{t("No count sessions found. Create a new count to begin.", "لا توجد جلسات جرد. أنشئ جردًا جديدًا للبدء.")}</td></tr>}</tbody></table></div>
      </section> : <>
        <section className="sc-panel overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 p-4">
            <div><div className="text-[11px] text-slate-500">{t("ACTIVE COUNT SESSION", "جلسة الجرد الحالية")}</div><div className="mt-1 flex flex-wrap items-center gap-3"><h2 className="text-lg font-black text-white">{selected.reference_no}</h2><span className={`rounded-full px-3 py-1 text-[11px] font-bold ${statusClass(selected.status)}`}>{statusLabel(selected.status)}</span></div><div className="mt-1 text-xs text-slate-400">{branchName} · {currentWarehouse?.name||"—"} · {selected.count_date}</div></div>
            <div className="flex flex-wrap gap-2"><button onClick={()=>{setSelected(null);setItems([]);setEvents([]);}} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800">{t("Back to sessions", "العودة للجلسات")}</button>{selected.status==="draft"&&<button onClick={fillRemaining} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200">{t("Fill remaining with system qty", "مطابقة المتبقي مع الدفتري")}</button>}<button onClick={exportCsv} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"><Download size={14} className="inline me-1"/>{t("Export", "تصدير")}</button></div>
          </div>
          {selected.status==="rejected"&&selected.rejection_reason&&<div className="m-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{t("Rejection reason", "سبب الرفض")}: {selected.rejection_reason}</div>}
          <div className="grid grid-cols-2 gap-3 border-b border-slate-700/60 p-4 md:grid-cols-4"><MiniStat label={t("Counted items", "الأصناف المجردة")} value={`${summary.counted} / ${summary.total}`} tone="blue"/><MiniStat label={t("Surplus value", "قيمة الزيادة")} value={`${fmt(summary.surplusValue)} ${t("SAR", "ر.س")}`} tone="green"/><MiniStat label={t("Shortage value", "قيمة العجز")} value={`${fmt(summary.shortageValue)} ${t("SAR", "ر.س")}`} tone="red"/><MiniStat label={t("Net difference", "صافي الفروق")} value={`${fmt(summary.net)} ${t("SAR", "ر.س")}`} tone="blue"/></div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/60 p-3"><div className="relative min-w-[220px] flex-1"><Search size={15} className={`absolute top-1/2 -translate-y-1/2 text-slate-500 ${isRTL?"right-3":"left-3"}`}/><input value={itemSearch} onChange={e=>setItemSearch(e.target.value)} placeholder={t("Search item, code or category", "ابحث باسم الصنف أو الكود أو المجموعة")} className={`sc-control w-full ${isRTL?"pr-9":"pl-9"}`}/></div><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="sc-control text-sm"><option value="all">{t("All groups", "كل المجموعات")}</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select><select value={differenceFilter} onChange={e=>setDifferenceFilter(e.target.value)} className="sc-control text-sm"><option value="all">{t("All differences", "كل الفروق")}</option><option value="pending">{t("Not counted", "لم يتم جرده")}</option><option value="surplus">{t("Surplus", "زيادة")}</option><option value="shortage">{t("Shortage", "عجز")}</option><option value="none">{t("No difference", "بدون فرق")}</option></select><span className="text-xs font-bold text-slate-400">{summary.counted}/{summary.total}</span></div>
          {detailLoading?<div className="p-16 text-center text-slate-400">{t("Loading count details…", "جارٍ تحميل تفاصيل الجرد…")}</div>:<div className="max-h-[560px] overflow-auto"><table className="sc-table w-full min-w-[1120px] text-sm"><thead className="sticky top-0 z-10"><tr><th className="w-12 text-center">#</th><th className="text-start">{t("Product code", "كود الصنف")}</th><th className="text-start">{t("Product name", "اسم الصنف")}</th><th className="text-center">{t("Unit", "الوحدة")}</th><th className="text-center">{t("System qty", "الكمية الدفترية")}</th><th className="text-center">{t("Physical count", "كمية الجرد الفعلية")}</th><th className="text-center">{t("Difference", "الفرق")}</th><th className="text-center">{t("Difference type", "نوع الفرق")}</th><th className="text-center">{t("Difference value", "قيمة الفرق (ر.س)")}</th><th className="text-start">{t("Notes", "ملاحظات")}</th></tr></thead><tbody>{filteredItems.map((item,index)=>{const diff=item.physical_quantity===null?null:round3(Number(item.physical_quantity)-Number(item.system_quantity));return <tr key={item.id}><td className="text-center text-slate-500">{index+1}</td><td className="font-mono text-xs text-sky-300">{item.product_code||"—"}</td><td className="font-bold text-white">{item.product_name}<div className="mt-0.5 text-[10px] font-normal text-slate-500">{item.category||""}</div></td><td className="text-center text-slate-400">{item.unit_name}</td><td className="text-center font-semibold tabular-nums">{fmt(item.system_quantity,3)}</td><td className="text-center">{selected.status==="draft"?<input type="number" min="0" step="1" value={item.physical_quantity??""} onChange={e=>updateItem(item.id,{physical_quantity:e.target.value===""?null:Math.max(0,Number(e.target.value))})} className="sc-control w-24 text-center font-bold" placeholder="—"/>:<span className="font-bold tabular-nums">{item.physical_quantity===null?"—":fmt(item.physical_quantity,3)}</span>}</td><td className={`text-center font-black tabular-nums ${diff===null||diff===0?"text-slate-400":diff>0?"text-emerald-400":"text-red-400"}`}>{diff===null?"—":`${diff>0?"+":""}${fmt(diff,3)}`}</td><td className="text-center">{diff===null?<span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400">{t("Pending", "بانتظار الجرد")}</span>:diff>0?<span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-300">↑ {t("Surplus", "زيادة")}</span>:diff<0?<span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-bold text-red-300">↓ {t("Shortage", "عجز")}</span>:<span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">{t("No difference", "بدون فرق")}</span>}</td><td className={`text-center font-bold tabular-nums ${diff===null||diff===0?"text-slate-400":diff>0?"text-emerald-400":"text-red-400"}`}>{diff===null?"—":fmt(diff*Number(item.unit_cost))}</td><td>{selected.status==="draft"?<input value={item.notes||""} onChange={e=>updateItem(item.id,{notes:e.target.value})} className="sc-control w-36 text-xs" placeholder={t("Add note", "أضف ملاحظة")}/>:<span className="text-xs text-slate-400">{item.notes||"—"}</span>}</td></tr>})}{filteredItems.length===0&&<tr><td colSpan={10} className="py-14 text-center text-slate-500">{t("No matching products.", "لا توجد أصناف مطابقة.")}</td></tr>}</tbody></table></div>}
          <div className="grid grid-cols-1 gap-3 border-t border-slate-700/60 bg-[#07152a] p-4 md:grid-cols-[1fr_auto] md:items-center"><div className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3"><div className="text-[11px] text-emerald-200">{t("Total surplus", "إجمالي قيمة الزيادة")}</div><div className="mt-1 text-lg font-black text-emerald-400">{fmt(summary.surplusValue)} {t("SAR", "ر.س")}</div></div><div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3"><div className="text-[11px] text-red-200">{t("Total shortage", "إجمالي قيمة العجز")}</div><div className="mt-1 text-lg font-black text-red-400">{fmt(summary.shortageValue)} {t("SAR", "ر.س")}</div></div><div className="rounded-xl border border-blue-500/40 bg-blue-950/40 p-3"><div className="text-[11px] text-blue-200">{t("Net difference", "صافي الفرق")}</div><div className="mt-1 text-lg font-black text-blue-300">{fmt(summary.net)} {t("SAR", "ر.س")}</div></div></div>
            <div className="flex flex-wrap items-center justify-end gap-2">{selected.status==="draft"&&<><button onClick={()=>void saveDraft()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-100 hover:bg-slate-700 disabled:opacity-50"><Save size={16}/>{t("Save draft", "حفظ كمسودة")}</button><button onClick={()=>void submitForReview()} disabled={busy||summary.counted!==summary.total} className="sc-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40"><Check size={17}/>{t("Submit for review", "إرسال للمراجعة")}</button></>}{selected.status==="in_review"&&<><button onClick={()=>void rejectSession()} disabled={busy} className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300"><Ban size={16} className="inline me-1"/>{t("Reject", "رفض")}</button><button onClick={()=>void approveSession()} disabled={busy} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50"><Check size={17} className="inline me-1"/>{t("Approve adjustment", "اعتماد التسوية")}</button></>}</div>
          </div>
          <div className="border-t border-slate-700/60 px-4 py-3 text-[11px] text-slate-500">{t("Valuation uses weighted purchase cost from recorded purchase_in stock movements. Approval is blocked when a difference has no reliable cost. Stock approval and accounting journal posting remain controlled steps.", "يتم تقييم الفروق بمتوسط تكلفة حركات الشراء المسجلة. يُمنع الاعتماد عند وجود فرق دون تكلفة موثوقة. اعتماد حركة المخزون وترحيل القيد المحاسبي مرحلتان منفصلتان ومضبوطتان.")}</div>
          {selected.status==="approved"&&<div className="m-4 space-y-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><div className="font-bold text-emerald-300">{t("Inventory adjustment approved", "تم اعتماد تسوية المخزون")}</div><div className="text-xs text-slate-400">{t("Accounting status", "حالة القيد المحاسبي")}: {selected.accounting_status==="posted"?t("Posted", "مرحّل"):selected.accounting_status==="not_required"?t("Not required", "غير مطلوب"):t("Not posted", "غير مرحّل")}</div>{selected.accounting_entry_id&&<div className="text-xs text-emerald-300">JV #{selected.accounting_entry_id}</div>}{selected.accounting_status!=="posted"&&selected.accounting_status!=="not_required"&&<><div className="grid gap-2 md:grid-cols-3"><AccountSelect label={t("Inventory account", "حساب المخزون")} value={inventoryAccount} onChange={setInventoryAccount} accounts={accounts}/><AccountSelect label={t("Surplus account", "حساب فائض المخزون")} value={surplusAccount} onChange={setSurplusAccount} accounts={accounts}/><AccountSelect label={t("Shortage account", "حساب عجز المخزون")} value={shortageAccount} onChange={setShortageAccount} accounts={accounts}/></div><button onClick={()=>void postAccounting()} disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold"><BookOpen size={15} className="inline me-1"/>{t("Create accounting entry", "إنشاء القيد المحاسبي")}</button></>}</div>}
          {events.length>0&&<div className="border-t border-slate-700/60 p-4"><div className="mb-3 font-bold">{t("Audit trail", "سجل التدقيق")}</div><div className="space-y-2">{events.slice(0,5).map(event=><div key={event.id} className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={13}/>{eventLabel(event.action)} · {new Date(event.created_at).toLocaleString(lang==="ar"?"ar-SA":"en-US")}</div>)}</div></div>}
        </section>
      </>}

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0b1325] shadow-2xl"><div className="flex items-center justify-between border-b border-slate-800 p-4"><div className="font-black text-white">{t("New Stock Count", "جرد جديد")}</div><button onClick={() => setShowCreate(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800"><X size={18} /></button></div><div className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-xs text-slate-400">{t("Warehouse", "المستودع")}</span><select value={newWarehouse} onChange={(e) => setNewWarehouse(e.target.value ? Number(e.target.value) : "")} className={inputClass}><option value="">{t("Select warehouse", "اختر المستودع")}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs text-slate-400">{t("Count Date", "تاريخ الجرد")}</span><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} /></label><label className="block"><span className="mb-1.5 block text-xs text-slate-400">{t("Description / Notes", "الوصف / الملاحظات")}</span><textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} className={inputClass} placeholder={t("Optional count description…", "وصف اختياري للجرد…")} /></label><div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">{t("The session includes products assigned to this branch. Book quantities are snapshotted from products.quantity on each product card; the warehouse is recorded as the count location only.", "ستشمل الجلسة أصناف الفرع. يتم حفظ الرصيد الدفتري من products.quantity في بطاقة كل صنف، ويُسجل المستودع كموقع للجرد فقط.")}</div><div className="flex justify-end gap-2"><button onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400">{t("Cancel", "إلغاء")}</button><button onClick={() => void createSession()} disabled={busy || !newWarehouse} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold disabled:opacity-50">{busy ? t("Creating…", "جارٍ الإنشاء…") : t("Create Session", "إنشاء الجلسة")}</button></div></div></div></div>}
      {importPreview && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"><div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1325] shadow-2xl"><div className="flex items-center justify-between border-b border-slate-800 p-4"><div><div className="font-black text-white">{t("Import Preview", "معاينة الاستيراد")}</div><div className="mt-1 text-xs text-slate-400">{importPreview.rows.length} {t("matched", "مطابق")} · {importPreview.missing.length} {t("unmatched / duplicate", "غير مطابق / مكرر")} · {importPreview.totalRows} {t("rows", "صف")}</div></div><button onClick={() => setImportPreview(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800"><X size={18} /></button></div><div className="max-h-[60vh] overflow-auto p-4"><div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[600px] text-sm"><thead className="bg-slate-900 text-slate-300"><tr><th className="p-3 text-start">{t("Product Code", "كود الصنف")}</th><th className="p-3 text-start">{t("Product Name", "اسم الصنف")}</th><th className="p-3 text-center">{t("System Qty", "الكمية الدفترية")}</th><th className="p-3 text-center">{t("Imported Qty", "الكمية المستوردة")}</th><th className="p-3 text-center">{t("Difference", "الفرق")}</th></tr></thead><tbody className="divide-y divide-slate-800">{importPreview.rows.slice(0, 100).map((row) => <tr key={row.itemId}><td className="p-3 font-mono text-xs text-sky-300">{row.code}</td><td className="p-3">{row.productName}</td><td className="p-3 text-center">{fmt(row.systemQuantity, 3)}</td><td className="p-3 text-center font-bold">{fmt(row.quantity, 3)}</td><td className={`p-3 text-center font-bold ${row.difference > 0 ? "text-emerald-400" : row.difference < 0 ? "text-red-400" : "text-slate-400"}`}>{row.difference > 0 ? "+" : ""}{fmt(row.difference, 3)}</td></tr>)}{importPreview.rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">{t("No matching products were found.", "لم يتم العثور على أصناف مطابقة.")}</td></tr>}</tbody></table></div>{importPreview.rows.length > 100 && <div className="mt-2 text-xs text-slate-500">{t("Showing first 100 matched rows in preview; all matched rows will be applied.", "يتم عرض أول 100 صف مطابق في المعاينة؛ سيتم تطبيق جميع الصفوف المطابقة.")}</div>}{importPreview.missing.length > 0 && <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><div className="text-xs font-bold text-amber-300">{t("Unmatched or duplicate rows", "صفوف غير مطابقة أو مكررة")}</div><div className="mt-2 text-xs text-slate-400 break-words">{importPreview.missing.slice(0, 20).join(" · ")}{importPreview.missing.length > 20 ? ` · +${importPreview.missing.length - 20}` : ""}</div></div>}</div><div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 p-4"><button onClick={() => setImportPreview(null)} className="rounded-xl px-4 py-2 text-sm text-slate-400">{t("Cancel", "إلغاء")}</button><button onClick={applyImportPreview} disabled={importPreview.rows.length === 0} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold disabled:opacity-50">{t("Apply matched quantities", "تطبيق الكميات المطابقة")}</button></div></div></div>}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "blue" | "slate" }) {
  const colors = { green: "text-emerald-300", red: "text-red-300", blue: "text-sky-300", slate: "text-slate-200" };
  return <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className={`mt-1 font-black tabular-nums ${colors[tone]}`}>{value}</div></div>;
}
function AccountSelect({ label, value, onChange, accounts }: { label: string; value: number | ""; onChange: (v: number | "") => void; accounts: GLAccount[] }) {
  return <label className="block"><span className="mb-1 block text-[11px] text-slate-400">{label}</span><select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white"><option value="">—</option>{accounts.filter((a) => !a.is_group).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>;
}
