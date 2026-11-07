"use client";

import { ROOM_CODE_LENGTH } from "@hideseek/shared";
import { ArrowRight, Dices, LogIn, MapPinned } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { INPUT_CLASS } from "@/components/ui/Field";
import { Mascot } from "@/components/ui/Mascot";
import { ErrorNotice } from "@/components/ui/Notice";
import { friendlyError } from "@/lib/errors";
import { randomName } from "@/lib/names";
import { cleanCode, cleanName, lastRoomCode, loadName, NAME_MAX, saveName } from "@/lib/player";
import { joinRoom } from "@/lib/rpc";
import { useSession } from "@/lib/session";

const noopSubscribe = () => () => {};

export default function Home() {
  const router = useRouter();
  const { status, ensure } = useSession();
  // Every visitor gets a ready-made name (saved), so nothing has to be typed to play.
  const storedName = useSyncExternalStore(noopSubscribe, loadName, () => "");
  const resumeCode = useSyncExternalStore(noopSubscribe, lastRoomCode, () => null);
  const [editedName, setName] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = editedName ?? storedName;
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const unconfigured = status === "unconfigured";

  const host = async () => {
    if (!nameOk) return setError("Enter a name first.");
    setError(null);
    setHosting(true);
    saveName(trimmed);
    try {
      await ensure();
      router.push("/room/create");
    } catch (err) {
      setError(friendlyError(err));
      setHosting(false);
    }
  };

  const join = async (roomCode: string) => {
    if (!nameOk) return setError("Enter a name first.");
    if (roomCode.length !== ROOM_CODE_LENGTH) return setError(`Room codes are ${ROOM_CODE_LENGTH} characters.`);
    setError(null);
    setJoining(true);
    saveName(trimmed);
    try {
      await joinRoom(roomCode, trimmed);
      router.push(`/room/${roomCode}`);
    } catch (err) {
      setError(friendlyError(err));
      setJoining(false);
    }
  };

  const onCode = (raw: string) => {
    const next = cleanCode(raw);
    setCode(next);
    // Joining starts as soon as the 6th character lands — no extra tap.
    if (next.length === ROOM_CODE_LENGTH && next !== code && !joining) void join(next);
  };

  return (
    <main className="pt-safe pb-safe mx-auto flex w-full max-w-md flex-1 flex-col gap-5 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#252330,transparent_55%)] px-5">
      <div className="flex items-center justify-between pt-2">
        <span className="font-display text-2xl font-bold tracking-tight">
          Peek<span className="text-accent">!</span>
        </span>
        <span className="text-xs text-ink-2">Hide well. Seek better.</span>
      </div>

      <header className="flex animate-enter items-center gap-4 pt-4">
        <Mascot size={84} float />
        <div>
          <h1 className="text-[36px] leading-[1.1]">Ready to disappear?</h1>
          <p className="mt-1 text-[15px] text-ink-2">Round up your friends. Let the chaos begin.</p>
        </div>
      </header>

      {unconfigured ? (
        <ErrorNotice>
          Supabase env vars are missing. Copy <code>apps/web/.env.example</code> to <code>.env.local</code> and restart.
        </ErrorNotice>
      ) : null}

      {resumeCode ? (
        <Link
          href={`/room/${resumeCode}`}
          data-testid="resume-room"
          className="flex min-h-14 animate-enter items-center justify-between rounded-card bg-accent-soft px-4 text-accent ring-1 ring-accent/35 transition-transform active:scale-[.98]"
        >
          <span className="text-sm font-semibold">
            Back to room <span className="font-mono tracking-widest">{resumeCode}</span>
          </span>
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      ) : null}

      <Button
        block
        loading={hosting}
        icon={<MapPinned className="size-5" aria-hidden />}
        disabled={unconfigured || !nameOk}
        onClick={host}
        className="min-h-13"
      >
        Create game
      </Button>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Playing as</span>
        <span className="flex gap-2">
          <input
            name="name"
            autoComplete="nickname"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(cleanName(e.target.value))}
            onBlur={() => nameOk && saveName(trimmed)}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <button
            type="button"
            aria-label="Random name"
            onClick={() => {
              const n = randomName();
              setName(n);
              saveName(n);
            }}
            className="grid size-12 shrink-0 place-items-center rounded-button bg-surface-raised text-ink ring-1 ring-line transition-transform hover:bg-surface-hover active:scale-[.97]"
          >
            <Dices className="size-5" />
          </button>
        </span>
      </label>

      <section className="flex flex-col gap-3 rounded-card bg-surface p-4 ring-1 ring-line">
        <h2 className="flex items-center gap-2 text-lg">
          <LogIn className="size-5 text-primary-text" aria-hidden /> Join a friend&apos;s game
        </h2>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void join(code);
          }}
          className="flex flex-col gap-3"
        >
          <input
            aria-label="Room code"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="HIDE42"
            value={code}
            disabled={joining || unconfigured}
            onChange={(e) => onCode(e.target.value)}
            className="h-16 rounded-button bg-surface-raised text-center font-mono text-3xl font-bold tracking-[0.4em] text-ink ring-1 ring-inset ring-line outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-primary-text disabled:opacity-60"
          />
          {joining ? (
            <Button type="button" block loading>
              Joining…
            </Button>
          ) : (
            <p className="text-center text-xs text-ink-2">Type the invite code — you&apos;ll join automatically.</p>
          )}
        </form>
      </section>

      <ErrorNotice>{error}</ErrorNotice>

      <p className="mt-auto pt-2 text-center text-xs text-ink-2">
        Play outdoors with location on. Your position is only shared during a game, as pings.
      </p>
    </main>
  );
}
