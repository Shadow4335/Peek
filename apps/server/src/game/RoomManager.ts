import type { RoomRow } from "@hideseek/shared";
import { errorMessage, type Logger } from "../log";
import type { GameStore } from "../store/types";
import type { GameServer } from "../types";
import type { RuntimeConfig } from "./config";
import { RoomRuntime } from "./RoomRuntime";

const isLive = (room: RoomRow) => room.status === "HEAD_START" || room.status === "ACTIVE";

/**
 * Owns one RoomRuntime per live room. A periodic sweep reconciles with Postgres so
 * the server recovers after restarts and notices transitions made outside sockets.
 * Assumes a single server instance (Render web service with 1 instance).
 */
export class RoomManager {
  private readonly runtimes = new Map<string, RoomRuntime>();
  private readonly creating = new Map<string, Promise<RoomRuntime>>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly deps: { io: GameServer; store: GameStore; config: RuntimeConfig; log: Logger },
  ) {}

  get(roomId: string): RoomRuntime | undefined {
    const rt = this.runtimes.get(roomId);
    return rt && !rt.isDisposed ? rt : undefined;
  }

  get size() {
    return this.runtimes.size;
  }

  /** Returns the runtime for a live room (creating it if needed), else null. */
  async ensure(room: RoomRow): Promise<RoomRuntime | null> {
    const existing = this.get(room.id);
    if (existing) {
      await existing.resync(room);
      return existing.isDisposed ? null : existing;
    }
    if (!isLive(room)) return null;

    let pending = this.creating.get(room.id);
    if (!pending) {
      pending = RoomRuntime.create(
        {
          ...this.deps,
          onDisposed: (id) => {
            this.runtimes.delete(id);
          },
        },
        room,
      );
      this.creating.set(room.id, pending);
    }
    try {
      const rt = await pending;
      if (!rt.isDisposed) this.runtimes.set(room.id, rt);
      return rt.isDisposed ? null : rt;
    } finally {
      this.creating.delete(room.id);
    }
  }

  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const live = await this.deps.store.listLiveRooms();
      const liveIds = new Set(live.map((r) => r.id));
      await Promise.all(live.map((room) => this.ensure(room)));
      // Runtimes whose room left HEAD_START/ACTIVE in the DB (e.g. ended by a direct RPC).
      for (const [id, rt] of this.runtimes) {
        if (liveIds.has(id)) continue;
        const row = await this.deps.store.getRoom(id);
        if (row) await rt.resync(row);
        else rt.dispose();
      }
    } catch (err) {
      this.deps.log.error("sweep failed", { err: errorMessage(err) });
    } finally {
      this.sweeping = false;
    }
  }

  async start(intervalMs: number) {
    await this.sweep();
    this.sweepTimer = setInterval(() => void this.sweep(), intervalMs);
  }

  stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const rt of [...this.runtimes.values()]) rt.dispose();
    this.runtimes.clear();
  }
}
