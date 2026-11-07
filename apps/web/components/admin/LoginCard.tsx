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
      className="m-auto flex w-full max-w-sm flex-col gap-5 rounded-card bg-surface p-8 ring-1 ring-line"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="grid size-16 place-items-center rounded-button bg-surface-raised ring-1 ring-line">
          <Lock className="size-7 text-reward" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold">Referee console</h1>
        <p className="text-sm text-ink-2">Admin access only.</p>
      </div>
      <input
        type="password"
        autoComplete="current-password"
        aria-label="Admin password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-14 rounded-button bg-bg px-4 text-lg ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-primary-text"
      />
      <ErrorNotice>{error}</ErrorNotice>
      <Button type="submit" block loading={busy} disabled={!password}>
        Sign in
      </Button>
    </form>
  );
}
