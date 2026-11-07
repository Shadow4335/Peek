"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const INTRO_SEEN_KEY = "hideseek:introSeen";
const PLAY_MS = 2600;
const REDUCED_MS = 1200;
const FADE_MS = 320;

/**
 * Runs in <head> before first paint (next/script beforeInteractive): marks <html> with
 * data-intro="1" on a first visit so the overlay is visible from the very first frame and the
 * page underneath never flashes. `?intro=1` forces a replay. Admin and dev pages are skipped.
 */
export const INTRO_GATE_SCRIPT = `try{var p=location.pathname,f=/[?&]intro=1/.test(location.search);if(f||(!localStorage.getItem(${JSON.stringify(
  INTRO_SEEN_KEY,
)})&&!/^\\/(admin|dev)(\\/|$)/.test(p))){document.documentElement.setAttribute("data-intro","1")}}catch(e){}`;

const LETTERS = ["P", "e", "e", "k", "!"];

/**
 * First-visit intro (~2.6 s): the mascot peeks up from behind a hill, glances around and
 * blinks, then the wordmark pops in. Tap anywhere or "Skip" to dismiss. Markup is static, so
 * SSR and hydration match; visibility is driven purely by html[data-intro].
 */
export function IntroOverlay() {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const dismiss = useCallback(() => {
    if (done.current) return;
    done.current = true;
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* private mode: it just plays again next time */
    }
    setLeaving(true);
    window.setTimeout(() => document.documentElement.removeAttribute("data-intro"), FADE_MS);
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.intro !== "1") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(dismiss, reduced ? REDUCED_MS : PLAY_MS);
    return () => window.clearTimeout(t);
  }, [dismiss]);

  return (
    <div
      className={`peek-intro${leaving ? " peek-intro--leaving" : ""}`}
      role="dialog"
      aria-label="Welcome to Peek!"
      onClick={dismiss}
    >
      <button
        type="button"
        className="peek-intro__skip"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
      >
        Skip
      </button>

      <div className="peek-intro__stage" aria-hidden>
        <svg className="peek-intro__mascot" viewBox="0 0 120 120" width="148" height="148">
          <path d="M60 10c26 0 44 19 44 46 0 25-17 44-44 44S16 81 16 56c0-27 18-46 44-46z" fill="#b6cd91" />
          <g className="peek-intro__eyes">
            <ellipse cx="46" cy="54" rx="8" ry="10" fill="#22271e" />
            <ellipse cx="74" cy="54" rx="8" ry="10" fill="#22271e" />
            <g className="peek-intro__pupils">
              <circle cx="48.5" cy="51" r="2.6" fill="#f0eee9" />
              <circle cx="76.5" cy="51" r="2.6" fill="#f0eee9" />
            </g>
          </g>
          <path d="M53 73c4 4 10 4 14 0" stroke="#22271e" strokeWidth="4" strokeLinecap="round" fill="none" />
        </svg>
        <div className="peek-intro__hill" />
      </div>

      <h1 className="peek-intro__word" aria-hidden>
        {LETTERS.map((l, i) => (
          <span key={i} style={{ animationDelay: `${1150 + i * 70}ms` }} className={l === "!" ? "peek-intro__bang" : ""}>
            {l}
          </span>
        ))}
      </h1>
      <p className="peek-intro__tag">Hide well. Seek better.</p>
    </div>
  );
}
