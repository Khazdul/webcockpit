# Stage 42 — The shared base for the look pages

Status: **Next** (planned 2026-11-07; wave 1 of the broad pass, on the
integration branch `stage-41-start-page`; nothing merged to main until the
owner has tested the whole of stages 42–47).

## Goal

One shared base that every remaining start-menu page builds on, so that
the five wave-2 stages (43 Profiles, 44 Scripts, 45 History, 46
Spotlights, 47 Credits and About) can run in parallel worktrees **without
editing a shared file**. Stage 42 ships:

1. **Layout B "Rummet växer"** (the owner's choice for big pages): the menu
   panel (or a normal box) grows into a large box that nearly fills the
   window; the wordmark lifts and fades, the quote and the almanac fade;
   Back / Esc reverses it. Plus the box variants the pages asked for
   (slots, a width cap, a tall normal box, the box swap between two large
   pages, a settled signal).
2. **Places**: the same look frame runs on the start page, in an in-game
   window and on the phone's ESC menu, and the kit adapts (`useLookPlace`).
3. **The in-game window frame** in the new look: **Lykta**, on dark and
   Paper, one frame for every window and every sub-page in it (owner,
   2026-11-07); the top frame sets the title and note (`useWindowChrome`).
4. **The kit**: controls and widgets, dialogs and overlay frames,
   popovers, list / grid / button cursors, shortcut letters, the Esc rule
   for fields, icons, tokens (dark and Paper).
5. **Code and manuals**: the lantern CodeMirror theme, the lantern find
   panel (`search.ts`) and one shared DOM manual reader (`LookManual`),
   used by both the profile editor (43) and the script pages (44).
6. **The player core** for stages 45 and 46: h:mm:ss, the run log player's
   Back, the `openPlayer` result, the embedded bare player.
7. A **dev-only kit gallery** (`?kit`) that shows every part working, so
   wave 2 starts from proven parts.

No user-facing page changes its content in this stage. What the owner can
see after it: the gallery, the new in-game window frame around today's
TUI content, and the run log player's Back and h:mm:ss.

## References

Read first: `CLAUDE.md`, `progress.md` (top), this file, then:

- `notes/research/start-menu-mockups/README.md`: "Baseline", "Night pass
  (2026-11-07)", "Round 7 decisions (owner, 2026-11-07)".
- `notes/research/start-menu-mockups/NIGHT-PASS.md` (decisions 3–6).
- `docs/stages/41-start-page.md`; ADR 0123 (Lykta panes), 0124 (start
  sky), 0125 (start surface and the lantern kit, with its addenda), 0126
  (wordmark and favicon).
- Mockups (throwaway code over a simplified DOM; never copy them, re-derive
  the look in the app's structure):
  - `round7/layout/b-room.html` — layout B: the open / close choreography
    and its timings (below).
  - `round7/base/README.md`, `base.css`, `base.js`, `gallery.html` (every
    component), `ingame.html` (the window frames over real game
    screenshots, `?bg=paper`; only the Lykta frame, `win-a`, is built).
- The five wave-2 stage files (`43-profile-pages.md` … `47-credits-about.md`),
  each ending with "Uses from stage 42": this stage's API is their union.

Current code this stage extends (read before changing it):

| Area | Files |
|---|---|
| Lantern kit | `src/chrome/kit/look.tsx`, `look.css` (`lookFrame`, `Scenery`, `Box`, `BackButton`, `GlassButton`, `KeyLabel`, `Icon`, `LookFlash`, `letterOf`, `letterAt`) |
| Start surface | `src/chrome/start-surface.tsx`, `start.css`, `src/start/geometry.css`, `src/chrome/frames/start-main.tsx`, `src/start/sky/index.ts` (`StartSkyHandle`), `src/start/wordmark.tsx`, `wordmark-svg.ts` |
| Frame stack | `src/chrome/kit/stack.tsx` (`FrameStack`, `Nav`, `useKeys`, `useUnsaved`, `wrap`, `frameAttrs`), `nav.ts` (`navKey`), `hooks.ts` (`ChromeServices`, `GridCtx`) |
| Windows | `src/chrome/kit/window.tsx`, `window.css`, `window-geom.ts`, `src/chrome/windows.tsx` (`WindowsSurface`, `WinStack`, `ProfileRoot`) |
| ESC menu (phone) | `src/chrome/index.tsx` (`MenuSurface`, `menuRoot`) |
| Editors | `src/editor/cm.ts` (`theme()`, `BufferOptions`), `search.ts` (`searchExtension`, the TUI panel), `help.ts` (`HelpSection`), `manual-search.ts` (pure find helpers) |
| Player | `src/player/view.ts` (`PlayerView`, `PlayerViewOptions`), `strip.ts` (`fmtClock`), `player.css`, `src/app/player-host.ts` (`PlayerHost`, `PlayerOpenOptions`), `src/app/shell.ts` (`openPlayer`, `startPlayer`, `openSpotlights`, `playerHost`) |

## Decisions (recorded in ADR 0127)

### Layout B, built so pages measure their real size

The mockup animates the page box's left/top/width/height with its content
hidden but still laid out, which would re-run every container query and
CodeMirror measure on every frame. The build splits the two:

- **The new frame is laid out at its final size from its first frame**
  (hidden: `visibility: hidden` on its box, keys already routed to it), so
  container queries, CodeMirror and the book's pagination measure the real
  box at mount.
- **A morph proxy** (`.wc-lk-morph`: an empty iron frame with its four
  brackets and the hood, `position: fixed`, `contain: strict`, owned by
  the start surface) carries the motion from the old rectangle to the new
  one. When it lands, the real box shows under it (same rectangle, same
  frame), the proxy is removed, and the content fades in.
- **Choreography** (from `b-room.html`; one clock; `fill: forwards`; all
  timings in `src/chrome/kit/look-motion.ts`):

  | step | opening (menu → large) | closing (large → menu) |
  |---|---|---|
  | menu items | fade out 200 ms | fade in 260 ms after the shrink |
  | wordmark | lifts 46 px and fades, 620 ms, `cubic-bezier(.5,0,.5,1)`, from 0 | settles back, 700 ms, delay 320 ms, `cubic-bezier(.3,.7,.3,1)` |
  | quote, almanac | fade out 350 ms | fade in 350 ms after the shrink |
  | box (proxy) | grows from the panel's rect, 780 ms from 200 ms, `cubic-bezier(.55,0,.15,1)` | the content fades 240 ms, then the proxy shrinks to the panel, 680 ms |
  | hood | 74 px wide until 25 %, then to its width | back to 74 px by 75 % |
  | content | fades in 320 ms once the box has landed | — |
  | reduced motion | a 260 ms cross-fade; nothing grows or lifts | a 240 ms fade |

  The wordmark's lift is `transform` and `opacity` only (the mockup's
  `blur(3px)` filter goes: a filter on the masked wordmark costs frames).
- **The same mechanism** serves every pair: menu → large, normal → large
  (the Profile list → the profile editor; the 0.62 wordmark lifts away),
  large → normal, normal → normal of another size (the Profile list → the
  import page: the box stays, its height morphs 380 ms, the content
  cross-fades), and the **box swap** (below). Menu → normal stays as
  stage 41 built it.
- **Keys go to the new frame at once** (no busy state); a Back or Esc
  during a morph reverses it from where the proxy is. Old-look (grid)
  frames get no morph (they cover the sky as today).
- **The stack's hold** (42c): the frame below stays drawn for the
  opening's first 200 ms (inert) and a popped frame stays mounted for the
  closing's 240 ms fade (inert, out of the key path), so both fades are
  real. The surface asks for it through `FrameStack`'s `hold` prop.
- **Scenery `large`** now means layout B: no wordmark, no almanac, no quote
  while a large box is open (stage 41's "small wordmark in the corner" for
  `large` goes).
- **The box swap**: when the top frame changes from one large box to
  another (push or pop), the box stays. The hood's title cross-fades
  (200 ms), the old content fades out (140 ms, through the hold) and the
  new one in (220 ms). Two different widths (History's cap → the Export
  editor's full width) morph the proxy between the rects (380 ms). Used
  by History → Statistics / Export (45, 43) and the Profile editor's own
  pages.
- **The width cap** (`maxWidth`, History): the large box stops at that
  width, centred; the sky shows on both sides; height as layout B.
- **The tall normal box** (`tall`, the import receipt): a normal box that
  grows downward to the window's bottom margin; on the phone the
  wordmark hides for it.
- **Settled**: `useBoxSettled()` is false from the frame's mount until its
  content has faded in (or at once with reduced motion and in windows and
  the ESC menu), then true. Pages that measure (Spotlights' columns,
  Credits' pagination) wait for it; a later resize is the page's own
  `ResizeObserver`.

### Places

`LookPlace = 'start' | 'window' | 'menu'`, provided by the host of each
frame stack (`LookPlaceCtx`), read with `useLookPlace()`. `Box` adapts:

- `start`: the iron box over the sky, the hood with the title, Back at the
  top left (with `onBack`), layout B.
- `window`: no iron box, no hood, no Back: the window frame is the box and
  its title bar carries the title (`useWindowChrome`). The same slots and
  the same content container. Sub-pages place `InlineBack` themselves
  (rendered only in a window and only when the frame is not the stack's
  root).
- `menu` (the phone's ESC menu, full screen): a full-screen Lykta frame
  over the opaque background (dark or Paper), the hood with the title,
  Back at the top left; no sky (it is the game behind). Old-look frames in
  the ESC menu stay as they are.

Every place's content box (`.wc-lk-win`) is a flex column with
`min-height: 0` and an inline-size container named `wc-page`, so pages
lay themselves out by their own width, never by the device.

### In-game windows

- **One frame, Lykta**, re-derived from the base's `.wwin.win-a` (5 px
  iron band, small riveted brackets, centred hood with title and dim
  note, small iron X, opaque lamp-lit body), with a bronze Paper variant
  (`data-light` on `.wc-windows`, as today). Owner decision 2026-11-07
  ("the Profile page and the Scripts page, with their sub-pages, can all
  have the same frame, the direction's own"): every in-game window for
  Profile and Scripts and all their sub-pages (Profile editor, Import,
  Export; Scripts page, script editor, manual) uses this one frame, the
  frame of both chosen directions (Profile editor B, Scripts page C). The
  window never switches frame when a sub-page opens. The mockups' Glass
  window (`.wwin.win-b`) is dropped from scope: there is no look type, no
  look prop and no `data-look`.
- The top frame of a window's stack sets the title and note with
  `useWindowChrome({ title?, note? })` while it is on top (as
  `useScenery`), reverting when it pops. Defaults: Profile title
  "Profile", note the profile name; Scripts title "Scripts".
- Behaviour is unchanged (ADR 0103): the bar drags, 8 edges and the grip
  resize, focus follows presses, without focus the frame dims and the
  content goes to 55 %, the X is the close request, geometry in whole
  cells stored in `settings.windows`. The minimum stays in cells and must
  give at least 360 × 260 CSS px at the default cell size.
- The body is free DOM for look frames (they fill it) and a whole-cell
  grid for old-look frames (`floor` of the body's px, the grid centred),
  through the same `wrap` / `frameAttrs` props the start surface uses.
- **No `backdrop-filter` in windows**: the game text scrolls under them all
  the time. The Lykta body is opaque.
- The old cyan window border goes: Lykta replaces it (owner, 2026-11-07:
  "Vi ersätter cyan ramen").

### Kit rules (owner's baseline, unchanged)

No key-hint rows anywhere; a shortcut is the letter marked inside its
label; selection only brightens (no glide, glow or sweep); Back at the top
left of every sub-page, Esc does the same; glass buttons never take the
DOM focus (the stack keeps it); no lanterns.

### Tokens

One set of custom properties, `--lk-*`, defined in
`src/chrome/kit/look-tokens.css` on `.wc-look` (the start surface root,
window bodies of look frames, the menu host, the player's Back), with the
Paper values under `[data-light] .wc-look` and `.wc-look[data-light]`. The
mockup's `--c-*` names are not used (they clash with the app's TUI theme:
`--c-item`, `--c-hint`, `--c-cursor`). The list is in the API below. The
mithril inlay tokens come from the wordmark's own constants (one source;
a unit test compares them).

### Performance rules (every stage 42–47 follows them)

- **Large boxes over the moving sky**: the large window keeps the normal
  box's blur (`backdrop-filter: blur(9px)`, 0.68 fill) **only if measured
  cheap**: on a production build, Iris Xe, Chromium and Firefox, 1728×1000
  @2 and 390×844 @3 (`bench/start-page-bench.ts` with a large box open
  from the gallery), within 2 fps of the menu page and no long frame
  (> 50 ms). Otherwise (decided in advance) the large window has no
  `backdrop-filter` and a 0.84 fill. The numbers go in ADR 0127.
- **The sky behind a large box keeps running** (it shows at the margins
  and around a capped box) at a calmer rate: when a large box covers
  ≥ 85 % of the view, the engine caps every layer at its 30 Hz tier,
  rain and snow included (`StartSkyHandle.setRate('calm')`, new).
- **`useSkyPause(true)`** pauses the sky fully while an opaque surface
  covers the box (the Spotlights viewer, 46).
- **No `backdrop-filter` on inner surfaces**: lists, tables, code wells,
  the export log, cards, book pages, wells and dialogs' veils are solid or
  plain translucent fills. Small glass pieces (buttons, the editor's tool
  pill) may blur.
- **Transitions** animate the proxy (geometry of an empty element) and
  `opacity` / `transform` of content; nothing re-lays out a page during a
  morph. Target: no frame over 16 ms during a morph at 1728×1000 @2.
- **Chunks**: the kit stays in the chrome chunk; CodeMirror and the
  manual stay in the lazy editor chunk; the gallery is not in a normal
  build. Record the chunk sizes before and after; targets: the start chunk
  and the first paint unchanged; the chrome chunk ≤ +15 KB gzip for 42a–d
  together; the editor chunk ≤ +8 KB; the player chunk ≤ +2 KB; the
  exported HTML replay ≤ +1.5 KB gzip (it carries `player.css`).
- **Measure a build**, never the dev server (ADR 0125 addendum).

### Reduced motion, phone, keyboard, Paper

- **Reduced motion**: no growth, slide, lift, clip or zoom anywhere in the
  kit; fades ≤ 260 ms. One helper, `useReducedMotion()`, replaces the
  copies of `reducedMotion()` in the kit (the wordmark's own may stay).
- **Phone** (≤ 600 px): `--lk-box-m: 6px`, the large box inside the safe
  areas, the wordmark hidden for large and tall boxes. Coarse pointers
  (`@media (pointer: coarse)`): every kit target (buttons, rows, chips,
  seg options, fields) at least 40 px high. Glass buttons drop their icons
  on the phone unless `keepIcon`. Nothing depends on hover (the first tap
  highlights). Fields stay above the soft keyboard (`useKeyboardInset`).
- **Keyboard**: Esc order everywhere: a key layer (popover, inline dialog)
  → the frame's own handler → a focused text field blurs (the Esc rule) →
  back. Tab rings are the page's (`useButtonZone`). Letters fire only
  outside text fields (`letterAction`).
- **Paper**: the start page is always dark (the sky); windows and the ESC
  menu follow the game background (`isLight(settings.appearance.bg)` →
  `data-light`). Every kit part has its Paper look, shown in the gallery.

## API (canonical names)

Everything below is exported from `src/chrome/kit/look.tsx` (a barrel over
the module files) unless another file is named. Wave-2 stages import from
these modules and never edit them; a missing piece goes into the stage's
own files as a local helper and is reported for wave 3.

### Box, places, scenery (42a)

```ts
lookFrame(c), isLookFrame(node)                        // unchanged
type Scenery = 'main' | 'sub' | 'large' | 'grid';      // 'large' = layout B: no wordmark, almanac or quote
useScenery(s)                                          // unchanged
type LookPlace = 'start' | 'window' | 'menu';
const LookPlaceCtx: Context<LookPlace>;                // default 'start'; provided by 42d in windows and the menu
useLookPlace(): LookPlace;
interface BoxProps {
  title?: string;            // the hood; may change between renders (cross-fades); none: the plain plate
  size?: 'normal' | 'large';
  tall?: boolean;            // normal only: grows downward to the window's bottom margin
  maxWidth?: number;         // large only: CSS px; stops there, centred
  onBack?: () => void;       // a sub-page: Back top left (start, menu); may change between renders
  label?: string; class?: string; winClass?: string;
  children?: ComponentChildren;
}
Box(p: BoxProps)
BoxHead({ class?, children })                          // fixed at the top of the window
BoxBody({ class?, scroll? = true, bodyRef?, children }) // fills, scrolls natively, thin iron scrollbar
BoxFoot({ class?, children })                          // fixed at the bottom
useBoxSettled(): boolean
BackButton({ onClick })                                // unchanged
InlineBack({ label? = 'Back', onClick? = nav.pop })    // the small Back for a window sub-page
// src/chrome/kit/look-motion.ts
useReducedMotion(): boolean; reducedMotion(): boolean; MOTION: { … the table above … }
// src/chrome/start-surface.tsx
useSkyPause(on: boolean): void                         // no-op outside the start surface
LookWordmark({ size: 'small' | 'full', class? })       // the wordmark inside page content (follows the sky's light)
// src/start/sky/index.ts
StartSkyHandle.setRate(r: 'full' | 'calm'): void
```

### Controls and widgets (42b) — `look-controls.tsx`, `look-icons.tsx`, `look-tokens.css`, `look-glass.css`

```ts
interface GlassButtonProps {
  label?: string;            // none: icon-only (then `title` is required)
  letter?: string; icon?: IconName | IconDraw; iconAfter?: boolean; keepIcon?: boolean;
  id?: string;               // data-btn
  selected?: boolean;        // the keyboard's button (.is-sel)
  disabled?: boolean; danger?: boolean; primary?: boolean; small?: boolean;
  title?: string; onClick: () => void;
}
GlassButton(p)
interface SegOption { value: string; label: string; letter?: string; icon?: IconName | IconDraw; title?: string; disabled?: boolean; id?: string }
Seg(p: { options: SegOption[]; label: string; kind?: 'seg' | 'pills';   // pills: scroll sideways, the chosen one kept in view
         selected?: number;                                            // the keyboard's option (.is-sel)
       } & ({ multi?: false; value: string; onChange(v: string): void }
          | { multi: true; values: readonly string[]; onChange(v: string, on: boolean): void }))
         // single: role=radiogroup, options role=radio + aria-checked; multi: options role=checkbox + aria-checked
Tabs(p: { tabs: SegOption[]; value: string; onChange(v: string): void; label: string })
Field(p: { value: string; onInput(v: string): void; onCommit?(v: string): void; label?: string; id?: string /* data-field */;
           mono?: boolean; error?: string | null; hint?: string; placeholder?: string; maxLength?: number;
           autoFocus?: boolean; selectAll?: boolean; inputRef?: Ref<HTMLInputElement> })
TextArea(p: same as Field + { rows?: number; inputRef?: Ref<HTMLTextAreaElement> })
Check(p: { checked: boolean; onChange(on: boolean): void; label: string; id?: string })
Toggle(p: { on: boolean; onChange(on: boolean): void; label: string; id?: string })   // groove + riveted knob, "On / Off"
Select(p: { value: string; options: { value: string; label: string }[]; onChange(v: string): void; label: string; id?: string })
Table(p: { cols: string /* grid-template-columns */; heads: { key: string; label: string; sort?: boolean; align?: 'end' }[];
           sort?: { key: string; dir: 1 | -1 }; onSort?(key: string): void; stackBelow?: number /* px: two-line rows */; children })
TableRow(p: { on?: boolean; id?: string; onClick?(); onDblClick?(); children })        // cells: .wc-lk-td
Rule(p: { title: string; children? /* right-hand button */ })    // a section heading with a hairline
OrnRule()                                                        // a thin rule with an open diamond
Fold(p: { open: boolean; onToggle(): void; label: string; children? })
Well(p: { mono?: boolean; class?: string; children })
Stars(p: { n: number; max?: number })
LookFlash(p: { class?: string; flash?: Flash | null })          // controlled when `flash` is given, else the stack's
useLocalFlash(): [Flash | null, (text: string, kind?: FlashKind, ms?: number) => void]
useKeyboardInset(): number                                       // px the soft keyboard covers (visualViewport)
Seal(p: { size?: number })                                       // the "M" mark (the favicon's drawing)
type IconDraw = { draw: ComponentChildren; box?: number };       // a page's own line icon
Icon(p: { name: IconName } | IconDraw & { class?: string })
```

Icon names (`IconName`), all line icons, `stroke: currentColor`:
existing `door person scroll hourglass star quill info back check plus
pencil rename import export trash`; new `book save find duplicate reset
lock fold up down prev next close play pause start back10 fwd10 display
fullscreen filter stats backup restore help action alias highlight macro
substitute exclude include comment title html text folder drop`.
Spotlight kind icons are not copied: 46 passes `kindIcon` from
`src/player/icons.ts` as an `IconDraw`.

CSS classes (in `.wc-look`): rows `.wc-lk-rows` (`.is-flat` hairline
rows) `> .wc-lk-row` with `.is-on` (the chosen row: the text brightens),
`.is-idle` (chosen but the keyboard is elsewhere: dimmer), `.is-cur` (the
fine tick of the keyboard's zone); `.wc-lk-scroll` (thin iron native
scrollbar); text helpers `.wc-lk-sec` (section head), `.wc-lk-lead`,
`.wc-lk-txt`, `.wc-lk-kv` (a `dl`), `.wc-lk-empty`, `.wc-lk-dim`,
`.wc-lk-faint`, `.wc-lk-gold`, `.wc-lk-ok`, `.wc-lk-bad`, `.wc-lk-mono`,
links (`a` inside `.wc-look`, lit and underlined).

Tokens: `--lk-text --lk-dim --lk-faint --lk-item --lk-on --lk-head
--lk-accent --lk-danger --lk-ok --lk-soon --lk-gold --lk-well
--lk-well-edge --lk-rule --lk-win-fill --lk-win-fill-large`; type
`--lk-display` (Cinzel) `--lk-serif` (Cormorant Garamond) `--lk-sc`
(Cormorant SC) `--lk-mono` (the user's terminal font); geometry
`--lk-box-m`; inlay `--lk-inlay-hi --lk-inlay-mid --lk-inlay-lo
--lk-inlay-ink --lk-rivet-hi --lk-rivet-mid --lk-rivet-lo`; motion
`--lk-ts` (1, or 0.2 with reduced motion).

### Overlays, cursors, letters, keys (42c) — `look-overlay.tsx`, `look-cursor.ts`, `look-keys.ts`, `stack.tsx`

```ts
// stack.tsx
interface Nav { push(node: VNode, opts?: { overlay?: boolean }): void; … }  // overlay: the frame below stays drawn, veiled and inert
FrameStackProps.hold?: (from: VNode, to: VNode, dir: 'push' | 'pop') => number   // ms the frame below / the popped frame stays drawn
useKeyLayer(handler: KeyHandler, active?: boolean): void   // a layer over the frame's handler (popover, inline dialog); top layer first
// The Esc rule (look frames only): an Esc the frame's handler does not consume, pressed in a text
// field (input, textarea, contenteditable) inside the frame, blurs it and returns the focus to the
// stack host; it does not pop. Ctrl+S / Ctrl+F / Ctrl+H already reach the frame's handler from fields.

// look-overlay.tsx
interface DialogButton { id: string; label: string; letter?: string; primary?: boolean; danger?: boolean; disabled?: boolean; run(): void }
Dialog(p: { title: string; dlg: string /* data-dlg */; buttons: DialogButton[]; onCancel(): void;
            error?: string | null; anyKeyCancels?: boolean; inline?: boolean /* inside a frame, not an overlay frame */;
            width?: number; children })
   // a small Lykta box centred over the box or window content below, a dim veil; keys: its letters,
   // Enter = the primary, Tab / ← → walk the buttons, Esc = onCancel (any other key too with anyKeyCancels)
KeyHelp(p: { rows: [keys: string, what: string][] })   // a two-column keys list (content of a Dialog)
openKeyHelp(nav: Nav, title: string, rows: KeyHelp['rows']): void
Popover(p: { anchor: () => HTMLElement | null; onClose(): void; label: string; children })
   // anchored to a button; Esc and a click outside close it; data-wc-own-keys when it holds controls

// look-cursor.ts
useListCursor(o: { count: number; page?: number /* 10 */; wrap?: boolean; initial?: number;
                   activateOn?: 'click' | 'dblclick'; touch?: 'tap-activates' | 'tap-selects';
                   onChange?(i: number): void; onActivate?(i: number): void })
  → { i: number; set(i: number): void; key(e: KeyboardEvent, nk: NavKey | null): boolean;
      rowProps(i: number): { onPointerMove; onClick; onDblClick; 'data-i': number }; scrollRef: Ref<HTMLElement> }
      // scrolls the cursor into view after a key, never after a pointer move
useGridCursor(o: same as useListCursor + { columns(): number })   // 2D arrows over a wrapping grid
useButtonZone(o: { ids: readonly string[]; enabled(id: string): boolean; wrap?: boolean })
  → { zone: 'list' | 'buttons'; sel: string | null; key(e, nk): boolean; reset(): void }
      // Tab / Shift+Tab list ↔ buttons, ← → (and ↑ ↓) walk the buttons, skipping disabled; Enter presses

// look-keys.ts
letterOf(e), letterAt(label, letter), KeyLabel({ text, letter, class? })   // unchanged
letterAction(e: KeyboardEvent, map: Record<string, () => void>): boolean     // fires only outside text fields
```

### Window frames (42d) — `window.tsx`, `window-chrome.ts`, `windows.tsx`, `index.tsx`

```ts
// One frame (Lykta, dark and Paper): no look type and no look prop.
// WindowFrameProps unchanged (id, title, titleNote, rect, grid, cellW, cellH, z, focused, onRect, onClose)
useWindowChrome(c: { title?: string; note?: string }): void   // no-op outside a window
// windows.tsx: look frames inside a window get place 'window', a free body and the tokens;
//   old-look frames get the cell grid; ProfileRoot moves to src/chrome/frames/profile-window.tsx (verbatim).
// index.tsx: look frames in the phone ESC menu get place 'menu' (full-screen Lykta page over the opaque background).
```

Test hooks: `.wc-win[data-win][data-focused]`, `.wc-win-t` (title),
`.wc-win-n` (note), `.wc-win-x`, `.wc-win-body`. No `data-look`: there is
one frame.

### Code and manuals (42e) — `src/editor/look-code.ts|css`, `cm.ts`, `search.ts`, `look-manual.tsx|css`, `look-manual-find.ts`

```ts
// look-code.ts
lookCodeTheme(): Extension      // --lk-mono, line height in px, gutter, soft current line, selection, caret,
                                // match marks, lint marks; dark and Paper from the host's tokens
const LOOK_CODE_CLASS = 'wc-code'   // the buffer host's class; token colours (tt++ wc-syn-*, Lua
                                    // wc-lua-kw|str|comment|num|std) and lint / match rules keyed on it
// cm.ts
BufferOptions.look?: 'tui' | 'lantern'      // default 'tui' (today's editors unchanged until 43 and 44)
// search.ts
SearchOptions.look?: 'tui' | 'lantern'; SearchOptions.top?: boolean
   // lantern: a Field, `n of m` (.wc-search-count), Case / Word / Regex toggles, prev / next / close
   // icon buttons, a Replace row (Replace, All) when editable; keys and searchFrameKey unchanged

// look-manual.tsx
interface ManualCtl { goto(i: number): void; section(): number; key(e: KeyboardEvent, nk: NavKey | null): boolean;
                      openFind(): void; findOpen(): boolean; closeFind(): boolean }
LookManual(p: { sections: readonly HelpSection[];
                contents: 'own' | 'none';     // own: the contents list at the left (an overlay under 700 px)
                find: 'head' | 'bar';         // head: always in the head (script manual A); bar: opened by Ctrl+F (profile Help)
                groups?: Readonly<Record<string, string>>;      // group id → label ("API reference")
                initial?: number; onSection?(i: number): void; ctl?(c: ManualCtl | null): void;
                example?(line: string): ComponentChildren;      // highlighted example lines (tt++ or Lua)
                link?(text: string): number | null;             // a text that links to a section (the Lua index)
                memory?: FindMemory })                          // the find query kept across opens
ManualContents(p: { sections; groups?; current: number; onGo(i: number): void; counts?: boolean })
   // the grouped, folding contents list with counts and the current section lit (the profile editor's rail uses it in Help)
// look-manual-find.ts (pure): findInSections(sections, query, cap = 1000) → matches, count text as today
```

Manual keys (both hosts): ↑↓ scroll (or the contents when it has the
keys), PgUp / PgDn, Space / Enter a page, Home / End, n / p next / previous
heading, Tab switches contents ↔ text, Ctrl+F find (Enter / F3 / Ctrl+G
next, Shift previous, Alt+C/W/R toggles), Esc: the contents overlay, then
a non-empty find, then the host. Matches are marked with the CSS Custom
Highlight API, a `<mark>` fallback where it is missing; sections laid out
lazily (`content-visibility: auto`); the scroll spy never reads layout per
scroll event.

Hooks: `.wc-lk-manual`, `.wc-lk-mtoc li[data-i]` (`.is-on`),
`.wc-lk-mtext section[data-i]`, `.wc-lk-mfind input`, `.wc-search-count`.

### Player core (42f) — `view.ts`, `strip.ts`, `player.css`, `player-host.ts`, `shell.ts`, `hooks.ts`

```ts
// strip.ts
fmtClock(ms: number, hours = false): string          // hours: h:mm:ss from one hour, mm:ss below; false: today's MM:SS
// view.ts — PlayerViewOptions additions
hours?: boolean;                 // the time readout, the rail's hint and tips (run log player, Spotlights: true; replay: false)
back?: { title: string };        // Back at the top left in the kit's look, part of the chrome (auto-hides), calls onEsc
bare?: boolean;                  // no header, rail, control box, hint, tip or auto-hide; keys, pause cursor, wheel, clicks stay
PlayerView.press(act: 'start' | 'back' | 'play' | 'fwd' | 'slower' | 'faster'): void   // 'play' resumes from the cursor line as Space
// player-host.ts
PlayerOpenOptions.view gains 'hours' | 'back' | 'bare'
PlayerHost.viewerControls(displayOnly: boolean): ViewerControls      // public (the Display popover)
PlayerHost.setPaletteTweak(t: Readonly<Record<number, string>> | null): void   // ANSI index → colour, only while the viewer theme is Default
// hooks.ts (ChromeServices) and shell.ts
type PlayerOpenResult = { ok: true } | { ok: false; error: string };
openPlayer?: (session: Session) => Promise<PlayerOpenResult>;        // the run log player: Back + hours on
embedPlayer?: (slot: HTMLElement) => Promise<PlayerHost | null>;     // a host mounted in `slot` (fills it, follows its size);
   // the start page stays shown; the shell tracks it as playerHost and refuses a second player;
   // its close() / dispose() hand back without showing or hiding the start page
```

The Back's look comes from `src/chrome/kit/look-glass.css` (the glass
button and Back rules and the tokens they need), imported by both
`look.css` and `player.css`. The HTML replay keeps no Back and `MM:SS`
(both options off by default). `openSpotlights` stays until wave 3.
Hook: `.wc-pv-back`.

## Canonical names (what was proposed, what is chosen)

| Thing | Chosen | Rejected aliases (proposed by) |
|---|---|---|
| Place of a frame | `useLookPlace()`, `LookPlace`, `LookPlaceCtx` | `useLookHost` (44); "host" as the term (44) |
| Place-aware page | `Box` adapts to the place | `LookPage` (43) |
| Window frame | one frame, Lykta; no look type | `WindowLook = 'lykta' \| 'glass'` (dropped with Glass, owner 2026-11-07); `win-a` / `win-b`, "Lyktfönster" / "Glasfönster" as code names (43, 44, mockups) |
| Per-frame window title / note | `useWindowChrome` | — |
| Dialog | `Dialog` (`title`, `dlg`, `buttons`, `onCancel`, `inline`) | `Plate` (44), `LookDialog` with `hood`, `question`, `within`, `onEsc` (43) |
| Dialog test hook | `.wc-lk-dialog[data-dlg]` | `.wc-lk-plate[data-dlg]` (44), `.wc-pe-dialog` (43) |
| Overlay frame | `nav.push(node, { overlay: true })` | `lookDialog()` marker (44) |
| Segmented control, pills, chips | `Seg` (`kind`, `multi`) with `aria-checked` | `Segmented` (44), separate "Seg chips" (46), `aria-pressed` (43), `aria-selected` (44) |
| Text input | `Field`, `TextArea` | `TextField` (44) |
| Icon-only button | `GlassButton` without `label` (with `title`) | `IconButton` (44) |
| Section heading with hairline | `Rule` | `.h-sec` as the only form (45); `.wc-lk-sec` stays as the plain text class |
| Ornament rule | `OrnRule` | `.orn-rule` (45, 47) |
| Settled signal | `useBoxSettled()` | `onSettled` prop (46, 47) |
| Box swap | built into `Box` (no API) | "same-box swap" API (45), "large → large cross-fade" (43) |
| Controlled flash | `LookFlash({ flash })` + `useLocalFlash()` | `LookFlash({ text, kind, ms })` (43) |
| Letters | `letterAction(e, map)` | `useLetters({ … })` (43), `WC.shortcut` (mockup) |
| Button zone | `useButtonZone` | "button-zone helper" (45) |
| Keys box | `KeyHelp`, `openKeyHelp` | — |
| Manual reader | `LookManual` with `contents: 'own' \| 'none'`, `find: 'head' \| 'bar'` | `menu: 'own' \| 'none'` (43) |
| Manual contents list | `ManualContents` | — |
| Tokens | `--lk-*` | `--c-*` (43, 45, mockups), `--wc-inlay-*` (46, 47), `--wc-display` / `--wc-serif` / `--wc-mono` (44), `--box-m` |
| Inline wordmark | `LookWordmark` (start-surface) | `Wordmark size="small"` used directly (47) |
| "M" seal | `Seal` | — |
| Find panel option | `searchExtension({ look: 'lantern', top })` | — |
| Close icon | `close` | `x` (44) |
| Chevrons | `prev`, `next`, `up`, `down` | `left`, `right` (44), "chevron back" (43) |
| Duplicate icon | `duplicate` | `dup` (44) |
| OK tick | `check` (exists) | "OK tick" (43) |
| Stars | `Stars` | `.stars` (45) |
| Sky pause | `useSkyPause(on)` | — |
| Palette tweak | `PlayerHost.setPaletteTweak` | "a palette tweak on the host" (46) |
| Player open result | `PlayerOpenResult` | — |

## What moved into stage 42 from the wave-2 stages

- **The player core** (45 WP-D's fallback, 46's needs): `src/player/view.ts`,
  `strip.ts`, `player.css`, `src/app/player-host.ts`, `src/app/shell.ts`,
  `src/chrome/kit/hooks.ts`, `tests/unit/player-timeline.test.ts`. Final:
  42f builds it; 45-D only verifies it with its e2e tests; 46-B uses it.
- **`LookManual`, its find and contents** (planned by 44c as
  `look-manual.tsx`, `look-manual.css`, `look-manual-find.ts`; wanted by
  43a): 42e. 44c keeps `script-manual-frame.tsx` (the host: links,
  examples, F1 targets) and `script-reference.ts` additions.
- **The lantern find panel** in `search.ts` (44's fallback was a
  `createPanel` override in `lua-cm.ts`): 42e. The fallback is dropped.
- **The lantern CodeMirror theme** (44b planned an override of `cm.ts`
  `theme()` in `lua-cm.ts`; 43 wanted it from 42): 42e builds the base
  theme, both token palettes and the lint / match rules under `.wc-code`.
  44b keeps the Lua pop-up plates (completion, info, signature, hover, lint
  tooltip) in `lua-cm.ts` and `script-editor.css`.
- **`ProfileRoot` out of `windows.tsx`** (43b owned a part of
  `windows.tsx`): 42d moves it verbatim to
  `src/chrome/frames/profile-window.tsx`; 43b then owns that file and
  nobody edits `windows.tsx` in wave 2.
- **The look hosts for the window stacks and the ESC menu stack** (43b
  owned the `index.tsx` hunk; 44d needed them): 42d.
- **The Esc rule for fields** (43 decision 6, at kit level): 42c.
- **The keys box** (45 WP-C could build its own on `Dialog`): `KeyHelp`
  in 42c; 45-C builds `HistoryKeysButton` on it.
- **Sky rate behind large boxes** (44 item 11, "42 decides"): 42a decides
  and builds it.
- **E2E navigation helpers** for the new look (to keep wave-2 test hunks
  small): `tests/e2e/look.ts` (42-0, filled by each package).

Stays in the wave-2 stages: every page's own layout, model and keys; the
pages' own CSS (prefixes `wc-pe-`, `wc-imp-`, `wc-exp-`, `wc-scr-`,
`wc-sed-`, `wc-sman-`, `wc-hist-`, `wc-spot-`, `wc-cred-`, `wc-about-`);
44b's Lua pop-up plates; 46-B's viewer chrome (head, countdown, track,
control row) over the bare view; `spotlight-mode.ts`; 45's `Statistics`
page; History's phone Export gate (45-A removes it).

## Work packages

Seven packages. **42-0 runs first and alone** (short, mechanical); then
**42a–42f run in parallel**; then **42-Z** integrates. Each package owns
its files exclusively (table below), writes its gallery section and its
tests, and keeps every existing test green (stage 42 may edit any test
file to keep it green; wave 2's hunk rules do not apply in wave 1).

### 42-0 — Scaffold (first; one agent)

Owns, for its duration: `src/chrome/kit/look.tsx`, `look.css`, the new
module files, `src/chrome/frames/start-main.tsx` (one hunk), `src/main.ts`
(one hunk), `tests/e2e/look.ts`, `docs/decisions/0127-look-pages-base.md`.

1. Split `look.tsx` with no change of behaviour: `look.tsx` keeps
   `lookFrame`, `isLookFrame`, `Scenery`, `SceneryCtx`, `useScenery`,
   `Box`, `BackButton` and re-exports the rest; new `look-keys.ts`
   (`letterOf`, `letterAt`, `KeyLabel`), `look-icons.tsx` (`Icon`,
   `ICONS`), `look-controls.tsx` (`GlassButton`, `LookFlash`); move the
   glass button and Back rules and the `--lk-*` tokens out of `look.css`
   into `look-glass.css` and `look-tokens.css` (imported by `look.css`).
   Introduce the `.wc-look` scope class on the start surface's root.
2. Create the other module files with the API's types and exports as
   minimal stubs (`look-motion.ts`, `look-overlay.tsx`, `look-cursor.ts`,
   `window-chrome.ts`, `src/editor/look-code.ts`, `look-manual.tsx`,
   `look-manual-find.ts`), each with a header comment naming its package.
   `LookPlaceCtx` (default `'start'`) and `useLookPlace` are real from here.
3. The gallery shell: `src/chrome/kit/gallery/index.tsx`, a look frame
   (`Box size="large" title="Kit"`) with a tab per section, sections
   loaded by `import.meta.glob('./*.tsx')` (every file but `index.tsx`), so
   each package adds `gallery/<name>.tsx` without touching the index. Opened
   by `?kit` (and `?kit=<section>`): `start-main.tsx` pushes it after the
   first render, behind `import.meta.env.DEV || import.meta.env.VITE_KIT`
   and a dynamic import, so a normal build holds none of it.
   `VITE_KIT=1 npm run build` makes a build with the gallery for benches.
4. `tests/e2e/look.ts`: helpers `openKit(page, section?)`,
   `openFromMenu(page, key)`, `lookBox(page)`, `backTo(page)`,
   `dialog(page, dlg)`, `win(page, id)`, `reducedMotion(page)`; each
   package adds its own helpers in its own block.
5. ADR 0127 skeleton (headings per package; each package fills its part).
6. `npm run typecheck`, lint, `npm test`, the start-page e2e specs
   (`chrome.spec.ts`, `enter-transition.spec.ts`, `phone-*`) green.

### 42a — The big box, layout B, places, scenery, sky rate

Owns: `src/chrome/kit/look.tsx` (Box and its slots, places, settled,
`InlineBack`), `look.css`, `look-motion.ts`, `src/chrome/start-surface.tsx`,
`src/chrome/start.css`, `src/start/geometry.css`,
`src/chrome/frames/start-main.tsx`, `src/start/sky/index.ts` (`setRate`
only), `src/chrome/kit/gallery/box.tsx`. Tests: new
`tests/unit/look-box.test.tsx`, `tests/e2e/look-kit-box.spec.ts`; keeps
`start-look.test.ts`, `start-sky*.test.ts`, `chrome-frames.test.tsx`,
`chrome.spec.ts`, `enter-transition.spec.ts` green.

1. `Box` with `tall`, `maxWidth`, the slots, the title cross-fade, the
   `wc-page` container, the place switch (start / window / menu
   rendering; 42d provides the context values).
2. The morph proxy and the choreography (table above) in the start
   surface: it keeps the top box's rectangle current (a `ResizeObserver`
   on the top frame's `.wc-lk-box`, never per frame), plans the
   transition from the old and new top (`morphPlan(from, to)`: a pure
   function of the two kinds and rects, unit-tested), runs it with Web
   Animations, and passes `hold` to the stack (42c's prop; until it lands,
   the content vanishes at once instead of fading).
3. Scenery `large` = layout B; the wordmark's lift and settle; the quote
   and almanac fades; the menu items' fade (start-main).
4. The box swap, normal → normal height morph, the width cap.
5. `useBoxSettled`, `useReducedMotion`, `InlineBack`, `useSkyPause`,
   `LookWordmark`, `StartSkyHandle.setRate('calm')` when a large box
   covers ≥ 85 % of the view.
6. Gallery section "Box": open a large box, a capped one (1180 px), a
   tall normal box, a normal → normal swap, a large → large swap with
   different widths, the settled readout, the sky pause toggle, a place
   preview (start / window / menu side by side).
7. Measure (production build with `VITE_KIT=1`, Iris Xe, Chromium and
   Firefox, 1728×1000 @2 and 390×844 @3): the morph (longest frame) and a
   large box idle with and without the blur; decide the blur rule; write
   the numbers in ADR 0127 and `bench/results/look-box.md`.

### 42b — Controls, widgets, icons, tokens

Owns: `src/chrome/kit/look-controls.tsx`, new `look-controls.css`,
`look-icons.tsx`, `look-tokens.css`, `look-glass.css`,
`src/start/wordmark-svg.ts` (an added export of the inlay constants
only), `src/chrome/kit/gallery/controls.tsx`. Tests: new
`tests/unit/look-controls.test.tsx` (each control's DOM, ARIA, disabled,
the Paper tokens present, the inlay tokens equal to the wordmark's
constants), `tests/e2e/look-kit-controls.spec.ts` (click, touch, the
40 px targets under a coarse pointer, Paper).

1. `GlassButton` variants (icon-only, `small`, `primary`, `iconAfter`,
   `keepIcon`), `Seg` (seg, pills, multi), `Tabs`, `Field`, `TextArea`
   (real elements in glass wells, `user-select: text`, the error and hint
   lines), `Check`, `Toggle`, `Select`, `Table` / `TableRow` (sortable
   heads with `data-dir`, the two-line mode below `stackBelow`), `Rule`,
   `OrnRule`, `Fold`, `Well`, `Stars`, the controlled `LookFlash` and
   `useLocalFlash`, `useKeyboardInset`, `Seal`, the icon set.
2. Tokens for dark and Paper; the rows, scrollbar, text-helper and link
   classes.
3. Gallery section "Controls": every control in every state on the sky,
   in a dark window body and in a Paper window body (the tokens switched
   by `data-light`), at 1440 and 390 px.

### 42c — Overlays, dialogs, popovers, cursors, letters, the stack

Owns: `src/chrome/kit/stack.tsx`, `look-overlay.tsx`, new
`look-overlay.css`, `look-cursor.ts`, `look-keys.ts`,
`src/chrome/kit/gallery/overlays.tsx`. Tests: `tests/unit/chrome-stack.test.tsx`
(overlay push and pop, the frame below inert and drawn, `hold`, key
layers, the Esc rule, Ctrl+S from a field), new
`tests/unit/look-keys.test.tsx` (`useListCursor`, `useGridCursor`,
`useButtonZone`, `letterAction` in and out of fields),
`tests/e2e/look-kit-overlays.spec.ts`.

1. `stack.tsx`: `push(node, { overlay })` (the frame below stays drawn,
   `inert`, under a veil; keys go to the overlay; the stack's flash shows
   on the frame below after the pop); `hold`; `useKeyLayer`; the Esc rule.
   Old-look frames behave exactly as before (no Esc rule, no overlay
   unless pushed as one).
2. `Dialog` (overlay frame or `inline`), `KeyHelp`, `openKeyHelp`,
   `Popover`; dialogs centre over the box or window content below, not
   over the whole game.
3. The cursor hooks and the button zone, modelled on the Profile list
   (ADR 0125 addendum): hover moves the cursor on a pointer move only; a
   key scrolls into view, a pointer never does; touch rules per option.
4. Gallery section "Overlays": a dialog of each shape (question with
   Y/N/Esc, an input dialog with a `Field`, an error dialog, any-key
   cancel), an inline dialog, a popover with controls, a keys box, a list
   and a grid with their cursors and a button zone.

### 42d — The window frame (Lykta; dark, Paper) and the ESC menu host

Owns: `src/chrome/kit/window.tsx`, `window.css`, `window-geom.ts`,
`window-chrome.ts`, `src/chrome/windows.tsx`, new
`src/chrome/frames/profile-window.tsx` (the verbatim move),
`src/chrome/index.tsx` (the menu host), `src/chrome/kit/gallery/windows.tsx`.
Tests: `tests/unit/window-geom.test.ts`, `tests/e2e/windows.spec.ts`,
`menubar.spec.ts` (the window title: "Profile" with the name as the note),
`popup-focus.spec.ts`, `phone-esc-menu.spec.ts` (all kept green, selectors
updated), new `tests/unit/window-frame.test.tsx` (title and note by
`useWindowChrome`, revert on pop, the frame unchanged when a sub-page
opens, Paper, focus dimming,
`LookPlaceCtx` = `window` inside, `menu` in the ESC menu).

1. The Lykta frame on dark and Paper; title, note, X, grip, edges;
   behaviour unchanged. No Glass frame.
2. `useWindowChrome` plumbing from the top frame to `WindowFrame`.
3. Window stacks: `LookPlaceCtx` `window`, `.wc-look` on the body,
   `wrap` / `frameAttrs` for old-look frames on a whole-cell grid inside
   the px body. Keep the `WinStack` re-render guard.
4. The phone ESC menu: look frames full screen in the Lykta frame over
   the opaque background (`LookPlaceCtx` `menu`); old-look frames and the
   TUI border as today.
5. Move `ProfileRoot` to `src/chrome/frames/profile-window.tsx` unchanged.
6. Gallery section "Windows": the Lykta frame, focused and not, dark and
   Paper, over a plain backdrop, with a look frame and an old-look frame
   inside; resize them.

### 42e — CodeMirror lantern theme, find panel, `LookManual`

Owns: `src/editor/look-code.ts`, new `src/editor/look-code.css`,
`src/editor/cm.ts` (the `look` option only), `src/editor/search.ts`,
`src/editor/look-manual.tsx`, new `look-manual.css`,
`look-manual-find.ts`, `src/chrome/kit/gallery/code.tsx` (loads the editor
chunk lazily). Reads only: `help.ts`, `manual-search.ts`, `syntax.ts`,
`script-reference.ts`, `lua-highlight.ts`. Tests: new
`tests/unit/look-manual-find.test.ts` (toggles, bad regex, the 1000 cap,
the count text), `tests/unit/look-manual.test.tsx` (sections, groups,
`goto`, `onSection`, keys, the find bar and head), the existing
`manual-search.test.ts` and `editor.spec.ts` / `script-code-editor.spec.ts`
green (the TUI look is the default), new `tests/e2e/look-kit-code.spec.ts`
(a lantern buffer: Ctrl+F opens the lantern panel at the top, `n of m`,
Replace / All, Esc closes it; the manual: n / p, find with marks, the
narrow contents overlay).

1. `lookCodeTheme()` and the `.wc-code` rules (tt++ and Lua token
   colours, lint and match marks) on dark and Paper.
2. The lantern find panel (`look: 'lantern'`, `top`), keys unchanged.
3. `LookManual` and `ManualContents` as in the API; the profile manual
   (`helpSections()`) and the script manual (`scriptManualSections()`)
   both render in the gallery, with `contents: 'own'` and `'none'`,
   `find: 'head'` and `'bar'`, a `link` hook and a highlighted `example`
   hook.
4. Measure: open the script manual cold and warm, find "timer" (time to
   the first mark); record in ADR 0127.

### 42f — Player core

Owns: `src/player/view.ts`, `src/player/strip.ts`, `src/player/player.css`,
`src/app/player-host.ts`, `src/app/shell.ts`, `src/chrome/kit/hooks.ts`,
`src/chrome/kit/gallery/player.tsx`. Tests:
`tests/unit/player-timeline.test.ts` (`fmtClock` with and without hours),
`player-viewer.test.ts` / `player-modes.test.ts` (back, bare, press,
hours, viewerControls, setPaletteTweak), new
`tests/e2e/player-core.spec.ts` (the run log player: Back top left, hides
with the chrome, returns to History; a 1h34m session reads `1:34:xx`; the
HTML replay has no Back and `MM:SS`; `openPlayer` on a broken session
resolves `{ ok: false }`; `embedPlayer` mounts in a slot, the start page
stays, `__wc.shell.playerHost` is set, a second open is refused).
`player.spec.ts`, `viewer.spec.ts`, `replay.spec.ts` stay green.

1. `fmtClock` hours, the `hours`, `back`, `bare` options, `press`.
2. `openPlayer` result through `ChromeServices` and `Shell.startPlayer`;
   the run log player opens with `back` and `hours`.
3. `embedPlayer(slot)`; `viewerControls` public; `setPaletteTweak`.
4. Gallery section "Player": an embedded bare player on a demo session
   (if the demo backup is restored), with buttons calling `press`.

### 42-Z — Integration (main session, or one agent)

Merge 42a–f; full `npm run typecheck`, lint, `npm test`, `npm run test:e2e`
(Chromium, Firefox, phone), `npm run build`; chunk sizes; the benches
above; screenshots of every gallery section at 1440×900, 1280×720 and
390×844, dark and Paper; ADR 0127 complete; spec §5 rows for stages 42–47;
the owner's test guide checked. Wave 2 starts only after this.

### Order and dependencies

```
42-0 ──► 42a ─┐
     ├─► 42b ─┤
     ├─► 42c ─┼─► 42-Z ──► wave 2 (43 · 44 · 45 · 46 · 47)
     ├─► 42d ─┤
     ├─► 42e ─┤
     └─► 42f ─┘
```

Soft dependencies inside the parallel step (each package codes against the
42-0 stubs and swaps in the real part when it lands on the branch):
42a's leave fade needs 42c's `hold` (until then: instant); 42a's window and
menu rendering of `Box` is checked against 42d's providers; 42c's `Dialog`
and 42e's find head use 42b's `GlassButton` / `Field` / `Seg` (stubs from
42-0 render plain elements); 42f needs only 42-0's `look-glass.css`.

### File ownership in wave 1

| File | Package |
|---|---|
| `src/chrome/kit/look.tsx`, `look.css`, `look-motion.ts`, `src/chrome/start-surface.tsx`, `start.css`, `src/start/geometry.css`, `src/chrome/frames/start-main.tsx`, `src/start/sky/index.ts` | 42a (42-0 first) |
| `src/chrome/kit/look-controls.tsx|css`, `look-icons.tsx`, `look-tokens.css`, `look-glass.css`, `src/start/wordmark-svg.ts` (an export) | 42b |
| `src/chrome/kit/stack.tsx`, `look-overlay.tsx|css`, `look-cursor.ts`, `look-keys.ts` | 42c |
| `src/chrome/kit/window.tsx`, `window.css`, `window-geom.ts`, `window-chrome.ts`, `src/chrome/windows.tsx`, `src/chrome/frames/profile-window.tsx`, `src/chrome/index.tsx` | 42d |
| `src/editor/look-code.ts|css`, `cm.ts`, `search.ts`, `look-manual.tsx|css`, `look-manual-find.ts` | 42e |
| `src/player/view.ts`, `strip.ts`, `player.css`, `src/app/player-host.ts`, `src/app/shell.ts`, `src/chrome/kit/hooks.ts` | 42f |
| `src/main.ts` (`?kit`), `src/chrome/kit/gallery/index.tsx`, `tests/e2e/look.ts` (shell) | 42-0 |
| `src/chrome/kit/gallery/<name>.tsx`, `tests/e2e/look-kit-<name>.spec.ts`, its block of `tests/e2e/look.ts`, its part of ADR 0127 | each package |

**In wave 2 every file in this table is read-only.** A wave-2 package that
needs a kit change keeps a local helper in its own files, names it in its
report, and the main session moves it into the kit in wave 3.

## Wave-2 file ownership (final, across stages 43–47)

| File or area | Owner |
|---|---|
| `src/editor/frame.tsx`, new `src/editor/profile/*`, `profile.css`, `logic.ts`, `index.ts`, `help.ts` (the profile manual's text only), `src/chrome/frames/profile-edit.ts` | 43a |
| `src/chrome/frames/profile-window.tsx`, `src/chrome/frames/esc-main.tsx` (`profileEditOptions`, `ProfileEntry`) | 43b |
| `src/chrome/frames/import-page.tsx`, `import.css`, `import-report.tsx`, `import-load.ts`, `src/chrome/frames/profiles.tsx` (the import entry) | 43c |
| `src/chrome/frames/export-editor.tsx`, `export-input.tsx`, `export-model.ts`, `export.css` | 43d |
| `src/chrome/frames/scripts.tsx`, `scripts.css`, `scripts-model.ts`, new `script-settings.tsx`, `script-dialogs.tsx`, `src/scripts/help-text.ts` (additions), `src/editor/script-manual.ts` (one sentence) | 44a |
| `src/editor/script-frame.tsx`, `lua-cm.ts`, new `script-editor.css`, the script section of `editor.css` | 44b |
| `src/editor/script-manual-frame.tsx`, `script-reference.ts` (additions) | 44c |
| `spec.md` §2.10 | 44d |
| `src/chrome/frames/history.tsx`, `history.css`, `history-model.ts` (additions), `history-stats.tsx|css`, `history-dialogs.tsx|css` | 45 |
| `src/chrome/frames/spotlights.tsx`, `spotlights-wall.tsx`, `spotlights.css`, `spotlights-viewer.tsx|css`, `src/share/spotlights.ts` (additions), `src/player/spotlight-reel.ts` (additions), `spotlight-mode.ts`, `spotlight-card.ts`, `spotlight.css` | 46 |
| `src/chrome/frames/credits.tsx`, `credits.css`, `src/share/chronicle.ts` (additions), `src/chrome/frames/about.tsx` (incl. every `ABOUT_TEXT` fact of stages 43–47), `about.css`, `vite.config.ts` (`licencePlugin` only), `THIRD_PARTY_NOTICES.md` | 47 |
| `README.md`, `progress.md`, spec §5 statuses, the dead-code sweep | wave 3 / main session |
| `notes/research/cockpit-inventory.md` | each stage only its sections (43 §5.1–5.9 and §7.7 in wave 3; 45 §7.4–7.5; 46 the Spotlights part of §7.6; 47 §3.11 and the Credits part of §7.6) |

Shared test files are split by test (each stage edits only the tests named
in its file): see "Remaining overlaps" in the session report and each
stage's test plan.

## Tasks

- [x] 42-0: look.tsx split, stubs, `.wc-look`, gallery shell (`?kit`,
      `VITE_KIT`), `tests/e2e/look.ts`, ADR 0127 skeleton; all green
- [ ] 42a: `Box` (tall, maxWidth, slots, title fade, places), morph proxy
      and choreography, hold wiring, box swap, normal → normal morph
- [ ] 42a: scenery `large` = layout B; `useBoxSettled`, `InlineBack`,
      `useReducedMotion`, `useSkyPause`, `LookWordmark`, `setRate('calm')`
- [ ] 42a: measurements (morph, large box with and without blur); blur
      rule decided; `bench/results/look-box.md`
- [ ] 42b: controls, widgets, icons, tokens (dark, Paper, inlay), `Seal`,
      `useKeyboardInset`; gallery section; tests
- [ ] 42c: stack (overlay, hold, key layers, Esc rule); `Dialog`,
      `KeyHelp`, `Popover`; cursors, button zone, `letterAction`; tests
- [ ] 42d: the Lykta frame on dark and Paper (no Glass); `useWindowChrome`;
      window and menu look hosts; `ProfileRoot` moved; tests
- [ ] 42e: `lookCodeTheme`, `.wc-code` rules, lantern find panel,
      `LookManual`, `ManualContents`, `look-manual-find`; measurements; tests
- [x] 42f: `fmtClock` hours, `back`, `bare`, `press`, `openPlayer` result,
      `embedPlayer`, `viewerControls`, `setPaletteTweak`; tests
- [ ] 42-Z: merged; typecheck, lint, unit, e2e (Chromium, Firefox, phone),
      build green; chunk sizes recorded; screenshots reviewed
- [ ] ADR 0127 written (every package's part, the numbers)
- [ ] spec §5 rows for stages 42–47
- [ ] Owner test guide (below) checked against the build
- [ ] Owner feedback recorded in this file

## Test plan

Run for every package: `npm run typecheck`, the linter, `npm test`, its own
specs and the specs it may affect (listed per package), Chromium and
Firefox, the `phone` project for phone specs; the full suite once in 42-Z.

Unit (vitest, happy-dom): `look-box.test.tsx` (42a: `Box` per place,
slots, scenery per size, `maxWidth`, `tall`, `morphPlan`, settled with and
without reduced motion), `look-controls.test.tsx` (42b),
`chrome-stack.test.tsx` and `look-keys.test.tsx` (42c),
`window-frame.test.tsx` and `window-geom.test.ts` (42d),
`look-manual-find.test.ts` and `look-manual.test.tsx` (42e),
`player-timeline.test.ts`, `player-viewer.test.ts`, `player-modes.test.ts`
(42f); `start-look.test.ts`, `start-sky*.test.ts`, `chrome-frames.test.tsx`,
`chrome-kit.test.ts`, `enter-transition.test.ts` stay green.

E2E (Playwright): `look-kit-box.spec.ts` (menu → the gallery's large box
and back: the wordmark gone while open and back after, the box's final
size at mount (a `ResizeObserver` log shows one size), keys reach the page
during the morph, reduced motion = a fade; a capped box centred at 2560 px;
a tall box; the swap), `look-kit-controls.spec.ts`,
`look-kit-overlays.spec.ts`, `look-kit-code.spec.ts`, `player-core.spec.ts`,
and the window specs with the frame's hooks (`.wc-win-t`, `.wc-win-n`). Keep green: `chrome.spec.ts`,
`enter-transition.spec.ts`, `windows.spec.ts`, `menubar.spec.ts`,
`popup-focus.spec.ts`, `phone-esc-menu.spec.ts`, `editor.spec.ts`,
`script-code-editor.spec.ts`, `manual-find.spec.ts`, `player.spec.ts`,
`viewer.spec.ts`, `replay.spec.ts`, `spotlights.spec.ts`, `history.spec.ts`.

Screenshots (gitignored): each gallery section at 1440×900, 1280×720,
390×844; the windows on dark and Paper; the run log player with Back.

## Test guide for the owner

Stage 42 alone changes little you would notice in normal use; it is the
toolbox for the next pages. On the branch: `npm run dev`, then:

1. **The kit gallery**: http://localhost:5173/?kit . The menu grows into a
   big box (the wordmark lifts away, the quote and the date fade); Back or
   Esc shrinks it back into the menu. Is the motion right (speed, the
   hood widening, the content fading in after)?
2. In the gallery's **Box** tab: a box with a width cap (more sky on the
   sides on a wide window), a tall box, and switching between two big
   pages (the box stays, the content changes).
3. **Controls** and **Overlays**: buttons, toggles, fields, lists, tables,
   pills, a dialog over the box, a popover. Also with a narrow window or a
   phone. Do they look like the round 7 mockups?
4. **Windows**: the window frame (lantern), dark and Paper.
   Then in the game: open Profile and Scripts from the menu bar: today's
   content in the new frame (the content changes in the next stages).
5. **Code**: the code well in the new colours, Ctrl+F's find row, and the
   manual (the profile manual and the script manual) as one long page.
6. **The run log player** (History → a session → Run log): a Back button
   at the top left (it hides with the controls while playing); times over
   an hour read `1:34:07`.

Feedback wanted: the grow / shrink motion and its speed, the window
frame in the game (dark and Paper), and the open questions below.

## Open questions for the owner (after testing)

The build follows the default until the owner answers.

1. **The code font.** The mockups used JetBrains Mono for code; the build
   uses your terminal font (as the game and today's editors). *Default:
   the terminal font.*
2. **The grow motion** takes about 1.3 s before the page's content shows
   (the mockup's timing). *Default: as the mockup; shorten if it feels slow.*

## ADR

**ADR 0127 — The look pages base** (`docs/decisions/0127-look-pages-base.md`):
layout B as built (the proxy, the choreography, the hold, keys during a
morph, the box swap, the cap, tall, settled), places and `Box`'s
adaptation, the one window frame (Lykta; Glass dropped) and
`useWindowChrome` (and the end of the cyan border), the ESC menu host, overlay frames, key layers and the Esc
rule, the controls and their ARIA, tokens (`--lk-*`, Paper, the inlay's
one source), icons, the lantern CodeMirror theme, the find panel and
`LookManual`, the player core, the performance rules with the measured
numbers (blur, morph, sky rate, chunk sizes), the gallery, the test hooks,
the canonical names table. Addenda: ADR 0125 (scenery `large` is layout
B; the kit split into modules), ADR 0103 (the window frames), ADR 0114 and
ADR 0018 (the run log player's Back, h:mm:ss, the `openPlayer` result).

Stage ADR numbers for wave 2 (assigned now so parallel stages do not
collide): **0128** stage 43, **0129** stage 44, **0130** stage 45, **0131**
stage 46, **0132** stage 47. Addenda to older ADRs stay addenda.

## Owner feedback

(none yet)
