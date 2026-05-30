import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import { supabase } from "../lib/supabase";

import {
  Session,
  User,
} from "@supabase/supabase-js";

type AuthType = {
  user: User | null;
  session: Session | null;
  ownedShopId: number | null;
  role: string | null;
  isAdmin: boolean; // Full Access
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
        .select("role, is_admin")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("PROFILE ERROR", error);
        return;
      }

      setRole(data?.role || null);
      // Admin هو فقط من لديه is_admin = true في قاعدة البيانات
      setIsAdmin(data?.is_admin === true);
    } catch (err) {
      console.error("LOAD PROFILE FAILED", err);
    }
  };

  const loadShop = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();

      if (data?.id) {
        setOwnedShopId(Number(data.id));
      } else {
        setOwnedShopId(null);
      }
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