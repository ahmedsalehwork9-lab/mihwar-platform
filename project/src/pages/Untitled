import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Store, 
  CheckCircle, 
  XCircle, 
  Phone, 
  MapPin, 
  Activity,
  RefreshCw,
  Search,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  AlertCircle,
  Filter,
  MoreVertical,
  Edit2,
  Key,
  Eye,
  User,
  ExternalLink,
  X,
  Save,
  CheckSquare,
  CalendarDays,
  Clock
} from 'lucide-react';

// المطلوب 1: تعديل Interface Shop مع دعم Null Safety
interface Shop {
  id: number;
  shop_name: string;
  phone: string | null;
  city: string | null;
  is_active: boolean;
  subscription_status?: string;
  created_at: string;
  total_quantity?: number;
  products_count?: number;
  outgoing_orders: { count: number }[];
  incoming_orders: { count: number }[];
}

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  // ── NEW STATES ──────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    shop_name: '',
    city: '',
    phone: '',
    is_active: true,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);
  const [now, setNow] = useState(new Date());
  // ────────────────────────────────────────────────────────────

  // المطلوب 2: إصلاح عداد المحلات التجريبية بناءً على البيانات الفعلية
  const stats = {
    total: shops.length,
    active: shops.filter(s => s.is_active).length,
    inactive: shops.filter(s => !s.is_active).length,
    trial: shops.filter(s => s.subscription_status === 'trial').length
  };

  useEffect(() => {
    fetchShops();
  }, []);

  // تحديث الوقت كل دقيقة
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchShops = async () => {
    try {
      setLoading(true);

      // 1) جلب المحلات الأساسية
      const { data: shopsData, error: shopsError } = await supabase
        .from('shops')
        .select('*')
        .order('created_at', { ascending: false });

      if (shopsError) throw shopsError;
      if (!shopsData || shopsData.length === 0) {
        setShops([]);
        return;
      }

      const shopIds = shopsData.map((s: any) => s.id);

      // 2) SELECT shop_id, SUM(quantity) as total_quantity, COUNT(*) as products_count
      //    FROM products GROUP BY shop_id
      const { data: productsData } = await supabase
        .from('products')
        .select('shop_id, quantity')
        .in('shop_id', shopIds);

      // 3) بناء Map: shop_id => { total_quantity, products_count }
      const productsSummary: Record<number, { total_quantity: number; products_count: number }> = {};
      for (const row of (productsData || [])) {
        if (row.shop_id != null) {
          if (!productsSummary[row.shop_id]) {
            productsSummary[row.shop_id] = { total_quantity: 0, products_count: 0 };
          }
          productsSummary[row.shop_id].total_quantity += Number(row.quantity || 0);
          productsSummary[row.shop_id].products_count += 1;
        }
      }

      // 4) جلب الطلبات الصادرة والواردة
      const { data: outgoingData } = await supabase
        .from('orders')
        .select('from_shop_id')
        .in('from_shop_id', shopIds);

      const { data: incomingData } = await supabase
        .from('orders')
        .select('to_shop_id')
        .in('to_shop_id', shopIds);

      // 5) دمج البيانات — كل محل يحمل total_quantity و products_count
      const merged = shopsData.map((shop: any) => ({
        ...shop,
        total_quantity: productsSummary[shop.id]?.total_quantity ?? 0,
        products_count: productsSummary[shop.id]?.products_count ?? 0,
        outgoing_orders: [{ count: (outgoingData || []).filter((o: any) => o.from_shop_id === shop.id).length }],
        incoming_orders: [{ count: (incomingData || []).filter((o: any) => o.to_shop_id === shop.id).length }],
      }));

      setShops(merged);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (shop: Shop) => {
    const confirmMsg = shop.is_active 
      ? `هل تريد فعلاً إيقاف محل "${shop.shop_name}"؟ سيؤدي ذلك لمنعه من تنفيذ الطلبات.`
      : `هل تريد تفعيل محل "${shop.shop_name}"؟`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('shops')
        .update({ is_active: !shop.is_active })
        .eq('id', shop.id);

      if (error) throw error;
      setShops(shops.map(s => s.id === shop.id ? { ...s, is_active: !s.is_active } : s));
    } catch (err) {
      alert('فشل في تحديث الحالة');
    }
  };

  // ── NEW: open edit modal and pre-fill form ──────────────────
  const openEditModal = (shop: Shop) => {
    setSelectedShop(shop);
    setEditForm({
      shop_name: shop.shop_name || '',
      city: shop.city || '',
      phone: shop.phone || '',
      is_active: shop.is_active,
    });
    setEditSuccess(false);
    setEditModalOpen(true);
  };

  // ── NEW: save edits to Supabase ─────────────────────────────
  const saveEdit = async () => {
    if (!selectedShop) return;
    try {
      setEditLoading(true);
      const { error } = await supabase
        .from('shops')
        .update({
          shop_name: editForm.shop_name,
          city: editForm.city,
          phone: editForm.phone,
          is_active: editForm.is_active,
        })
        .eq('id', selectedShop.id);

      if (error) throw error;

      await fetchShops();
      setEditSuccess(true);

      // auto-close after brief success flash
      setTimeout(() => {
        setEditModalOpen(false);
        setEditSuccess(false);
      }, 1200);
    } catch (err) {
      alert('فشل في حفظ التعديلات');
    } finally {
      setEditLoading(false);
    }
  };
  // ────────────────────────────────────────────────────────────

  // المطلوب 3 + 4 + 5: إصلاح منطق الفلترة والبحث مع Null Safety
  const filteredShops = shops.filter((shop) => {
    // معالجة البحث مع حماية ضد Null
    const matchesSearch =
      (shop.shop_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shop.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shop.phone || '').includes(searchTerm);

    // معالجة التبويبات
    const matchesTab =
      activeTab === "all"
        ? true
        : activeTab === "active"
        ? shop.is_active
        : activeTab === "inactive"
        ? !shop.is_active
        : shop.subscription_status === "trial";

    return matchesSearch && matchesTab;
  });

  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8 text-right" dir="rtl">
      
      {/* SECTION 1: HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
            إدارة المحلات
            <span className="text-sm font-medium bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full border border-blue-500/20">
              {stats.total} محل
            </span>
          </h1>
          <p className="text-slate-400 mt-2 text-lg">إدارة جميع المحلات والعملاء داخل المنصة والتحكم في صلاحياتهم.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          {/* زر تحديث */}
          <button 
            onClick={fetchShops}
            className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* بطاقة التاريخ والوقت */}
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800/60 rounded-2xl px-5 py-3 shadow-xl">
            {/* التاريخ */}
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-400 shrink-0" />
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mb-0.5">
                  {now.toLocaleDateString('ar-SA', { weekday: 'long' })}
                </p>
                <p className="text-white font-black text-sm leading-none">
                  {now.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </p>
              </div>
            </div>

            {/* فاصل */}
            <div className="w-px h-8 bg-slate-700" />

            {/* الوقت */}
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-400 shrink-0" />
              <p className="text-white font-black text-sm tabular-nums">
                {now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'إجمالي المحلات', value: stats.total, icon: Store, color: 'text-blue-500', bg: 'bg-blue-500/5' },
          { label: 'المحلات النشطة', value: stats.active, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
          { label: 'المحلات الموقوفة', value: stats.inactive, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/5' },
          { label: 'المحلات التجريبية', value: stats.trial, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/5' }
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800/60 p-6 rounded-3xl hover:border-slate-700 transition-all group hover:scale-[1.02] duration-300 shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 ${card.bg} rounded-2xl`}>
                <card.icon className={card.color} size={24} />
              </div>
              <span className="text-slate-500 text-xs font-black uppercase tracking-widest">Global Stat</span>
            </div>
            <p className="text-slate-400 font-medium">{card.label}</p>
            <h3 className="text-3xl font-black text-white mt-1">{card.value}</h3>
          </div>
        ))}
      </div>

      {/* SECTION 3: FILTERS & SEARCH */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-4 lg:p-6 mb-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-full lg:w-auto overflow-x-auto">
            {['all', 'active', 'inactive', 'trial'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === tab ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'all' ? 'جميع المحلات' : tab === 'active' ? 'نشط' : tab === 'inactive' ? 'موقوف' : 'تجريبي'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 w-full lg:w-1/2">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input 
                type="text" 
                placeholder="البحث باسم المحل أو المدينة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 pr-12 pl-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-white">
              <Filter size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: TABLE */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-950/50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6">المحل والمعلومات</th>
                <th className="px-8 py-6">الموقع</th>
                <th className="px-8 py-6">المالك</th>
                <th className="px-8 py-6 text-center">المخزون</th>
                <th className="px-8 py-6 text-center">الحالة</th>
                <th className="px-8 py-6 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 font-bold">جاري تحميل البيانات...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredShops.map((shop) => (
                <tr key={shop.id} className="group hover:bg-slate-800/30 transition-all duration-300">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner transition-transform group-hover:scale-110 ${
                        shop.is_active ? 'bg-blue-600/10 text-blue-500' : 'bg-slate-800 text-slate-600'
                      }`}>
                        {(shop.shop_name || 'M').charAt(0)}
                      </div>
                      <div>
                        <p className="text-white font-black text-lg group-hover:text-blue-400 transition-colors">{shop.shop_name}</p>
                        <p className="text-slate-500 text-sm font-medium mt-1">{shop.phone || '---'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-slate-300 font-bold bg-slate-950/50 w-fit px-3 py-1.5 rounded-xl border border-slate-800/50">
                      <MapPin size={14} className="text-slate-500" />
                      {shop.city || '---'}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                        <User size={14} className="text-slate-500" />
                      </div>
                      <p className="text-slate-400 text-sm font-medium">مدير المحل</p>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center font-black text-white">
                    <div className="flex flex-col items-center bg-slate-950/50 p-2 rounded-2xl border border-slate-800/50">
                      <span className="text-blue-500 text-lg">
                        {shop.total_quantity || 0}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        قطعة
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {shop.products_count || 0} صنف
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border transition-all ${
                      shop.is_active 
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/5' 
                      : 'bg-red-500/10 text-red-500 border-red-500/20 shadow-lg shadow-red-500/5'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${shop.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      {shop.is_active ? 'نشط' : 'موقف'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setSelectedShop(shop)}
                        className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition-all" title="عرض التفاصيل">
                        <Eye size={18} />
                      </button>

                      {/* ── FIXED EDIT BUTTON ── */}
                      <button
                        onClick={() => openEditModal(shop)}
                        className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-blue-400 hover:border-blue-500/50 transition-all"
                        title="تعديل"
                      >
                        <Edit2 size={18} />
                      </button>

                      <button 
                        onClick={() => toggleStatus(shop)}
                        className={`p-2.5 bg-slate-950 border border-slate-800 rounded-xl transition-all ${shop.is_active ? 'text-red-400 hover:bg-red-500/10 hover:border-red-500/50' : 'text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50'}`} 
                        title={shop.is_active ? 'إيقاف' : 'تفعيل'}
                      >
                        <Activity size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5: EDIT MODAL (NEW)
      ══════════════════════════════════════════════════════════ */}
      {editModalOpen && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setEditModalOpen(false)}
          />

          {/* modal card */}
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden">

            {/* top accent line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            {/* header */}
            <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Edit2 size={16} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg leading-none">تعديل المحل</h3>
                  <p className="text-slate-500 text-xs mt-0.5">{selectedShop.shop_name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* form body */}
            <div className="px-7 py-6 space-y-5">

              {/* shop name */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">اسم المحل</label>
                <input
                  type="text"
                  value={editForm.shop_name}
                  onChange={(e) => setEditForm({ ...editForm, shop_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="اسم المحل"
                />
              </div>

              {/* city */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">المدينة</label>
                <input
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="المدينة"
                />
              </div>

              {/* phone */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wide">رقم الجوال</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 h-12 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                  placeholder="05xxxxxxxx"
                />
              </div>

              {/* is_active toggle */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3">
                <span className="text-sm text-slate-300 font-bold">حالة المحل</span>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${
                    editForm.is_active ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${
                      editForm.is_active ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
                <span className={`text-xs font-bold ${editForm.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                  {editForm.is_active ? 'نشط' : 'موقوف'}
                </span>
              </div>

              {/* success banner */}
              {editSuccess && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3">
                  <CheckSquare size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 text-sm font-bold">تم تحديث بيانات المحل بنجاح</span>
                </div>
              )}
            </div>

            {/* footer buttons */}
            <div className="flex gap-3 px-7 pb-7">
              <button
                onClick={() => setEditModalOpen(false)}
                className="flex-1 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={saveEdit}
                disabled={editLoading || editSuccess}
                className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {editLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري الحفظ...
                  </>
                ) : editSuccess ? (
                  <>
                    <CheckCircle size={16} />
                    تم الحفظ
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    حفظ التعديلات
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: SHOP DETAILS DRAWER (Visual Component) */}
      {selectedShop && !editModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedShop(null)}
          />
          <div className="relative w-full max-w-lg bg-slate-900 border-r border-slate-800 h-full shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-8 h-full overflow-y-auto">
              <div className="flex justify-between items-center mb-10">
                <button onClick={() => setSelectedShop(null)} className="p-2 hover:bg-slate-800 rounded-xl transition-all">
                  <X size={24} className="text-slate-400" />
                </button>
                <h2 className="text-2xl font-black text-white">تفاصيل المحل</h2>
              </div>

              <div className="flex flex-col items-center mb-10 text-center">
                <div className="w-24 h-24 bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex items-center justify-center text-blue-500 text-4xl font-black mb-4">
                  {(selectedShop.shop_name || 'M').charAt(0)}
                </div>
                <h3 className="text-2xl font-black text-white">{selectedShop.shop_name}</h3>
                <p className="text-slate-500 mt-1">{selectedShop.phone || '---'}</p>
                <div className="mt-4 flex gap-2">
                  <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                    <Key size={14} /> إعادة تعيين كلمة المرور
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                {[
                  { label: 'المنتجات', val: selectedShop.total_quantity || 0, icon: Package, color: 'text-blue-500' },
                  { label: 'الطلبات الصادرة', val: selectedShop.outgoing_orders[0]?.count || 0, icon: ArrowUpRight, color: 'text-amber-500' },
                  { label: 'الطلبات الواردة', val: selectedShop.incoming_orders[0]?.count || 0, icon: ArrowDownLeft, color: 'text-indigo-500' },
                  { label: 'المستخدمين', val: 1, icon: User, color: 'text-emerald-500' }
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800/60 p-4 rounded-3xl">
                    <div className="flex items-center gap-3 mb-2">
                      <stat.icon size={16} className={stat.color} />
                      <span className="text-slate-500 text-xs font-bold">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-black text-white">{stat.val}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                <h4 className="text-white font-black text-lg border-b border-slate-800 pb-2">المعلومات الأساسية</h4>
                <div className="grid grid-cols-2 gap-y-6">
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">المدينة</p>
                    <p className="text-white font-bold">{selectedShop.city || '---'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">تاريخ الإنشاء</p>
                    <p className="text-white font-bold">{new Date(selectedShop.created_at).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">حالة النظام</p>
                    <span className="text-emerald-500 font-bold">متصل</span>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs font-bold uppercase mb-1">الاشتراك</p>
                    <span className="text-blue-500 font-bold underline cursor-pointer flex items-center gap-1">
                      {selectedShop.subscription_status === 'trial' ? 'فترة تجريبية' : 'خطة المؤسسات'} <ExternalLink size={12} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex gap-4">
                <button 
                   onClick={() => { toggleStatus(selectedShop); setSelectedShop(null); }}
                   className={`flex-1 py-4 rounded-2xl font-black transition-all ${
                  selectedShop.is_active 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white' 
                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                }`}>
                  {selectedShop.is_active ? 'إيقاف المحل' : 'تفعيل المحل'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
