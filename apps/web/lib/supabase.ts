"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "./env";

let client: SupabaseClient | null = null;

/** Browser singleton. Session (anonymous auth) persists in localStorage. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  client ??= createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "hideseek-auth" },
  });
  return client;
}

/** Returns a session, signing in anonymously on first use. */
export async function ensureSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.session) throw new Error(error?.message ?? "AUTH_FAILED");
  return signedIn.session;
}
