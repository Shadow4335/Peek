/**
 * DOM elements for MapLibre markers. Styling lives in globals.css (.peek-marker*, .peek-you)
 * so markers share the brand tokens and honour prefers-reduced-motion.
 */

function el(className: string, label?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  if (label) d.setAttribute("aria-label", label);
  return d;
}

/** Zone-builder pin (polygon mode). First pin is lavender so the ring start is obvious. */
export function vertexElement(label: string, first: boolean): HTMLDivElement {
  const d = el("", `Pin ${label}`);
  d.textContent = label;
  Object.assign(d.style, {
    width: "32px",
    height: "32px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    font: "700 13px var(--font-sans)",
    color: first ? "#14151b" : "#22271e",
    background: first ? "#8878cb" : "#b6cd91",
    border: "3px solid #242831",
    boxShadow: "0 2px 8px rgba(0,0,0,.45)",
    touchAction: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  return d;
}

/** Quick-circle centre handle. */
export function centerElement(): HTMLDivElement {
  const d = el("", "Zone centre — drag to move");
  Object.assign(d.style, {
    width: "36px",
    height: "36px",
    borderRadius: "999px",
    background: "#b6cd91",
    border: "4px solid #242831",
    boxShadow: "0 0 0 2px rgba(182,205,145,.45), 0 2px 8px rgba(0,0,0,.45)",
    touchAction: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  return d;
}

/** You (local player): lavender dot, clear light boundary. */
export function userDotElement(): HTMLDivElement {
  return el("peek-you", "Your position");
}

export type PingMarkerState = "fresh" | "aged" | "alert" | "seeker" | "hider" | "muted";

export interface PingMarkerHandle {
  root: HTMLDivElement;
  update(next: { initial: string; title: string; detail: string; state: PingMarkerState }): void;
}

/**
 * Snapshot / player pin: initial in a round pin with a name + time chip above it.
 * `arrive` plays the one-shot pop + two sage rings (skipped under reduced motion).
 */
export function pingMarkerElement(opts: {
  initial: string;
  title: string;
  detail: string;
  state: PingMarkerState;
  arrive?: boolean;
  ringColor?: string;
  /** Override the pin fill (e.g. per-player replay colours). */
  color?: string;
}): PingMarkerHandle {
  const root = el(`peek-marker peek-marker--${opts.state}${opts.arrive ? " peek-marker--arrive" : ""}`);
  if (opts.ringColor) root.style.setProperty("--ring", opts.ringColor);
  const ring1 = el("peek-marker__ring");
  const ring2 = el("peek-marker__ring");
  const pin = el("peek-marker__pin");
  const label = el("peek-marker__label");
  const title = document.createElement("span");
  const detail = document.createElement("small");
  label.append(title, document.createTextNode(" "), detail);
  root.append(ring1, ring2, pin, label);
  if (opts.color) pin.style.background = opts.color;

  const update: PingMarkerHandle["update"] = (n) => {
    pin.textContent = n.initial;
    title.textContent = n.title;
    detail.textContent = n.detail;
    root.setAttribute("aria-label", `${n.title} ${n.detail}`.trim());
    for (const s of ["fresh", "aged", "alert", "seeker", "hider", "muted"]) {
      root.classList.toggle(`peek-marker--${s}`, s === n.state);
    }
  };
  update(opts);
  if (opts.arrive) {
    // Rings run twice then the marker becomes static (no infinite pulsing).
    window.setTimeout(() => root.classList.remove("peek-marker--arrive"), 3200);
  }
  return { root, update };
}

export const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
