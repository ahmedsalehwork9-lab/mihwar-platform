import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type ShopRow = {
  id: string;
  name: string;
  owner_id: string | null;
  phone: string;
};

type ProfileRow = {
  role: string;
};

export default function TestPage() {
  const { user, role, ownedShopId } = useAuth();
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const [shopsRes, profileRes, invRes] = await Promise.all([
        supabase.from('shops').select('id, name, owner_id, phone').order('name'),
        user
          ? supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('inventory').select('id', { count: 'exact', head: true }),
      ]);

      if (shopsRes.error) setError(shopsRes.error.message);
      else setShops(shopsRes.data);

      if (profileRes.error) setError(prev => prev ?? profileRes.error!.message);
      else setProfile(profileRes.data);

      if (invRes.error) setError(prev => prev ?? invRes.error!.message);
      else setInventoryCount(invRes.count ?? 0);

      setLoading(false);
    };

    void run();
  }, [user?.id]);

  return (
    <div className="max-w-3xl space-y-4 text-sm">
      <h1 className="text-white font-bold text-lg">RBAC test</h1>
      <p className="text-slate-400">
        Verifies what the logged-in user can read via Supabase RLS (same session as the rest of the app).
      </p>

      {loading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-2">
        <p className="text-slate-300">
          <span className="text-slate-500">User:</span> {user?.email ?? '—'}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-500">User ID:</span> {user?.id ?? '—'}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-500">Role (app):</span> {role ?? '—'}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-500">Role (DB profile):</span> {profile?.role ?? '—'}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-500">Owned shop ID (app):</span> {ownedShopId ?? '—'}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-500">Shops visible (RLS):</span> {shops?.length ?? 0}
        </p>
        <p className="text-slate-300">
          <span className="text-slate-500">Inventory rows visible (RLS):</span> {inventoryCount ?? '—'}
        </p>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-auto">
        <pre className="text-xs text-slate-300 whitespace-pre-wrap">
          {JSON.stringify(shops, null, 2)}
        </pre>
      </div>

      <p className="text-slate-500 text-xs">
        Expected: shop_owner sees 1 shop and only their inventory; admin sees all shops.
      </p>
    </div>
  );
}
