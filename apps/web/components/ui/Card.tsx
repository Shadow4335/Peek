import type { HTMLAttributes } from "react";

/** Standard surface: 20 px radius, 1 px quiet border, no glow. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={`rounded-card bg-surface p-4 ring-1 ring-line ${className}`} />;
}

/** Visual handle at the top of bottom sheets. */
export function SheetGrabber() {
  return <span aria-hidden className="mx-auto -mt-1 mb-1 block h-1 w-10 shrink-0 rounded-full bg-surface-hover" />;
}

/** Bottom sheet chrome (24 px top corners, strong separation from the map, slide-in). */
export const SHEET_CLASS =
  "pb-safe absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 rounded-t-panel bg-surface/95 px-4 pt-3 shadow-panel ring-1 ring-line backdrop-blur-md animate-sheet";
