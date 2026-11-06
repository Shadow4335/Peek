"use client";

import { ROOM_CODE_LENGTH } from "@hideseek/shared";
import { LogIn, MapPinned, Radar } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ErrorNotice } from "@/components/ui/Notice";
import { friendlyError } from "@/lib/errors";
import { cleanCode, cleanName, loadName, NAME_MAX, saveName } from "@/lib/player";
import { joinRoom } from "@/lib/rpc";
import { useSession } from "@/lib/session";

const noopSubscribe = () => () => {};

export default function Home() {
  const router = useRouter();
  const { status, ensure } = useSession();
  // Saved name from localStorage (server snapshot: empty), overridden once the user types.
  const storedName = useSyncExternalStore(noopSubscribe, loadName, () => "");
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? storedName;
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const codeOk = code.length === ROOM_CODE_LENGTH;
  const unconfigured = status === "unconfigured";

  const host = async () => {
    if (!nameOk) return setError("Enter your name first.");
    setError(null);
    saveName(trimmed);
    try {
      await ensure();
      router.push("/room/create");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk) return setError("Enter your name first.");
    if (!codeOk) return setError(`Room codes are ${ROOM_CODE_LENGTH} characters.`);
    setError(null);
    setJoining(true);
    saveName(trimmed);
    try {
      await joinRoom(code, trimmed);
      router.push(`/room/${code}`);
    } catch (err) {
      setError(friendlyError(err));
      setJoining(false);
    }
  };

  return (
    <main className="pt-safe pb-safe mx-auto flex w-full max-w-md flex-1 flex-col gap-8 overflow-y-auto px-5">
      <header className="mt-10 flex flex-col items-center gap-3 text-center">
        <div className="grid size-20 place-items-center rounded-3xl bg-neutral-950 ring-1 ring-neutral-800">
          <Radar className="size-10 text-hider" aria-hidden />
        </div>
        <h1 className="text-4xl font-black tracking-tight">Hide &amp; Seek</h1>
        <p className="text-sm text-neutral-400">Real-world. GPS pings. A fence you draw.</p>
      </header>

      {unconfigured ? (
        <ErrorNotice>
          Supabase env vars are missing. Copy <code>apps/web/.env.example</code> to{" "}
          <code>.env.local</code> and restart.
        </ErrorNotice>
      ) : null}

      <Field
        label="Your name"
        name="name"
        autoComplete="nickname"
        placeholder="e.g. Sneaky Sam"
        maxLength={NAME_MAX}
        value={name}
        onChange={(e) => setName(cleanName(e.target.value))}
      />

      <section className="flex flex-col gap-3 rounded-3xl bg-neutral-950 p-4 ring-1 ring-neutral-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
          <LogIn className="size-4" aria-hidden /> Join a room
        </h2>
        <form onSubmit={join} className="flex flex-col gap-3">
          <input
            aria-label="Room code"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="HIDE42"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            className="h-16 rounded-2xl bg-black text-center font-mono text-3xl font-bold tracking-[0.4em] text-white ring-1 ring-inset ring-neutral-800 outline-none placeholder:text-neutral-700 focus:ring-2 focus:ring-hider"
          />
          <Button type="submit" block loading={joining} disabled={unconfigured || !codeOk || !nameOk}>
            Join
          </Button>
        </form>
      </section>

      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-neutral-600">
        <span className="h-px flex-1 bg-neutral-800" /> or <span className="h-px flex-1 bg-neutral-800" />
      </div>

      <Button
        variant="secondary"
        block
        icon={<MapPinned className="size-5" aria-hidden />}
        disabled={unconfigured || !nameOk}
        onClick={host}
      >
        Host a game &amp; draw the zone
      </Button>

      <ErrorNotice>{error}</ErrorNotice>

      <p className="mt-auto text-center text-xs text-neutral-600">
        Play outdoors with location on. Phones only.
      </p>
    </main>
  );
}
