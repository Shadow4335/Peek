"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "./env";
import { ensureSession, getSupabase } from "./supabase";

type SessionStatus = "loading" | "signed-out" | "ready" | "unconfigured";

interface SessionContextValue {
  session: Session | null;
  userId: string | null;
  status: SessionStatus;
  /** Signs in anonymously if needed. */
  ensure: () => Promise<Session>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>(isSupabaseConfigured ? "loading" : "unconfigured");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? "ready" : "signed-out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "ready" : "signed-out");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const ensure = useCallback(async () => {
    const s = await ensureSession();
    setSession(s);
    setStatus("ready");
    return s;
  }, []);

  const value = useMemo(
    () => ({ session, userId: session?.user.id ?? null, status, ensure }),
    [session, status, ensure],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
