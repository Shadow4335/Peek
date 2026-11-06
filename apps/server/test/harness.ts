import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import type { ClientToServerEvents, GeoFix, ServerToClientEvents } from "@hideseek/shared";
import { createGameApp, type GameApp } from "../src/app";
import type { RuntimeConfig } from "../src/game/config";
import { createLogger } from "../src/log";
import { FakeStore } from "./fakeStore";

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export const FAST: Partial<RuntimeConfig> = {
  preWarningMs: 150,
  endgameWindowMs: 0,
  freshFixTimeoutMs: 300,
  outOfBoundsGraceMs: 200,
  tagRequestConfirmMs: 400,
  heartbeatMinIntervalMs: 0,
  seekerLocationMinIntervalMs: 0,
  random: () => 0.5,
};

export async function startServer(config: Partial<RuntimeConfig> = FAST) {
  const store = new FakeStore();
  const app: GameApp = createGameApp({
    store,
    log: createLogger("error"),
    corsOrigins: ["*"],
    config,
  });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  const { port } = app.httpServer.address() as AddressInfo;
  const clients: Client[] = [];

  const client = async (token: string): Promise<Client> => {
    const c: Client = connect(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(c);
    await new Promise<void>((resolve, reject) => {
      c.once("connect", () => resolve());
      c.once("connect_error", reject);
    });
    return c;
  };

  const stop = async () => {
    clients.forEach((c) => c.disconnect());
    await app.close();
    await new Promise<void>((r) => app.httpServer.close(() => r()));
  };

  return { store, app, port, client, stop };
}

/** Resolves with the next payload of `event` matching `pred`. */
export function next<E extends keyof ServerToClientEvents>(
  c: Client,
  event: E,
  pred: (p: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      c.off(event, handler as never);
      reject(new Error(`timeout waiting for ${String(event)}`));
    }, timeoutMs);
    const handler = (p: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!pred(p)) return;
      clearTimeout(timer);
      c.off(event, handler as never);
      resolve(p);
    };
    c.on(event, handler as never);
  });
}

/** Records every payload of `event` for later assertions. */
export function record<E extends keyof ServerToClientEvents>(c: Client, event: E) {
  const seen: Array<Parameters<ServerToClientEvents[E]>[0]> = [];
  c.on(event, ((p: Parameters<ServerToClientEvents[E]>[0]) => seen.push(p)) as never);
  return seen;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function join(c: Client, roomId: string) {
  const res = await c.emitWithAck("room:join", { roomId });
  if (!res.ok) throw new Error(`join failed: ${res.error}`);
  return res;
}

export function heartbeat(c: Client, fix: GeoFix, at = Date.now()) {
  c.emit("hider:heartbeat", { ...fix, battery: 0.8, updated_at: new Date(at).toISOString() });
}

/** Makes a hider client answer FORCE_GPS_FLUSH with whatever `where()` returns. */
export function autoFlush(c: Client, where: () => GeoFix | null) {
  let count = 0;
  c.on("FORCE_GPS_FLUSH", ({ requestId }) => {
    count += 1;
    const fix = where();
    if (fix) c.emit("hider:fresh_fix", { ...fix, requestId, battery: 0.8, updated_at: new Date().toISOString() });
  });
  return { get count() { return count; } };
}
