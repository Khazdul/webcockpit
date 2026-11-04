// `#script list` and `#script help <name>` as game output rows (spec
// §2.10). No DOM; the classes are the `#help` ones (ui.css). The help is
// what the Scripts page shows: name and summary, aliases and keys, the
// `@help` text typeset as on the page (help-text.ts, ADR 0121), and each
// setting with its value and the `#script set` command that changes it.

import type { StyledRow } from '../ui/output-pane';
import { type SettingDecl, formatNumber } from './header';
import { type HelpRole, typesetHelp } from './help-text';
import type { ScriptInfo } from './library';

const row = (kind: string, text: string): StyledRow => ({ cls: `wc-help wc-help-${kind}`, segs: [{ text }] });

/** Cuts `s` to `w` cells with `…`. */
function cut(s: string, w: number): string {
  return s.length > w ? s.slice(0, Math.max(0, w - 1)) + '…' : s;
}

/** The value of a setting as `#script set` takes it. */
export function settingText(v: string | number | boolean): string {
  if (typeof v === 'number') return formatNumber(v);
  return typeof v === 'string' ? (v === '' || /\s|[{}]/.test(v) ? `{${v}}` : v) : String(v);
}

/** What a setting takes, for `#script set`: `number 0..10`, `10|20`, `boolean`. */
export function settingKind(d: SettingDecl): string {
  if (d.type === 'choice') return (d.options ?? []).map(String).join('|');
  if (d.type === 'number' && d.min !== undefined && d.max !== undefined) return `number ${formatNumber(d.min)}..${formatNumber(d.max)}`;
  return d.type;
}

/** The `#help` class of each help role. */
const HELP_CLS: Record<HelpRole, string> = {
  heading: 'wc-help-group',
  text: 'wc-help-text',
  bullet: 'wc-help-syntax',
  term: 'wc-help-syntax',
  desc: 'wc-help-text',
  pre: 'wc-help-code',
};

/** The state word of a script on its row. */
export function stateWord(s: ScriptInfo, running: boolean): string {
  if (!s.enabled) return 'off';
  if (s.lastError && !running) return 'failed';
  return 'on';
}

/** `#script list`: one row per script. */
export function listRows(list: readonly ScriptInfo[], running: (name: string) => boolean, width = 80): StyledRow[] {
  if (list.length === 0) return [row('note', 'No scripts yet. #scripts opens the Scripts page; the start page has it under Profile.')];
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
    for (const l of typesetHelp(h.help, width - 2)) {
      out.push({
        cls: 'wc-help wc-help-text',
        segs: [{ text: '  ' }, ...l.map((s) => (s.role ? { text: s.text, cls: HELP_CLS[s.role] } : { text: s.text }))],
      });
    }
  }
  if (h.settings.length > 0) {
    out.push(row('group', 'Settings'));
    for (const d of h.settings) {
      const v = s.settings[d.name] ?? d.default;
      const unit = d.unit ? ` ${d.unit}` : '';
      out.push(row('code', cut(`  ${d.name} = ${settingText(v)}${unit}${d.label ? `  ${d.label}` : ''}`, width)));
      out.push(row('note', cut(`    #script set ${s.name} ${d.name} <${settingKind(d)}>`, width)));
    }
  }
  return out;
}
