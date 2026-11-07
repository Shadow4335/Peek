"use client";

import { Eye, ShieldAlert, UserX } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Banner } from "./HiderView";
import { Hud } from "./Hud";
import type { LiveMarker, PingDot } from "./MatchMap";
import { TagDrawer } from "./TagDrawer";
import { Toasts } from "./Toasts";
import { isEndgame, msUntil, visibleWave, type MatchViewProps } from "./types";

const MatchMap = dynamic(() => import("./MatchMap"), { ssr: false });

/**
 * Seeker radar (and the read-only spectator view for caught hiders / unassigned players):
 * the latest ping wave for 15 s after it arrives, live out-of-bounds hiders, tag drawer.
 */
export function SeekerView({ room, me, players, match, fix, now, spectator }: MatchViewProps & { spectator?: boolean }) {
  const nameOf = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);
  const hiders = players.filter((p) => p.role === "HIDER");
  const uncaught = hiders.filter((p) => !p.caught_at);
  const uncaughtIds = new Set(uncaught.map((h) => h.id));

  // Only the latest wave, and only for PING_VISIBLE_MS after it arrives.
  const shown = visibleWave(match, now);
  const pings: PingDot[] = (shown?.pings ?? [])
    .filter((p) => uncaughtIds.has(p.playerId))
    .map((p) => ({ ...p, label: nameOf.get(p.playerId) ?? "Hider", rank: 0, wave: shown!.waveNumber, capturedAt: p.heartbeatAt }));

  const oob = match.outOfBounds.filter((o) => uncaughtIds.has(o.playerId));
  const markers: LiveMarker[] = oob.map((o) => ({
    id: o.playerId,
    label: nameOf.get(o.playerId) ?? "Hider",
    note: "out of bounds",
    lat: o.location.lat,
    lng: o.location.lng,
    kind: "oob-hider",
  }));

  const caughtMe = me.role === "HIDER" && me.caught_at;
  const catcher = me.caught_by_player_id ? nameOf.get(me.caught_by_player_id) : null;

  return (
    <div className="relative flex-1 overflow-hidden">
      <MatchMap
        fence={room.geofence}
        buffered={room.geofence_buffered}
        myFix={fix}
        pings={pings}
        markers={markers}
        now={now}
        padding={{ top: 90, bottom: spectator ? 40 : 90 }}
      />
      <Hud
        label={spectator ? "Spectating" : "Seeking"}
        tone={spectator ? "neutral" : "seeker"}
        remainingMs={msUntil(room.ends_at, now)}
        hidersLeft={uncaught.length}
        hidersTotal={hiders.length}
        endgame={isEndgame(room, now)}
        wave={match.waves[0]?.waveNumber ?? room.ping_wave_count}
      >
        {caughtMe ? (
          <Banner tone="info" icon={<UserX className="size-5" />}>
            You were caught{catcher ? ` by ${catcher}` : ""}. Spectating the rest of the match.
          </Banner>
        ) : null}
        {oob.map((o) => (
          <Banner key={o.playerId} tone="warn" icon={<ShieldAlert className="size-5" />}>
            {nameOf.get(o.playerId) ?? "A hider"} is out of bounds — position shown, updates every 5 s
          </Banner>
        ))}
        {match.waves.length === 0 && !spectator ? (
          <Banner tone="info" icon={<Eye className="size-5" />}>
            Waiting for the first ping…
          </Banner>
        ) : null}
        <Toasts toasts={match.toasts} />
      </Hud>

      {!spectator ? (
        <TagDrawer
          hiders={uncaught}
          latestWave={match.waves[0] ?? null}
          waves={match.waves}
          cooldownUntil={match.cooldownUntil}
          eligible={match.eligible}
          outgoing={match.outgoing}
          hasFix={fix !== null}
          now={now}
          onTag={async (id) => {
            if (fix) await match.tag(id, { lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy_m });
          }}
          onRequest={(id) => void match.requestTag(id)}
        />
      ) : null}
    </div>
  );
}
