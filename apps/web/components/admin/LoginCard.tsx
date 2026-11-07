"use client";

import { Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/Notice";
import { adminApi, adminErrorText } from "@/lib/admin";

export function LoginCard() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(password);
    } catch (err) {
      setError(adminErrorText(err));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="m-auto flex w-full max-w-sm flex-col gap-5 rounded-3xl bg-neutral-950 p-8 ring-1 ring-neutral-800"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-neutral-900 ring-1 ring-neutral-700">
          <Lock className="size-7 text-warn" aria-hidden />
        </div>
        <h1 className="text-2xl font-black">Referee console</h1>
        <p className="text-sm text-neutral-400">Admin access only.</p>
      </div>
      <input
        type="password"
        autoComplete="current-password"
        aria-label="Admin password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-14 rounded-2xl bg-black px-4 text-lg ring-1 ring-inset ring-neutral-700 outline-none focus:ring-2 focus:ring-warn"
      />
      <ErrorNotice>{error}</ErrorNotice>
      <Button type="submit" block loading={busy} disabled={!password}>
        Sign in
      </Button>
    </form>
  );
}
