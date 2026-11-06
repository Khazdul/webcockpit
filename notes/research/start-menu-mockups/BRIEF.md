# Start menu redesign — mockup brief (round 1)

Research for a coming stage (start menu + sub-pages: History, Credits,
About, Profile list, then the Profile editor and the Scripts editor).
Spotlights and the run/replay players are out of scope.

## Owner goal (2026-11-06)

Leave the TUI look on the start menu and give it a "wow" feeling: alive,
not static. Replace the old pixel "MUME COCKPIT" banner with a new
identity with recognition value. The background is a **full scene**
(sky + weather + a layered landscape in the foreground lit by sun/moon).

- **Day/night follows MUME's real game clock** (offline, see below).
  Month → season; **winter months (Foreyule, Afteryule, Solmath) always
  snow**. Moon phase and position from the real model.
- Everything else (clouds, rain, birds, shooting stars, fog, lightning,
  fireflies, leaves …) runs for **maximum visual effect**, cycling freely.
- Keep the random Tolkien **quote** under the menu.
- No sound.
- Keyboard (↑↓ + Enter/Space, Esc back) works as today; mouse gets hover
  effects; phone (≈390×844 portrait) gets an adapted, equally alive layout.
- Menu items: Enter MUME (primary), Profile, Scripts, History, Spotlights,
  Credits, About.
- The new mark/wordmark will also become the favicon and appear in About,
  so it must work tiny (16–32 px) too — show it at favicon size somewhere
  in the mockup.
- The in-game panes just got the "Lykta" look (iron band, riveted corner
  brackets, centred iron hood with a Cinzel title, window lit from within).
  See `notes/research/pane-lantern-mockups/README.md` and
  `round3-src/variants/17.css`, screenshot `s17*.png`. The start menu may
  echo it or depart from it; it must not clash with it.

## Game time (offline)

Read `src/gmcp/clock.ts` and `src/gmcp/gametime.ts` (moon model, seasons,
periods). 1 real second = 1 game minute; day 1440 s, month 30 days
(43 200 s), year 12 months (518 400 s). Epoch: use
`localStorage['wc.clock']` if present and parseable (it is our client's
saved clock; look at `src/gmcp/state.ts` for the shape) and otherwise the
almanac's seed `SEED_EPOCH = 1_696_118_400 - 2850 * 518_400` (approx.,
fine for show). `g = nowUnixSeconds - epoch`. DAWN/DUSK per month in
`clock.ts`. Re-implement the few functions you need inline in the mockup
(it is throwaway); do not import project code.

## Mockup rules

- One self-contained HTML file: `round1/NN-name.html`. Inline CSS/JS.
  Fonts only via Google Fonts `<link>`; scripts only from
  cdnjs.cloudflare.com / cdn.jsdelivr.net with exact versions (prefer none).
  Canvas 2D or SVG/CSS; no WebGL required (keep it cheap: 60 fps on a
  laptop, pause when the tab is hidden, respect prefers-reduced-motion
  with a calmer version).
- Must look finished at 1440×900, 1920×1080 and 390×844.
- A small, collapsible **demo panel** (bottom-left, discreet) to override:
  time of day (slider 0–24 h), month (12), weather (auto / clear / clouds /
  rain / storm / snow / fog), moon phase, and "fast time" (×600). Default
  is the real game time and auto weather.
- Show one **sub-page** inside the same mockup: selecting **Profile**
  opens a mock profile list (3–4 profiles with name, character, last used,
  buttons New / Edit / Import / Export / Delete), and Esc/back returns.
  This shows how the sub-pages will inherit the look. Other items can
  flash "not in mockup".
- A short block comment at the top of the file: the direction's name, the
  idea in 3–5 lines, and what it would cost to build for real.
- Screenshot it yourself with Playwright (the project has it:
  `npx playwright` from /home/ole/proj/webcockpit, Chromium) at the three
  sizes, plus night and day and snow, into `round1/shots/NN-*.png`. Look
  at your screenshots and iterate until it really is impressive. Bad
  mockups waste the owner's time; ambition is the point.
- Do not touch anything outside `notes/research/start-menu-mockups/`.
  Do not commit.
