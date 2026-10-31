# 0105 — The profile editor applies in place

- Status: Accepted
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md`, "30b round 1"),
  ADR 0015 (live profile and write-back, P3 editor), ADR 0038 (typed
  settings write-back), ADR 0103 (windows), ADR 0104 (Lite view)

## Context

Step 30b made the profile editor a window that stays open while the
player plays (ADR 0103), but the editor still applied only when it was
left: Esc → Apply / Discard / Keep editing, then `applyProfile` and a
save. The owner (round 1) wants changes to take effect with the window
open; first choice at once, second choice a "modified" mark and Ctrl+S as
in the script editor. The decisions recorded in the stage file: LITE
applies at the points where an edit is finished, never per keystroke (a
half-typed action pattern would fire on every line); Ctrl+S applies in
both views, EDITOR only on Ctrl+S and on the flip back to LITE; what does
not validate or load is not applied and the editor says why; the close
prompt only asks while something is unapplied; no `Profile applied` line
for these applies; typed settings and script variables saved while the
window is open are kept and shown.

## Decision

- **Base.** The editor keeps `base`, the text last stored (and applied,
  when live) as it knows it, as a `ProfileDoc` whose node ids the lite
  document shares (ADR 0015 document model). What the open view differs
  from it in is unapplied: the lite document without its empty new
  entries (`pendingDoc`), or the EDITOR buffer. That is the frame's
  `useUnsaved` state, so the window's close request and the Exit popup's
  warning see it.
- **Commit points (LITE).** Leaving a detail field, a move to another
  entry or kind (the cursor's entry id changes), a new or deleted entry, a
  captured macro key, a highlight style or colour, the flip back from
  EDITOR, and a `focusout` that leaves the editor (a click in the game, the
  bar, another window). Detected after the render that holds the change,
  in layout effects, so they run before the next key; each takes a
  snapshot of the edits at that moment. One exception: moving from a new
  entry's Pattern straight into its still empty Commands box waits, since
  an empty substitute would delete text and a new action or alias is not
  done yet. The flip from LITE to EDITOR does not apply: the unapplied
  lite edits go along as unapplied text.
- **Ctrl+S** applies at once in LITE, EDITOR and HELP (the stack's key
  handler returns true, so the browser's Save dialog never opens). It does
  not clash: Find is Ctrl+F, Replace Ctrl+H, and CodeMirror's bindings get
  only what the frame passes on. The EDITOR footer shows `Ctrl+S Apply`
  (`Ctrl+S Save` when not live, tappable on touch) and `Modified` before
  the cursor position while the buffer differs from `base`, as the script
  editor does. LITE's hints drop `Save &` from `ESC Save & back`.
- **What is applied.** LITE: every changed entry that passes
  `validateEntry` (`applicableDoc`); a held entry keeps its base text, or
  is left out when new; an empty new entry is left out silently. EDITOR:
  the whole buffer; a text whose load fails is not applied. Either way
  the footer says why (`Not applied: Unbalanced braces in Commands (alias
  gv)`, `Not applied: Unbalanced braces: the { on line 3 …`), in red for
  six seconds, and the change stays unapplied. An automatic apply does not
  try (and flash) again an unapplied text it held back last time.
- **Rebase.** The host reads the latest stored text and the editor builds
  the text to store from it: `alignDoc(base, parse(stored))` matches the
  stored nodes to base (equal text by LCS after the common prefix and
  suffix; between matches, entries of one kind and pattern pair up, so an
  `#alias {x}` rewritten keeps its id; the rest get negative ids from one
  page counter, which no document hands out), then `rebaseDoc(base,
  local, onto)` lays the local changes over it: a changed or new local
  node replaces the node with its id or is inserted after the local node
  before it, a node local deleted goes, a node local did not change keeps
  the stored version. A local change wins over an outside change to the
  same node; an edit to an entry removed outside (`#unalias`) puts it
  back. EDITOR's buffer is lined up with `alignDoc` too.
