import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Env } from "./env";

type RealtimeTransport = NonNullable<
  NonNullable<SupabaseClientOptions<"public">["realtime"]>["transport"]
>;

// Node < 22 has no global WebSocket; `ws` is runtime-compatible with Realtime.
const realtime = { transport: WebSocket as unknown as RealtimeTransport };
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Service-role client: bypasses RLS. Authoritative server use only. */
export function createAdminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth, realtime });
}

/** Anon-key client carrying the end user's JWT: RLS and auth.uid() apply. */
export function createUserClient(env: Env, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth,
    realtime,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
