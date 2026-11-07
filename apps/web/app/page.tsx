"use client";

import { ROOM_CODE_LENGTH } from "@hideseek/shared";
import { ArrowRight, Dices, LogIn, MapPinned, Radar } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
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
    <main className="pt-safe pb-safe mx-auto flex w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-5">
      <header className="mt-8 flex flex-col items-center gap-3 text-center">
        <div className="grid size-20 place-items-center rounded-3xl bg-neutral-950 ring-1 ring-neutral-800">
          <Radar className="size-10 text-hider" aria-hidden />
        </div>
        <h1 className="text-4xl font-black tracking-tight">Hide &amp; Seek</h1>
        <p className="text-sm text-neutral-400">Real-world. GPS pings. A fence you draw.</p>
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
          className="flex min-h-14 items-center justify-between rounded-2xl bg-lime-950/60 px-4 text-hider ring-1 ring-lime-800"
        >
          <span className="text-sm font-semibold">
            Back to room <span className="font-mono tracking-widest">{resumeCode}</span>
          </span>
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Playing as</span>
        <span className="flex gap-2">
          <input
            name="name"
            autoComplete="nickname"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => setName(cleanName(e.target.value))}
            onBlur={() => nameOk && saveName(trimmed)}
            className="h-13 min-w-0 flex-1 rounded-2xl bg-neutral-900 px-4 text-lg text-white ring-1 ring-inset ring-neutral-800 outline-none focus:ring-2 focus:ring-hider"
          />
          <button
            type="button"
            aria-label="Random name"
            onClick={() => {
              const n = randomName();
              setName(n);
              saveName(n);
            }}
            className="grid size-13 shrink-0 place-items-center rounded-2xl bg-neutral-900 ring-1 ring-neutral-800 active:bg-neutral-800"
          >
            <Dices className="size-5" />
          </button>
        </span>
      </label>

      <section className="flex flex-col gap-3 rounded-3xl bg-neutral-950 p-4 ring-1 ring-neutral-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
          <LogIn className="size-4" aria-hidden /> Join with a code
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
            className="h-16 rounded-2xl bg-black text-center font-mono text-3xl font-bold tracking-[0.4em] text-white ring-1 ring-inset ring-neutral-800 outline-none placeholder:text-neutral-700 focus:ring-2 focus:ring-hider disabled:opacity-60"
          />
          {joining ? (
            <Button type="button" block loading>
              Joining…
            </Button>
          ) : (
            <p className="text-center text-xs text-neutral-500">Joins automatically once all 6 characters are in.</p>
          )}
        </form>
      </section>

      <Button
        variant="secondary"
        block
        loading={hosting}
        icon={<MapPinned className="size-5" aria-hidden />}
        disabled={unconfigured || !nameOk}
        onClick={host}
      >
        Host a game
      </Button>

      <ErrorNotice>{error}</ErrorNotice>

      <p className="mt-auto text-center text-xs text-neutral-600">Play outdoors with location on. Phones only.</p>
    </main>
  );
}
