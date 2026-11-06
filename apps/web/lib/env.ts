/** Public (browser-safe) env. Next inlines NEXT_PUBLIC_* at build time, so access them literally. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  gameServerUrl: process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000",
  mapStyleUrl:
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty",
} as const;

export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
