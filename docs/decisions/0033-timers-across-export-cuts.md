# 0033 — Timers across export cuts

- Status: Accepted
- Date: 2026-09-29
- Amends: ADR 0019 ("What an exclusion removes", "Replay payload")

## Context

Owner report: an HTML replay of a log with an excluded part shows only
the timers started after the cut, not those already running. ADR 0019
said kept GMCP makes the panes right after a cut "(vitals, group,
timers)", but the Timers pane is derived from game text and sent
commands, which the cut removes from the file.

## Decision

- At export, `buildReplayPayload` replays each run's **full** capture
  text headlessly (`timersStatesAt`, src/share/timers-state.ts:
  LineAssembler → ScriptEngine with the trackers' system rules →
  TimersHub on a ReplayClock) up to every cut end that lies inside the
  run, one pass per run.
- The hub's saved form (`snapshot()`, the same format as its IndexedDB
  record) is written into the edited run text as a private GMCP record,
  `ESC GMCP WebCockpit.Timers <state>`, before the first entry at or
  after the cut end and stamped with its time. Every such cut gets one,
  also when nothing is active (timers that ended inside the cut then go).
- `TimersHub` takes `WebCockpit.Timers` only on a replay connection and
  replaces its state with it (`replaceState`: reset, restore, silent).
  Other consumers ignore the unknown package; the timeline plays it like
  any kept GMCP at the cut.
- The record holds timer names, expiries and learned durations, never
  the removed lines.

## Consequences

- Export of a run with a cut costs one pass of the text pipeline over
  the run up to its last cut end (the text layer runs ~100 MB/s).
- HTML replays made before this change keep the old behaviour.
- Not covered: timers active when a run starts (restored from the live
  archive at login) are not in the capture, so a replay starts without
  them; Spotlight windows (text-less state prefix) likewise.
