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
    <div role="alertdialog" aria-label="Tag request" className="fixed inset-0 z-[70] grid place-items-end bg-bg/85 p-4 pb-safe">
      <div className="flex w-full max-w-md animate-sheet flex-col gap-4 rounded-panel bg-surface p-5 shadow-panel ring-1 ring-reward/50">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-reward-soft"><Hand className="size-6 text-reward" aria-hidden /></span>
          <div>
            <h2 className="text-xl leading-tight">{request.seekerName} says they tagged you</h2>
            <p className="text-sm text-ink-2">GPS couldn&apos;t confirm it. Are they right next to you?</p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div className="h-full bg-reward transition-[width] duration-200" style={{ width: `${(left / 15000) * 100}%` }} />
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
