"use client";

import { AlertTriangle, Moon, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SHEET_CLASS, SheetGrabber } from "@/components/ui/Card";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { formatClock } from "@/lib/useNow";
import { HeadStartBanner } from "./HeadStartBanner";
import { Hud } from "./Hud";
import type { PingDot } from "./MatchMap";
import { StealthOverlay } from "./StealthOverlay";
import { TagRequestModal } from "./TagRequestModal";
import { Toasts } from "./Toasts";
import { isEndgame, msUntil, visibleWave, type MatchViewProps } from "./types";

const MatchMap = dynamic(() => import("./MatchMap"), { ssr: false });

export function HiderView({ room, me, players, match, fix, now, wakeLockHeld }: MatchViewProps) {
  const [stealth, setStealth] = useState(false);
  const active = room.status === "ACTIVE";

  const hiders = players.filter((p) => p.role === "HIDER");
  const hidersLeft = hiders.filter((p) => !p.caught_at).length;

  // My own recent pings (what seekers saw).
  const shown = visibleWave(match, now);
  const myPings: PingDot[] = (shown?.pings ?? [])
    .filter((p) => p.playerId === me.id)
    .map((p) => ({ ...p, label: "Your ping", rank: 0, wave: shown!.waveNumber, capturedAt: p.heartbeatAt }));

  const penalized = match.outOfBounds.some((o) => o.playerId === me.id);
  const graceLeft = match.boundaryWarningAt ? match.boundaryWarningAt - now : 0;

  return (
    <div className="relative flex-1 overflow-hidden">
      <MatchMap
        fence={room.geofence}
        buffered={room.geofence_buffered}
        myFix={fix}
        pings={myPings}
        now={now}
        padding={{ top: 90, bottom: active ? 190 : 120 }}
      />
      <Hud
        label={active ? "Hiding" : "Head start"}
        tone="hider"
        remainingMs={msUntil(active ? room.ends_at : room.head_start_ends_at, now)}
        hidersLeft={hidersLeft}
        hidersTotal={hiders.length}
        endgame={isEndgame(room, now)}
      >
        {!active ? <HeadStartBanner /> : null}
        {penalized ? (
          <Banner tone="warn" icon={<ShieldAlert className="size-5" />}>
            Out of bounds — seekers can see your position. Get back inside!
          </Banner>
        ) : graceLeft > 0 ? (
          <Banner tone="warn" icon={<AlertTriangle className="size-5" />}>
            Leaving the zone — {formatClock(graceLeft)} until seekers see you
          </Banner>
        ) : null}
        <Toasts toasts={match.toasts} />
      </Hud>

      <section className={SHEET_CLASS} aria-label="Hider controls">
        <SheetGrabber />
        <Button variant="secondary" block onClick={() => setStealth(true)} icon={<Moon className="size-5" aria-hidden />}>
          Stealth pocket mode
        </Button>
        {active ? (
          <SlideToConfirm label="Slide to self-surrender (I was caught)" onConfirm={() => void match.surrender()} />
        ) : null}
      </section>

      {stealth ? <StealthOverlay wakeLockHeld={wakeLockHeld} onExit={() => setStealth(false)} /> : null}
      {match.incoming ? <TagRequestModal request={match.incoming} onAnswer={match.answerTagRequest} /> : null}
    </div>
  );
}

export function Banner({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "bad" | "good" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = {
    warn: "bg-reward-soft text-reward ring-reward/40",
    bad: "bg-danger-soft text-danger ring-danger/40",
    good: "bg-accent-soft text-accent ring-accent/35",
    info: "bg-surface/95 text-ink ring-line",
  }[tone];
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-2 rounded-button px-3 py-2.5 text-sm font-semibold shadow-panel ring-1 backdrop-blur animate-enter ${t}`}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}
