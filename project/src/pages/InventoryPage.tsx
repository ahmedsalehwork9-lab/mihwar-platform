import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  Package, Plus, Search, RefreshCw, Trash2,
  Edit2, X, Save, AlertCircle, ChevronLeft,
  ChevronRight, Download, Upload, Copy, Check,
  TrendingDown, Boxes, DollarSign,
  PackageX, PackageCheck, Filter, Globe, Users, Lock,
  ImagePlus, ImageOff, ScanLine, Percent,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type VisibilityScope = 'public' | 'group' | 'private';

type Product = {
  id: number;
  product_code: string;
  product_name: string;
  brand: string;
  model: string;
  quantity: number;
  price: number;
  shop_id: number;
  visibility_scope?: VisibilityScope;
  product_image_url?: string | null;
  barcode?: string | null;
  // Optional per-product margin override (%). When null/undefined, the
  // shop's default_margin_percent applies instead. Cost price (this
  // page) is never affected by margin — margin only changes the price
  // shown to a different-shop ("purchase") viewer in the marketplace.
  margin_percent?: number | null;
};

type FilterStatus = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

type FormState = {
  product_code: string;
  product_name: string;
  brand: string;
  model: string;
  quantity: string;
  price: string;
  visibility_scope: VisibilityScope;
  product_image_url: string;
  // Empty string = "use shop default margin" (maps to null in the DB).
  margin_percent: string;
};

// ── Import summary returned after a completed sync ──────────────────────────
type ImportSummary = {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  inserted: number;
  updated: number;
  totalProcessed: number;
};

const EMPTY_FORM: FormState = {
  product_code: '', product_name: '', brand: '', model: '', quantity: '', price: '',
  visibility_scope: 'public',
  product_image_url: '',
  margin_percent: '',
};

const PAGE_SIZE   = 12;
const BATCH_SIZE  = 200;

// ─── FETCH PAGE SIZE ──────────────────────────────────────────────────────────
const FETCH_CHUNK = 1000;

// ─── Product image upload constraints ────────────────────────────────────────
const PRODUCT_IMAGES_BUCKET = 'product-images';
const ALLOWED_IMAGE_TYPES   = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES       = 5 * 1024 * 1024; // 5 MB

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatus(qty: number): FilterStatus {
  if (qty > 5) return "in_stock";
  if (qty > 0) return "low_stock";
  return "out_of_stock";
}

function safeVisibilityScope(val: string | undefined | null): VisibilityScope {
  if (val === 'public' || val === 'group' || val === 'private') return val;
  return 'public';
}

/**
 * Deterministic, unique-enough barcode derived from shop + product code.
 * Used only as a fallback when a product has no stored `barcode` value
 * (e.g. legacy rows, or rows imported from a CSV without a barcode
 * column). Does not write to the DB by itself — callers decide whether
 * to persist it.
 */
function generateBarcode(shopId: number, productCode: string): string {
  const cleanedCode = (productCode || '').replace(/\s+/g, '').toUpperCase();
  return `${shopId}-${cleanedCode}`;
}

function effectiveBarcode(p: Pick<Product, 'shop_id' | 'product_code' | 'barcode'>): string {
  return p.barcode && p.barcode.trim() !== '' ? p.barcode : generateBarcode(p.shop_id, p.product_code);
}

function getFileExtension(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
  if (fromName) return fromName.toLowerCase();
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

type ImageValidationResult = { ok: true } | { ok: false; message: string };

function validateImageFile(file: File, t: (en: string, ar: string) => string): ImageValidationResult {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: t(
        'Only JPEG, PNG, or WEBP images are allowed.',
        'يُسمح فقط بصور JPEG أو PNG أو WEBP.'
      ),
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: t(
        'Image size must not exceed 5 MB.',
        'يجب ألا يتجاوز حجم الصورة 5 ميجابايت.'
      ),
    };
  }
  return { ok: true };
}

