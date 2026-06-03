import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import {
  Package, Plus, Search, RefreshCw, Trash2,
  Edit2, X, Save, AlertCircle, ChevronLeft,
  ChevronRight, Download, Upload, Copy, Check,
  TrendingDown, BoxSelect, Boxes, DollarSign, 
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

const EMPTY_FORM: FormState = {
  part_number: '', part_name: '', brand: '', model: '', quantity: '', price: ''
};

const PAGE_SIZE = 12;

// ─── Components ──────────────────────────────────────────────────────────────

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

export default function InventoryPage() {
  const { ownedShopId } = useAuth();
  const { t, isRTL }   = useLang();

  // ── State ──────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
    if (!error) {
      fetchProducts();
      showSuccess(t('Deleted', 'تم الحذف'));
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getStatus = useCallback((qty: number): FilterStatus => {
    if (qty > 5) return "in_stock";
    if (qty > 0) return "low_stock";
    return "out_of_stock";
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products
      .filter(p => filter === 'all' || getStatus(p.quantity) === filter)
      .filter(p => !q || p.part_number?.toLowerCase().includes(q) || p.part_name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q));
  }, [products, filter, search, getStatus]);

  const counts = useMemo(() => ({
    all: products.length,
    in_stock: products.filter(p => getStatus(p.quantity) === 'in_stock').length,
    low_stock: products.filter(p => getStatus(p.quantity) === 'low_stock').length,
    out_of_stock: products.filter(p => getStatus(p.quantity) === 'out_of_stock').length,
  }), [products, getStatus]);

  const totals = useMemo(() => {
    return products.reduce((acc, p) => {
      acc.value += (p.quantity * p.price);
      acc.qty += p.quantity;
      return acc;
    }, { value: 0, qty: 0 });
  }, [products]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setFormError(null); setShowModal(true); };
  const openEdit = (p: Product) => {
    setEditItem(p);
    setForm({ part_number: p.part_number, part_name: p.part_name, brand: p.brand, model: p.model, quantity: String(p.quantity), price: String(p.price) });
    setFormError(null);
    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const handleExport = () => {
    const csv = [
      ['Part Number', 'Name', 'Brand', 'Model', 'Quantity', 'Price'].join(','),
      ...filtered.map(p => [p.part_number, p.part_name, p.brand, p.model, p.quantity, p.price].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventory_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = text.split('\n').slice(1).filter(r => r.trim());
      const toInsert = rows.map(row => {
        const c = row.split(',');
        return {
          part_number: c[0]?.trim(),
          part_name: c[1]?.trim(),
          brand: c[2]?.trim(),
          model: c[3]?.trim(),
          quantity: Number(c[4]) || 0,
          price: Number(c[5]) || 0,
          shop_id: ownedShopId!
        };
      }).filter(r => r.part_number && r.part_name);
      
      const { error } = await supabase.from('products').insert(toInsert);
      if (error) throw error;
      fetchProducts();
      showSuccess(t('Imported successfully', 'تم الاستيراد بنجاح'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-10 px-4 sm:px-6 animate-in fade-in duration-500" dir={isRTL ? 'rtl' : 'ltr'}>
      
      {successMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 text-sm font-medium animate-bounce">
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

      {/* ── Primary Action: Search (Mobile First) ── */}
      <section className="relative mb-4">
        <div className={`absolute inset-y-0 ${isRTL ? 'right-0 pr-4' : 'left-0 pl-4'} flex items-center pointer-events-none text-slate-500`}>
          <Search size={18} />
        </div>
        <input
          type="text"
          value={search}
          onChange={e => {setSearch(e.target.value); setPage(1);}}
          placeholder={t('Search by part number, name or brand...', 'ابحث برقم القطعة، الاسم أو الماركة...')}
          className={`w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 ${isRTL ? 'pr-11 pl-11' : 'pl-11 pr-11'} text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all placeholder:text-slate-600 shadow-sm text-sm sm:text-base`}
        />
        {search && (
          <button 
            onClick={() => setSearch('')}
            className={`absolute inset-y-0 ${isRTL ? 'left-0 pl-4' : 'right-0 pr-4'} flex items-center text-slate-500 hover:text-white transition-colors`}
          >
            <X size={18} />
          </button>
        )}
      </section>

      {/* ── Filters (Directly below Search) ── */}
      <section className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
        <div className="flex items-center gap-1.5 px-2 py-1 text-slate-500 text-[10px] font-bold border-r border-slate-800 mr-1 uppercase tracking-widest shrink-0">
          <Filter size={12} /> {t('Filter', 'تصفية')}
        </div>
        {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as FilterStatus[]).map(s => (
          <button
            key={s}
            onClick={() => {setFilter(s); setPage(1);}}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filter === s 
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {t(s.replace('_', ' '), s === 'all' ? 'الكل' : s === 'in_stock' ? 'متوفر' : s === 'low_stock' ? 'منخفض' : 'نفد')}
            <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${filter === s ? 'bg-white/20' : 'bg-slate-800'}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </section>

      {/* ── KPI Section (Reduced height on mobile, redesigned hierarchy) ── */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-6">
        {[
          { label: t('Total Value', 'إجمالي القيمة'), val: `${totals.value.toLocaleString()} ر.س`, icon: DollarSign, color: 'text-emerald-400', wide: true },
          { label: t('Total Parts', 'إجمالي القطع'), val: counts.all, icon: Boxes, color: 'text-blue-400' },
          { label: t('In Stock', 'متوفر'), val: counts.in_stock, icon: PackageCheck, color: 'text-emerald-500' },
          { label: t('Low Stock', 'منخفض'), val: counts.low_stock, icon: TrendingDown, color: 'text-amber-400' },
          { label: t('Out of Stock', 'نفد'), val: counts.out_of_stock, icon: PackageX, color: 'text-red-400' },
        ].map((kpi, i) => (
          <div 
            key={i} 
            className={`p-3 rounded-xl border border-slate-800/60 bg-slate-900 flex flex-col justify-between min-h-[72px] sm:min-h-[90px] transition-colors hover:border-slate-700 group ${kpi.wide ? 'col-span-2 md:col-span-1' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate mr-2">{kpi.label}</span>
              <kpi.icon size={12} className={`${kpi.color} shrink-0`} />
            </div>
            <div className={`text-base sm:text-xl font-black ${kpi.color} mt-0.5 truncate`}>{kpi.val}</div>
          </div>
        ))}
      </section>

      {/* ── Table Actions ── */}
      <section className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input ref={importRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
          <button 
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Upload size={14} /> {importing ? t('Wait...', 'لحظة...') : t('Import', 'استيراد')}
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

      {/* ── Inventory Table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800">
                <th className="p-4 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="accent-emerald-500 rounded cursor-pointer"
                    checked={selected.size === pageItems.length && pageItems.length > 0}
                    onChange={() => selected.size === pageItems.length ? setSelected(new Set()) : setSelected(new Set(pageItems.map(p => p.id)))}
                  />
                </th>
                <th className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Part Details', 'تفاصيل القطعة')}</th>
                <th className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Vehicle / Brand', 'المركبة / الماركة')}</th>
                <th className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Stock Level', 'المخزون')}</th>
                <th className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('Unit Price', 'سعر الوحدة')}</th>
                <th className="p-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest text-center">{t('Actions', 'إجراء')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={6} className="p-20 text-center text-slate-500"><RefreshCw className="animate-spin mx-auto mb-4" /> {t('Loading...', 'جاري التحميل...')}</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center text-slate-600 italic">{t('No inventory records found.', 'لا توجد سجلات مخزون.')}</td></tr>
              ) : pageItems.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="p-4 text-center">
                    <input 
                      type="checkbox" 
                      className="accent-emerald-500 cursor-pointer"
                      checked={selected.has(p.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                        setSelected(next);
                      }}
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
                      <span className={`text-base font-black w-8 ${getStatus(p.quantity) === 'in_stock' ? 'text-emerald-500' : getStatus(p.quantity) === 'low_stock' ? 'text-amber-500' : 'text-red-500'}`}>
                        {p.quantity}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-tighter ${
                        p.quantity > 5 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                        p.quantity > 0 ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                        'bg-red-500/10 border-red-500/20 text-red-500'
                      }`}>
                        {p.quantity > 5 ? t('OK', 'متوفر') : p.quantity > 0 ? t('LOW', 'منخفض') : t('OUT', 'نفد')}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 font-bold text-slate-100">
                    {p.price.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500 font-normal">ر.س</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(p)} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all" title={t('Edit', 'تعديل')}><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title={t('Delete', 'حذف')}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/20">
            <span className="text-[11px] text-slate-500 font-medium">
              {t('Showing', 'عرض')} {(page-1)*PAGE_SIZE + 1} - {Math.min(page*PAGE_SIZE, filtered.length)} {t('of', 'من')} {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setPage(p => Math.max(1, p-1))} 
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-800 transition-colors active:scale-90"
              >
                {isRTL ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              {Array.from({length: Math.min(5, totalPages)}).map((_, i) => {
                const n = i + 1;
                return (
                  <button 
                    key={n} 
                    onClick={() => setPage(n)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${page === n ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    {n}
                  </button>
                );
              })}
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p+1))} 
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-800 transition-colors active:scale-90"
              >
                {isRTL ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-black text-white">{editItem ? t('Edit Part', 'تعديل قطعة') : t('New Inventory Item', 'إضافة قطعة جديدة')}</h2>
              <button onClick={closeModal} className="p-2 text-slate-500 hover:text-white transition-colors" aria-label={t('Close', 'إغلاق')}><X size={20} /></button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Part Name', 'اسم القطعة')}</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.part_name} onChange={e => setForm({...form, part_name: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Part Number', 'رقم القطعة')}</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors font-mono text-sm"
                    value={form.part_number} onChange={e => setForm({...form, part_number: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Brand', 'الماركة')}</label>
                  <input 
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Quantity', 'الكمية')}</label>
                  <input 
                    type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('Unit Price', 'السعر')}</label>
                  <input 
                    type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors text-sm"
                    value={form.price} onChange={e => setForm({...form, price: e.target.value})} 
                  />
                </div>
              </div>
              {formError && <div className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex items-center gap-2"><AlertCircle size={14} /> {formError}</div>}
            </div>

            <div className="p-5 bg-slate-950/30 flex items-center justify-end gap-3 border-t border-slate-800">
              <button onClick={closeModal} className="px-5 py-2.5 rounded-xl text-slate-400 text-sm font-bold hover:text-white transition-colors">{t('Cancel', 'إلغاء')}</button>
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

      {/* Error View */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={fetchProducts} className="underline font-bold text-xs">{t('Retry', 'إعادة المحاولة')}</button>
        </div>
      )}
    </div>
  );
}