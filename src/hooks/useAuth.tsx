import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  role: "user" | "admin" | "super_admin" | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ session: null, user: null, role: null, isAdmin: false, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<"user" | "admin" | "super_admin" | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const resolveRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      console.error("Unable to resolve user role", error);
      setRole("user");
      setIsAdmin(false);
      return;
    }
    const roles = (data ?? []).map((row) => row.role);
    const nextRole = roles.includes("super_admin") ? "super_admin" : roles.includes("admin") ? "admin" : "user";
    setRole(nextRole);
    setIsAdmin(nextRole === "admin" || nextRole === "super_admin");
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer role lookup to avoid deadlocks inside the auth callback
        setLoading(true);
        setTimeout(() => {
          resolveRole(s.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRole(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        await resolveRole(s.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [resolveRole]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setIsAdmin(false);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, role, isAdmin, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
