import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  Package, Plus, Search, RefreshCw, Trash2,
  Edit2, X, Save, AlertCircle, ChevronLeft,
  ChevronRight, Download, Upload, Copy, Check,
  TrendingDown, Boxes, DollarSign,
  PackageX, PackageCheck, Filter
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  part_number: string;
  part_name: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
};

type FilterStatus = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

type FormState = {
  part_number: string;
  part_name: string;
  brand: string;
  model: string;
  quantity: string;
  price: string;
};

// ── Import summary returned after a completed sync ──────────────────────────
type ImportSummary = {
  totalRows: number;      // lines read from the file (excl. header)
  validRows: number;      // rows that passed validation
  skippedRows: number;    // rows that failed validation
  inserted: number;       // new products created
  updated: number;        // existing products updated
  totalProcessed: number; // valid rows actually sent to Supabase
};

const EMPTY_FORM: FormState = {
  part_number: '', part_name: '', brand: '', model: '', quantity: '', price: ''
};

const PAGE_SIZE   = 12;
const BATCH_SIZE  = 200; // rows per Supabase request — safe for PostgREST

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatus(qty: number): FilterStatus {
  if (qty > 5) return "in_stock";
  if (qty > 0) return "low_stock";
  return "out_of_stock";
}

// ─── Production-grade CSV parser ─────────────────────────────────────────────
// Supports: quoted fields, commas inside quotes, Arabic/UTF-8, empty fields,
// CRLF + LF line endings, and doubled-quote escaping ("" → ").
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  // Normalise line endings
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;

  while (i < normalised.length) {
    const row: string[] = [];
    // Parse one row
    while (i < normalised.length && normalised[i] !== '\n') {
      if (normalised[i] === '"') {
        // Quoted field
        let field = '';
        i++; // skip opening quote
        while (i < normalised.length) {
          if (normalised[i] === '"') {
            if (normalised[i + 1] === '"') {
              // Escaped quote ("")
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else if (normalised[i] === '\n') {
            // Newline inside a quoted field (multiline cell) — include it
            field += normalised[i];
            i++;
          } else {
            field += normalised[i];
            i++;
          }
        }
        row.push(field.trim());
        // Skip comma separator if present
        if (normalised[i] === ',') i++;
      } else {
        // Unquoted field — read until comma or newline
        let field = '';
        while (i < normalised.length && normalised[i] !== ',' && normalised[i] !== '\n') {
          field += normalised[i];
          i++;
        }
        row.push(field.trim());
        // Skip comma separator if present
        if (normalised[i] === ',') i++;
      }
    }
    if (normalised[i] === '\n') i++; // skip newline
    // Only push non-empty rows
    if (row.length > 0 && row.some(cell => cell !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handle}
      className="p-1 rounded hover:bg-slate-700 text-slate-500 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

interface StockBadgeProps { quantity: number; t: (en: string, ar: string) => string; }
function StockBadge({ quantity, t }: StockBadgeProps) {
  const status = getStatus(quantity);
  const cfg = status === 'in_stock'
    ? { cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500', label: t('OK', 'متوفر') }
    : status === 'low_stock'
    ? { cls: 'bg-amber-500/10 border-amber-500/20 text-amber-500', label: t('LOW', 'منخفض') }
    : { cls: 'bg-red-500/10 border-red-500/20 text-red-500', label: t('OUT', 'نفد') };

  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-tighter ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Mobile Product Card ──────────────────────────────────────────────────────

interface MobileProductCardProps {
  p: Product;
  selected: boolean;
  onToggle: (id: number) => void;
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
  t: (en: string, ar: string) => string;
}

function MobileProductCard({ p, selected, onToggle, onEdit, onDelete, t }: MobileProductCardProps) {
  const status = getStatus(p.quantity);
  const qtyColor = status === 'in_stock' ? 'text-emerald-400' : status === 'low_stock' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className={`bg-slate-900 rounded-xl border transition-colors ${selected ? 'border-emerald-500/50' : 'border-slate-800'}`}>
      {/* Header: checkbox + name + badge */}
      <div className="flex items-start gap-3 p-3 pb-2">
        <input
          type="checkbox"
          className="accent-emerald-500 cursor-pointer mt-0.5 shrink-0"
          checked={selected}
          onChange={() => onToggle(p.id)}
          aria-label={t(`Select ${p.part_name}`, `تحديد ${p.part_name}`)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-white font-bold text-sm leading-tight">{p.part_name}</span>
            <StockBadge quantity={p.quantity} t={t} />
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded leading-none">{p.part_number}</span>
            <CopyButton text={p.part_number} />
          </div>
        </div>
      </div>

      {/* Body: brand / model / qty / price */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 py-2.5 border-t border-slate-800/60">
        <div>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{t('Brand', 'الماركة')}</div>
          <div className="text-slate-300 text-xs font-medium truncate">{p.brand || '—'}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{t('Model', 'الموديل')}</div>
          <div className="text-slate-300 text-xs uppercase truncate">{p.model || '—'}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{t('Quantity', 'الكمية')}</div>
          <div className={`text-sm font-black tabular-nums ${qtyColor}`}>{p.quantity}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{t('Unit Price', 'السعر')}</div>
          <div className="text-slate-100 text-xs font-bold tabular-nums">
            {p.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
            <span className="text-[9px] text-slate-500 font-normal">ر.س</span>
          </div>
        </div>
      </div>

      {/* Footer: actions */}
      <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-slate-800/60">
        <button
          onClick={() => onEdit(p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all text-xs font-bold"
          aria-label={t(`Edit ${p.part_name}`, `تعديل ${p.part_name}`)}
        >
          <Edit2 size={13} /> {t('Edit', 'تعديل')}
        </button>
        <button
          onClick={() => onDelete(p.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-bold"
          aria-label={t(`Delete ${p.part_name}`, `حذف ${p.part_name}`)}
        >
          <Trash2 size={13} /> {t('Delete', 'حذف')}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { ownedShopId } = useAuth();
  const { t, isRTL }   = useLang();

  // ── State ──────────────────────────────────────────────────────────────────
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [importing, setImporting]       = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState<FilterStatus>('all');
  const [page, setPage]                 = useState(1);
  const [selected, setSelected]         = useState<Set<number>>(new Set());

  const [showModal, setShowModal]       = useState(false);
  const [editItem, setEditItem]         = useState<Product | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError]       = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isSearching = search.trim().length > 0;

  // ── Database Actions ───────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    if (!ownedShopId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", ownedShopId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setProducts(data || []);
    setLoading(false);
  }, [ownedShopId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSave = async () => {
    if (!form.part_number || !form.part_name || !form.quantity) {
      setFormError(t('Required fields missing', 'الحقول المطلوبة ناقصة'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        part_number: form.part_number,
        part_name:   form.part_name,
        brand:       form.brand,
        model:       form.model,
        quantity:    Number(form.quantity),
        price:       Number(form.price),
        shop_id:     ownedShopId,
      };
      const { error } = editItem
        ? await supabase.from('products').update(payload).eq('id', editItem.id)
        : await supabase.from('products').insert(payload);
      if (error) throw error;
      showSuccess(editItem ? t('Updated ✓', 'تم التعديل ✓') : t('Added ✓', 'تمت الإضافة ✓'));
      closeModal();
      fetchProducts();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('Delete item?', 'حذف القطعة؟'))) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) { fetchProducts(); showSuccess(t('Deleted', 'تم الحذف')); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ── PRODUCTION IMPORT HANDLER — Manual Upsert Strategy ───────────────────
  //
  // WHY MANUAL UPSERT instead of supabase.upsert()?
  //   supabase.upsert() with onConflict fails when:
  //     • RLS UPDATE policy is not explicitly granted
  //     • The constraint name doesn't match PostgREST's internal index lookup
  //   This handler avoids both issues by:
  //     1. Fetching all existing part_numbers for this shop (part_number + id)
  //     2. Splitting validated rows into two buckets: toInsert / toUpdate
  //     3. Running INSERT batches for new rows (no conflict possible)
  //     4. Running individual UPDATE calls for existing rows (uses row id)
  //
  // Supports: 1 000 – 10 000+ rows without failure.
  // ─────────────────────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportSummary(null);
    setImportProgress(null);

    try {
      // ── 1. Read & parse file ──────────────────────────────────────────────
      console.log(`[MIHWAR Import] ▶ File: "${file.name}"  Size: ${(file.size / 1024).toFixed(1)} KB`);
      const text     = await file.text();
      const allRows  = parseCSV(text);

      console.log(`[MIHWAR Import] Total rows incl. header: ${allRows.length}`);

      if (allRows.length < 2) {
        throw new Error(t(
          'CSV file is empty or has no data rows.',
          'الملف فارغ أو لا يحتوي على صفوف بيانات.'
        ));
      }

      const dataRows = allRows.slice(1); // drop header
      console.log(`[MIHWAR Import] Data rows: ${dataRows.length}`);

      // ── 2. Validate rows ──────────────────────────────────────────────────
      // CSV column order: part_number, part_name, brand, model, quantity, price
      type ValidRow = Omit<Product, 'id'>;
      const validatedRows: ValidRow[] = [];
      let skippedRows = 0;

      dataRows.forEach((cols, idx) => {
        const line        = idx + 2;
        const part_number = cols[0]?.trim() ?? '';
        const part_name   = cols[1]?.trim() ?? '';
        const brand       = cols[2]?.trim() ?? '';
        const model       = cols[3]?.trim() ?? '';
        const quantity    = parseInt(cols[4]?.trim() ?? '', 10);
        const price       = parseFloat(cols[5]?.trim() ?? '');

        if (!part_number) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: missing part_number`);
          return;
        }
        if (!part_name) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: missing part_name (pn: ${part_number})`);
          return;
        }
        if (isNaN(quantity) || quantity < 0) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: invalid quantity for "${part_number}"`);
          return;
        }
        if (isNaN(price) || price < 0) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: invalid price for "${part_number}"`);
          return;
        }

        validatedRows.push({ part_number, part_name, brand, model, quantity, price, shop_id: ownedShopId! });
      });

      const validRows = validatedRows.length;
      console.log(`[MIHWAR Import] Valid: ${validRows}  Skipped: ${skippedRows}`);

      if (validRows === 0) {
        throw new Error(t(
          `No valid rows found. ${skippedRows} rows skipped due to missing or invalid data.`,
          `لم يتم العثور على صفوف صالحة. تم تخطي ${skippedRows} صف.`
        ));
      }

      // ── 3. Fetch existing part_numbers for this shop ──────────────────────
      // We do a lightweight select (only part_number + id) to avoid fetching
      // all product data again. Paginated with .range() to handle 10 000+ rows.
      setImportProgress(t('Loading existing inventory…', 'جاري تحميل المخزون الحالي…'));
      console.log(`[MIHWAR Import] Fetching existing part_numbers for shop ${ownedShopId}…`);

      const existingMap = new Map<string, number>(); // part_number → product id
      const FETCH_PAGE  = 1000;
      let   fetchFrom   = 0;
      let   keepFetching = true;

      while (keepFetching) {
        const { data: chunk, error: fetchErr } = await supabase
          .from('products')
          .select('id, part_number')
          .eq('shop_id', ownedShopId!)
          .range(fetchFrom, fetchFrom + FETCH_PAGE - 1);

        if (fetchErr) {
          console.error('[MIHWAR Import] Failed to fetch existing products:', fetchErr);
          throw new Error(t(
            `Failed to load existing inventory: ${fetchErr.message}`,
            `فشل تحميل المخزون الحالي: ${fetchErr.message}`
          ));
        }

        (chunk ?? []).forEach(row => existingMap.set(row.part_number, row.id));

        if (!chunk || chunk.length < FETCH_PAGE) keepFetching = false;
        else fetchFrom += FETCH_PAGE;
      }

      console.log(`[MIHWAR Import] Existing products loaded: ${existingMap.size}`);

      // ── 4. Split into INSERT and UPDATE buckets ───────────────────────────
      const toInsert: ValidRow[]                          = [];
      const toUpdate: Array<ValidRow & { id: number }>   = [];

      for (const row of validatedRows) {
        const existingId = existingMap.get(row.part_number);
        if (existingId !== undefined) toUpdate.push({ ...row, id: existingId });
        else                          toInsert.push(row);
      }

      console.log(`[MIHWAR Import] Bucket — INSERT: ${toInsert.length}  UPDATE: ${toUpdate.length}`);

      let totalInserted = 0;
      let totalUpdated  = 0;

      // ── 5. INSERT new products in batches ─────────────────────────────────
      if (toInsert.length > 0) {
        const insertBatches = Math.ceil(toInsert.length / BATCH_SIZE);
        console.log(`[MIHWAR Import] ▶ INSERT phase — ${toInsert.length} rows in ${insertBatches} batch(es)`);

        for (let bi = 0; bi < insertBatches; bi++) {
          const start  = bi * BATCH_SIZE;
          const end    = Math.min(start + BATCH_SIZE, toInsert.length);
          const batch  = toInsert.slice(start, end);
          const label  = `INSERT batch ${bi + 1}/${insertBatches}`;

          setImportProgress(t(
            `Inserting new products… (${bi + 1}/${insertBatches})`,
            `إضافة منتجات جديدة… (${bi + 1} من ${insertBatches})`
          ));
          console.log(`[MIHWAR Import]   ${label} — ${batch.length} rows`);

          const { error: insErr } = await supabase.from('products').insert(batch);

          if (insErr) {
            console.error(`[MIHWAR Import] ✖ ${label} FAILED:`, insErr);
            throw new Error(t(
              `${label} failed: ${insErr.message}`,
              `فشلت دفعة الإضافة ${bi + 1}: ${insErr.message}`
            ));
          }

          totalInserted += batch.length;
          console.log(`[MIHWAR Import]   ${label} ✔  cumulative inserted: ${totalInserted}`);
        }
      }

      // ── 6. UPDATE existing products in batches ────────────────────────────
      // Strategy: batch UPDATE using .in() filter on ids.
      // We send the full updated payload for each row in the batch.
      // Because each row may have different values, we loop individually
      // but fire them as concurrent Promises within each batch window
      // to keep total round-trips low (BATCH_SIZE concurrent at a time).
      if (toUpdate.length > 0) {
        const updateBatches = Math.ceil(toUpdate.length / BATCH_SIZE);
        console.log(`[MIHWAR Import] ▶ UPDATE phase — ${toUpdate.length} rows in ${updateBatches} batch(es)`);

        for (let bi = 0; bi < updateBatches; bi++) {
          const start = bi * BATCH_SIZE;
          const end   = Math.min(start + BATCH_SIZE, toUpdate.length);
          const batch = toUpdate.slice(start, end);
          const label = `UPDATE batch ${bi + 1}/${updateBatches}`;

          setImportProgress(t(
            `Updating existing products… (${bi + 1}/${updateBatches})`,
            `تحديث المنتجات الموجودة… (${bi + 1} من ${updateBatches})`
          ));
          console.log(`[MIHWAR Import]   ${label} — ${batch.length} rows`);

          // Fire all updates in this batch concurrently
          const results = await Promise.all(
            batch.map(row =>
              supabase
                .from('products')
                .update({
                  part_name: row.part_name,
                  brand:     row.brand,
                  model:     row.model,
                  quantity:  row.quantity,
                  price:     row.price,
                })
                .eq('id', row.id)
                .eq('shop_id', ownedShopId!) // RLS safety guard
            )
          );

          // Check for any errors in this batch
          const batchErrors = results
            .map((r, i) => r.error ? `Row id=${batch[i].id} (${batch[i].part_number}): ${r.error.message}` : null)
            .filter(Boolean);

          if (batchErrors.length > 0) {
            console.error(`[MIHWAR Import] ✖ ${label} — ${batchErrors.length} error(s):`, batchErrors);
            throw new Error(t(
              `${label} failed with ${batchErrors.length} error(s): ${batchErrors[0]}`,
              `فشلت دفعة التحديث ${bi + 1} بـ ${batchErrors.length} خطأ: ${batchErrors[0]}`
            ));
          }

          totalUpdated += batch.length;
          console.log(`[MIHWAR Import]   ${label} ✔  cumulative updated: ${totalUpdated}`);
        }
      }

      // ── 7. Done ───────────────────────────────────────────────────────────
      const summary: ImportSummary = {
        totalRows:      dataRows.length,
        validRows,
        skippedRows,
        inserted:       totalInserted,
        updated:        totalUpdated,
        totalProcessed: totalInserted + totalUpdated,
      };

      console.log('[MIHWAR Import] ✔ Complete. Summary:', summary);

      setImportSummary(summary);
      setImportProgress(null);
      fetchProducts();

    } catch (err: any) {
      console.error('[MIHWAR Import] ✖ Fatal:', err);
      setError(err.message || t('Import failed unexpectedly.', 'فشل الاستيراد بشكل غير متوقع.'));
      setImportProgress(null);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };
  // ── END IMPORT HANDLER ────────────────────────────────────────────────────

  // ── Derived Data (single-pass for performance) ────────────────────────────
  const { filtered, counts, totals } = useMemo(() => {
    const q = search.toLowerCase().trim();
    let inStock = 0, lowStock = 0, outOfStock = 0;
    let totalValue = 0, totalQty = 0;

    const allFiltered: Product[] = [];

    for (const p of products) {
      const s = getStatus(p.quantity);
      if (s === 'in_stock') inStock++;
      else if (s === 'low_stock') lowStock++;
      else outOfStock++;
      totalValue += p.quantity * p.price;
      totalQty   += p.quantity;

      const matchesFilter = filter === 'all' || s === filter;
      const matchesSearch = !q
        || p.part_number?.toLowerCase().includes(q)
        || p.part_name?.toLowerCase().includes(q)
        || p.brand?.toLowerCase().includes(q);

      if (matchesFilter && matchesSearch) allFiltered.push(p);
    }

    return {
      filtered: allFiltered,
      counts: { all: products.length, in_stock: inStock, low_stock: lowStock, out_of_stock: outOfStock },
      totals: { value: totalValue, qty: totalQty },
    };
  }, [products, filter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  const openAdd = useCallback(() => {
    setEditItem(null); setForm(EMPTY_FORM); setFormError(null); setShowModal(true);
  }, []);

  const openEdit = useCallback((p: Product) => {
    setEditItem(p);
    setForm({ part_number: p.part_number, part_name: p.part_name, brand: p.brand, model: p.model, quantity: String(p.quantity), price: String(p.price) });
    setFormError(null);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => setShowModal(false), []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const handleFilterChange = useCallback((s: FilterStatus) => {
    setFilter(s);
    setPage(1);
  }, []);

  const handleExport = useCallback(() => {
    const csv = [
      ['Part Number', 'Name', 'Brand', 'Model', 'Quantity', 'Price'].join(','),
      ...filtered.map(p => [p.part_number, p.part_name, p.brand, p.model, p.quantity, p.price].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventory_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  }, [filtered]);

  const toggleSelectAll = useCallback(() => {
    setSelected(prev => prev.size === pageItems.length ? new Set() : new Set(pageItems.map(p => p.id)));
  }, [pageItems]);

  const toggleSelectOne = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Shared pagination UI ──────────────────────────────────────────────────
  const PaginationControls = () => totalPages > 1 ? (
    <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/20">
      <span className="text-[11px] text-slate-500 font-medium">
        {t('Showing', 'عرض')} {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} {t('of', 'من')} {filtered.length}
      </span>
      <div className="flex items-center gap-1" role="navigation" aria-label={t('Pagination', 'التنقل بين الصفحات')}>
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          aria-label={t('Previous page', 'الصفحة السابقة')}
          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-800 transition-colors active:scale-90"
        >
          {isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              onClick={() => setPage(n)}
              aria-label={t(`Page ${n}`, `صفحة ${n}`)}
              aria-current={page === n ? 'page' : undefined}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${page === n ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              {n}
            </button>
          );
        })}
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          aria-label={t('Next page', 'الصفحة التالية')}
          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-800 transition-colors active:scale-90"
        >
          {isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto pb-10 px-4 sm:px-6 animate-in fade-in duration-500" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Toast ── */}
      {successMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 text-sm font-medium animate-bounce pointer-events-none">
          <Check size={16} /> {successMsg}
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex items-center justify-between gap-4 py-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Package className="text-emerald-500 shrink-0" size={24} />
            <span className="truncate">{t('Local Inventory', 'المخزون المحلي')}</span>
          </h1>
        </div>
        <button
          onClick={fetchProducts}
          className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white transition-all active:scale-95"
          aria-label={t('Refresh', 'تحديث')}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-500' : ''} />
        </button>
      </header>

      {/* ── Search ── */}
      <section className="relative mb-3">
        <div className={`absolute inset-y-0 ${isRTL ? 'right-0 pr-4' : 'left-0 pl-4'} flex items-center pointer-events-none text-slate-500`}>
          <Search size={18} />
        </div>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder={t('Search by part number, name or brand...', 'ابحث برقم القطعة، الاسم أو الماركة...')}
          className={`w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 ${isRTL ? 'pr-11 pl-11' : 'pl-11 pr-11'} text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all placeholder:text-slate-600 shadow-sm text-sm sm:text-base`}
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setPage(1); searchRef.current?.focus(); }}
            className={`absolute inset-y-0 ${isRTL ? 'left-0 pl-4' : 'right-0 pr-4'} flex items-center text-slate-500 hover:text-white transition-colors`}
            aria-label={t('Clear search', 'مسح البحث')}
          >
            <X size={18} />
          </button>
        )}
      </section>

      {/* ── Filters ── */}
      <section className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar" role="group" aria-label={t('Filter inventory', 'تصفية المخزون')}>
        <div className="flex items-center gap-1.5 px-2 py-1 text-slate-500 text-[10px] font-bold border-r border-slate-800 mr-1 uppercase tracking-widest shrink-0">
          <Filter size={12} /> {t('Filter', 'تصفية')}
        </div>
        {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as FilterStatus[]).map(s => (
          <button
            key={s}
            onClick={() => handleFilterChange(s)}
            aria-pressed={filter === s}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filter === s
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {t(s.replace('_', ' '), s === 'all' ? 'الكل' : s === 'in_stock' ? 'متوفر' : s === 'low_stock' ? 'منخفض' : 'نفد')}
            <span className={`${isRTL ? 'mr-2' : 'ml-2'} px-1.5 py-0.5 rounded-md text-[10px] ${filter === s ? 'bg-white/20' : 'bg-slate-800'}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </section>

      {/* ── KPI Cards — hidden on mobile when searching ── */}
      <section
        className={`mb-6 ${isSearching ? 'hidden md:block' : 'block'}`}
        aria-label={t('Inventory summary', 'ملخص المخزون')}
        aria-hidden={isSearching}
      >
        {/* Desktop: 5-column grid */}
        <div className="hidden md:grid md:grid-cols-5 gap-2.5">
          {[
            { label: t('Total Value', 'إجمالي القيمة'), val: `${totals.value.toLocaleString()} ر.س`, icon: DollarSign, color: 'text-emerald-400' },
            { label: t('Total Parts', 'إجمالي القطع'),  val: counts.all,          icon: Boxes,        color: 'text-blue-400' },
            { label: t('In Stock', 'متوفر'),             val: counts.in_stock,     icon: PackageCheck, color: 'text-emerald-500' },
            { label: t('Low Stock', 'منخفض'),            val: counts.low_stock,    icon: TrendingDown, color: 'text-amber-400' },
            { label: t('Out of Stock', 'نفد'),           val: counts.out_of_stock, icon: PackageX,     color: 'text-red-400' },
          ].map((kpi, i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-slate-800/60 bg-slate-900 flex flex-col justify-between min-h-[90px] transition-colors hover:border-slate-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate mr-2">{kpi.label}</span>
                <kpi.icon size={12} className={`${kpi.color} shrink-0`} />
              </div>
              <div className={`text-xl font-black ${kpi.color} mt-0.5 truncate`}>{kpi.val}</div>
            </div>
          ))}
        </div>

        {/* Mobile: 2-column condensed grid */}
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <div className="col-span-2 p-2.5 rounded-xl border border-slate-800/60 bg-slate-900 flex items-center justify-between min-h-[54px] hover:border-slate-700 transition-colors">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('Total Value', 'إجمالي القيمة')}</span>
              <span className="text-base font-black text-emerald-400 leading-tight">{totals.value.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">ر.س</span></span>
            </div>
            <DollarSign size={16} className="text-emerald-400/60 shrink-0" />
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800/60 bg-slate-900 flex flex-col justify-between min-h-[54px] hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('Total Parts', 'إجمالي القطع')}</span>
              <Boxes size={11} className="text-blue-400 shrink-0" />
            </div>
            <span className="text-lg font-black text-blue-400 leading-tight">{counts.all}</span>
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800/60 bg-slate-900 flex flex-col justify-between min-h-[54px] hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('In Stock', 'متوفر')}</span>
              <PackageCheck size={11} className="text-emerald-500 shrink-0" />
            </div>
            <span className="text-lg font-black text-emerald-500 leading-tight">{counts.in_stock}</span>
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800/60 bg-slate-900 flex flex-col justify-between min-h-[54px] hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('Low Stock', 'منخفض')}</span>
              <TrendingDown size={11} className="text-amber-400 shrink-0" />
            </div>
            <span className="text-lg font-black text-amber-400 leading-tight">{counts.low_stock}</span>
          </div>
          <div className="p-2.5 rounded-xl border border-slate-800/60 bg-slate-900 flex flex-col justify-between min-h-[54px] hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('Out of Stock', 'نفد')}</span>
              <PackageX size={11} className="text-red-400 shrink-0" />
            </div>
            <span className="text-lg font-black text-red-400 leading-tight">{counts.out_of_stock}</span>
          </div>
        </div>
      </section>

      {/* ── Table Actions — hidden on mobile when searching ── */}
      <input ref={importRef} type="file" accept=".csv" onChange={handleImport} className="hidden" aria-hidden="true" />
      <section
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 ${isSearching ? 'hidden md:flex' : 'flex'}`}
      >
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Upload size={14} /> {importing ? t('Importing…', 'جاري الاستيراد…') : t('Import', 'استيراد')}
          </button>
          <button
            onClick={handleExport}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            <Download size={14} /> {t('Export', 'تصدير')}
          </button>
        </div>
        <button
          onClick={openAdd}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-500 shadow-lg active:scale-95 transition-all"
        >
          <Plus size={18} /> {t('Add Part', 'إضافة قطعة')}
        </button>
      </section>

      {/* ── Import Progress Banner ── */}
      {importProgress && (
        <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium flex items-center gap-3" role="status" aria-live="polite">
          <RefreshCw size={14} className="animate-spin shrink-0" />
          {importProgress}
        </div>
      )}

      {/* ── Import Summary Banner ── */}
      {importSummary && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-3">
            <span className="text-emerald-400 text-sm font-black flex items-center gap-2">
              <PackageCheck size={16} />
              {t('Import Complete', 'اكتمل الاستيراد')}
            </span>
            <button
              onClick={() => setImportSummary(null)}
              className="text-slate-500 hover:text-white transition-colors"
              aria-label={t('Dismiss', 'إغلاق')}
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: t('New Products', 'منتجات جديدة'),
                val: importSummary.inserted,
                color: 'text-emerald-400',
              },
              {
                label: t('Updated Products', 'منتجات محدّثة'),
                val: importSummary.updated,
                color: 'text-blue-400',
              },
              {
                label: t('Skipped Rows', 'صفوف مُتخطّاة'),
                val: importSummary.skippedRows,
                color: 'text-amber-400',
              },
              {
                label: t('Total Processed', 'إجمالي المعالجة'),
                val: importSummary.totalProcessed,
                color: 'text-white',
              },
            ].map((item, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">{item.label}</span>
                <span className={`text-xl font-black tabular-nums ${item.color}`}>{item.val.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MOBILE: card list ── */}
      <div className="md:hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
            <RefreshCw className="animate-spin" size={22} />
            <span className="text-sm">{t('Loading...', 'جاري التحميل...')}</span>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
            <Package size={28} className="opacity-40" />
            <span className="text-sm italic">{t('No inventory records found.', 'لا توجد سجلات مخزون.')}</span>
          </div>
        ) : (
          <>
            {/* Select-all bar */}
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <input
                type="checkbox"
                className="accent-emerald-500 rounded cursor-pointer"
                checked={selected.size === pageItems.length && pageItems.length > 0}
                onChange={toggleSelectAll}
                aria-label={t('Select all', 'تحديد الكل')}
              />
              <span className="text-[11px] text-slate-500">
                {selected.size > 0
                  ? `${selected.size} ${t('selected', 'محدد')}`
                  : t('Select all', 'تحديد الكل')}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-2">
              {pageItems.map(p => (
                <MobileProductCard
                  key={p.id}
                  p={p}
                  selected={selected.has(p.id)}
                  onToggle={toggleSelectOne}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  t={t}
                />
              ))}
            </div>

            {/* Mobile pagination */}
            {totalPages > 1 && (
              <div className="mt-4 rounded-xl border border-slate-800 overflow-hidden">
                <PaginationControls />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── DESKTOP: original table ── */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right border-collapse min-w-[800px]" role="grid">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800">
                <th className="p-4 w-12 text-center" scope="col">
                  <input
                    type="checkbox"
                    className="accent-emerald-500 rounded cursor-pointer"
                    checked={selected.size === pageItems.length && pageItems.length > 0}
                    onChange={toggleSelectAll}
                    aria-label={t('Select all', 'تحديد الكل')}
                  />
                </th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Part Details', 'تفاصيل القطعة')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Vehicle / Brand', 'المركبة / الماركة')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Stock Level', 'المخزون')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Unit Price', 'سعر الوحدة')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest text-center">{t('Actions', 'إجراء')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-slate-500">
                    <RefreshCw className="animate-spin mx-auto mb-4" />
                    {t('Loading...', 'جاري التحميل...')}
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-slate-600 italic">
                    {t('No inventory records found.', 'لا توجد سجلات مخزون.')}
                  </td>
                </tr>
              ) : pageItems.map(p => {
                const status = getStatus(p.quantity);
                const qtyColor = status === 'in_stock' ? 'text-emerald-500' : status === 'low_stock' ? 'text-amber-500' : 'text-red-500';
                return (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        className="accent-emerald-500 cursor-pointer"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelectOne(p.id)}
                        aria-label={t(`Select ${p.part_name}`, `تحديد ${p.part_name}`)}
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-sm mb-1">{p.part_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded leading-none">{p.part_number}</span>
                          <CopyButton text={p.part_number} />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-slate-300">
                      <div className="flex flex-col">
                        <span className="font-medium text-xs">{p.brand || '—'}</span>
                        <span className="text-[10px] text-slate-500 uppercase">{p.model || '—'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-base font-black w-8 ${qtyColor}`}>{p.quantity}</span>
                        <StockBadge quantity={p.quantity} t={t} />
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-100">
                      {p.price.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500 font-normal">ر.س</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                          title={t('Edit', 'تعديل')}
                          aria-label={t(`Edit ${p.part_name}`, `تعديل ${p.part_name}`)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title={t('Delete', 'حذف')}
                          aria-label={t(`Delete ${p.part_name}`, `حذف ${p.part_name}`)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationControls />
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={editItem ? t('Edit Part', 'تعديل قطعة') : t('New Inventory Item', 'إضافة قطعة جديدة')}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-black text-white">
                {editItem ? t('Edit Part', 'تعديل قطعة') : t('New Inventory Item', 'إضافة قطعة جديدة')}
              </h2>
              <button onClick={closeModal} className="p-2 text-slate-500 hover:text-white transition-colors" aria-label={t('Close', 'إغلاق')}>
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Part Name', 'اسم القطعة')}</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.part_name}
                    onChange={e => setForm(f => ({ ...f, part_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Part Number', 'رقم القطعة')}</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors font-mono text-sm"
                    value={form.part_number}
                    onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Brand', 'الماركة')}</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Model', 'الموديل')}</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Quantity', 'الكمية')}</label>
                  <input
                    type="number"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Unit Price', 'السعر')}</label>
                  <input
                    type="number"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  />
                </div>
              </div>
              {formError && (
                <div className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex items-center gap-2" role="alert">
                  <AlertCircle size={14} /> {formError}
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-950/30 flex items-center justify-end gap-3 border-t border-slate-800">
              <button onClick={closeModal} className="px-5 py-2.5 rounded-xl text-slate-400 text-sm font-bold hover:text-white transition-colors">
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center gap-2 active:scale-95 shadow-lg"
              >
                {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                {t('Save Details', 'حفظ التفاصيل')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3" role="alert">
          <AlertCircle size={20} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="underline font-bold text-xs shrink-0">{t('Dismiss', 'إغلاق')}</button>
        </div>
      )}
    </div>
  );
}
