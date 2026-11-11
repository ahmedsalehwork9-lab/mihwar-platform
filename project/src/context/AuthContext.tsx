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

type AuthType = {
  user: User | null;
  session: Session | null;
  ownedShopId: number | null;
  role: string | null;
  isAdmin: boolean;
  permissions: string[] | null; // null = وصول كامل لكل الصفحات؛ قائمة = الصفحات المسموحة فقط
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ownedShopId, setOwnedShopId] = useState<number | null>(null);
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
          loadShop(session.user.id);
          loadProfile(session.user.id);
        } else {
          setOwnedShopId(null);
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
        await loadShop(session.user.id);
        await loadProfile(session.user.id);
      }
    } catch (err) {
      console.error("SESSION ERROR", err);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, is_admin, page_permissions")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("PROFILE ERROR", error);
        return;
      }

      setRole(data?.role || null);
      setIsAdmin(data?.is_admin === true);

      const perms = (data as any)?.page_permissions;
      setPermissions(Array.isArray(perms) && perms.length > 0 ? perms : null);
    } catch (err) {
      console.error("LOAD PROFILE FAILED", err);
    }
  };

  const loadShop = async (userId: string) => {
    try {
      // 1) مالك محل؟
      const { data: owned } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();

      if (owned?.id) { setOwnedShopId(Number(owned.id)); return; }

      // 2) عضو في فرع عبر store_id في ملفه الشخصي
      const { data: prof } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", userId)
        .maybeSingle();

      setOwnedShopId(prof?.store_id ? Number(prof.store_id) : null);
    } catch (err) {
      console.error("LOAD SHOP FAILED", err);
      setOwnedShopId(null);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setOwnedShopId(null);
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
