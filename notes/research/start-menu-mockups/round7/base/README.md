# Round 7 base

Shared CSS/JS for every round-7 page mockup. Built from the agreed baseline
`round6/logo-3.html` (sky, weather, game clock, wordmark 3, Lykta panel,
Profile box, glass buttons, quote A, almanac), with the wordmark's inlay
changed to cyan metal. Throwaway mockup code; copy freely between mockups.

Include it by relative path from a sibling folder:

```html
<link rel="stylesheet" href="../base/base.css">   <!-- also loads the Google fonts -->
<script src="../base/base.js"></script>             <!-- defines window.WC -->
```

Reference pages in this folder: `gallery.html` (every component in a large
box on the sky; `?page` opens it directly) and `ingame.html` (both window
frames over the real game view; `?bg=paper`). The round-7 layout review
(`../layout/`) shows how a content-heavy page opens.

## Two page modes

**Start page / sub-pages on the sky**

```js
WC.sky.start();                         // scene canvas, vignette, grain, almanac (bottom right), DEMO panel, frame loop
const menu = WC.startMenu({             // #stage: #brand (full wordmark), #menuPanel, #quote
  onActivate(key) { if (key === 'profile') { open(); return true; } },  // keys: enter profile scripts history spotlights credits about
});
WC.decorate();                          // brackets / hood / Back for every .lp in the page
```

`menu` = `{ stage, brand, panel, quote, wordmark, items, select(i), cur, active, flash(msg) }`.
Set `menu.active = false` while a page is open (hover/click on the hidden
menu stop). Unhandled items flash "… — not in this mockup".

**In-game (editor windows)**

```js
const ig = WC.ingame({ bg: 'dark' });   // backdrop = real screenshot, DEMO gets Dark/Paper; ?bg=paper
WC.window(el, { title: 'Profile', note: 'Gibur', x, y, w, h });
ig.markBar('profile');                  // gold underline under the bar icon of an open window ('profile' | 'scripts')
```

No sky in this mode. On Paper the body gets `.paper` (all components turn
light) and `.paper-bg` (window frames turn bronze). The phone has no
windows (as in the app); show phone versions of editors as start-page boxes.

## CSS classes

| Class | What |
|---|---|
| `.lp` + `data-hood="Title"` / `data-hood=""` + `data-back` | The Lykta box (stone-iron frame, riveted brackets, glossy hood, Back top left). `WC.decorate()` builds the parts. Content goes in a child `.win` (the lit glass window). |
| `.box-normal` | Sub-page box like round 6's Profile page: centred, top `clamp(150px,26vh,270px)`, max 820 px. |
| `.box-large` | Content-heavy page: fixed, inset `--box-top` (top) and `--box-m` (other sides; 6 px on phone). Its `.win` is a flex column: `.box-head` (fixed) · `.box-body` (scrolls, thin iron scrollbar) · `.box-foot` (fixed). Raise `--box-top` to leave room for a mark. |
| `.wm` / `.wm.small` / `.wm.bare` | Wordmark container (`WC.Wordmark(el)` draws it). Size via `--wm-w` (full: `clamp(290px,40vw,660px)`, small: 120 px). `.bare` hides COCKPIT. |
| `.ibtn` · `.primary` · `.danger` · `[disabled]` · `.small` · `.icon` | Glass buttons (frosted, lit top edge). Hover/focus brightens. Icons: an inline `<svg viewBox="0 0 16 16">` stroke icon before the label `<span>`. Hidden on phone unless `.keep-ic`. |
| `.btnrow` / `.btncol` | Button row (wraps) / column. |
| `.backbtn` | Back (made by `data-back`). Calls `WC.back()`. |
| `u.sk` | The shortcut letter inside a label: `<u class="sk">N</u>ew`. Fine lit underline, brighter on hover / `.on`. |
| `.rows > .row` · `.rows.flat` · `.row.on` · `.row .dim` | List rows (cards, or hairline-separated). Selection = `.on`: the text brightens, nothing else. |
| `.tbl` (`--cols`) `.th-row .th.sort[data-dir]` `.row .td` `.r` | Table on one grid; sortable heads show ▾/▴ via `data-dir="-1"/"1"`. |
| `.field` `.field.mono` `textarea.field` `.select` `label.lbl` | Text input / select in a glass well; small Cinzel caps label. |
| `input.chk` · `input.tog` · `label.check` | Checkbox (lit tick) · toggle (groove + riveted knob) · label wrapper. |
| `.seg > button[aria-selected]` | Segmented control / filter pills. |
| `.tabs > button[aria-selected]` | Page tabs, fine lit underline on the active one. |
| `.form` | Auto-fill grid for fields (min 240 px columns). |
| `.code > .code-gut + pre.code-src > .code-line(.cur)` | Monospace code surface (JetBrains Mono). Tokens: `.tk-k` keyword `.tk-s` string `.tk-c` comment `.tk-n` number `.tk-f` function `.tk-v` variable `.tk-o` operator. Paper variant included. |
| `.h-page` `.h-sec` `.lead` `.txt` `.kv` (dl) `.empty` `.orn-rule` `.hr` `.stars` `.gold` `.muted` `.faint` `.ok` `.bad` `.mono` | Text helpers. |
| `.flash` (+ `.static`, `.fail`) | Message line; `WC.flash(el, msg)` shows it. |
| `.wwin.win-a` | In-game window "Lyktfönster": a Lykta pane as a window (5 px iron band, small riveted brackets, centred hood with the title and a dim note, small iron X on the band, opaque lamp-lit window). |
| `.wwin.win-b` | In-game window "Glasfönster": the start-page box family (7 px stone-iron frame, big brackets) with a frosted glass title bar (title left, note, glass X right) and the box's glass window (blurred, 90 % opaque). |

