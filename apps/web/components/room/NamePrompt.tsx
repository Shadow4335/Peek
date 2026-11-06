"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { cleanName, NAME_MAX } from "@/lib/player";

export function NamePrompt({ code, onSubmit }: { code: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };
  return (
    <form onSubmit={submit} className="pt-safe pb-safe mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5">
      <p className="text-center text-sm text-neutral-400">
        Joining room <span className="font-mono font-bold text-hider">{code}</span>
      </p>
      <Field
        label="Your name"
        name="name"
        autoFocus
        autoComplete="nickname"
        maxLength={NAME_MAX}
        value={name}
        onChange={(e) => setName(cleanName(e.target.value))}
      />
      <Button type="submit" block disabled={!name.trim()}>
        Join
      </Button>
    </form>
  );
}
