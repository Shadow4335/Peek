"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Lobby } from "@/components/lobby/Lobby";
import { MatchScreen } from "@/components/match/MatchScreen";
import { useGameSocket } from "@/lib/socket";
import { ErrorNotice } from "@/components/ui/Notice";
import { useRoom } from "@/lib/useRoom";

export function RoomScreen({ code }: { code: string }) {
  const r = useRoom(code);
  const { socket } = useGameSocket();

  if (r.phase === "error" || r.phase === "left") {
    return (
      <div className="pt-safe pb-safe mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5">
        {r.phase === "error" ? (
          <ErrorNotice>{r.error}</ErrorNotice>
        ) : (
          <p className="text-center font-display text-2xl text-ink">You left the room.</p>
        )}
        <Link href="/" className="mx-auto flex min-h-12 items-center rounded-button bg-surface-raised px-5 text-sm font-semibold text-ink ring-1 ring-line">
          Back to start
        </Link>
      </div>
    );
  }

  if (r.phase === "loading" || !r.room) {
    return (
      <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-2">
        <Loader2 className="size-6 animate-spin text-primary-text" aria-hidden />
        <span className="text-sm">Joining the room…</span>
      </div>
    );
  }

  if (r.room.status === "LOBBY") {
    return (
      <Lobby
        room={r.room}
        players={r.players}
        me={r.me}
        connected={r.connected}
        claim={r.claim}
        setReady={r.setReady}
        start={r.start}
        leave={r.leave}
        rename={r.rename}
      />
    );
  }

  return <MatchScreen room={r.room} me={r.me} players={r.players} socket={socket} refresh={r.refresh} onRematch={r.rematch} />;
}
