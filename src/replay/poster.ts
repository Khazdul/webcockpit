// The shared run's poster (stage 73 point 11, ADR 0162): a presentation
// layer over the replay while it waits paused at its start. A glass
// screen (vignette, faint scanlines, a glare; CSS only, src/replay/
// poster.css), the run's title in the pane title's face (Cinzel Bold, in
// the frame and in the exported file already) at the top, a line with the
// character, the date and the played length under it, a large play key in
// the middle and the MUME Cockpit wordmark at the bottom right.
//
// A click or tap anywhere on it, or Enter or Space, takes it away and
// starts the run (`onStart`). While it is up no other key reaches the
// player: a capture listener on the window, registered before the
// player's own (src/player/view.ts), swallows them (Tab moves the focus).
// Pointer and wheel events stop at the layer, so the player's stage under
// it never sees them.
//
// Everything is built with DOM calls and SVG presentation attributes, no
// markup strings and no `style` attributes: the watch page's frame
// (ADR 0154) has a hash in `style-src`, which voids `'unsafe-inline'` for
// style attributes; CSSOM is not covered by CSP. The wordmark is the
// start page's glyph outlines (src/start/wordmark-glyphs.ts) drawn as a
// flat version of ADR 0126's mark: no fetch, no image file.

import { COCKPIT, MUME } from "../start/wordmark-glyphs";
import { INLAY_TOKENS } from "../start/wordmark-svg";
import { fmtDate } from "./title";

const SVG_NS = "http://www.w3.org/2000/svg";

/** What the poster shows. */
export interface PosterInfo {
  /** The run's title ('' when it has none: the character takes its place). */
  title: string;
  character: string;
  /** The first run's start, µs. */
  startUs: number;
  /** The played length, ms (0: unknown, not shown). */
  durationMs: number;
}

