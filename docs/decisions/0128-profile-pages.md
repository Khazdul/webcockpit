# 0128 — The profile pages in the new look

- Status: Accepted (stage 43 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 43 (`docs/stages/43-profile-pages.md`), ADR 0127 (the look
  pages base), ADR 0125 (start surface and the lantern kit), ADR 0073 and
  ADR 0076 (foreign import), ADR 0115 (export), ADR 0075 (phone), ADR 0103
  (in-game windows), ADR 0105 and ADR 0119 (the profile editor).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/profiles/` (`editor-b.html`, `import-c.html`,
  `export-b.html`, `CONTENT.md`).

## Context

Stage 43 moves the three content pages of the profiles group (the Profile
editor, Import, Export) from the TUI cell grid to the new look, built on
stage 42's kit, in four parallel packages (43a–43d). Each package records
its decisions in its own section below.

## Decision

### 43a — The Profile editor, direction B (start page first)

### 43b — The editor in the game (window, phone ESC menu)

### 43c — The import page and the receipt (direction C)

**Two frames, one box.** Import on the Profile list pushes `ImportFrame`
(`src/chrome/frames/import-page.tsx`), a normal box (hood "Import", Back,
780 px wide) that takes the list's place: the surface's normal → normal
swap keeps the box and morphs its size. The page holds the choosing, the
reading and the error states itself. A success replaces it
(`nav.replace`) by `ImportReceipt` (`import-report.tsx`), so the box swap
morphs once more to the receipt and the receipt's OK pops straight back
to the list, never to the import page. The receipt is a tall normal box
(`Box tall`) only when it has groups to read; the short form (a native
profile that needed no change) and "Every setting was translated as it
was." stay a normal box, which would otherwise stand mostly empty.

**The import sequence is unchanged** (`loadImportFiles` → `importFiles` →
`profiles.importFile` → `settings.update({ profile })`; the core and the
archive unpacking are untouched). `readImportFiles(files)` in
`import-load.ts` reads a `FileList`, `DataTransfer.files` or an array into
`ImportFile`s for both the picker and a drop. Errors (`Import failed: …`
with the chosen file names under it) stay on the page in place of the
formats, with the drop zone to try again; they are no longer the list's
flash. After OK the list gets the flash `Imported "x" from y.` and its
cursor on the new profile through the list's own `done` callback (the same
one New and Rename use).

**Reading.** "Reading a.set, b.set…" with a thin running bar while the
chunk loads and the files are read; the page keeps the height it had when
the reading began, so the box does not jump for the moment it lasts.
Keys wait meanwhile, except Esc / Back: leaving during the reading drops
the import (nothing is saved). The page tracks this with its own flag set
by Back, because a popped frame stays mounted for the stack's 240 ms hold
and an unmount check alone would let a late import replace the list.

**The picker's input sits beside the box**, in the frame but outside
`Box`: the box is `visibility: hidden` while the morph carries it in, and
an input under it could miss its file chooser for an Enter pressed right
after Import. (While building, a Chromium miss turned out to be the
Playwright file-chooser listener being registered too late; the specs now
register it before Import. The input stays beside the box as the safer
place.)

**Drops.** A drag of files over the box (anywhere on it, not only on the
zone) lights the zone (a dragenter / dragleave depth count, so child
elements do not flicker it) and a drop imports those files. While the
page is the top frame a file drop beside the box is swallowed
(`preventDefault` on the document's `dragover` / `drop`), so the browser
never opens the file over the running page. Drags of text or links are
ignored. On a touch device (`pointer: coarse` and `hover: none`, or the
phone class) "Drop the files here" hides; Choose files… stays.

**The receipt.** The head (`BoxHead`): the profile name in Cinzel, "a new
profile from **gibur.set** and 2 more files" (the number of chosen files
besides the entry), the format and its signals as chips. The body
(`BoxBody`, native scroll): the file-wide warnings and "Missing files: …"
(red), the summary sentence, then the groups Kept as #nop / Skipped /
Translated with a warning as collapsible sections with their counts, the
first open, each item `file:line`, the reason (and the warning in the
accent) and the first source line dimmed (` …` when more). The notes sit
in the body, not in the head as in the mockup: on a phone a head with
three warnings would leave little room for the list, and in the body they
scroll away. The summary sentence drops zero parts except the first ("3
settings were translated.", "1 setting was translated and 1 needs a
look."); its numbers are also data attributes for the tests. The short
form adds the mockup's line "A WebCockpit profile as it is: every setting
kept as written." **OK only** (owner, 2026-11-07); the new profile is
selected and highlighted on the list, where Enter (or E) opens the editor.

**Keys.** Import page: Enter or C = Choose files…, Esc / Back = the list.
Receipt: ↑↓ (44 px) PgUp PgDn Home End scroll the body; Tab / Shift+Tab
walk the group headers and OK (the kit's `is-sel` on OK, `.is-sel` on a
header; nothing takes the DOM focus); Space, or Enter on a header, opens
or closes that group; Enter elsewhere, O, Esc and Back are OK. Nothing is
lit until the keyboard walks (as in the mockup: OK is the primary button,
Enter presses it); Tab starts at the first header, Shift+Tab at OK. The
same holds for the import page's Choose files… (primary, unlit).

**Local helper (for the kit in wave 3).** The groups use a local
collapsible (`Group` in `import-report.tsx`: a header button with
`aria-expanded`, a chevron, the title and a count at the right) because
the kit's `Fold` takes only a string label: a `Fold` with a right-hand
slot (a count) would replace it.

**Layout.** Prefix `wc-imp-` (`import.css`). Both frames lay themselves out
by the box's width (`@container wc-page (max-width: 600px)`: the formats
in two columns, a smaller drop zone and name). With a coarse pointer the
window's top padding grows to 58 px, since the kit's Back is 40 px high
there and covered the lead and the profile name. No `backdrop-filter`
inside; the drop zone and the format cards are solid fills. Reduced
motion: the bar pulses instead of running, the chevron does not turn,
groups open with a plain fade.

**Measurements** (production build, `vite build`, against the integration
tip before 43c): the start chunk `index` 8.44 → 8.45 kB gzip (a hash
reference); the chrome chunk JS 85.92 → 87.15 kB gzip (+1.23 kB) and CSS
14.87 → 16.25 kB gzip (+1.38 kB, `import.css`); the lazy import chunk
unchanged (39.03 kB gzip).

### 43d — The Export editor (direction B, with the format toggle)

## Consequences

- The import report's TUI text helpers (`reportHeader`, `reportRows`,
  `countsText`) are gone; the pure text lives in
  `src/chrome/frames/import-model.ts`.
