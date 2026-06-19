import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { 
  Users, 
  UserCheck, 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Mail, 
  Phone, 
  Store, 
  ShieldCheck,
  MoreHorizontal,
  UserX,
  Smartphone
} from 'lucide-react';

// تعريف أنواع البيانات بدقة
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  is_active: boolean;
  is_admin: boolean;
  store_id: number | null;
  shops: {
    shop_name: string;
  } | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // حساب الإحصائيات
  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    admins: users.filter(u => u.is_admin).length,
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // جلب المستخدمين مع ربط جدول المحلات لجلب اسم المحل
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          shops:store_id (
            shop_name
          )
        `)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  // منطق البحث
  const filteredUsers = users.filter(user => {
    const search = searchTerm.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search) ||
      user.phone?.includes(search)
    );
  });

  return (
    <div className="p-1 space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Users className="text-blue-500" size={28} />
            إدارة المستخدمين
          </h1>
          <p className="text-slate-400 text-sm mt-1">التحكم في حسابات الموظفين ومدراء المحلات وصلاحياتهم</p>
        </div>
        <button 
          onClick={fetchUsers}
          className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-2xl transition-all border border-slate-700 shadow-lg"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          تحديث البيانات
        </button>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800/50 p-6 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <Users className="absolute -left-4 -bottom-4 w-24 h-24 text-blue-500/5 group-hover:scale-110 transition-transform" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">إجمالي الحسابات</p>
          <div className="text-4xl font-black text-white mt-2">{stats.total}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800/50 p-6 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <UserCheck className="absolute -left-4 -bottom-4 w-24 h-24 text-emerald-500/5 group-hover:scale-110 transition-transform" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest text-emerald-500/50">نشط الآن</p>
          <div className="text-4xl font-black text-emerald-500 mt-2">{stats.active}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800/50 p-6 rounded-[2rem] shadow-xl relative overflow-hidden group">
          <ShieldAlert className="absolute -left-4 -bottom-4 w-24 h-24 text-purple-500/5 group-hover:scale-110 transition-transform" />
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest text-purple-500/50">المدراء (Admins)</p>
          <div className="text-4xl font-black text-purple-500 mt-2">{stats.admins}</div>
        </div>
      </div>

      {/* SEARCH & TABLE SECTION */}
      <div className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-sm">
        
        {/* Search Box */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input 
              type="text" 
              placeholder="ابحث بالاسم، البريد الإلكتروني، أو رقم الهاتف..."
              className="w-full bg-slate-950 border border-slate-700/50 rounded-2xl py-4 pr-12 pl-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-950/50 text-slate-500 text-[11px] font-black uppercase tracking-tighter border-b border-slate-800">
                <th className="px-6 py-5">المستخدم</th>
                <th className="px-6 py-5">معلومات الاتصال</th>
                <th className="px-6 py-5">المحل المرتبط</th>
                <th className="px-6 py-5">الدور</th>
                <th className="px-6 py-5 text-center">نوع الحساب</th>
                <th className="px-6 py-5 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-slate-500 font-medium text-sm">جاري جلب سجلات المستخدمين...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-40">
                      <UserX size={48} className="text-slate-500 mb-2" />
                      <span className="text-slate-400 font-medium">لا توجد بيانات مستخدمين تتوافق مع بحثك</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/20 transition-all group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${
                          user.is_active ? 'bg-blue-600/10 text-blue-500' : 'bg-slate-800 text-slate-600'
                        }`}>
                          {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-bold text-base">{user.full_name || 'بدون اسم'}</p>
                          <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                            <ShieldCheck size={12} className={user.is_admin ? 'text-purple-400' : 'text-slate-600'} />
                            ID: {user.id.substring(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-300 text-xs font-medium">
                          <Mail size={14} className="text-slate-500" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                          <Smartphone size={14} />
                          {user.phone || 'غير مسجل'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="inline-flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700/50">
                        <Store size={14} className="text-slate-500" />
                        <span className="text-slate-300 text-xs font-bold">
                          {user.shops?.shop_name || 'غير مرتبط بمحل'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-slate-400 text-xs font-medium capitalize">
                        {user.role || 'موظف'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      {user.is_admin ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black tracking-widest bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          ADMIN
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-bold tracking-widest">USER</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[11px] font-black tracking-tight border ${
                        user.is_active 
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                        {user.is_active ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-950/30 border-t border-slate-800 text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest">
          مجموع السجلات المعروضة: {filteredUsers.length} من أصل {users.length}
        </div>
      </div>
    </div>
  );
}