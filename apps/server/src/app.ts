import { createServer, type Server as HttpServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { defaultRuntimeConfig, type RuntimeConfig } from "./game/config";
import { RoomManager } from "./game/RoomManager";
import type { Logger } from "./log";
import { corsOrigin } from "./origins";
import { registerSocketHandlers } from "./sockets";
import type { GameStore } from "./store/types";
import type { GameServer } from "./types";

export interface AppOptions {
  store: GameStore;
  log: Logger;
  corsOrigins: string[];
  config?: Partial<RuntimeConfig>;
}

export interface GameApp {
  httpServer: HttpServer;
  io: GameServer;
  manager: RoomManager;
  close(): Promise<void>;
}

/** Wires Express + Socket.io + RoomManager. Pure factory so tests can run it on a random port. */
export function createGameApp({ store, log, corsOrigins, config }: AppOptions): GameApp {
  const app = express();
  app.disable("x-powered-by");
  const origin = corsOrigin(corsOrigins);
  app.use(cors({ origin }));

  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer, {
    cors: { origin },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // Brief mobile network drops: restore rooms + missed events without a full rejoin.
    connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  });

  const manager = new RoomManager({
    io,
    store,
    log,
    config: { ...defaultRuntimeConfig, ...config },
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, uptime_s: Math.round(process.uptime()), live_rooms: manager.size });
  });

  registerSocketHandlers(io, { store, manager, log });

  return {
    httpServer,
    io,
    manager,
    close: async () => {
      manager.stop();
      await io.close();
    },
  };
}