Tokens worth knowing: `--c-text --c-dim --c-faint --c-item --c-on --c-head
--c-accent --c-danger` (all components read these; `.paper` redefines them),
`--box-m --box-top --win-fill --win-fill-large`, `--ts` (motion scale).

## JS helpers (`window.WC`)

| Helper | What |
|---|---|
| `WC.sky.start(opts)` | `{ almanac: true, demo: true }`. Also `WC.sky.env` (light, sky colours, weather…), `WC.sky.onFrame(fn(env,t,dt))`, `setHour(h)`, `setMonth(m)`. |
| `WC.Wordmark(el)` | A wordmark instance in a `.wm` element (canvas + COCKPIT made if missing). Any number; each follows the sky's light, draws only while visible, rebuilds when its width changes. |
| `WC.INLAY` | The inlay colours `{ day, night, rivet }` — **the one place to change the cyan tint**. A page can set `window.WC_INLAY = {…}` before loading base.js. |
| `WC.startMenu(opts)` | See above. `opts.profile` sets the dim name after Scripts (default `gibur`). |
| `WC.decorate(root?)` | Builds brackets, hood and Back for `.lp` boxes (idempotent). |
| `WC.keys.push({ key(e), back() })` | Keyboard layer; returns a pop function. The top layer gets keys; `key()` returns true when handled; unhandled Esc/Backspace call `back()`. In text fields only Esc reaches the stack (it blurs first). Keys are swallowed while `WC.busy` is true (set it during transitions). |
| `WC.back()` | `back()` of the top layer (the Back button calls it). |
| `WC.list(root, opts)` | ↑↓ PgUp PgDn Home End Enter/Space over `opts.item` (`.row`) elements: `{ onActivate(i,el), onChange(i,el), hover, activateOn: 'dblclick'|'click', wrap }` → `{ i, items, key(e), set(i), refresh() }`. Call `refresh()` after re-rendering rows. |
| `WC.shortcut(e, { n: fn, … })` | Letter shortcuts (no modifiers); true when one fired. |
| `WC.flash(el, msg, { kind, ms })` · `WC.toast(html)` | Messages. |
| `WC.window(el, opts)` | Movable/resizable in-game window → `{ el, body, focus(), close(), rect }`. Drag the title bar to move, edges/corners/grip to resize (pointer events: pen and touch too), min 340×220, kept inside the viewport. A press inside focuses and raises it; a press outside unfocuses (frame dims, content 55 %), as in the app. Esc closes the focused window unless a layer above handles it. `onClose` defaults to hiding it. |
| `WC.dur(ms)` · `WC.wait(ms)` · `WC.TS` · `WC.RM` | Durations scaled by `?slow=N` and reduced motion (×0.2). Use them for every transition. CSS: `calc(.4s * var(--ts))`. |
| `WC.rect(el)` · `WC.flyTo(from, to)` | Layout box ignoring transforms; the transform that moves box `from` onto `to` (FLIP). |
| `WC.el(tag, attrs, html)` · `WC.demoExtra(html)` · `WC.util` | Small helpers; extra DEMO-panel controls. |

URL parameters: `t` hour, `m` month, `s` season, `w` weather, `p` moon phase
(as round 6), `fast`, `rm` (reduced motion), `slow=N`, `nointro` (no load
fade; for screenshots), `demo` (panel open), `q` quote index, `sel` menu
item, `bg=paper` (in-game).

## In-game backdrop

`ingame-dark.jpg` and `ingame-paper.jpg` (1440×900, JPEG q80) are real
screenshots of the app (dev server, `?fixture=gmcp-demo.log`, map pane on;
Paper = `appearance.bg #f4ecd8` with the paper ANSI palette, as
`tests/e2e/appearance.spec.ts`). Game text on the left (x 0–935), map top
right, Timers / Group / Comm Lykta panes bottom right (x ≥ 942, y ≥ 514),
the menu bar bottom centre-right (y ≈ 883; icons weather 740, profile 782,
scripts 807, layout 832, settings 857, fullscreen 892, power 917). The
backdrop is scaled to cover and anchored bottom left, so the bar and panes
stay in view at 1280×720. Place editor windows over the game text (as the
app does by default).

Today's windows (stage 30, `src/chrome/kit/window.css`, ADR 0103): thin
cyan border, slim one-cell title bar (title left, X right), grip bottom
right, opaque terminal background; geometry in whole cells. The base's two
frames replace the look; behaviour (drag bar, 8 resize bands, grip, focus
dims, X = Esc) is kept.

## Notes for page agents

- Every page = a box (`.lp`) with Back top left (`data-back`) and Esc; no
  key-hint rows, no lanterns, selection only brightens text.
- Content-heavy pages use `.box-large`; how the wordmark gives way is the
  open question in `../layout/` (A corner mark, B none, C name plate). Until
  the owner picks, use plain `--box-top: var(--box-m)` or copy one layout.
- The large box's window is 68 % opaque over the sky (`--win-fill-large`)
  for legibility; the menu panel stays at 58 %.
- Performance: a near-fullscreen `backdrop-filter` over the animated sky is
  heavy; the build should consider a static blurred snapshot behind large
  boxes, or pausing the sky while one is open.
