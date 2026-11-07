/** DOM elements for MapLibre markers (styled inline so they work outside Tailwind's scan). */

export function vertexElement(label: string, first: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = label;
  el.setAttribute("aria-label", `Pin ${label}`);
  Object.assign(el.style, {
    width: "30px",
    height: "30px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    font: "700 12px ui-sans-serif, system-ui",
    color: "#000",
    background: first ? "#a3e635" : "#ffffff",
    border: "3px solid #000",
    boxShadow: "0 0 0 2px #a3e635, 0 2px 8px rgba(0,0,0,.6)",
    touchAction: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

export function centerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-label", "Circle center");
  Object.assign(el.style, {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    background: "#a3e635",
    border: "4px solid #000",
    boxShadow: "0 0 0 2px #a3e635, 0 2px 8px rgba(0,0,0,.6)",
    touchAction: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

export function userDotElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-label", "You");
  Object.assign(el.style, {
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    background: "#3b82f6",
    border: "3px solid #fff",
    boxShadow: "0 0 0 6px rgba(59,130,246,.25)",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

/** Small name chip (ping labels). */
export function labelElement(text: string, color: string, dim = false): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    padding: "2px 8px",
    borderRadius: "999px",
    font: "700 11px ui-sans-serif, system-ui",
    color: "#000",
    background: color,
    opacity: dim ? "0.6" : "1",
    whiteSpace: "nowrap",
    transform: "translateY(-18px)",
    pointerEvents: "none",
    boxShadow: "0 1px 4px rgba(0,0,0,.5)",
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

/** Pulsing live marker (out-of-bounds hider / exposed seeker). */
export function pulseElement(label: string, color: string): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "hs-pulse";
  wrap.style.setProperty("--pulse", color);
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    width: "16px",
    height: "16px",
    borderRadius: "999px",
    background: color,
    border: "3px solid #000",
  } satisfies Partial<CSSStyleDeclaration>);
  const text = labelElement(label, color);
  Object.assign(text.style, { position: "absolute", left: "50%", top: "-6px", transform: "translate(-50%, -100%)" });
  wrap.append(dot, text);
  Object.assign(wrap.style, { position: "relative", pointerEvents: "none" });
  return wrap;
}

/** Solid dot with a name chip above it (admin map). */
export function dotLabelElement(label: string, color: string, ring?: string): HTMLDivElement {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, { position: "relative", pointerEvents: "none" } satisfies Partial<CSSStyleDeclaration>);
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    background: color,
    border: "3px solid #000",
    boxShadow: ring ? `0 0 0 3px ${ring}` : "0 1px 4px rgba(0,0,0,.6)",
  } satisfies Partial<CSSStyleDeclaration>);
  const text = labelElement(label, color);
  Object.assign(text.style, { position: "absolute", left: "50%", top: "-4px", transform: "translate(-50%, -100%)" });
  wrap.append(dot, text);
  return wrap;
}
