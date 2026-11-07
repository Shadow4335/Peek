"use client";

import { ChevronsRight } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";

interface Props {
  label: string;
  onConfirm: () => void;
  tone?: "danger" | "neutral";
  disabled?: boolean;
  /** Ultra-dim styling for the stealth overlay. */
  stealth?: boolean;
}

const HANDLE = 56;

/** Drag the handle ≥ 90 % of the track to confirm. Immune to accidental pocket taps. */
export function SlideToConfirm({ label, onConfirm, tone = "danger", disabled = false, stealth = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [pct, setPct] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);

  const max = () => (trackRef.current ? trackRef.current.clientWidth - HANDLE - 8 : 1);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = e.clientX - x;
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const nx = Math.min(max(), Math.max(0, e.clientX - start.current));
    setX(nx);
    setPct(Math.round((nx / max()) * 100));
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (x >= max() * 0.9) onConfirm();
    setX(0);
    setPct(0);
  };

  const track = stealth
    ? "bg-surface ring-line text-ink-3"
    : tone === "danger"
      ? "bg-danger-soft ring-danger/40 text-ink"
      : "bg-surface-raised ring-line text-ink";
  const handle = stealth ? "bg-surface-hover text-ink-3" : tone === "danger" ? "bg-danger text-on-primary" : "bg-accent text-on-accent";

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-disabled={disabled}
      className={`relative h-16 touch-none select-none rounded-full ring-1 ring-inset ${track} ${disabled ? "opacity-40" : ""}`}
    >
      <span className="pointer-events-none absolute inset-0 grid place-items-center pl-12 text-sm font-semibold">
        {label}
      </span>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`absolute top-1 left-1 grid place-items-center rounded-full ${handle} ${dragging ? "" : "transition-transform"}`}
        style={{ width: HANDLE, height: HANDLE, transform: `translateX(${x}px)` }}
      >
        <ChevronsRight className="size-6" aria-hidden />
      </div>
    </div>
  );
}
