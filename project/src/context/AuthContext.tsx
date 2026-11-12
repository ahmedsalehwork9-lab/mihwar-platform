import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import { supabase } from "../pages/lib/supabase";

import {
  Session,
  User,
} from "@supabase/supabase-js";

export type Branch = { id: number; name: string };

type AuthType = {
  user: User | null;
  session: Session | null;
  ownedShopId: number | null;          // = الفرع النشط حاليًا
  branches: Branch[];                  // كل الفروع التي يصل إليها المستخدم
  setActiveBranchId: (id: number) => void;
  role: string | null;
  isAdmin: boolean;
  permissions: string[] | null; // null = وصول كامل لكل الصفحات؛ قائمة = الصفحات المسموحة فقط
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthType | null>(null);
const ACTIVE_KEY = "mihwar_active_branch";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ownedShopId, setOwnedShopId] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          loadAll(session.user.id);
        } else {
          setOwnedShopId(null);
          setBranches([]);
          setRole(null);
          setIsAdmin(false);
          setPermissions(null);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const getInitialSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await loadAll(session.user.id);
      }
    } catch (err) {
      console.error("SESSION ERROR", err);
    } finally {
      setLoading(false);
    }
  };

  // يختار الفرع النشط من القائمة: المحفوظ سابقًا إن وُجد، وإلا أول فرع
  const applyActive = (list: Branch[]) => {
    const ids = list.map((b) => b.id);
    let saved: number | null = null;
    try { const s = localStorage.getItem(ACTIVE_KEY); if (s) saved = Number(s); } catch (e) {}
    const pick = saved && ids.includes(saved) ? saved : (ids[0] ?? null);
    setOwnedShopId(pick);
  };

  const setActiveBranchId = (id: number) => {
    setOwnedShopId(id);
    try { localStorage.setItem(ACTIVE_KEY, String(id)); } catch (e) {}
  };

  const loadAll = async (userId: string) => {
    try {
      // 1) الملف الشخصي (الدور + أدمن + الصلاحيات + الفرع الثابت)
      const { data: prof } = await supabase
        .from("profiles")
        .select("role, is_admin, page_permissions, store_id")
        .eq("id", userId)
        .single();

      const admin = (prof as any)?.is_admin === true;
      setRole((prof as any)?.role || null);
      setIsAdmin(admin);
      const perms = (prof as any)?.page_permissions;
      setPermissions(Array.isArray(perms) && perms.length > 0 ? perms : null);

      // 2) قائمة الفروع
      let list: Branch[] = [];
      if (admin) {
        // الأدمن يصل لكل الفروع
        const { data } = await supabase.from("shops").select("id, shop_name").order("id");
        list = (data || []).map((s: any) => ({ id: Number(s.id), name: s.shop_name || ("فرع " + s.id) }));
      } else {
        // الفروع التي المستخدم مالكها (owner_id)
        const { data: owned } = await supabase.from("shops").select("id, shop_name").eq("owner_id", userId).order("id");
        list = (owned || []).map((s: any) => ({ id: Number(s.id), name: s.shop_name || ("فرع " + s.id) }));
        // + فرعه الثابت من ملفه الشخصي (لو مش ضمن القائمة)
        const storeId = (prof as any)?.store_id;
        if (storeId && !list.some((b) => b.id === Number(storeId))) {
          const { data: sb } = await supabase.from("shops").select("id, shop_name").eq("id", storeId).maybeSingle();
          if (sb) list.push({ id: Number((sb as any).id), name: (sb as any).shop_name || ("فرع " + (sb as any).id) });
        }
      }

      setBranches(list);
      applyActive(list);
    } catch (err) {
      console.error("LOAD AUTH FAILED", err);
      setBranches([]);
      setOwnedShopId(null);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setOwnedShopId(null);
      setBranches([]);
      setRole(null);
      setIsAdmin(false);
      setPermissions(null);
      window.location.reload();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        ownedShopId,
        branches,
        setActiveBranchId,
        role,
        isAdmin,
        permissions,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