// ─── Production-grade CSV parser ─────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;

  while (i < normalised.length) {
    const row: string[] = [];
    while (i < normalised.length && normalised[i] !== '\n') {
      if (normalised[i] === '"') {
        let field = '';
        i++;
        while (i < normalised.length) {
          if (normalised[i] === '"') {
            if (normalised[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else if (normalised[i] === '\n') {
            field += normalised[i];
            i++;
          } else {
            field += normalised[i];
            i++;
          }
        }
        row.push(field.trim());
        if (normalised[i] === ',') i++;
      } else {
        let field = '';
        while (i < normalised.length && normalised[i] !== ',' && normalised[i] !== '\n') {
          field += normalised[i];
          i++;
        }
        row.push(field.trim());
        if (normalised[i] === ',') i++;
      }
    }
    if (normalised[i] === '\n') i++;
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

// ─── Visibility Badge ─────────────────────────────────────────────────────────

interface VisibilityBadgeProps {
  scope: VisibilityScope | undefined;
  t: (en: string, ar: string) => string;
}

function VisibilityBadge({ scope, t }: VisibilityBadgeProps) {
  const safe = safeVisibilityScope(scope);
  const cfg =
    safe === 'public'
      ? { cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', label: t('Public Marketplace', 'السوق العام'), Icon: Globe }
      : safe === 'group'
      ? { cls: 'bg-amber-500/10 border-amber-500/20 text-amber-400', label: t('Group Only', 'داخل المجموعة'), Icon: Users }
      : { cls: 'bg-blue-500/10 border-blue-500/20 text-blue-400', label: t('Shop Only', 'داخل الفرع'), Icon: Lock };

  return (
    <span className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-tighter ${cfg.cls}`}>
      <cfg.Icon size={8} />
      {cfg.label}
    </span>
  );
}

// ─── Product Image Thumbnail (shared placeholder logic) ──────────────────────

interface ProductThumbProps {
  src?: string | null;
  alt: string;
  sizeCls: string;
  iconSize: number;
  roundedCls?: string;
  t: (en: string, ar: string) => string;
}

function ProductThumb({ src, alt, sizeCls, iconSize, roundedCls = 'rounded-lg', t }: ProductThumbProps) {
  const [errored, setErrored] = useState(false);
  const showPlaceholder = !src || errored;

  if (showPlaceholder) {
    return (
      <div
        className={`${sizeCls} ${roundedCls} bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0`}
        aria-label={t('No image', 'لا توجد صورة')}
        title={t('No image', 'لا توجد صورة')}
      >
        <ImageOff size={iconSize} className="text-slate-600" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={`${sizeCls} ${roundedCls} object-cover border border-slate-700 shrink-0`}
    />
  );
}

// ─── Image Picker (select / drag&drop / preview / replace / remove) ──────────

interface ImagePickerProps {
  value: string;
  onFileSelected: (file: File) => void;
  onRemove: () => void;
  uploading: boolean;
  error: string | null;
  t: (en: string, ar: string) => string;
}

function ImagePicker({ value, onFileSelected, onRemove, uploading, error, t }: ImagePickerProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    if (uploading) return;
    fileInputRef.current?.click();
  }, [uploading]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = '';
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }, [onFileSelected, uploading]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragActive(true);
  }, [uploading]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  return (
    <div className="col-span-2">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
        {t('Product Image', 'صورة المنتج')}
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex items-center gap-4 p-4 rounded-2xl border-2 transition-colors ${
          dragActive
            ? 'border-emerald-500 bg-emerald-500/5'
            : 'border-dashed border-slate-700 bg-slate-800/40'
        }`}
      >
        <ProductThumb
          src={value || null}
          alt={t('Product image preview', 'معاينة صورة المنتج')}
          sizeCls="w-20 h-20"
          iconSize={28}
          roundedCls="rounded-xl"
          t={t}
        />

        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-2 leading-snug">
            {t(
              'Drag & drop an image here, or click to select.',
              'اسحب وأسقط صورة هنا، أو اضغط للاختيار.'
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openPicker}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-bold hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <ImagePlus size={13} />
              {uploading
                ? t('Uploading…', 'جاري الرفع…')
                : value
                ? t('Replace Image', 'استبدال الصورة')
                : t('Select Image', 'اختيار صورة')}
            </button>
            {value && !uploading && (
              <button
                type="button"
                onClick={onRemove}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={13} />
                {t('Remove Image', 'إزالة الصورة')}
              </button>
            )}
          </div>
        </div>

        {uploading && (
          <div className="absolute inset-0 rounded-2xl bg-slate-950/50 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-emerald-400" />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-red-400 flex items-center gap-1.5" role="alert">
          <AlertCircle size={12} className="shrink-0" /> {error}
        </p>
      )}
    </div>
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
    <div className={`bg-slate-900 rounded-xl border transition-colors overflow-hidden ${selected ? 'border-emerald-500/50' : 'border-slate-800'}`}>
      <div className="relative w-full aspect-square">
        <ProductThumb
          src={p.product_image_url}
          alt={p.product_name}
          sizeCls="w-full h-full"
          iconSize={36}
          roundedCls="rounded-none"
          t={t}
        />
        <input
          type="checkbox"
          className="absolute top-2 left-2 accent-emerald-500 cursor-pointer w-4 h-4 shrink-0"
          checked={selected}
          onChange={() => onToggle(p.id)}
          aria-label={t(`Select ${p.product_name}`, `تحديد ${p.product_name}`)}
        />
        <div className="absolute top-2 right-2">
          <StockBadge quantity={p.quantity} t={t} />
        </div>
      </div>

      <div className="p-3 pb-2">
        <span className="text-white font-bold text-sm leading-tight block">{p.product_name}</span>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded leading-none">{p.product_code}</span>
          <CopyButton text={p.product_code} />
        </div>
      </div>

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
        <div className="col-span-2">
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{t('Visibility', 'نطاق الظهور')}</div>
          <VisibilityBadge scope={p.visibility_scope} t={t} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-slate-800/60">
        <button
          onClick={() => onEdit(p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all text-xs font-bold"
          aria-label={t(`Edit ${p.product_name}`, `تعديل ${p.product_name}`)}
        >
          <Edit2 size={13} /> {t('Edit', 'تعديل')}
        </button>
        <button
          onClick={() => onDelete(p.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-bold"
          aria-label={t(`Delete ${p.product_name}`, `حذف ${p.product_name}`)}
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

  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError]         = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved]     = useState(false);

  // ── Shop-level default profit margin ──────────────────────────────────────
  // Applied automatically to this shop's products when shown to a
  // different-shop ("purchase") viewer in the public marketplace.
  // Cost prices here in the inventory page are NEVER affected by this —
  // it only changes what a buyer from another shop sees.
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [defaultMarginPercent, setDefaultMarginPercent] = useState<number>(0);
  const [marginInput, setMarginInput]         = useState('');
  const [marginSaving, setMarginSaving]       = useState(false);
  const [marginError, setMarginError]         = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isSearching = search.trim().length > 0;

  // ── Database Actions ───────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    console.log(`[MIHWAR fetchProducts] ▶ called — ownedShopId=${ownedShopId}`);
    if (!ownedShopId) {
      console.warn('[MIHWAR fetchProducts] ✖ aborted — ownedShopId is null/undefined');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { count: dbCount, error: countErr } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', ownedShopId);

      if (countErr) {
        console.error('[MIHWAR fetchProducts] COUNT query failed:', countErr.message, countErr);
      } else {
        console.log(`[MIHWAR fetchProducts] ── DB COUNT (ground truth): ${dbCount} ──`);
      }

      const allProducts: Product[] = [];
      let from = 0;
      let keepFetching = true;
      let chunkIndex = 0;

      while (keepFetching) {
        const to = from + FETCH_CHUNK - 1;
        console.log(`[MIHWAR fetchProducts] chunk ${chunkIndex} — range(${from}, ${to})`);

        const { data: chunk, error: fetchErr } = await supabase
          .from("products")
          .select("id, product_code, product_name, brand, model, quantity, price, shop_id, visibility_scope, product_image_url, barcode, margin_percent")
          .eq("shop_id", ownedShopId)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (fetchErr) {
          console.error(`[MIHWAR fetchProducts] ✖ chunk ${chunkIndex} error:`, fetchErr.message, fetchErr);
          setError(fetchErr.message);
          break;
        }

        const chunkLen = chunk?.length ?? 0;
        allProducts.push(...(chunk ?? []));

        console.log(
          `[MIHWAR fetchProducts] chunk ${chunkIndex} received ${chunkLen} rows` +
          ` — running total: ${allProducts.length}` +
          (chunkLen < FETCH_CHUNK ? ' — ✔ last chunk' : ' — fetching next chunk…')
        );

        if (chunkLen < FETCH_CHUNK) {
          keepFetching = false;
        } else {
          from += FETCH_CHUNK;
          chunkIndex++;
        }
      }

      console.log(
        `[MIHWAR fetchProducts] ── FINAL LOADED: ${allProducts.length} rows` +
        ` | DB COUNT was: ${dbCount ?? 'n/a (count query failed)'}` +
        (dbCount !== null && dbCount !== undefined && allProducts.length !== dbCount
          ? ` ← ⚠ MISMATCH — pagination bug or RLS returning different sets`
          : ` ← ✔ match`)
      );

      setProducts(allProducts);
      setPage(1);

      console.log(`[MIHWAR fetchProducts] setProducts(${allProducts.length} items) called`);

    } finally {
      setLoading(false);
    }
  }, [ownedShopId]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    console.log(`[MIHWAR STATE] products.length updated → ${products.length}`);
  }, [products]);

  // ── Fetch the shop's current default margin percentage ────────────────────
  const fetchDefaultMargin = useCallback(async () => {
    if (!ownedShopId) return;
    const { data, error: fetchErr } = await supabase
      .from('shops')
      .select('default_margin_percent')
      .eq('id', ownedShopId)
      .single();
    if (fetchErr) {
      console.error('[MIHWAR fetchDefaultMargin] error:', fetchErr.message);
      return;
    }
    const val = Number(data?.default_margin_percent ?? 0);
    setDefaultMarginPercent(Number.isFinite(val) ? val : 0);
  }, [ownedShopId]);

  useEffect(() => { fetchDefaultMargin(); }, [fetchDefaultMargin]);

  const openMarginModal = useCallback(() => {
    setMarginInput(String(defaultMarginPercent));
    setMarginError(null);
    setShowMarginModal(true);
  }, [defaultMarginPercent]);

  const closeMarginModal = useCallback(() => setShowMarginModal(false), []);

  const handleSaveMargin = useCallback(async () => {
    const parsed = Number(marginInput);
    if (marginInput.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setMarginError(t(
        'Enter a valid margin percentage (0 or greater).',
        'أدخل نسبة هامش صحيحة (0 أو أكبر).'
      ));
      return;
    }
    if (!ownedShopId) return;

    setMarginSaving(true);
    setMarginError(null);
    try {
      const { error: updateErr } = await supabase
        .from('shops')
        .update({ default_margin_percent: parsed })
        .eq('id', ownedShopId);
      if (updateErr) throw updateErr;

      setDefaultMarginPercent(parsed);
      setShowMarginModal(false);
      showSuccess(t('Margin updated ✓', 'تم تحديث الهامش ✓'));
    } catch (e: any) {
      setMarginError(e?.message ?? t('Failed to update margin', 'فشل تحديث الهامش'));
    } finally {
      setMarginSaving(false);
    }
  }, [marginInput, ownedShopId, t]);

  // ── Product image upload ──────────────────────────────────────────────────
  // Filename pattern required: shopId-productId-timestamp.ext
  // Because `productId` does not exist yet for a brand-new product until
  // after the initial insert, the upload step always runs AFTER the
  // products-table write that obtains a real id (see handleSave below),
  // then a second lightweight update persists product_image_url onto
  // that same row. This keeps the row write and the image upload as two
  // separate, individually-retriable steps without changing the shape
  // of the existing insert/update payload contract.
  const uploadProductImage = useCallback(async (file: File, shopId: number, productId: number): Promise<string> => {
    const ext      = getFileExtension(file);
    const fileName = `${shopId}-${productId}-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadErr) throw uploadErr;

    const { data: publicUrlData } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  }, []);

  const handleSave = async () => {
    if (!form.product_code || !form.product_name || !form.quantity) {
      setFormError(t('Required fields missing', 'الحقول المطلوبة ناقصة'));
      return;
    }

    let parsedMargin: number | null = null;
    if (form.margin_percent.trim() !== '') {
      const m = Number(form.margin_percent);
      if (!Number.isFinite(m) || m < 0) {
        setFormError(t(
          'Product margin must be a valid percentage (0 or greater).',
          'هامش المنتج يجب أن يكون نسبة صحيحة (0 أو أكبر).'
        ));
        return;
      }
      parsedMargin = m;
    }

    setSaving(true);
    try {
      const basePayload = {
        product_code:      form.product_code,
        product_name:        form.product_name,
        brand:            form.brand,
        model:            form.model,
        quantity:         Number(form.quantity),
        price:            Number(form.price),
        shop_id:          ownedShopId,
        visibility_scope: safeVisibilityScope(form.visibility_scope),
        margin_percent:   parsedMargin,
      };

      let productId: number;

      if (editItem) {
        const { error: updateErr } = await supabase.from('products').update(basePayload).eq('id', editItem.id);
        if (updateErr) throw updateErr;
        productId = editItem.id;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('products')
          .insert(basePayload)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        productId = inserted.id;
      }

      // Resolve final image URL for this product, independent of the
      // row write above: upload a newly-picked file, clear it if the
      // user removed the image, or keep the existing URL untouched.
      let finalImageUrl: string | null = editItem?.product_image_url ?? null;

      if (pendingImageFile && ownedShopId != null) {
        setImageUploading(true);
        try {
          finalImageUrl = await uploadProductImage(pendingImageFile, ownedShopId, productId);
        } finally {
          setImageUploading(false);
        }
      } else if (imageRemoved) {
        finalImageUrl = null;
      }

      if (finalImageUrl !== (editItem?.product_image_url ?? null) || pendingImageFile || imageRemoved) {
        const { error: imgUpdateErr } = await supabase
          .from('products')
          .update({ product_image_url: finalImageUrl })
          .eq('id', productId);
        if (imgUpdateErr) throw imgUpdateErr;
      }

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
    if (!confirm(t('Delete item?', 'حذف المنتج؟'))) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) { fetchProducts(); showSuccess(t('Deleted', 'تم الحذف')); }
  };

  // ── Image picker handlers (modal-scoped, applied on Save) ─────────────────
  const handleImageFileSelected = useCallback((file: File) => {
    const result = validateImageFile(file, t);
    if (!result.ok) {
      setImageError(result.message);
      return;
    }
    setImageError(null);
    setPendingImageFile(file);
    setImageRemoved(false);
    const previewUrl = URL.createObjectURL(file);
    setForm(f => ({ ...f, product_image_url: previewUrl }));
  }, [t]);

  const handleImageRemove = useCallback(() => {
    setPendingImageFile(null);
    setImageRemoved(true);
    setImageError(null);
    setForm(f => ({ ...f, product_image_url: '' }));
  }, []);

  // ─── PRODUCTION IMPORT HANDLER ────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setImportSummary(null);
    setImportProgress(null);

    try {
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

      // Detect header to find optional column indices (visibility_scope,
      // barcode, product_image_url). All three are optional: if absent
      // from the header, import proceeds unaffected (no errors), and
      // those fields are simply left unset for every imported row.
      const headerRow = allRows[0].map(h => h.toLowerCase().trim());
      const visibilityColIndex = headerRow.findIndex(h => h === 'visibility_scope' || h === 'visibility');
      const barcodeColIndex    = headerRow.findIndex(h => h === 'barcode');
      const imageUrlColIndex   = headerRow.findIndex(h => h === 'product_image_url' || h === 'image_url');

      const dataRows = allRows.slice(1);
      console.log(
        `[MIHWAR Import] Data rows: ${dataRows.length}, visibility col index: ${visibilityColIndex}, ` +
        `barcode col index: ${barcodeColIndex}, image col index: ${imageUrlColIndex}`
      );

      type ValidRow = Omit<Product, 'id'>;
      const validatedRows: ValidRow[] = [];
      let skippedRows = 0;

      dataRows.forEach((cols, idx) => {
        const line         = idx + 2;
        const product_code = cols[0]?.trim() ?? '';
        const product_name = cols[1]?.trim() ?? '';
        const brand         = cols[2]?.trim() ?? '';
        const model          = cols[3]?.trim() ?? '';
        const quantity        = parseInt(cols[4]?.trim() ?? '', 10);
        const price            = parseFloat(cols[5]?.trim() ?? '');

        // visibility_scope from column index if present, else default 'public'
        const rawScope = visibilityColIndex >= 0 ? (cols[visibilityColIndex]?.trim() ?? '') : '';
        const visibility_scope = safeVisibilityScope(rawScope || undefined);

        // barcode / product_image_url are optional pass-through columns.
        // Absent column index (-1) or empty cell both resolve to
        // `undefined`, which the DB stores as null — no error either way.
        const rawBarcode  = barcodeColIndex >= 0 ? (cols[barcodeColIndex]?.trim() ?? '') : '';
        const rawImageUrl = imageUrlColIndex >= 0 ? (cols[imageUrlColIndex]?.trim() ?? '') : '';
        const barcode           = rawBarcode || undefined;
        const product_image_url = rawImageUrl || undefined;

        if (!product_code) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: missing product_code`);
          return;
        }
        if (!product_name) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: missing product_name (pn: ${product_code})`);
          return;
        }
        if (isNaN(quantity) || quantity < 0) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: invalid quantity for "${product_code}"`);
          return;
        }
        if (isNaN(price) || price < 0) {
          skippedRows++;
          console.warn(`[MIHWAR Import] SKIP line ${line}: invalid price for "${product_code}"`);
          return;
        }

        validatedRows.push({
          product_code, product_name, brand, model, quantity, price,
          shop_id: ownedShopId!, visibility_scope,
          barcode, product_image_url,
        });
      });

      const validRows = validatedRows.length;
      console.log(`[MIHWAR Import] Valid: ${validRows}  Skipped: ${skippedRows}`);

      if (validRows === 0) {
        throw new Error(t(
          `No valid rows found. ${skippedRows} rows skipped due to missing or invalid data.`,
          `لم يتم العثور على صفوف صالحة. تم تخطي ${skippedRows} صف.`
        ));
      }

      setImportProgress(t('Loading existing inventory…', 'جاري تحميل المخزون الحالي…'));
      console.log(`[MIHWAR Import] Fetching existing product_codes for shop ${ownedShopId}…`);

      const existingMap = new Map<string, number>();
      const FETCH_PAGE  = 1000;
      let   fetchFrom   = 0;
      let   keepFetching = true;

      while (keepFetching) {
        const { data: chunk, error: fetchErr } = await supabase
          .from('products')
          .select('id, product_code')
          .eq('shop_id', ownedShopId!)
          .range(fetchFrom, fetchFrom + FETCH_PAGE - 1);

        if (fetchErr) {
          console.error('[MIHWAR Import] Failed to fetch existing products:', fetchErr);
          throw new Error(t(
            `Failed to load existing inventory: ${fetchErr.message}`,
            `فشل تحميل المخزون الحالي: ${fetchErr.message}`
          ));
        }

        (chunk ?? []).forEach(row => existingMap.set(row.product_code, row.id));

        if (!chunk || chunk.length < FETCH_PAGE) keepFetching = false;
        else fetchFrom += FETCH_PAGE;
      }

      console.log(`[MIHWAR Import] Existing products loaded: ${existingMap.size}`);

      const toInsert: ValidRow[]                          = [];
      const toUpdate: Array<ValidRow & { id: number }>   = [];

      for (const row of validatedRows) {
        const existingId = existingMap.get(row.product_code);
        if (existingId !== undefined) toUpdate.push({ ...row, id: existingId });
        else                          toInsert.push(row);
      }

      console.log(`[MIHWAR Import] Bucket — INSERT: ${toInsert.length}  UPDATE: ${toUpdate.length}`);

      let totalInserted = 0;
      let totalUpdated  = 0;

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

          const results = await Promise.all(
            batch.map(row =>
              supabase
                .from('products')
                .update({
                  product_name:         row.product_name,
                  brand:             row.brand,
                  model:             row.model,
                  quantity:          row.quantity,
                  price:             row.price,
                  visibility_scope:  row.visibility_scope,
                  ...(row.barcode !== undefined ? { barcode: row.barcode } : {}),
                  ...(row.product_image_url !== undefined ? { product_image_url: row.product_image_url } : {}),
                })
                .eq('id', row.id)
                .eq('shop_id', ownedShopId!)
            )
          );

          const batchErrors = results
            .map((r, i) => r.error ? `Row id=${batch[i].id} (${batch[i].product_code}): ${r.error.message}` : null)
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

      const summary: ImportSummary = {
        totalRows:      dataRows.length,
        validRows,
        skippedRows,
        inserted:       totalInserted,
        updated:        totalUpdated,
        totalProcessed: totalInserted + totalUpdated,
      };

      console.log('[MIHWAR Import] ✔ Complete. Summary:', summary);

      const { count: postImportCount, error: postCountErr } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', ownedShopId!);

      if (postCountErr) {
        console.error('[MIHWAR Import] post-import COUNT failed:', postCountErr.message);
      } else {
        console.log(
          `[MIHWAR Import] ── POST-IMPORT DB COUNT: ${postImportCount}` +
          ` | Expected from summary: ${summary.totalProcessed}` +
          (postImportCount === summary.totalProcessed
            ? ' ← ✔ DB matches import summary'
            : ` ← ⚠ MISMATCH — expected ${summary.totalProcessed}, got ${postImportCount}`)
        );
        console.log(
          postImportCount !== null && postImportCount !== undefined
            ? (postImportCount > 1000
              ? `[MIHWAR Import] ⚠ COUNT=${postImportCount} > 1000 — if dashboard shows 1000, the bug is in fetchProducts pagination`
              : `[MIHWAR Import] COUNT=${postImportCount} ≤ 1000 — if this is wrong, check DB writes or RLS SELECT policy`)
            : '[MIHWAR Import] COUNT is null — RLS may be blocking the count query entirely'
        );
      }

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

  // ── Derived Data ──────────────────────────────────────────────────────────
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
        || p.product_code?.toLowerCase().includes(q)
        || p.product_name?.toLowerCase().includes(q)
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
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImageError(null);
    setPendingImageFile(null);
    setImageRemoved(false);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((p: Product) => {
    setEditItem(p);
    setForm({
      product_code:        p.product_code,
      product_name:          p.product_name,
      brand:              p.brand,
      model:              p.model,
      quantity:           String(p.quantity),
      price:              String(p.price),
      visibility_scope:   safeVisibilityScope(p.visibility_scope),
      product_image_url:  p.product_image_url ?? '',
      margin_percent:     p.margin_percent != null ? String(p.margin_percent) : '',
    });
    setFormError(null);
    setImageError(null);
    setPendingImageFile(null);
    setImageRemoved(false);
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
      ['Product Code', 'Name', 'Brand', 'Model', 'Quantity', 'Price', 'Visibility Scope', 'Barcode', 'Product Image Url'].join(','),
      ...filtered.map(p => [
        p.product_code, p.product_name, p.brand, p.model, p.quantity, p.price,
        safeVisibilityScope(p.visibility_scope),
        effectiveBarcode(p),
        p.product_image_url ?? '',
      ].join(','))
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

  // ── Visibility scope options ───────────────────────────────────────────────
  const visibilityOptions: { value: VisibilityScope; labelEn: string; labelAr: string; Icon: React.ElementType; cls: string }[] = [
    { value: 'public',  labelEn: 'Public Marketplace', labelAr: 'السوق العام',     Icon: Globe, cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
    { value: 'group',   labelEn: 'Group Only',          labelAr: 'داخل المجموعة',  Icon: Users, cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5' },
    { value: 'private', labelEn: 'Shop Only',           labelAr: 'داخل الفرع',     Icon: Lock,  cls: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
  ];

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
          placeholder={t('Search by product code, name or brand...', 'ابحث بكود المنتج، الاسم أو الماركة...')}
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

      {/* ── KPI Cards ── */}
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

      {/* ── Table Actions ── */}
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
          <button
            onClick={openMarginModal}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors"
            title={t('Set the profit margin applied to your products in the public marketplace', 'ضبط هامش الربح المُطبَّق على منتجاتك في السوق العام')}
          >
            <Percent size={14} /> {t('Profit Margin', 'هامش الربح')}
          </button>
        </div>
        <button
          onClick={openAdd}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-500 shadow-lg active:scale-95 transition-all"
        >
          <Plus size={18} /> {t('Add Product', 'إضافة منتج')}
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
              { label: t('New Products', 'منتجات جديدة'),     val: importSummary.inserted,       color: 'text-emerald-400' },
              { label: t('Updated Products', 'منتجات محدّثة'), val: importSummary.updated,         color: 'text-blue-400' },
              { label: t('Skipped Rows', 'صفوف مُتخطّاة'),    val: importSummary.skippedRows,     color: 'text-amber-400' },
              { label: t('Total Processed', 'إجمالي المعالجة'), val: importSummary.totalProcessed, color: 'text-white' },
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
          <table className="w-full text-sm text-right border-collapse min-w-[980px]" role="grid">
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
                <th scope="col" className="p-4 w-[64px] text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Image', 'الصورة')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Product Details', 'تفاصيل المنتج')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Vehicle / Brand', 'المركبة / الماركة')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Stock Level', 'المخزون')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Unit Price', 'سعر الوحدة')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Visibility', 'نطاق الظهور')}</th>
                <th scope="col" className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest text-center">{t('Actions', 'إجراء')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-20 text-center text-slate-500">
                    <RefreshCw className="animate-spin mx-auto mb-4" />
                    {t('Loading...', 'جاري التحميل...')}
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-20 text-center text-slate-600 italic">
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
                        aria-label={t(`Select ${p.product_name}`, `تحديد ${p.product_name}`)}
                      />
                    </td>
                    <td className="p-4">
                      <ProductThumb
                        src={p.product_image_url}
                        alt={p.product_name}
                        sizeCls="w-12 h-12"
                        iconSize={18}
                        roundedCls="rounded-lg"
                        t={t}
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-sm mb-1">{p.product_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded leading-none">{p.product_code}</span>
                          <CopyButton text={p.product_code} />
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
                      <VisibilityBadge scope={p.visibility_scope} t={t} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                          title={t('Edit', 'تعديل')}
                          aria-label={t(`Edit ${p.product_name}`, `تعديل ${p.product_name}`)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title={t('Delete', 'حذف')}
                          aria-label={t(`Delete ${p.product_name}`, `حذف ${p.product_name}`)}
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
          aria-label={editItem ? t('Edit Product', 'تعديل منتج') : t('New Inventory Item', 'إضافة منتج جديد')}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-black text-white">
                {editItem ? t('Edit Product', 'تعديل منتج') : t('New Inventory Item', 'إضافة منتج جديد')}
              </h2>
              <button onClick={closeModal} className="p-2 text-slate-500 hover:text-white transition-colors" aria-label={t('Close', 'إغلاق')}>
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-2 gap-4">

                {/* ── Product Image Picker ── */}
                <ImagePicker
                  value={form.product_image_url}
                  onFileSelected={handleImageFileSelected}
                  onRemove={handleImageRemove}
                  uploading={imageUploading}
                  error={imageError}
                  t={t}
                />

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Product Name', 'اسم المنتج')}</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.product_name}
                    onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Product Code', 'كود المنتج')}</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors font-mono text-sm"
                    value={form.product_code}
                    onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
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

                {/* ── Barcode (auto-generated when missing, read-only + copy) ── */}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    {t('Barcode', 'الباركود')}
                  </label>
                  <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                    <ScanLine size={15} className="text-slate-500 shrink-0" />
                    <span className="flex-1 font-mono text-sm text-slate-200 truncate">
                      {editItem
                        ? effectiveBarcode(editItem)
                        : (form.product_code
                          ? generateBarcode(ownedShopId ?? 0, form.product_code)
                          : t('Will be generated after saving', 'سيتم إنشاؤه بعد الحفظ'))}
                    </span>
                    {editItem && (
                      <CopyButton text={effectiveBarcode(editItem)} />
                    )}
                  </div>
                </div>

                {/* ── Per-product margin override (optional) ──
                     Empty = use the shop's default margin. A value here
                     overrides the shop default for THIS product only —
                     for products whose profit margin differs from the
                     rest of the catalog. Never affects the cost price
                     shown on this page; only affects the marketplace
                     price shown to buyers from a different shop. ── */}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    {t('Product Margin Override (%)', 'هامش ربح خاص بالمنتج (%)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder={t(
                      `Leave empty to use shop default (${defaultMarginPercent}%)`,
                      `اتركه فاضياً لاستخدام هامش المحل العام (${defaultMarginPercent}%)`
                    )}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm placeholder:text-slate-600"
                    value={form.margin_percent}
                    onChange={e => setForm(f => ({ ...f, margin_percent: e.target.value }))}
                  />
                </div>

                {/* ── Visibility Scope Selector ── */}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    {t('Visibility Scope', 'نطاق الظهور')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {visibilityOptions.map(opt => {
                      const isActive = form.visibility_scope === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, visibility_scope: opt.value }))}
                          className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all ${
                            isActive
                              ? `${opt.cls} border-current shadow-md`
                              : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                          }`}
                          aria-pressed={isActive}
                        >
                          <opt.Icon size={16} className={isActive ? '' : 'opacity-50'} />
                          <span className="text-[10px] font-bold leading-tight">
                            {t(opt.labelEn, opt.labelAr)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
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

      {/* ── Shop-level Profit Margin Modal ──
           Sets shops.default_margin_percent. This value is applied to
           this shop's products only when shown to a buyer from a
           DIFFERENT shop in the public marketplace ("purchase"
           relationship). Same-group/org transfer requests, and this
           inventory page itself, always show the raw cost price —
           never the marked-up price. ── */}
      {showMarginModal && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={t('Profit Margin', 'هامش الربح')}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Percent size={18} className="text-amber-400" />
                {t('Profit Margin', 'هامش الربح')}
              </h2>
              <button onClick={closeMarginModal} className="p-2 text-slate-500 hover:text-white transition-colors" aria-label={t('Close', 'إغلاق')}>
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                {t(
                  'This percentage is added on top of your cost price when your products appear to buyers from other shops in the public marketplace. Your own inventory price always stays the cost price, and transfers between branches of the same group are never marked up.',
                  'تُضاف هذي النسبة على سعر التكلفة عندما تظهر منتجاتك للمشترين من محلات أخرى في السوق العام. سعر منتجاتك في المخزون يبقى دائماً سعر التكلفة، والتحويلات بين فروع نفس المجموعة لا تُضاف عليها أي نسبة.'
                )}
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  {t('Default Margin (%)', 'الهامش العام (%)')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    autoFocus
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={marginInput}
                    onChange={e => setMarginInput(e.target.value)}
                  />
                  <Percent size={14} className="absolute top-1/2 -translate-y-1/2 right-4 text-slate-500" />
                </div>
              </div>

              {marginError && (
                <div className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex items-center gap-2" role="alert">
                  <AlertCircle size={14} /> {marginError}
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-950/30 flex items-center justify-end gap-3 border-t border-slate-800">
              <button onClick={closeMarginModal} className="px-5 py-2.5 rounded-xl text-slate-400 text-sm font-bold hover:text-white transition-colors">
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleSaveMargin}
                disabled={marginSaving}
                className="px-8 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-black hover:bg-amber-500 transition-all disabled:opacity-50 flex items-center gap-2 active:scale-95 shadow-lg"
              >
                {marginSaving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                {t('Save', 'حفظ')}
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
