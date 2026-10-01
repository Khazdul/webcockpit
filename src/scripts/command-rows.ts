// `#script list` and `#script help <name>` as game output rows (spec
// §2.10). No DOM; the classes are the `#help` ones (ui.css). The help is
// what the Scripts page shows: name and summary, aliases and keys, the
// `@help` text, and each setting with its value and the `#script set`
// command that changes it.

import type { StyledRow } from '../ui/output-pane';
import type { ScriptInfo } from './library';

const row = (kind: string, text: string): StyledRow => ({ cls: `wc-help wc-help-${kind}`, segs: [{ text }] });

/** Cuts `s` to `w` cells with `…`. */
function cut(s: string, w: number): string {
  return s.length > w ? s.slice(0, Math.max(0, w - 1)) + '…' : s;
}

/** The value of a setting as `#script set` takes it. */
export function settingText(v: string | number | boolean): string {
  return typeof v === 'string' ? (v === '' || /\s|[{}]/.test(v) ? `{${v}}` : v) : String(v);
}

/** The state word of a script on its row. */
export function stateWord(s: ScriptInfo, running: boolean): string {
  if (!s.enabled) return 'off';
  if (s.lastError && !running) return 'failed';
  return 'on';
}

/** `#script list`: one row per script. */
export function listRows(list: readonly ScriptInfo[], running: (name: string) => boolean, width = 80): StyledRow[] {
  if (list.length === 0) return [row('note', 'No scripts yet. Scripts sits under Profile on the start page and in the ESC menu.')];
  const nameW = Math.min(24, Math.max(...list.map((s) => s.name.length)));
  const out: StyledRow[] = [row('heading', 'Scripts')];
  for (const s of list) {
    const state = stateWord(s, running(s.name)).padEnd(6);
    const mark = s.bundled ? ' (bundled)' : '';
    const head = `  ${state} ${s.name.padEnd(nameW)}  `;
    out.push(row('code', cut(head + (s.header.summary || '') + mark, width)));
    if (s.lastError) out.push(row('note', cut(`         ${s.lastError}`, width)));
  }
  out.push(row('note', 'Type #script help <name> for a script\'s help, #script enable <name> to turn it on.'));
  return out;
}

/** `#script help <name>`: the script's help. */
export function helpRows(s: ScriptInfo, running: boolean, width = 80): StyledRow[] {
  const h = s.header;
  const out: StyledRow[] = [];
  out.push(row('heading', cut(`${s.name}${h.summary ? ' — ' + h.summary : ''}`, width)));
  const status = [`${stateWord(s, running)}`, s.bundled ? 'bundled, read-only' : 'your script'].join(', ');
  out.push(row('note', `  ${status}`));
  if (s.loadProblem) out.push(row('note', cut(`  Cannot load: ${s.loadProblem}`, width)));
  if (s.lastError) out.push(row('note', cut(`  Last error: ${s.lastError}`, width)));
  if (h.aliases.length > 0) {
    out.push(row('group', 'Aliases'));
    const w = Math.max(...h.aliases.map((a) => a.name.length));
    for (const a of h.aliases) out.push(row('code', cut(`  ${a.name.padEnd(w)}  ${a.text}`, width)));
  }
  if (h.keys.length > 0) {
    out.push(row('group', 'Keys'));
    const w = Math.max(...h.keys.map((k) => k.key.length));
    for (const k of h.keys) out.push(row('code', cut(`  ${k.key.padEnd(w)}  ${k.text}`, width)));
  }
  if (h.help.length > 0) {
    out.push(row('group', 'Help'));
    for (const l of h.help) for (const part of wrap(l, width - 2)) out.push(row('text', `  ${part}`));
  }
  if (h.settings.length > 0) {
    out.push(row('group', 'Settings'));
    for (const d of h.settings) {
      const v = s.settings[d.name] ?? d.default;
      out.push(row('code', cut(`  ${d.name} = ${settingText(v)}${d.label ? `  ${d.label}` : ''}`, width)));
      out.push(row('note', cut(`    #script set ${s.name} ${d.name} <${d.type}>`, width)));
    }
  }
  return out;
}

/** Word-wraps `s` to `w` cells (a word longer than `w` is cut). */
function wrap(s: string, w: number): string[] {
  if (s.length <= w || w < 10) return [s];
  const out: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= w) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.map((l) => cut(l, w));
}
