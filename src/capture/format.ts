// Raw capture line format (Inv §7.1), Cockpit's `.log` plus client records
// (ADR 0016):
//
//   <16-digit µs since epoch> <raw inbound line, ANSI SGR kept>\n
//   <16-digit µs since epoch> > <outbound command>\n
//   <16-digit µs since epoch> ESC <TYPE> <payload>\n        (client record)
//
// An empty Enter is `<ts> > ` (trailing space). Every formatter returns the
// full line including its trailing '\n', so the recorder allocates exactly
// one string per captured event.
//
// Client records
// --------------
// A body that starts with ESC (0x1B) followed by an upper-case letter is a
// client record: the word after ESC up to the first space is its type, the
// rest its payload. An inbound raw line can never start like that: the line
// assembler keeps only SGR sequences (`ESC [ … m`) in `Line.raw`, and MUME
// sends nothing else. Cockpit logs have no records, so they read as before.
// `cat -v` shows a record as `^[GMCP Char.Vitals {…}`.
//
//   ESC GMCP <Package.Name>[ <json>]   an inbound GMCP message as received
//                                      (JSON text verbatim, CR/LF → space);
//                                      Core.Ping replies are not recorded.
//   ESC VIEW <json>                    the screen settings (ViewSnapshot:
//                                      appearance, panes, layout, group,
//                                      comm) at run start and on change
//   ESC SIZE {"cols":C,"rows":R}       the cockpit size in cells at run start
//                                      and on change (debounced)
//
// Readers skip record types they do not know. ReplaySocket turns GMCP
// records back into `IAC SB GMCP … IAC SE` and ignores the rest.

let lastTsUs = NaN;
let lastTs = '';

/**
 * A µs timestamp as the 16-digit integer Cockpit writes. The last result is
 * reused: every line of a received frame shares its timestamp.
 */
export function formatTs(us: number): string {
  if (us !== lastTsUs) {
    lastTsUs = us;
    lastTs = String(Math.trunc(us)).padStart(16, '0');
  }
  return lastTs;
}

/** One inbound line (use `Line.raw`; prompts are ordinary lines). */
export function formatInbound(ts: number, raw: string): string {
  return formatTs(ts) + ' ' + raw + '\n';
}

/** One outbound command. Callers skip `secret` commands. */
export function formatOutbound(ts: number, cmd: string): string {
  return formatTs(ts) + ' > ' + cmd + '\n';
}

/**
 * The UTF-8 length of `s` in bytes, as `TextEncoder` would encode it (a
 * lone surrogate becomes U+FFFD, 3 bytes). Counts without allocating.
 */
export function utf8Length(s: string): number {
  const len = s.length;
  let n = len;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) n += 1;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < len && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 2; // a surrogate pair: 2 units, 4 bytes
      i++;
    } else n += 2;
  }
  return n;
}

/** Client record types (see the file header). */
export const RECORD = { gmcp: 'GMCP', view: 'VIEW', size: 'SIZE' } as const;
export type RecordType = (typeof RECORD)[keyof typeof RECORD];

const LINE_BREAKS = /[\r\n]/g;

/** One client record line; CR/LF in the payload become spaces. */
export function formatRecord(ts: number, type: string, payload: string): string {
  const p = payload.indexOf('\n') < 0 && payload.indexOf('\r') < 0 ? payload : payload.replace(LINE_BREAKS, ' ');
  return formatTs(ts) + ' \x1b' + type + (p === '' ? '' : ' ' + p) + '\n';
}

/** One inbound GMCP message: `<ts> ESC GMCP <pkg>[ <json>]`. */
export function formatGmcpRecord(ts: number, pkg: string, json: string): string {
  return formatRecord(ts, RECORD.gmcp, json === '' ? pkg : pkg + ' ' + json);
}

/**
 * Parses a line body (the text after `<ts> `) as a client record, or
 * returns null when it is an ordinary inbound or outbound line.
 */
export function parseRecord(body: string): { type: string; payload: string } | null {
  if (body.charCodeAt(0) !== 0x1b) return null;
  const c = body.charCodeAt(1);
  if (!(c >= 65 && c <= 90)) return null;
  const sp = body.indexOf(' ', 1);
  return sp < 0 ? { type: body.slice(1), payload: '' } : { type: body.slice(1, sp), payload: body.slice(sp + 1) };
}

/**
 * Run id: `<Character>/<local time as 2026-09-19T21-35-58>`. The time part
 * is also the timestamp in the download file name.
 */
export function makeRunId(character: string, date: Date): string {
  return character + '/' + localStamp(date);
}

/** Local time as `YYYY-MM-DDTHH-MM-SS` (file-name safe). */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

/** Download name for a run id: `<Character>-<timestamp>.log`. */
export function runFileName(runId: string): string {
  const slash = runId.indexOf('/');
  const name = slash < 0 ? runId : runId.slice(0, slash) + '-' + runId.slice(slash + 1);
  return name.replace(/[\\/:*?"<>|]/g, '_') + '.log';
}
