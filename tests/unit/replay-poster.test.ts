// @vitest-environment happy-dom
// The shared run's poster (stage 73 point 11, ADR 0162): its words, its
// build (no style attributes: the frame's CSP), and openReplay holding the
// run paused at its start under it until a click, Enter or Space.
import { afterEach, describe, expect, it } from "vitest";
import { openReplay } from "../../src/replay/page";
import {
  type Poster,
  mountPoster,
  posterLength,
  posterLogo,
  posterText,
  titleSize,
} from "../../src/replay/poster";
import { defaultSettings } from "../../src/settings";
import { defaultExportDoc } from "../../src/share/edits";
import {
  type ReplayPayload,
  buildReplayPayload,
} from "../../src/share/payload";
import { BASE_US, FakeWall, makeLog, meta } from "./player-helpers";

const START = new Date(2026, 8, 26, 20, 15).getTime() * 1000;

function payload(title = "Clearing the ranger camp"): ReplayPayload {
  // A line every 2 s for 90 s (long quiet stretches are shortened in play).
  const text = makeLog(
    BASE_US,
    Array.from({ length: 46 }, (_, i) => ({ at: i * 2, in: `Line ${i}.` })),
  );
  const doc = { ...defaultExportDoc("Rasta/a"), title };
  return buildReplayPayload(
    [{ meta: meta("Rasta/a", BASE_US), text }],
    [],
    doc,
    defaultSettings(),
    {},
  );
}

// Each test's poster goes (its key listener with it) and the page is emptied.
const posters: Poster[] = [];
afterEach(() => {
  for (const p of posters.splice(0)) p.dispose();
  document.body.textContent = "";
});

describe("the poster’s words", () => {
  it("has the title, then the character, the date and the length", () => {
    expect(
      posterText({
        title: "A fight",
        character: "Rasta",
        startUs: START,
        durationMs: 4_500_000,
      }),
    ).toEqual({
      title: "A fight",
      sub: ["Rasta", "2026-09-26", "1 h 15 min"],
    });
  });

  it("puts the character in the title when the run has none, and leaves out what it does not know", () => {
    expect(
      posterText({
        title: "  ",
        character: "Rasta",
        startUs: 0,
        durationMs: 0,
      }),
    ).toEqual({ title: "Rasta", sub: [] });
    expect(
      posterText({ title: "", character: "", startUs: 0, durationMs: 0 }).title,
    ).toBe("MUME");
  });

  it("writes lengths and sizes long titles down", () => {
    expect(posterLength(50_000)).toBe("50 s");
    expect(posterLength(42 * 60_000)).toBe("42 min");
    expect(posterLength(2 * 3_600_000)).toBe("2 h");
    expect(titleSize("Short")).toBe("short");
    expect(titleSize("x".repeat(40))).toBe("mid");
    expect(titleSize("x".repeat(80))).toBe("long");
  });
});

describe("the poster’s build", () => {
  it("uses no style attributes and no markup (the frame’s CSP), and its title is text", () => {
    const p = mountPoster(
      document,
      {
        title: "<img src=x onerror=alert(1)>",
        character: "Rasta",
        startUs: START,
        durationMs: 0,
      },
      () => {},
    );
    posters.push(p);
    expect(p.el.querySelectorAll("[style]")).toHaveLength(0);
    expect(p.el.querySelector("img")).toBeNull();
    expect(p.el.querySelector(".wc-poster-title")!.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    expect(p.el.parentElement).toBe(document.body);
  });

  it("draws the wordmark from the glyphs, labelled MUME Cockpit", () => {
    const svg = posterLogo(document);
    expect(svg.getAttribute("aria-label")).toBe("MUME Cockpit");
    expect(svg.querySelectorAll("path").length).toBeGreaterThanOrEqual(2);
    expect(svg.querySelector("image")).toBeNull();
  });
});

describe("openReplay with the poster", () => {
  function open(o: { poster?: boolean } = { poster: true }) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const wall = new FakeWall();
    const page = openReplay(document, root, payload(), { wall, ...o });
    if (page.poster) posters.push(page.poster);
    return { page, wall, root };
  }

  it("opens paused at the start under the poster, with the title and the played length", () => {
    const { page } = open();
    expect(page.poster?.up).toBe(true);
    expect(page.host.engine!.playing).toBe(false);
    expect(page.host.engine!.position).toBe(0);
    const el = document.querySelector(".wc-poster")!;
    expect(el.querySelector(".wc-poster-title")!.textContent).toBe(
      "Clearing the ranger camp",
    );
    const sub = [...el.querySelectorAll(".wc-poster-sub span")].map(
      (s) => s.textContent,
    );
    expect(sub[0]).toBe("Rasta");
    expect(sub.at(-1)).toMatch(/min$/);
  });

  it("a click anywhere on it takes it away and plays", () => {
    const { page } = open();
    (document.querySelector(".wc-poster-title") as HTMLElement).click();
    expect(page.poster!.up).toBe(false);
    expect(page.host.engine!.playing).toBe(true);
  });

  it("Enter or Space starts it; other keys never reach the player while it is up", () => {
    const { page } = open();
    const eng = page.host.engine!;
    for (const key of ["ArrowRight", "f", "3", "ArrowDown"]) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    }
    expect(page.poster!.up).toBe(true);
    expect(eng.position).toBe(0);
    expect(eng.playing).toBe(false);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(page.poster!.up).toBe(false);
    expect(eng.playing).toBe(true);
  });

  it("a press on it never reaches the player’s stage", () => {
    const { root } = open();
    let seen = 0;
    root.addEventListener("pointerdown", () => seen++);
    document.addEventListener("pointerdown", () => seen++);
    document
      .querySelector(".wc-poster")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(seen).toBe(0);
  });

  it("is not there without `poster` (the in-app player, tests)", () => {
    const { page } = open({});
    expect(page.poster).toBeNull();
    expect(document.querySelector(".wc-poster")).toBeNull();
    expect(page.host.engine!.playing).toBe(true);
  });
});
