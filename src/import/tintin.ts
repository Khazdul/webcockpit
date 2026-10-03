// TinTin++ (1.x and 2.x) → WebCockpit profile (ADR 0073 "Translation
// rules", research `tintin.md`).
//
// Text passes through. Fixed up: `/* */` block comments (at brace level 0)
// become `#nop` lines; `#read` and `#class {x} {read} {f}` are inlined
// from the chosen files; tt++'s GMCP event names lose ` IAC SE`; 1.x
// `#highlight {colour} {pattern}` and `#if {…} {…} else {…}` are
// rewritten; macro keys we can decode are renamed. `#config`,
// `#session`, `#split`, `#send` and screen commands are skipped. Inert
// commands stay in place verbatim (kept); commands the engine would reject
// (unknown words, unsupported `#class` forms) stay in place as `#nop`.

import { type CommandEntry, resolveCommand, scriptCommandArgs } from '../script/commands';
import { parseHighlight } from '../script/engine/color';
import { normalizeKey } from '../script/keys';
import { Args, type Out, type Resolver, type SourceFile, type Statement, braceSafe, br, nopLine, normaliseCmdChar, splitCommand, splitList } from './common';
import { sequenceKey } from './keys';

type StKind = 'blank' | 'comment' | 'command' | 'text';

interface TtStatement extends Statement {
  kind: StKind;
}

/** Splits tt++ text into statements, keeping blank lines and block comments. */
export function scanTintin(file: SourceFile, cmdChar = '#'): TtStatement[] {
  const text = file.text;
  const n = text.length;
  const out: TtStatement[] = [];
  let pos = 0;
  let line = 1;
  const push = (kind: StKind, end: number) => {
    const t = text.slice(pos, end);
    out.push({ file: file.name, line, kind, text: t });
    for (let i = pos; i < end; i++) if (text[i] === '\n') line++;
  };
  while (pos < n) {
    const nl = text.indexOf('\n', pos);
    const le = nl < 0 ? n : nl;
    if (text.slice(pos, le).trim() === '') {
      push('blank', le);
      pos = le + 1;
      line++;
      continue;
    }
    let p = pos;
    while (text[p] === ' ' || text[p] === '\t') p++;
    if (text.startsWith('/*', p)) {
      let depth = 0;
      let i = p;
      for (; i < n; i++) {
        if (text.startsWith('/*', i)) {
          depth++;
          i++;
        } else if (text.startsWith('*/', i)) {
          depth--;
          i++;
          if (depth === 0) break;
        }
      }
      const end = Math.min(i + 1, n);
      push('comment', end);
      pos = end;
      // The rest of the line, if blank, belongs to the comment.
      const nl2 = text.indexOf('\n', pos);
      const le2 = nl2 < 0 ? n : nl2;
      if (text.slice(pos, le2).trim() === '') {
        pos = le2 + 1;
        if (nl2 >= 0) line++;
      } else {
        while (text[pos] === ' ' || text[pos] === '\t') pos++;
      }
      continue;
    }
    const command = text[p] === cmdChar;
    let depth = 0;
    let i = pos;
    for (; i < n; i++) {
      const c = text[i];
      if (c === '\\' && text[i + 1] !== '\n') i++;
      else if (c === '{') depth++;
      else if (c === '}') {
        if (depth > 0) depth--;
      } else if (depth === 0 && c === '/' && text[i + 1] === '*' && i > p) break;
      else if (c === '\n' && depth === 0) {
        if (!command) break;
        let j = i + 1;
        while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
        if (text[j] !== '{') break;
      }
    }
    let end = Math.min(i, n);
    // A trailing block comment on the same line starts its own statement.
    let stop = end;
    while (stop > pos && (text[stop - 1] === ' ' || text[stop - 1] === '\t')) stop--;
    if (text.startsWith('/*', end)) {
      push(command ? 'command' : 'text', stop);
      pos = end;
      continue;
    }
    push(command ? 'command' : 'text', end);
    pos = end + 1;
    if (end < n) line++;
  }
  return out;
}

const SKIP: Record<string, string> = {
  config: 'Terminal setting; WebCockpit has its own settings',
  session: 'WebCockpit connects to MUME itself',
  split: 'Screen layout; WebCockpit has its own panes',
  unsplit: 'Screen layout; WebCockpit has its own panes',
  screen: 'Terminal screen command',
  cursor: 'Terminal screen command',
  bell: 'Terminal screen command',
  banner: 'Terminal screen command',
  draw: 'Terminal screen command',
  button: 'Terminal screen command',
  unbutton: 'Terminal screen command',
  buffer: 'Terminal screen command',
  gts: 'WebCockpit has one session',
  zap: 'WebCockpit has one session',
  all: 'WebCockpit has one session',
  port: 'WebCockpit has one session',
  snoop: 'WebCockpit has one session',
  chat: 'WebCockpit has one session',
  ssl: 'WebCockpit has one session',
  daemon: 'WebCockpit has one session',
  send: 'WebCockpit negotiates telnet and GMCP itself',
};

