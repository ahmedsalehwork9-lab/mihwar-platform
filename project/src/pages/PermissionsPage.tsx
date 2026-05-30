import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Shield,
  User,
  Store,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";

type Profile = {
  id: string;
  email: string | null;
  role: string | null;
  store_id: number | null;
  is_active: boolean;
  is_admin: boolean;
  full_name: string | null;
};

type Shop = {
  id: number;
  shop_name: string;
};

export default function PermissionsPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const { data: usersData } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: shopsData } = await supabase
      .from("shops")
      .select("id, shop_name")
      .order("shop_name");

    setUsers(usersData || []);
    setShops(shopsData || []);

    setLoading(false);
  }

  async function toggleAdmin(user: Profile) {
    await supabase
      .from("profiles")
      .update({
        is_admin: !user.is_admin,
      })
      .eq("id", user.id);

    loadData();
  }

  async function toggleActive(user: Profile) {
    await supabase
      .from("profiles")
      .update({
        is_active: !user.is_active,
      })
      .eq("id", user.id);

    loadData();
  }

  async function changeRole(userId: string, role: string) {
    await supabase
      .from("profiles")
      .update({
        role,
      })
      .eq("id", userId);

    loadData();
  }

  async function changeShop(userId: string, storeId: string) {
    await supabase
      .from("profiles")
      .update({
        store_id: storeId ? Number(storeId) : null,
      })
      .eq("id", userId);

    loadData();
  }

  const adminsCount = users.filter((u) => u.is_admin).length;
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-3xl font-bold">
            إدارة الصلاحيات
          </h1>

          <p className="text-slate-400 mt-2">
            التحكم الكامل بالمستخدمين والصلاحيات والمحلات
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-xl text-white"
        >
          <RefreshCw size={16} />
          تحديث البيانات
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <div className="text-slate-400">
            إجمالي المستخدمين
          </div>

          <div className="text-4xl font-bold text-white mt-2">
            {users.length}
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <div className="text-slate-400">
            المديرون
          </div>

          <div className="text-4xl font-bold text-purple-400 mt-2">
            {adminsCount}
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <div className="text-slate-400">
            الحسابات النشطة
          </div>

          <div className="text-4xl font-bold text-emerald-400 mt-2">
            {activeCount}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="p-4">المستخدم</th>
                <th className="p-4">البريد</th>
                <th className="p-4">الدور</th>
                <th className="p-4">المحل</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">Admin</th>
                <th className="p-4">الإجراءات</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-slate-800"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600/20 p-2 rounded-xl">
                        <User size={18} />
                      </div>

                      <div>
                        <div className="text-white font-semibold">
                          {user.full_name || "بدون اسم"}
                        </div>

                        <div className="text-xs text-slate-500">
                          {user.id.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-4 text-slate-300">
                    {user.email}
                  </td>

                  <td className="p-4">
                    <select
                      value={user.role || ""}
                      onChange={(e) =>
                        changeRole(user.id, e.target.value)
                      }
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="admin">
                        admin
                      </option>

                      <option value="shop_owner">
                        shop_owner
                      </option>

                      <option value="employee">
                        employee
                      </option>
                    </select>
                  </td>

                  <td className="p-4">
                    <select
                      value={user.store_id || ""}
                      onChange={(e) =>
                        changeShop(user.id, e.target.value)
                      }
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">
                        بدون محل
                      </option>

                      {shops.map((shop) => (
                        <option
                          key={shop.id}
                          value={shop.id}
                        >
                          {shop.shop_name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="p-4">
                    {user.is_active ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle size={16} />
                        نشط
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <XCircle size={16} />
                        معطل
                      </span>
                    )}
                  </td>

                  <td className="p-4">
                    {user.is_admin ? (
                      <span className="text-purple-400 flex items-center gap-1">
                        <Shield size={16} />
                        نعم
                      </span>
                    ) : (
                      "لا"
                    )}
                  </td>

                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          toggleAdmin(user)
                        }
                        className="bg-purple-600 px-3 py-2 rounded-lg text-white text-sm"
                      >
                        Admin
                      </button>

                      <button
                        onClick={() =>
                          toggleActive(user)
                        }
                        className="bg-emerald-600 px-3 py-2 rounded-lg text-white text-sm"
                      >
                        حالة
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="p-10 text-center text-slate-400">
              جاري التحميل...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}