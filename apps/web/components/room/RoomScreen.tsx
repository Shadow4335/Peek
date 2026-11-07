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
          <p className="text-center text-neutral-300">You left the room.</p>
        )}
        <Link href="/" className="text-center text-sm text-hider underline underline-offset-4">
          Back to start
        </Link>
      </div>
    );
  }

  if (r.phase === "loading" || !r.room) {
    return (
      <div className="grid flex-1 place-items-center text-neutral-500">
        <Loader2 className="size-6 animate-spin" aria-label="Loading room" />
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
