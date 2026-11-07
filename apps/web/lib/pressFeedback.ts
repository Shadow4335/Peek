/**
 * App-wide click/tap animation for every pressable control (buttons, link-buttons, tabs).
 *
 * Uses the Web Animations API on the independent CSS `scale` property, so it never touches
 * an element's classes, transitions or entrance animations, and composes with the hover
 * lift (`translate`). Skipped entirely under prefers-reduced-motion.
 */
export const PRESSABLE =
  'button:not(:disabled):not([aria-disabled="true"]), a[href], [role="button"]:not([aria-disabled="true"]), [role="tab"], summary, input[type="submit"]:not(:disabled), input[type="button"]:not(:disabled)';

const KEYFRAMES: Keyframe[] = [
  { scale: "1" },
  { scale: "0.95", offset: 0.35 },
  { scale: "1.015", offset: 0.75 },
  { scale: "1" },
];
const TIMING: KeyframeAnimationOptions = { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

export function pressTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(PRESSABLE);
  if (!el || el.closest("[data-no-press]")) return null;
  return el;
}

export function playPress(el: HTMLElement) {
  if (typeof el.animate !== "function") return;
  el.getAnimations().forEach((a) => {
    if ((a as Animation & { id: string }).id === "peek-press") a.cancel();
  });
  const anim = el.animate(KEYFRAMES, TIMING);
  anim.id = "peek-press";
}

/** Installs the listeners; returns a cleanup function. */
export function installPressFeedback(doc: Document = document): () => void {
  const reduced = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const onPointerDown = (e: PointerEvent) => {
    if (reduced?.matches || e.button > 0) return;
    const el = pressTarget(e.target);
    if (el) playPress(el);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (reduced?.matches || e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
    const el = pressTarget(e.target);
    if (el) playPress(el);
  };
  doc.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  doc.addEventListener("keydown", onKeyDown, { capture: true });
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown, { capture: true });
    doc.removeEventListener("keydown", onKeyDown, { capture: true });
  };
}
