import { createGameApp } from "./app";
import { loadEnv } from "./env";
import { createLogger, errorMessage } from "./log";
import { SupabaseGameStore } from "./store/supabaseStore";

const env = loadEnv();
const log = createLogger(env.NODE_ENV === "production" ? "info" : "debug", { svc: "hideseek-server" });
const store = new SupabaseGameStore(env);
const game = createGameApp({ store, log, corsOrigins: env.CORS_ORIGINS });

game.httpServer.listen(env.PORT, () => {
  log.info("listening", { port: env.PORT, env: env.NODE_ENV });
  game.manager
    .start(env.SWEEP_INTERVAL_MS)
    .catch((err) => log.error("room manager failed to start", { err: errorMessage(err) }));
});

const shutdown = (signal: string) => {
  log.info("shutting down", { signal });
  game
    .close()
    .catch((err) => log.error("shutdown error", { err: errorMessage(err) }))
    .finally(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => log.error("unhandledRejection", { err: errorMessage(err) }));