- **Outside changes while open.** `ProfileStore.subscribe` (new) calls
  back after every `save`. The editor ignores a text equal to its base
  (its own save) and otherwise queues a refresh: read the latest text,
  rebase the open edits onto it, make it the base. EDITOR's buffer gets
  the result as one change over the part that differs (`replaceText`,
  outside the undo history, the cursor stays); a buffer with open braces
  is left alone until the next apply rebases it. Applies and refreshes run
  one at a time on the frame's chain; a commit snapshot taken before an
  earlier apply moved the base is rebased onto the new base first.
- **The host** (`EditorHost`): `{ name, text, isLive(), load(),
  commit(build, { quiet }), subscribe?() }`, built by `editProfile`.
  `commit` is `App.commitProfile` in the cockpit and `commitStored` (read,
  build, save) on the start page. `App.commitProfile` waits until the
  write-back is idle (flush, read, again while busy, as
  `loadSelectedProfile` does), calls `build`, applies (live) and queues
  the save as the next write-back job (`ProfileWriteBack.save`), with no
  await from the read to the queued save: a setting typed before is in the
  text read, one typed after is written on top of the save. Queued script
  values are flushed into the text before the read, so the apply's
  `writeBack.discard()` drops nothing.
- **Session variables.** A live apply keeps the session's variables that
  the new text does not set (`loadProfile(text, { keepVars: true })`):
  a target an action set survives an edit. Declared variables come from
  the text, which holds their flushed values.
- **Quiet.** Automatic applies and Ctrl+S pass `quiet`: no UI pane line
  (`Profile x applied.`) and no `onSaved` line (`Profile x saved.`). A
  success flashes `Applied` (`Saved` when not live) in the footer for
  1.5 s, unless another message is showing; a warning the running profile
  did not have flashes in yellow (`Applied · a new warning: line 4: …`;
  `App.applyProfile` returns `added`, comparing warnings without their
  `line N:`). The explicit Apply in the prompt stays loud (UI pane lines),
  since the window closes with it and nothing else would report it.
- **Esc / X.** A running apply finishes first (`Applying…`). Nothing
  unapplied: the editor leaves without asking, flashing `Profile updated.`
  (live) or `Saved <name>.` when this visit stored something. Live: the
  prompt, or, when nothing left could be applied, a variant that says why
  and offers only `N to discard · ESC to keep editing`. Y applies what
  validates; if something stays unapplied the variant follows. Not live
  (start page): Esc applies, as it saved before, and only asks with the
  variant. Discard (N) drops only what is unapplied.
- **Focus.** The editor moves the DOM focus only while it is the top of
  an active stack (`useIsTop`): a Profile window without the focus no
  longer pulls it back on a re-render (ADR 0103 bounced it; with applies
  re-rendering the editor while unfocused that became a loop).
- The same rules everywhere the editor runs: the Profile window, the ESC
  menu (phone) and the start page.

## Consequences

- An alias edited in the open window works as soon as the game is
  clicked; the UI pane stays quiet.
- Every apply re-runs the profile load, so tickers in the profile restart
  their countdown and pending `#delay`s of the old rules are dropped, as
  with the Apply before; now that happens on every applied edit. Applies
  run only when something changed.
- The lite rule "entries edited with an empty pattern are dropped on
  save" (ADR 0015 P3) now covers new entries only; an existing entry
  whose pattern is cleared is held back (`Pattern required`) instead of
  deleted.
- `EditorHost` lost `save` and `apply`; `EscActions.liveApply` is now
  `commitProfile`.
- Tests: `script-doc-rebase.test.ts`, `app-commit-profile.test.ts`, the
  lite helpers in `editor-logic.test.ts`, e2e `profile-apply.spec.ts`;
  `editor.spec.ts` and `windows.spec.ts` follow the new behaviour.
