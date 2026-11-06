"use client";

import type { TagRequestIncomingEvent } from "@hideseek/shared";
import { Hand } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useNow } from "@/lib/useNow";

/** 15 s confirm on the hider's phone; sits above the stealth overlay. */
export function TagRequestModal({
  request,
  onAnswer,
}: {
  request: TagRequestIncomingEvent;
  onAnswer: (accept: boolean) => void;
}) {
  const now = useNow(250);
  const left = Math.max(0, Date.parse(request.expiresAt) - now);
  if (left <= 0) return null;
  return (
    <div role="alertdialog" aria-label="Tag request" className="fixed inset-0 z-[70] grid place-items-end bg-black/80 p-4 pb-safe">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-neutral-950 p-5 ring-1 ring-seeker">
        <div className="flex items-center gap-3">
          <Hand className="size-8 text-seeker" aria-hidden />
          <div>
            <p className="text-lg font-bold">{request.seekerName} says they tagged you</p>
            <p className="text-sm text-neutral-400">GPS couldn&apos;t confirm it. Are they right next to you?</p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full bg-seeker transition-[width] duration-200" style={{ width: `${(left / 15000) * 100}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => onAnswer(false)}>
            No ({Math.ceil(left / 1000)}s)
          </Button>
          <Button variant="danger" onClick={() => onAnswer(true)}>
            Yes, I&apos;m caught
          </Button>
        </div>
      </div>
    </div>
  );
}
