import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  Package, Plus, Search, RefreshCw, Trash2,
  Edit2, X, Save, AlertCircle, ChevronLeft,
  ChevronRight, Download, Upload
} from "lucide-react";

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

export default function InventoryPage() {
  const { ownedShopId } = useAuth();

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

  const getStatus = (qty: number): FilterStatus => {
    if (qty > 5) return "in_stock";
    if (qty > 0) return "low_stock";
    return "out_of_stock";
  };

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

  const counts = useMemo(() => ({
    all:           products.length,
    in_stock:      products.filter(p => getStatus(p.quantity) === 'in_stock').length,
    low_stock:     products.filter(p => getStatus(p.quantity) === 'low_stock').length,
    out_of_stock:  products.filter(p => getStatus(p.quantity) === 'out_of_stock').length,
  }), [products]);

  const totalValue = products.reduce((sum, p) => sum + p.quantity * p.price, 0);

  const toggleSelect = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleAll = () => {
    if (selected.size === pageItems.length) setSelected(new Set());
    else setSelected(new Set(pageItems.map(p => p.id)));
  };

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

  const handleSave = async () => {
    if (!form.part_number || !form.part_name || !form.quantity) {
      setFormError('رقم القطعة والاسم والكمية مطلوبة');
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
        showSuccess('تم التعديل بنجاح ✓');
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
        showSuccess('تمت الإضافة بنجاح ✓');
      }
      closeModal();
      await fetchProducts();
    } catch (e: any) {
      setFormError(e?.message ?? 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) { await fetchProducts(); showSuccess('تم الحذف بنجاح'); }
  };

  // ─── EXPORT ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = [
      ['رقم القطعة', 'الاسم', 'الماركة', 'الموديل', 'الكمية', 'السعر', 'الحالة'],
      ...filtered.map(p => [
        p.part_number, p.part_name, p.brand, p.model,
        p.quantity, p.price,
        getStatus(p.quantity) === 'in_stock' ? 'متوفر'
          : getStatus(p.quantity) === 'low_stock' ? 'منخفض' : 'نفد',
      ]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── IMPORT ───────────────────────────────────────────────────────────────
  const handleImportClick = () => {
    importRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = '';

    setImporting(true);
    setError(null);

    try {
      const text = await file.text();

      // Remove BOM if present
      const clean = text.replace(/^\uFEFF/, '');
      const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        setError('الملف فارغ أو لا يحتوي على بيانات');
        setImporting(false);
        return;
      }

      // Skip header row (index 0), parse from index 1
      const rows = lines.slice(1);
      const toInsert: Omit<Product, 'id'>[] = [];
      const skipped: number[] = [];

      rows.forEach((line, idx) => {
        const cols = line.split(',');
        const part_number = cols[0]?.trim();
        const part_name   = cols[1]?.trim();
        const brand       = cols[2]?.trim() ?? '';
        const model       = cols[3]?.trim() ?? '';
        const quantity    = Number(cols[4]?.trim());
        const price       = Number(cols[5]?.trim());

        if (!part_number || !part_name || isNaN(quantity)) {
          skipped.push(idx + 2); // +2: 1 for header, 1 for 1-based
          return;
        }

        toInsert.push({
          part_number,
          part_name,
          brand,
          model,
          quantity: isNaN(quantity) ? 0 : quantity,
          price:    isNaN(price)    ? 0 : price,
          shop_id:  ownedShopId!,
        });
      });

      if (toInsert.length === 0) {
        setError('لم يتم العثور على صفوف صالحة للاستيراد. تأكد من تنسيق الملف.');
        setImporting(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('products')
        .insert(toInsert);

      if (insertError) throw insertError;

      await fetchProducts();

      const msg = skipped.length > 0
        ? `تم استيراد ${toInsert.length} قطعة بنجاح ✓ (تم تخطي ${skipped.length} صف غير صالح)`
        : `تم استيراد ${toInsert.length} قطعة بنجاح ✓`;

      showSuccess(msg);
    } catch (e: any) {
      setError(e?.message ?? 'حدث خطأ أثناء الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const statusBadge = (qty: number) => {
    const s = getStatus(qty);
    if (s === 'in_stock')
      return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />متوفر</span>;
    if (s === 'low_stock')
      return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />منخفض</span>;
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />نفد</span>;
  };

  const qtyColor = (qty: number) => {
    const s = getStatus(qty);
    if (s === 'in_stock')  return 'text-emerald-400 font-semibold';
    if (s === 'low_stock') return 'text-amber-400 font-semibold';
    return 'text-red-400 font-semibold';
  };

  return (
    <div className="p-4 lg:p-6 min-h-screen" dir="rtl">

      {/* SUCCESS TOAST */}
      {successMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg">
          {successMsg}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
            <RefreshCw
              size={18}
              className={`text-emerald-400 cursor-pointer ${loading ? 'animate-spin' : ''}`}
              onClick={fetchProducts}
            />
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg">مخزون محلي</h1>
            <p className="text-slate-500 text-xs">
              {loading ? 'جاري التحميل...' : `${products.length} قطعة — قيمة إجمالية: ${totalValue.toLocaleString()} ر.س`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ابحث في مخزونك..."
              className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm rounded-lg py-2 pr-9 pl-4 w-44 focus:outline-none focus:border-emerald-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>

          {/* ─── زر الاستيراد ─── */}
          <input
            ref={importRef}
            type="file"
            accept=".csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload size={14} />
            {importing ? 'جاري الاستيراد...' : 'استيراد'}
          </button>

          {/* ─── زر التصدير ─── */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 text-sm px-3 py-2 rounded-lg transition-colors"
          >
            <Download size={14} />
            تصدير
          </button>

          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus size={14} />
            إضافة قطعة
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 mb-5 text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={fetchProducts} className="mr-auto underline text-xs">إعادة المحاولة</button>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {([
          { key: 'all',          label: 'الكل'    },
          { key: 'in_stock',     label: 'متوفر'   },
          { key: 'low_stock',    label: 'منخفض'   },
          { key: 'out_of_stock', label: 'نفد'     },
        ] as { key: FilterStatus; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              filter === f.key
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:text-white'
            }`}
          >
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              filter === f.key ? 'bg-white/20' : 'bg-slate-700'
            }`}>
              {counts[f.key]}
            </span>
          </button>
        ))}
        {search && (
          <span className="text-slate-500 text-xs mr-auto">
            {filtered.length} نتيجة لـ "{search}"
          </span>
        )}
      </div>

      {/* TABLE */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selected.size === pageItems.length && pageItems.length > 0}
                    onChange={toggleAll}
                    className="accent-emerald-500"
                  />
                </th>
                <th className="p-3 text-right text-slate-400 font-medium text-xs">رقم القطعة</th>
                <th className="p-3 text-right text-slate-400 font-medium text-xs">اسم القطعة</th>
                <th className="p-3 text-right text-slate-400 font-medium text-xs">الماركة / الموديل</th>
                <th className="p-3 text-right text-slate-400 font-medium text-xs">الكمية</th>
                <th className="p-3 text-right text-slate-400 font-medium text-xs">السعر</th>
                <th className="p-3 text-right text-slate-400 font-medium text-xs">الحالة</th>
                <th className="p-3 text-center text-slate-400 font-medium text-xs">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-emerald-500" />
                    جاري تحميل البيانات...
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <Package size={40} className="mx-auto mb-3 opacity-20" />
                    لا توجد قطع في مخزونك
                  </td>
                </tr>
              ) : pageItems.map(p => (
                <tr
                  key={p.id}
                  className={`border-b border-slate-700/30 hover:bg-slate-800/40 transition-colors ${
                    selected.has(p.id) ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="accent-emerald-500"
                    />
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs text-slate-400">{p.part_number}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-white font-medium">{p.part_name}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-slate-400 text-xs">{p.brand} · {p.model}</span>
                  </td>
                  <td className="p-3">
                    <span className={qtyColor(p.quantity)}>{p.quantity}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-white font-medium">{p.price.toLocaleString()} ر.س</span>
                  </td>
                  <td className="p-3">{statusBadge(p.quantity)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEdit(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500 hover:text-emerald-400 transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-red-500 hover:text-red-400 transition-colors"
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

        {/* PAGINATION */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 text-xs text-slate-500">
            <span>
              عرض {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, filtered.length)} من {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={13} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg border text-xs transition-colors ${
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
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" dir="rtl">

            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-white font-semibold text-base">
                {editItem ? 'تعديل القطعة' : 'إضافة قطعة جديدة'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">رقم القطعة *</label>
                  <input
                    value={form.part_number}
                    onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))}
                    placeholder="OF-001"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">اسم القطعة *</label>
                  <input
                    value={form.part_name}
                    onChange={e => setForm(f => ({ ...f, part_name: e.target.value }))}
                    placeholder="فلتر زيت"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">الماركة</label>
                  <input
                    value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="Isuzu"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">الموديل</label>
                  <input
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="NQR"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">الكمية *</label>
                  <input
                    type="number" min="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1.5">السعر (ريال)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                <Save size={14} />
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
        </div>
        </div>
      )}
    </div>
  );
}