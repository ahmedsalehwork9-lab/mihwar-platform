import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  Package, Plus, Search, RefreshCw, Trash2,
  Edit2, X, Save, AlertCircle, ChevronLeft,
  ChevronRight, Download, Upload, Copy, Check,
  TrendingDown, ShieldAlert, BoxSelect,
  Boxes, DollarSign, PackageX, PackageCheck,
} from "lucide-react";

// ─── Types (unchanged) ───────────────────────────────────────────────────────

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

const EMPTY_FORM: FormState = {
  part_number: '', part_name: '', brand: '', model: '', quantity: '', price: ''
};

const PAGE_SIZE = 10;

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handle}
      className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-700 transition-all"
    >
      {copied
        ? <Check size={11} className="text-emerald-400" />
        : <Copy size={11} />}
    </button>
  );
}

// ─── InventoryPage ────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { ownedShopId } = useAuth();
  const { t, isRTL }   = useLang();

  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [importing, setImporting]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<FilterStatus>('all');
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<Set<number>>(new Set());

  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState<Product | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError]   = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ownedShopId) return;
    fetchProducts();
  }, [ownedShopId]);

  // ── Supabase queries — UNCHANGED ──────────────────────────────────────────
  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("shop_id", ownedShopId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setProducts(data || []);
    setLoading(false);
  };

  // ── Status helper — UNCHANGED ─────────────────────────────────────────────
  const getStatus = (qty: number): FilterStatus => {
    if (qty > 5) return "in_stock";
    if (qty > 0) return "low_stock";
    return "out_of_stock";
  };

  // ── Filtering — UNCHANGED logic ───────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => filter === 'all' || getStatus(p.quantity) === filter)
      .filter(p =>
        !q ||
        p.part_number?.toLowerCase().includes(q) ||
        p.part_name?.toLowerCase().includes(q)   ||
        p.brand?.toLowerCase().includes(q)
      );
  }, [products, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Real KPI counts — UNCHANGED logic ────────────────────────────────────
  const counts = useMemo(() => ({
    all:           products.length,
    in_stock:      products.filter(p => getStatus(p.quantity) === 'in_stock').length,
    low_stock:     products.filter(p => getStatus(p.quantity) === 'low_stock').length,
    out_of_stock:  products.filter(p => getStatus(p.quantity) === 'out_of_stock').length,
  }), [products]);

  const totalValue    = products.reduce((sum, p) => sum + p.quantity * p.price, 0);
  const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);

  // ── Selection helpers — UNCHANGED ─────────────────────────────────────────
  const toggleSelect = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === pageItems.length) setSelected(new Set());
    else setSelected(new Set(pageItems.map(p => p.id)));
  };

  // ── Modal helpers — UNCHANGED ─────────────────────────────────────────────
  const openAdd = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };
  const openEdit = (p: Product) => {
    setEditItem(p);
    setForm({
      part_number: p.part_number,
      part_name:   p.part_name,
      brand:       p.brand,
      model:       p.model,
      quantity:    String(p.quantity),
      price:       String(p.price),
    });
    setFormError(null);
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  // ── Save / Delete — UNCHANGED ─────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.part_number || !form.part_name || !form.quantity) {
      setFormError(t('Part number, name and quantity are required', 'رقم القطعة والاسم والكمية مطلوبة'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editItem) {
        const { error } = await supabase
          .from('products')
          .update({
            part_number: form.part_number,
            part_name:   form.part_name,
            brand:       form.brand,
            model:       form.model,
            quantity:    Number(form.quantity),
            price:       Number(form.price),
          })
          .eq('id', editItem.id);
        if (error) throw error;
        showSuccess(t('Updated successfully ✓', 'تم التعديل بنجاح ✓'));
      } else {
        const { error } = await supabase
          .from('products')
          .insert({
            part_number: form.part_number,
            part_name:   form.part_name,
            brand:       form.brand,
            model:       form.model,
            quantity:    Number(form.quantity),
            price:       Number(form.price),
            shop_id:     ownedShopId,
          });
        if (error) throw error;
        showSuccess(t('Added successfully ✓', 'تمت الإضافة بنجاح ✓'));
      }
      closeModal();
      await fetchProducts();
    } catch (e: any) {
      setFormError(e?.message ?? t('An error occurred', 'حدث خطأ'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('Are you sure you want to delete this item?', 'هل أنت متأكد من الحذف؟'))) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) { await fetchProducts(); showSuccess(t('Deleted successfully', 'تم الحذف بنجاح')); }
  };

  // ── Export — UNCHANGED ────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      [
        t('Part Number', 'رقم القطعة'),
        t('Name', 'الاسم'),
        t('Brand', 'الماركة'),
        t('Model', 'الموديل'),
        t('Quantity', 'الكمية'),
        t('Price', 'السعر'),
        t('Status', 'الحالة'),
      ],
      ...filtered.map(p => [
        p.part_number, p.part_name, p.brand, p.model,
        p.quantity, p.price,
        getStatus(p.quantity) === 'in_stock'
          ? t('In Stock', 'متوفر')
          : getStatus(p.quantity) === 'low_stock'
          ? t('Low Stock', 'منخفض')
          : t('Out of Stock', 'نفد'),
      ]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
    showSuccess(t('Export completed ✓', 'تم التصدير بنجاح ✓'));
  };

  // ── Import — UNCHANGED logic ──────────────────────────────────────────────
  const handleImportClick = () => { importRef.current?.click(); };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setError(null);
    try {
      const text  = await file.text();
      const clean = text.replace(/^\uFEFF/, '');
      const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        setError(t('File is empty or has no data', 'الملف فارغ أو لا يحتوي على بيانات'));
        setImporting(false);
        return;
      }

      const rows    = lines.slice(1);
      const toInsert: Omit<Product, 'id'>[] = [];
      const skipped: number[]               = [];

      rows.forEach((line, idx) => {
        const cols        = line.split(',');
        const part_number = cols[0]?.trim();
        const part_name   = cols[1]?.trim();
        const brand       = cols[2]?.trim() ?? '';
        const model       = cols[3]?.trim() ?? '';
        const quantity    = Number(cols[4]?.trim());
        const price       = Number(cols[5]?.trim());

        if (!part_number || !part_name || isNaN(quantity)) {
          skipped.push(idx + 2);
          return;
        }
        toInsert.push({
          part_number, part_name, brand, model,
          quantity: isNaN(quantity) ? 0 : quantity,
          price:    isNaN(price)    ? 0 : price,
          shop_id:  ownedShopId!,
        });
      });

      if (toInsert.length === 0) {
        setError(t('No valid rows found. Please check the file format.', 'لم يتم العثور على صفوف صالحة للاستيراد. تأكد من تنسيق الملف.'));
        setImporting(false);
        return;
      }

      const { error: insertError } = await supabase.from('products').insert(toInsert);
      if (insertError) throw insertError;

      await fetchProducts();
      const msg = skipped.length > 0
        ? t(
            `Imported ${toInsert.length} items ✓ (${skipped.length} invalid rows skipped)`,
            `تم استيراد ${toInsert.length} قطعة بنجاح ✓ (تم تخطي ${skipped.length} صف غير صالح)`
          )
        : t(`Imported ${toInsert.length} items successfully ✓`, `تم استيراد ${toInsert.length} قطعة بنجاح ✓`);
      showSuccess(msg);
    } catch (e: any) {
      setError(e?.message ?? t('An error occurred during import', 'حدث خطأ أثناء الاستيراد'));
    } finally {
      setImporting(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = (qty: number) => {
    const s = getStatus(qty);
    const cfg = {
      in_stock:    { label: t('In Stock',    'متوفر'),   cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      low_stock:   { label: t('Low Stock',   'منخفض'),   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'       },
      out_of_stock:{ label: t('Out of Stock','نفد'),      cls: 'bg-red-500/10 text-red-400 border-red-500/20'             },
    };
    const { label, cls } = cfg[s];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap font-medium ${cls}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {label}
      </span>
    );
  };

  const qtyColor = (qty: number) => {
    const s = getStatus(qty);
    if (s === 'in_stock')  return 'text-emerald-400 font-bold';
    if (s === 'low_stock') return 'text-amber-400 font-bold';
    return 'text-red-400 font-bold';
  };

  // ── Top 5 attention items (real data) ────────────────────────────────────
  const attentionItems = useMemo(() =>
    products
      .filter(p => p.quantity <= 5)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5)
  , [products]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Success toast ─────────────────────────────────────────── */}
      {successMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
                        bg-emerald-600 text-white text-sm px-5 py-2.5 rounded-xl shadow-xl
                        animate-[fadeUp_0.2s_ease]">
          <Check size={15} />
          {successMsg}
        </div>
      )}

      {/* ── Error banner ──────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3.5
                        text-red-400 mb-4 text-xs sm:text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1 min-w-0">{error}</span>
          <button onClick={fetchProducts} className="underline text-xs shrink-0 hover:text-red-300 transition-colors">
            {t('Retry', 'إعادة المحاولة')}
          </button>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={fetchProducts}
            className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl
                       flex items-center justify-center shrink-0 hover:bg-emerald-500/20 transition-colors"
            aria-label={t('Refresh', 'تحديث')}
          >
            <RefreshCw size={16} className={`text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-base sm:text-lg leading-tight">
              {t('Local Inventory', 'مخزون محلي')}
            </h1>
            <p className="text-slate-500 text-xs truncate">
              {loading
                ? t('Loading…', 'جاري التحميل…')
                : t(`${products.length} items · ${totalValue.toLocaleString()} SAR`,
                    `${products.length} قطعة — ${totalValue.toLocaleString()} ر.س`)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative w-full sm:w-48 order-first sm:order-none">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('Search inventory…', 'ابحث في مخزونك…')}
              className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm
                         rounded-xl py-2.5 pr-9 pl-8 w-full focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input ref={importRef} type="file" accept=".csv" onChange={handleImportFile} className="hidden" />
            <button
              onClick={handleImportClick}
              disabled={importing}
              className="flex items-center justify-center gap-1.5 bg-slate-800 border border-slate-700
                         hover:border-slate-500 text-slate-300 text-sm px-3 py-2.5 rounded-xl transition-colors
                         disabled:opacity-50 flex-1 sm:flex-none min-h-[40px]"
            >
              <Upload size={14} className="shrink-0" />
              <span>{importing ? t('Importing…', 'جاري…') : t('Import', 'استيراد')}</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 bg-slate-800 border border-slate-700
                         hover:border-slate-500 text-slate-300 text-sm px-3 py-2.5 rounded-xl transition-colors
                         flex-1 sm:flex-none min-h-[40px]"
            >
              <Download size={14} className="shrink-0" />
              <span>{t('Export', 'تصدير')}</span>
            </button>
            <button
              onClick={openAdd}
              className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500
                         text-white text-sm px-3 sm:px-4 py-2.5 rounded-xl font-semibold transition-colors
                         flex-1 sm:flex-none min-h-[40px] active:scale-[0.98]"
            >
              <Plus size={14} className="shrink-0" />
              <span>{t('Add Part', 'إضافة قطعة')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI cards — real data only ────────────────────────────── */}
      {!loading && products.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          {[
            {
              icon: <Boxes size={18} />,
              iconBg: 'bg-blue-500/10 text-blue-400',
              value: products.length,
              label: t('Total Parts', 'إجمالي القطع'),
              valueColor: 'text-white',
            },
            {
              icon: <Package size={18} />,
              iconBg: 'bg-violet-500/10 text-violet-400',
              value: totalQuantity.toLocaleString(),
              label: t('Total Quantity', 'إجمالي الكميات'),
              valueColor: 'text-white',
            },
            {
              icon: <DollarSign size={18} />,
              iconBg: 'bg-emerald-500/10 text-emerald-400',
              value: totalValue.toLocaleString(),
              label: t('Inventory Value (SAR)', 'قيمة المخزون (ر.س)'),
              valueColor: 'text-emerald-400',
              wide: true,
            },
            {
              icon: <TrendingDown size={18} />,
              iconBg: 'bg-amber-500/10 text-amber-400',
              value: counts.low_stock,
              label: t('Low Stock', 'كمية منخفضة'),
              valueColor: 'text-amber-400',
            },
            {
              icon: <PackageX size={18} />,
              iconBg: 'bg-red-500/10 text-red-400',
              value: counts.out_of_stock,
              label: t('Out of Stock', 'نفد المخزون'),
              valueColor: 'text-red-400',
            },
          ].map(({ icon, iconBg, value, label, valueColor, wide }) => (
            <div
              key={label}
              className={`bg-slate-900 border border-slate-700/60 rounded-2xl p-4 ${wide ? 'col-span-2 lg:col-span-1' : ''}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
                {icon}
              </div>
              <p className={`text-[22px] font-black leading-none mb-1 ${valueColor}`}>{value}</p>
              <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Inventory health + action center (real data) ──────────── */}
      {!loading && products.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">

          {/* Health bars */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <PackageCheck size={16} className="text-emerald-400" />
              {t('Inventory Health', 'صحة المخزون')}
            </p>
            <div className="space-y-3">
              {[
                {
                  label: t('Healthy Stock', 'مخزون جيد'),
                  count: counts.in_stock,
                  total: products.length,
                  barColor: 'bg-emerald-500',
                  textColor: 'text-emerald-400',
                },
                {
                  label: t('Low Stock', 'كمية منخفضة'),
                  count: counts.low_stock,
                  total: products.length,
                  barColor: 'bg-amber-500',
                  textColor: 'text-amber-400',
                },
                {
                  label: t('Out of Stock', 'نفد المخزون'),
                  count: counts.out_of_stock,
                  total: products.length,
                  barColor: 'bg-red-500',
                  textColor: 'text-red-400',
                },
              ].map(({ label, count, total, barColor, textColor }) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-400">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${textColor}`}>{count}</span>
                        <span className="text-[10px] text-slate-600">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action center — top 5 needing attention */}
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-400" />
              {t('Needs Attention', 'تحتاج مراجعة')}
            </p>
            {attentionItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <PackageCheck size={24} className="text-emerald-400" />
                <p className="text-xs text-slate-500 text-center">
                  {t('All items are well stocked', 'جميع القطع بمخزون جيد')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {attentionItems.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 py-2 border-b border-slate-800/60 last:border-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => openEdit(p)}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black ${
                      p.quantity === 0 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {p.quantity}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-slate-200 truncate">{p.part_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{p.part_number}</p>
                    </div>
                    <Edit2 size={12} className="text-slate-600 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filter chips ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto pb-1
                      scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
        {([
          { key: 'all',          label: t('All', 'الكل'),           icon: <BoxSelect size={12} /> },
          { key: 'in_stock',     label: t('In Stock', 'متوفر'),     icon: <PackageCheck size={12} /> },
          { key: 'low_stock',    label: t('Low Stock', 'منخفض'),    icon: <TrendingDown size={12} /> },
          { key: 'out_of_stock', label: t('Out of Stock', 'نفد'),   icon: <PackageX size={12} />     },
        ] as { key: FilterStatus; label: string; icon: React.ReactNode }[]).map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border
                        transition-all whitespace-nowrap shrink-0 min-h-[32px] ${
              filter === f.key
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:text-white'
            }`}
          >
            <span className={filter === f.key ? 'text-white' : 'text-slate-500'}>{f.icon}</span>
            {f.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              filter === f.key ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              {counts[f.key]}
            </span>
          </button>
        ))}
        {search && (
          <span className="text-slate-500 text-xs shrink-0 mr-auto">
            {filtered.length} {t('results', 'نتيجة')}
          </span>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/40">
                <th className="p-3 w-9 text-center">
                  <input
                    type="checkbox"
                    checked={selected.size === pageItems.length && pageItems.length > 0}
                    onChange={toggleAll}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </th>
                {[
                  t('Part Number', 'رقم القطعة'),
                  t('Part Name', 'اسم القطعة'),
                  t('Brand / Model', 'الماركة / الموديل'),
                  t('Qty', 'الكمية'),
                  t('Price', 'السعر'),
                  t('Status', 'الحالة'),
                  t('Actions', 'إجراء'),
                ].map((h, i) => (
                  <th key={i} className={`p-3 text-slate-400 font-semibold text-xs ${i === 6 ? 'text-center' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm">{t('Loading inventory…', 'جاري تحميل المخزون…')}</p>
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center">
                        <Package size={26} className="text-slate-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-400">
                          {search
                            ? t('No matching products found', 'لا توجد قطع تطابق بحثك')
                            : t('No inventory items yet', 'لا توجد قطع في مخزونك')}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {search
                            ? t('Try a different keyword', 'جرب كلمة بحث مختلفة')
                            : t('Start by adding your first part', 'ابدأ بإضافة أول قطعة')}
                        </p>
                      </div>
                      {!search && (
                        <button
                          onClick={openAdd}
                          className="mt-1 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-xl transition-colors"
                        >
                          <Plus size={14} />
                          {t('Add Part', 'إضافة قطعة')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : pageItems.map(p => (
                <tr
                  key={p.id}
                  className={`border-b border-slate-700/20 hover:bg-slate-800/40 transition-colors ${
                    selected.has(p.id) ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="accent-emerald-500 cursor-pointer"
                    />
                  </td>
                  {/* Part number */}
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded px-1.5 py-0.5">
                        {p.part_number}
                      </span>
                      <CopyButton text={p.part_number} />
                    </div>
                  </td>
                  {/* Part name */}
                  <td className="p-3">
                    <span className="text-white font-semibold text-[13px]">{p.part_name}</span>
                  </td>
                  {/* Brand / model */}
                  <td className="p-3">
                    <span className="text-slate-400 text-xs">
                      {p.brand}
                      {p.brand && p.model ? ' · ' : ''}
                      {p.model}
                    </span>
                  </td>
                  {/* Quantity */}
                  <td className="p-3">
                    <span className={`text-[15px] ${qtyColor(p.quantity)}`}>{p.quantity}</span>
                  </td>
                  {/* Price */}
                  <td className="p-3">
                    <span className="text-white font-semibold text-[13px]">
                      {p.price.toLocaleString()}
                      <span className="text-slate-500 text-[10px] font-normal mr-1">{t('SAR', 'ر.س')}</span>
                    </span>
                  </td>
                  {/* Status */}
                  <td className="p-3">{statusBadge(p.quantity)}</td>
                  {/* Actions */}
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEdit(p)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700
                                   text-slate-400 hover:border-emerald-500 hover:text-emerald-400 transition-colors"
                        title={t('Edit', 'تعديل')}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700
                                   text-slate-400 hover:border-red-500 hover:text-red-400 transition-colors"
                        title={t('Delete', 'حذف')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 text-xs text-slate-500 gap-2">
            <span className="shrink-0">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}{' '}
              {t('of', 'من')} {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700
                           text-slate-400 hover:border-slate-500 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={13} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                    page === n
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700
                           text-slate-400 hover:border-slate-500 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add / Edit modal ──────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl"
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
              {/* Handle bar on mobile */}
              <div className="sm:hidden absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-700" />
              <h2 className="text-white font-bold text-base">
                {editItem ? t('Edit Part', 'تعديل القطعة') : t('Add New Part', 'إضافة قطعة جديدة')}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X size={17} />
              </button>
            </div>

            {/* Form fields */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'part_number', label: t('Part Number *', 'رقم القطعة *'), placeholder: 'IS-001' },
                  { key: 'part_name',   label: t('Part Name *',   'اسم القطعة *'), placeholder: t('Oil Filter', 'فلتر زيت') },
                  { key: 'brand',       label: t('Brand',         'الماركة'),      placeholder: 'Isuzu' },
                  { key: 'model',       label: t('Model',         'الموديل'),      placeholder: 'NQR' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-slate-400 text-[11px] font-medium mb-1.5">{label}</label>
                    <input
                      value={form[key as keyof FormState]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 text-sm
                                 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600"
                    />
                  </div>
                ))}
                {/* Quantity */}
                <div>
                  <label className="block text-slate-400 text-[11px] font-medium mb-1.5">
                    {t('Quantity *', 'الكمية *')}
                  </label>
                  <input
                    type="number" min="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 text-sm
                               focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                {/* Price */}
                <div>
                  <label className="block text-slate-400 text-[11px] font-medium mb-1.5">
                    {t('Price (SAR)', 'السعر (ريال)')}
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 text-sm
                               focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <AlertCircle size={14} className="shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-4 sm:px-5 pb-5">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-sm text-slate-400 hover:text-white border border-slate-700
                           hover:border-slate-500 rounded-xl transition-colors min-h-[40px]"
              >
                {t('Cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500
                           disabled:opacity-50 text-white rounded-xl font-semibold transition-colors min-h-[40px]
                           active:scale-[0.98]"
              >
                <Save size={14} />
                {saving ? t('Saving…', 'جاري الحفظ…') : t('Save', 'حفظ')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
