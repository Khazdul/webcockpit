// Capture line reading for the exports (ADR 0019): the same line grammar as
// the player's timeline (src/player/timeline.ts, src/capture/format.ts),
// but one entry at a time with the whole line, so the payload builder can
// copy kept lines verbatim and the text export can read their bodies.

export type CaptureKind = 'in' | 'out' | 'gmcp' | 'view' | 'size' | 'spane' | 'record';

export interface CaptureEntry {
  ts: number;
  kind: CaptureKind;
  /** Text after `<ts> ` (after `> ` for a command, after the type for a record). */
  body: string;
  /** For `gmcp`: the package name. */
  pkg?: string;
  /** The whole line including its `\n` (a missing final newline is added). */
  line: string;
}

const TS_DIGITS = 16;

/**
 * The entries of one capture text in order. Malformed lines are skipped;
 * unknown records come as `record` (the player skips them).
 */
export function* captureEntries(text: string): Generator<CaptureEntry> {
  const len = text.length;
  let pos = 0;
  while (pos < len) {
    let nl = text.indexOf('\n', pos);
    if (nl < 0) nl = len;
    const s = pos;
    pos = nl + 1;
    let e = nl;
    if (e > s && text.charCodeAt(e - 1) === 13) e--;
    if (e - s < TS_DIGITS + 1 || text.charCodeAt(s + TS_DIGITS) !== 32) continue;
    let ok = true;
    for (let k = s; k < s + TS_DIGITS; k++) {
      const c = text.charCodeAt(k);
      if (c < 48 || c > 57) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const ts = Number(text.slice(s, s + TS_DIGITS));
    const line = nl < len ? text.slice(s, nl + 1) : text.slice(s, len) + '\n';
    let b = s + TS_DIGITS + 1;
    const c0 = text.charCodeAt(b);
    if (c0 === 62 && text.charCodeAt(b + 1) === 32 && b + 1 < e) {
      yield { ts, kind: 'out', body: text.slice(b + 2, e), line };
      continue;
    }
    if (c0 === 27) {
      const c1 = text.charCodeAt(b + 1);
      if (c1 >= 65 && c1 <= 90) {
        const sp = text.indexOf(' ', b);
        const end = sp < 0 || sp > e ? e : sp;
        const type = text.slice(b + 1, end);
        b = end < e ? end + 1 : e;
        const body = text.slice(b, e);
        if (type === 'GMCP') {
          const sp2 = body.indexOf(' ');
          yield { ts, kind: 'gmcp', body, pkg: sp2 < 0 ? body : body.slice(0, sp2), line };
        } else if (type === 'VIEW') yield { ts, kind: 'view', body, line };
        else if (type === 'SIZE') yield { ts, kind: 'size', body, line };
        else if (type === 'SPANE') yield { ts, kind: 'spane', body, line };
        else yield { ts, kind: 'record', body, line };
        continue;
      }
    }
    yield { ts, kind: 'in', body: text.slice(b, e), line };
  }
}

/** Removes ANSI escape sequences (CSI and two-byte ESC forms). */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.indexOf('\x1b') < 0 ? s : s.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]/g, '');
}

/**
 * True for a visible entry, the kind the export editor shows and excludes:
 * an inbound line or a command. (The player's lead-in test is stricter.)
 */
export function isVisible(e: CaptureEntry): boolean {
  return e.kind === 'in' || e.kind === 'out';
}

/**
 * GMCP that an exclusion removes (ADR 0019): the Comm pane's channel text.
 * `Comm.Channel.List` is state (the header's channels) and is kept.
 */
export function isCommText(e: CaptureEntry): boolean {
  return e.kind === 'gmcp' && e.pkg!.startsWith('Comm.') && e.pkg !== 'Comm.Channel.List';
}
