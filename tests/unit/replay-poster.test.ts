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
  POSTER_UP,
  posterText,
  titleSize,
} from "../../src/replay/poster";
import {
  FRAME_DESC_MAX,
  FRAME_TITLE_MAX,
  frameMeta,
} from "../../src/replay/frame";
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
      description: "",
      meta: ["Rasta", "2026-09-26", "1 h 15 min"],
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
    ).toEqual({ title: "Rasta", description: "", meta: ["Rasta"] });
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

  it("hides the player's control box while it is up (the attribute on <html>), until the run starts", () => {
    const { page } = open();
    expect(document.documentElement.hasAttribute(POSTER_UP)).toBe(true);
    page.poster!.start();
    expect(document.documentElement.hasAttribute(POSTER_UP)).toBe(false);
    const p = mountPoster(document, { title: "x", character: "", startUs: 0, durationMs: 0 }, () => {});
    expect(document.documentElement.hasAttribute(POSTER_UP)).toBe(true);
    p.dispose();
    expect(document.documentElement.hasAttribute(POSTER_UP)).toBe(false);
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

  it("a held Space or Enter that started it never toggles the run it started, until its keyup", () => {
    for (const key of [" ", "Enter"]) {
      const { page } = open();
      const eng = page.host.engine!;
      const key_ = (type: string, repeat = false) =>
        window.dispatchEvent(new KeyboardEvent(type, { key, repeat, bubbles: true }));
      key_("keydown");
      expect(page.poster!.up).toBe(false);
      expect(eng.playing).toBe(true);
      // The auto-repeats of the held key are swallowed.
      for (let i = 0; i < 5; i++) key_("keydown", true);
      expect(eng.playing).toBe(true);
      key_("keyup");
      // Released: Space is the player's again.
      if (key === " ") {
        key_("keydown");
        expect(eng.playing).toBe(false);
      }
      page.host.dispose();
    }
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

// ADR 0162 round 1: the owner's pick (frosted glass, the title card's
// words), and the publication's words the watch page sends the frame.
describe("the poster’s round 1 words", () => {
  it("has the description, trimmed, and the character, date and length at the foot", () => {
    expect(
      posterText({
        title: "A fight",
        character: "Rasta",
        startUs: START,
        durationMs: 4_500_000,
        description: "  Two lines\nof it. ",
      }),
    ).toEqual({
      title: "A fight",
      description: "Two lines\nof it.",
      meta: ["Rasta", "2026-09-26", "1 h 15 min"],
    });
  });

  it("builds the description and the foot as text, no style attributes", () => {
    const p = mountPoster(
      document,
      {
        title: "A fight",
        character: "Rasta",
        startUs: START,
        durationMs: 0,
        description: "<i>x</i>",
      },
      () => {},
    );
    posters.push(p);
    expect(p.el.querySelector(".wc-poster-desc")!.textContent).toBe("<i>x</i>");
    expect(p.el.querySelector("i")).toBeNull();
    expect(p.el.querySelector(".wc-poster-foot .wc-poster-sub")!.textContent).toBe(
      "Rasta2026-09-26",
    );
    expect(p.el.querySelector(".wc-poster-foot .wc-poster-logo")).not.toBeNull();
    expect(p.el.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("the frame takes the meta as plain, capped text", () => {
    expect(frameMeta(undefined)).toEqual({ title: "", description: "" });
    expect(frameMeta({ title: 5, description: ["x"] })).toEqual({ title: "", description: "" });
    const m = frameMeta({
      title: "  A‮bad\u0007\n title ",
      description: "One\r\n\n\n\n\u0000two⁦ ",
    });
    expect(m).toEqual({ title: "Abad title", description: "One\n\ntwo" });
    const long = frameMeta({ title: "x".repeat(5000), description: "y".repeat(9000) });
    expect(long.title).toHaveLength(FRAME_TITLE_MAX);
    expect(long.description).toHaveLength(FRAME_DESC_MAX);
  });

  it("openReplay shows the publication's title over the payload's, and the payload's without one", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const a = openReplay(document, root, payload("Export title"), {
      wall: new FakeWall(),
      poster: { title: "Published title", description: "Notes." },
    });
    posters.push(a.poster!);
    expect(a.poster!.el.querySelector(".wc-poster-title")!.textContent).toBe("Published title");
    expect(a.poster!.el.querySelector(".wc-poster-desc")!.textContent).toBe("Notes.");
    a.host.dispose();
    a.poster!.dispose();
    const b = openReplay(document, root, payload("Export title"), {
      wall: new FakeWall(),
      poster: true,
    });
    posters.push(b.poster!);
    expect(b.poster!.el.querySelector(".wc-poster-title")!.textContent).toBe("Export title");
    expect(b.poster!.el.querySelector(".wc-poster-desc")).toBeNull();
  });
});