/** "1 h 15 min", "42 min", "50 s". */
export function posterLength(ms: number): string {
  const t = Math.max(0, Math.round(Number.isFinite(ms) ? ms / 1000 : 0));
  if (t < 60) return `${t} s`;
  const min = Math.round(t / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** The headline and the small line under it (each part its own item). */
export function posterText(i: PosterInfo): { title: string; sub: string[] } {
  const who = i.character.trim();
  const title = i.title.trim() || who || "MUME";
  const sub: string[] = [];
  if (who && title !== who) sub.push(who);
  if (Number.isFinite(i.startUs) && i.startUs > 0) sub.push(fmtDate(i.startUs));
  if (i.durationMs > 0) sub.push(posterLength(i.durationMs));
  return { title, sub };
}

/** Long titles get a smaller face (`data-len`). */
export function titleSize(title: string): "short" | "mid" | "long" {
  const n = [...title].length;
  return n <= 28 ? "short" : n <= 56 ? "mid" : "long";
}

function svg(
  doc: Document,
  tag: string,
  attrs: Record<string, string | number>,
): SVGElement {
  const el = doc.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

let seq = 0;

/** The MUME Cockpit wordmark: iron MUME with a mithril inlay, COCKPIT under it. */
export function posterLogo(doc: Document): SVGElement {
  const id = `wcpl${++seq}`;
  const pad = 60;
  const w = MUME.x1 - MUME.x0 + 2 * pad;
  // COCKPIT is scaled to MUME's width less the rules' room, under it.
  const cw = COCKPIT.x1 - COCKPIT.x0;
  const cs = (w * 0.62) / cw;
  const cTop = MUME.bottom + 150;
  const cH = (COCKPIT.bottom - COCKPIT.top) * cs;
  const h = cTop + cH + pad - (MUME.top - pad);
  const root = svg(doc, "svg", {
    viewBox: `${MUME.x0 - pad} ${MUME.top - pad} ${w} ${h}`,
    class: "wc-poster-logo",
    role: "img",
    "aria-label": "MUME Cockpit",
  });
  const defs = svg(doc, "defs", {});
  defs.appendChild(svg(doc, "path", { id: `${id}-m`, d: MUME.d }));
  const face = svg(doc, "linearGradient", {
    id: `${id}-f`,
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: -720,
    x2: 0,
    y2: 0,
  });
  for (const [o, c] of [
    [0, "#7a6a5a"],
    [0.2, "#463b31"],
    [0.65, "#2a221c"],
    [1, "#16110e"],
  ] as const) {
    face.appendChild(svg(doc, "stop", { offset: o, "stop-color": c }));
  }
  const inlay = svg(doc, "linearGradient", {
    id: `${id}-i`,
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    y1: -720,
    x2: 0,
    y2: 0,
  });
  for (const [o, c] of INLAY_TOKENS.day)
    inlay.appendChild(svg(doc, "stop", { offset: o, "stop-color": c }));
  const area = {
    x: MUME.x0 - pad,
    y: MUME.top - pad,
    width: w,
    height: MUME.bottom - MUME.top + 2 * pad,
  };
  const mask = svg(doc, "mask", {
    id: `${id}-c`,
    maskUnits: "userSpaceOnUse",
    ...area,
  });
  mask.appendChild(
    svg(doc, "use", {
      href: `#${id}-m`,
      fill: "#fff",
      stroke: "#000",
      "stroke-width": 98,
      "stroke-linejoin": "round",
    }),
  );
  defs.append(face, inlay, mask);
  root.appendChild(defs);
  root.appendChild(
    svg(doc, "use", { href: `#${id}-m`, y: 28, fill: "#000", opacity: 0.7 }),
  );
  root.appendChild(
    svg(doc, "use", {
      href: `#${id}-m`,
      fill: "none",
      stroke: "#0b0807",
      "stroke-width": 26,
      "stroke-linejoin": "round",
    }),
  );
  root.appendChild(
    svg(doc, "use", { href: `#${id}-m`, fill: `url(#${id}-f)` }),
  );
  root.appendChild(
    svg(doc, "rect", { mask: `url(#${id}-c)`, ...area, fill: `url(#${id}-i)` }),
  );
  // COCKPIT between two thin rules.
  const cx = MUME.x0 - pad + (w - cw * cs) / 2;
  const ruleY = cTop + cH / 2;
  const ruleW = (w - cw * cs) / 2 - 110;
  root.appendChild(
    svg(doc, "rect", {
      x: MUME.x0,
      y: ruleY - 9,
      width: ruleW,
      height: 18,
      rx: 9,
      fill: "#6b5d50",
    }),
  );
  root.appendChild(
    svg(doc, "rect", {
      x: MUME.x1 - ruleW,
      y: ruleY - 9,
      width: ruleW,
      height: 18,
      rx: 9,
      fill: "#6b5d50",
    }),
  );
  root.appendChild(
    svg(doc, "path", {
      d: COCKPIT.d,
      fill: INLAY_TOKENS.ink,
      transform: `translate(${cx - COCKPIT.x0 * cs} ${cTop - COCKPIT.top * cs}) scale(${cs})`,
    }),
  );
  return root;
}

/** The play key's glyph: a ring and a triangle. */
function playGlyph(doc: Document): SVGElement {
  const g = svg(doc, "svg", {
    viewBox: "0 0 100 100",
    class: "wc-poster-glyph",
    "aria-hidden": "true",
  });
  g.appendChild(
    svg(doc, "circle", { cx: 50, cy: 50, r: 46, class: "wc-poster-ring" }),
  );
  g.appendChild(
    svg(doc, "path", { d: "M40 31 L71 50 L40 69 Z", class: "wc-poster-tri" }),
  );
  return g;
}

export interface Poster {
  readonly el: HTMLElement;
  /** Whether the poster is still up. */
  readonly up: boolean;
  /** Takes the poster away and calls `onStart` (once). */
  start(): void;
  /** Takes it away without starting (the page goes). */
  dispose(): void;
  /** Sets the played length (ms) once the player knows it. */
  setLength(ms: number): void;
}

/** Ms of the fade when the poster goes (none with reduced motion). */
export const POSTER_FADE_MS = 260;

/**
 * Shows the poster over the page: a fixed layer as the last child of
 * `doc.body`. Call it before the player is made, so its key listener runs
 * first.
 */
export function mountPoster(
  doc: Document,
  info: PosterInfo,
  onStart: () => void,
): Poster {
  const win = doc.defaultView;
  const text = posterText(info);
  const el = doc.createElement("div");
  el.className = "wc-poster";
  el.setAttribute("data-poster", "");

  const screen = doc.createElement("div");
  screen.className = "wc-poster-screen";
  const top = doc.createElement("header");
  top.className = "wc-poster-top";
  const h = doc.createElement("h1");
  h.className = "wc-poster-title";
  h.setAttribute("data-len", titleSize(text.title));
  h.textContent = text.title;
  top.appendChild(h);
  const sub = doc.createElement("p");
  sub.className = "wc-poster-sub";
  const fillSub = (parts: readonly string[]): void => {
    sub.textContent = "";
    for (const s of parts) {
      const span = doc.createElement("span");
      span.textContent = s;
      sub.appendChild(span);
    }
    sub.hidden = parts.length === 0;
  };
  fillSub(text.sub);
  top.appendChild(sub);

  const play = doc.createElement("button");
  play.type = "button";
  play.className = "wc-poster-play";
  play.setAttribute("aria-label", `Play ${text.title}`);
  play.appendChild(playGlyph(doc));
  const hint = doc.createElement("span");
  hint.className = "wc-poster-hint";
  hint.textContent = "Play";
  play.appendChild(hint);

  const logo = doc.createElement("div");
  logo.className = "wc-poster-mark";
  logo.appendChild(posterLogo(doc));

  const glass = doc.createElement("div");
  glass.className = "wc-poster-glass";
  glass.setAttribute("aria-hidden", "true");

  screen.append(top, play, logo, glass);
  el.appendChild(screen);

  let up = true;
  const stop = (e: Event): void => e.stopPropagation();
  const STOPPED = [
    "pointerdown",
    "pointerup",
    "pointermove",
    "mousedown",
    "touchstart",
    "touchmove",
    "dblclick",
    "contextmenu",
  ];
  for (const t of STOPPED) el.addEventListener(t, stop);
  el.addEventListener(
    "wheel",
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    { passive: false },
  );
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    start();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (!up) return;
    if (e.key === "Tab") return;
    e.stopImmediatePropagation();
    const go =
      (e.key === "Enter" || e.key === " " || e.key === "Spacebar") &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey;
    if (go) {
      e.preventDefault();
      if (!e.repeat) start();
    }
  };
  win?.addEventListener("keydown", onKey, true);

  const remove = (fade: boolean): void => {
    win?.removeEventListener("keydown", onKey, true);
    const reduced =
      win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    if (!fade || reduced) {
      el.remove();
      return;
    }
    el.setAttribute("data-going", "");
    win!.setTimeout(() => el.remove(), POSTER_FADE_MS);
  };
  function start(): void {
    if (!up) return;
    up = false;
    remove(true);
    onStart();
  }

  doc.body.appendChild(el);
  try {
    play.focus({ preventScroll: true });
  } catch {
    /* no focus here (a frame the page has not focused): the keys still work once it is */
  }
  return {
    el,
    get up() {
      return up;
    },
    start,
    dispose: () => {
      if (!up) return;
      up = false;
      remove(false);
    },
    setLength: (ms) => fillSub(posterText({ ...info, durationMs: ms }).sub),
  };
}