const TICK_1X = /^(?:tick|tickon|tickoff|tickset|ticksize)$/i;

type Result =
  | { type: 'as-is' }
  | { type: 'comment' }
  | { type: 'translated'; text: string; reason: string; warning?: string }
  | { type: 'keep'; text: string; reason: string }
  | { type: 'skip'; reason: string; read?: string }
  | { type: 'read'; path: string; cls?: string };

const GMCP_TT = /^IAC SB GMCP(?: (\S+))? IAC SE$/i;
const KNOWN_EVENT = /^(?:SESSION CONNECTED|SESSION DISCONNECTED|IAC SB GMCP(?: \S+)?)$/i;
const ELSE_1X = /\}\s*else\s*\{/g;

function rewriteArgs(word: string, args: string[]): string {
  return `#${word} ${args.map(br).join(' ')}`;
}

function command(text: string, cmdChar: string): Result {
  const sc = splitCommand(text, cmdChar);
  if (!sc) return { type: 'as-is' };
  const { word, rest } = sc;
  if (/^\d+$/.test(word)) return { type: 'as-is' };
  const e: CommandEntry | null | 'ambiguous' = resolveCommand(word);
  if (e === null || e === 'ambiguous') {
    if (TICK_1X.test(word)) return { type: 'keep', text: nopLine(`TinTin 1.x tick timer, use #ticker: ${text}`), reason: 'TinTin 1.x tick timer; use #ticker' };
    const reason = e === 'ambiguous' ? `Ambiguous command #${word}` : `Unknown command #${word}`;
    return { type: 'keep', text: nopLine(`${reason}: ${text}`), reason };
  }
  const a = new Args(rest);
  switch (e.name) {
    case 'nop':
      return { type: 'comment' };
    case 'read':
      return { type: 'read', path: a.next() };
    case 'class': {
      const cls = a.next();
      const op = a.next().toLowerCase();
      if (op === 'read') return { type: 'read', path: a.next(), cls };
      if (['open', 'close', 'kill', 'clear'].includes(op)) return { type: 'as-is' };
      const reason = `#class ${op || '(no operation)'} is not supported (only open, close and kill)`;
      return { type: 'keep', text: nopLine(`${reason}: ${text}`), reason };
    }
    case 'session': {
      const args = a.all();
      const read = args[3];
      return read ? { type: 'skip', reason: SKIP.session!, read } : { type: 'skip', reason: SKIP.session! };
    }
    case 'event': {
      const name = a.next();
      const norm = name.trim().replace(/\s+/g, ' ');
      const m = GMCP_TT.exec(norm);
      if (m) {
        const ours = m[1] ? `IAC SB GMCP ${m[1]}` : 'IAC SB GMCP';
        const body = a.rest();
        return {
          type: 'translated',
          text: `#event {${ours}} ${body}`,
          reason: `Event renamed to ${ours}`,
          warning: 'Arguments differ: tt++ passes a table in %0/%1 and JSON in %2; here %0 is the package and %1 the JSON.',
        };
      }
      if (KNOWN_EVENT.test(norm)) return { type: 'as-is' };
      return { type: 'keep', text, reason: `Event ${norm} never fires in WebCockpit` };
    }
    case 'highlight': {
      const args = a.all();
      if (args.length >= 2 && parseHighlight(args[0]!) && !parseHighlight(args[1]!)) {
        const swapped = [args[1]!, args[0]!, ...args.slice(2)];
        return {
          type: 'translated',
          text: rewriteArgs(word, swapped),
          reason: 'TinTin 1.x argument order {colour} {pattern} swapped',
          warning: 'Check the colour: 1.x colour names may differ.',
        };
      }
      return { type: 'as-is' };
    }
    case 'macro': {
      const key = a.next();
      const body = a.rest();
      const k = normalizeKey(key);
      if (k) return { type: 'as-is' };
      const seq = sequenceKey(key);
      if (!seq.ok) return { type: 'keep', text: nopLine(`${seq.reason}: ${text}`), reason: seq.reason };
      const r: Result = { type: 'translated', text: `#${word} {${seq.key}} ${body}`, reason: `Key ${key} written as ${seq.key}` };
      if (seq.warning) r.warning = seq.warning;
      return r;
    }
    case 'variable': {
      const name = a.next();
      if (a.nextBraced && /^\s*\{[^{}]*\}\s*\{/.test(a.next())) {
        return { type: 'translated', text, reason: `Variable ${name} is a table`, warning: 'Tables are not supported; the value is kept as text.' };
      }
      return { type: 'as-is' };
    }
  }
  if (e.inert) {
    if ((e.name === 'script' || e.name === 'lua') && scriptCommandArgs(e.name, rest)) return { type: 'as-is' };
    const reason = SKIP[e.name];
    if (reason) return { type: 'skip', reason };
    return { type: 'keep', text, reason: e.hint ?? 'Does nothing in WebCockpit' };
  }
  return { type: 'as-is' };
}

/** Rewrites the 1.x literal `else` of `#if {…} {…} else {…}`. */
function fixElse(text: string): string {
  if (!/#if/i.test(text)) return text;
  return text.replace(ELSE_1X, '} {');
}

/** Translates a tt++ file (and the files it reads) into `out`. */
export function translateTintin(entry: SourceFile, res: Resolver, out: Out): void {
  const m = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*([!-/:-@[-`~])/.exec(entry.text);
  const first = m?.[1];
  const comment = first === '/' && entry.text[m!.index + m![0].length] === '*';
  const cmdChar = first && first !== '#' && first !== '{' && !comment ? first : '#';
  if (cmdChar !== '#') out.warnFile(`The file uses ${cmdChar} as the command character; it was changed to #.`);
  translateFile(entry, res, out, cmdChar);
}

function translateFile(file: SourceFile, res: Resolver, out: Out, cmdChar: string): void {
  res.within(file, () => {
    for (const st of scanTintin(file, cmdChar)) statement(st, res, out, cmdChar);
  });
}

function statement(st0: TtStatement, res: Resolver, out: Out, cmdChar: string): void {
  if (st0.kind === 'blank') {
    out.raw(st0.text);
    return;
  }
  if (st0.kind === 'comment') {
    const body = st0.text.trim().replace(/^\/\*/, '').replace(/\*\/$/, '');
    for (const l of body.split('\n')) if (l.trim() !== '') out.raw(nopLine(l.trim()));
    out.changed = true;
    return;
  }
  if (st0.kind === 'text') {
    const reason = 'Text outside a command';
    out.keepInPlace(st0, reason, nopLine(`${reason}: ${st0.text.trim()}`));
    return;
  }
  let st: TtStatement = st0;
  if (cmdChar !== '#') {
    st = { ...st0, text: normaliseCmdChar(st0.text, cmdChar) };
    out.changed = true;
  }
  const fixed = fixElse(st.text);
  const elseFixed = fixed !== st.text;
  const text = fixed;
  const parts = splitList(text.trim());
  if (parts.length <= 1) {
    emit(st, text, command(text, '#'), res, out, cmdChar, elseFixed, true);
    return;
  }
  const results = parts.map((p) => command(p, '#'));
  if (results.every((r) => r.type === 'as-is' || r.type === 'comment')) {
    out.raw(text);
    results.forEach((r) => {
      if (r.type === 'as-is') out.item(st, 'translated', elseFixed ? { reason: 'TinTin 1.x else rewritten', warning: 'Check the #if.' } : {});
    });
    if (elseFixed) out.changed = true;
    return;
  }
  out.changed = true;
  parts.forEach((p, i) => emit({ ...st, text: p }, p, results[i]!, res, out, cmdChar, elseFixed, false));
}

function emit(st: Statement, text: string, r: Result, res: Resolver, out: Out, cmdChar: string, elseFixed: boolean, whole: boolean): void {
  const elseNote = { reason: 'TinTin 1.x else rewritten', warning: 'Check the #if: the 1.x else keyword was removed.' };
  switch (r.type) {
    case 'comment':
      out.raw(text);
      return;
    case 'as-is':
      out.raw(text);
      out.item(st, 'translated', elseFixed ? elseNote : {});
      if (elseFixed || !whole) out.changed = true;
      return;
    case 'translated': {
      out.raw(r.text);
      const note: { reason: string; warning?: string } = { reason: r.reason };
      if (r.warning) note.warning = r.warning;
      out.item(st, 'translated', note);
      out.changed = true;
      return;
    }
    case 'keep':
      out.keepInPlace(st, r.reason, r.text);
      if (!whole) out.changed = true;
      return;
    case 'skip':
      out.skip(st, r.reason);
      if (r.read) inline(st, r.read, undefined, res, out, cmdChar);
      return;
    case 'read':
      inline(st, r.path, r.cls, res, out, cmdChar);
      return;
  }
}

function inline(st: Statement, path: string, cls: string | undefined, res: Resolver, out: Out, cmdChar: string): void {
  const got = res.read(path);
  if (!got.ok) {
    // Kept inert: the engine shows a hint for #read; a #class read is not a valid form.
    if (cls === undefined && /^\s*#re/i.test(st.text) && !/;/.test(st.text)) out.keepInPlace(st, got.reason);
    else out.keepInPlace(st, got.reason, nopLine(`${got.reason}: ${st.text.trim()}`));
    return;
  }
  out.changed = true;
  out.item(st, 'translated', { reason: `Inlined ${got.file.name}` });
  if (cls !== undefined) out.raw(`#class {${braceSafe(cls)}} {open}`);
  out.raw(nopLine(`--- ${got.file.name} ---`));
  translateFile(got.file, res, out, cmdChar);
  out.raw(nopLine(`--- end of ${got.file.name} ---`));
  if (cls !== undefined) out.raw(`#class {${braceSafe(cls)}} {close}`);
}
