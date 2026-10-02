// Shared contracts between the net, text, ui, capture and app layers.
// Changing anything here affects every layer: keep it small and stable.

import type { PaneSnapshot } from '../panes/script-content';

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/**
 * A colour as a single number, so style runs stay monomorphic and cheap to
 * compare and render:
 *
 * - `0..255`: palette index. 0–7 normal, 8–15 bright (the DOS palette,
 *   Inv §1.1), 16–255 the xterm 256-colour cube and grey ramp.
 * - `>= TRUECOLOR` (0x1000000): 24-bit colour, `TRUECOLOR | 0xRRGGBB`.
 *
 * "Default colour" is expressed by leaving the field `undefined`.
 * Bold does not change the colour index: the parser emits the colour as
 * sent (SGR 1;31 gives fg 1 + bold). Whether bold brightens is a renderer
 * decision.
 */
export type Color = number;

/** Flag bit that marks a `Color` as 24-bit truecolor. */
export const TRUECOLOR = 0x1000000;

/** Packs an RGB triple (0–255 each) into a truecolor `Color`. */
export function rgb(r: number, g: number, b: number): Color {
  return TRUECOLOR | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** True when `c` is a truecolor value rather than a palette index. */
export function isTrueColor(c: Color): boolean {
  return c >= TRUECOLOR;
}

// ---------------------------------------------------------------------------
// Line model
// ---------------------------------------------------------------------------

/**
 * Styling for the half-open range `[start, end)` of `Line.text`, in UTF-16
 * code units. Runs are sorted, non-overlapping, and only cover styled text:
 * gaps are default style. Adjacent runs with identical style are merged.
 * Absent flags mean false; absent colours mean the default colour.
 */
export interface StyleRun {
  start: number;
  end: number;
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  blink?: boolean;
}

/**
 * A MUME XML element (ADR 0003) covering `[start, end)` of `Line.text`.
 * `tag` is the lower-case element name as sent, e.g. `room`, `name`,
 * `description`, `exits`, `prompt`, `tell`, `narrate`, `say`, `magic`.
 * Spans may nest; they are listed in order of their start tag. An element
 * that spans several lines yields one span per line it touches.
 */
export interface XmlSpan {
  tag: string;
  start: number;
  end: number;
  attrs?: Record<string, string>;
}

/** One assembled line of game output (or a prompt). */
export interface Line {
  /** Plain text: no ANSI, no XML, entities decoded, no trailing CR/LF. */
  text: string;
  /** Style runs over `text`. */
  runs: StyleRun[];
  /** XML element spans over `text`. Empty when XML mode is off. */
  tags: XmlSpan[];
  /** True for a prompt (ended by IAC GA, or wrapped in `<prompt>`). */
  prompt: boolean;
  /**
   * The inbound line with ANSI SGR preserved, XML tags removed and entities
   * decoded, no trailing CR/LF. This is what raw capture records (Inv §7.1).
   */
  raw: string;
  /** Receive time in µs since the Unix epoch (see `nowUs`). */
  ts: number;
}

/** A `gmcp` message's package name in lower case (its `key` when set). */
export function gmcpKey(m: { pkg: string; key?: string }): string {
  return m.key ?? m.pkg.toLowerCase();
}

/** Current time in µs since the Unix epoch, as an integer. */
export function nowUs(): number {
  return Math.round((performance.timeOrigin + performance.now()) * 1000);
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * - `idle`: never connected in this tab.
 * - `connecting`: socket opening.
 * - `login`: socket open, no GMCP `Char.Name` yet.
 * - `playing`: after GMCP `Char.Name`.
 * - `disconnected`: after `Core.Goodbye` or socket close.
 */
export type ConnState = 'idle' | 'connecting' | 'login' | 'playing' | 'disconnected';

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

/**
 * Every bus event and its payload. Payloads are shared between all
 * handlers and must be treated as read-only.
 */
export interface BusEvents {
  /** Raw bytes as received from the socket, before telnet parsing. */
  'net.bytesIn': Uint8Array;
  /** Raw bytes as written to the socket, protocol bytes included. */
  'net.bytesOut': Uint8Array;
  /** A completed line (or GA-terminated prompt). Emitted once per line. */
  'text.line': Line;
  /**
   * The pending unterminated tail (text after the last newline, no GA yet),
   * e.g. a prompt that has not been closed. Each emit replaces the previous
   * partial. It is superseded by the next `text.line`, which contains the
   * completed text; an empty `text` clears it. Never recorded by capture.
   */
  'text.partial': Line;
  /**
   * A line to show in the game output (ADR 0015 "Display pipeline"):
   * `line` is the display copy (after substitutes and highlights), `source`
   * the line as received. Emitted by the script engine once per `text.line`
   * that is not gagged, and for each `#showme` (`local: true`; a local line
   * is not part of the game stream and never supersedes the partial).
   */
  'text.display': { line: Line; source: Line; local?: boolean };
  /** The display copy of a `text.partial` (substitutes and highlights, no gags). */
  'text.displayPartial': { line: Line; source: Line };
  /**
   * GMCP message as received: package name as sent, JSON text ('' if none).
   * `ts` is the receive time (µs, the frame's time like `Line.ts`) when the
   * message came through a Session; capture records it (ADR 0016).
   */
  'gmcp.raw': { pkg: string; json: string; ts?: number };
  /**
   * Parsed GMCP message. `pkg` is exactly as sent by the server (MUME mixes
   * case); consumers match case-insensitively on `gmcpKey(m)`, the package
   * in lower case. `key` is that lower-case name, set once by the producer
   * (every producer in src sets it; tests may leave it out). `data` is
   * `undefined` when there was no payload or the JSON did not parse (the
   * failure is reported via `sys.message`).
   */
  gmcp: { pkg: string; key?: string; data: unknown };
  /**
   * A command sent to the game, after alias expansion. Never protocol bytes.
   * An empty Enter gives `text: ''`. When `secret` is true (password), the
   * Sender sets `text` to '' and consumers must not log, echo or store it.
   * `echo: false` means the command must not be echoed locally in the
   * output pane (client housekeeping such as `change width`); absent means
   * echo. `replay: true` marks a command re-emitted from a replayed log
   * (ReplaySocket): it was not sent now, so it is never sent, echoed or
   * captured again; trackers take it as a send of that session (ADR 0017).
   */
  'cmd.sent': { text: string; ts: number; secret?: boolean; echo?: boolean; replay?: true };
  /**
   * Connection state change. `reason` explains a disconnect. `replay` is
   * set on every change of a replay connection (ReplaySocket): a replay can
   * reach `playing` from recorded GMCP, but it is never captured.
   */
  'conn.state': { state: ConnState; prev: ConnState; reason?: string; replay?: true };
  /** Telnet ECHO: true when the server echoes (password mode, mask input). */
  'telnet.echo': { serverEchoes: boolean };
  /**
   * Keep-alive and link RTT (`Link:` readout, ADR 0030). `ms` is the
   * readout: `http` when the link probe has a value, else `ping`, or null
   * before either. `http` is the HTTPS link probe's round trip to
   * mume.org (lower median of the last 3 samples; null when none or the
   * probe fails). `ping` is the minimum GMCP `Core.Ping` round trip over
   * the samples received in the last 60 s (MUME answers on its ~250 ms
   * game pulse, so it reads above the network RTT). `last` is the latest
   * raw Core.Ping round trip, or null. `suspect` is true when a ping has
   * had no pong for more than 10 s.
   */
  'link.rtt': { ms: number | null; last: number | null; ping: number | null; http: number | null; suspect: boolean };
  /** A client line for the output pane; the UI adds the `[SYSTEM]` prefix. */
  'sys.message': { text: string };
  /** The first MUME XML tag after connect was seen (XML mode is on). */
  'xml.seen': void;
  /**
   * A line for the UI messages pane (Inv §2.4, ADR 0016). Any module may
   * emit it; the UI pane renders the prefix from `kind`. See `UiMessage`.
   */
  'ui.message': UiMessage;
  /**
   * The screen settings (src/settings `viewSnapshot`: appearance, panes,
   * layout, group, comm, timers) as JSON. App emits it once at start and again
   * whenever the snapshot changes; the recorder captures it so a log player
   * can rebuild the screen (ADR 0016).
   */
  'view.settings': { json: string };
  /** The cockpit size in cells changed (emitted by the cockpit's relayout). */
  'view.size': { cols: number; rows: number };
  /**
   * A script pane's content (ADR 0053 P1), coalesced to at most one per
   * frame per pane by the App's recording surface; `snap` null: the pane
   * went away. The recorder writes it as an `ESC SPANE` record.
   */
  'view.pane': { id: string; snap: PaneSnapshot | null };
}

// ---------------------------------------------------------------------------
// UI messages
// ---------------------------------------------------------------------------

/**
 * Kind of a UI pane line and its prefix (Inv §2.4):
 *
 * - `system` → `● SYSTEM:` infrastructure (connect, login, profile saved).
 * - `event`  → `▶ NAME:` a feature or script event; `name` is required
 *   (e.g. `ACHIEVEMENT`).
 * - `state`  → `◆ TAG:` character-state lifecycle; `tag` is required
 *   (e.g. `SPELL`, `BLIND`).
 * - `warn`   → `⚠ WARN:` a degraded path the player should see.
 * - `error`  → `✖ ERROR:` a failure.
 */
export type UiMessageKind = 'system' | 'event' | 'state' | 'warn' | 'error';

/**
 * A piece of a UI message: plain text (bold bright white) or a dynamic
 * value `{ value }` (bold yellow: names, numbers, files).
 */
export type UiMessagePart = string | { value: string };

/**
 * One UI pane line. The text is the parts joined as they are (put the
 * spaces in the strings); every message is a sentence ending in `.`, e.g.
 * `{ kind: 'system', parts: [{ value: 'Rasta' }, ' logged in.'] }`.
 */
export interface UiMessage {
  kind: UiMessageKind;
  /** The `▶ NAME:` label for `kind: 'event'` (upper case by convention). */
  name?: string;
  /** The `◆ TAG:` label for `kind: 'state'`. */
  tag?: string;
  parts: UiMessagePart[];
}

export type BusEventType = keyof BusEvents;

export type BusHandler<K extends BusEventType> = (payload: BusEvents[K]) => void;

// ---------------------------------------------------------------------------
// Transport and sending
// ---------------------------------------------------------------------------

/**
 * A byte-stream socket. Implemented by the WebSocket transport and by the
 * replay fake socket. Assign the callbacks before `connect()`.
 */
export interface Socketish {
  /** Starts connecting. `onOpen` or `onClose` follows. */
  connect(): void;
  /** Writes bytes. Ignored when not open. */
  send(bytes: Uint8Array): void;
  /**
   * False while the socket cannot write although `onClose` has not come
   * yet (a WebSocket that is CLOSING). Absent: open from `onOpen` until
   * `onClose`.
   */
  readonly isOpen?: boolean;
  /** Bytes queued but not yet sent (`WebSocket.bufferedAmount`); absent = unknown. */
  readonly bufferedAmount?: number;
  /** Closes the socket. `onClose` follows with reason 'closed by client'. */
  close(): void;
  onOpen: (() => void) | null;
  /** Inbound bytes, in order. */
  onData: ((bytes: Uint8Array) => void) | null;
  /** Called exactly once per `connect()` that got this far. */
  onClose: ((reason: string) => void) | null;
}

/** What the input pane and the app use to talk to the game. */
export interface Sender {
  /**
   * Sends one command line (a newline is appended). `secret` marks a
   * password: never logged, stored or echoed. `echo` (default true) controls
   * the local command echo in the output pane.
   */
  sendCommand(text: string, opts?: { secret?: boolean; echo?: boolean }): void;
  /** Sends a GMCP message; `data` is JSON-encoded when given. */
  sendGmcp(pkg: string, data?: unknown): void;
}
