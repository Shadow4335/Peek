"use client";

import { useEffect, useState } from "react";

const COLORS = ["#b6cd91", "#8878cb", "#d9bc81", "#c58f87", "#c5b9e9"];
const PIECES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  const dist = 70 + ((i * 37) % 50);
  return {
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist - 30)}px`,
    rot: `${(i * 67) % 360}deg`,
    color: COLORS[i % COLORS.length]!,
    round: i % 3 === 0,
  };
});

/** Restrained one-shot burst (< 900 ms) for results. Hidden under reduced motion. */
export function Confetti() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 950);
    return () => clearTimeout(t);
  }, []);
  if (done) return null;
  return (
    <div aria-hidden className="peek-confetti pointer-events-none absolute top-10 left-1/2 size-0">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="absolute block"
          style={
            {
              width: 8,
              height: p.round ? 8 : 4,
              borderRadius: p.round ? 999 : 2,
              background: p.color,
              "--dx": p.dx,
              "--dy": p.dy,
              "--rot": p.rot,
              animation: "peek-confetti 850ms var(--peek-ease-smooth) forwards",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
