// Mudlet packages and profile saves → WebCockpit profile (ADR 0076,
// research `mudlet.md`).
//
// A MudletPackage XML is a tree of triggers, timers, aliases, buttons,
// scripts, keys and variables. The translation:
// - installed packages (a top-level folder whose name is its packageName,
//   or a packageName listed in HostPackage) are skipped, one report item
//   each, naming the built-in replacement;
// - own folders become `#class {a/b} {open}` … `{close}`;
// - aliases → `#alias`, triggers → `#action` (one per pattern), plus
//   `#gag`/`#highlight`/`#substitute` from colorizers and line idioms,
//   keys → `#macro`, timers → `#ticker`, variables → `#variable`;
// - bodies go through the Lua subset (mudlet-lua.ts); functions of the
//   user's own Scripts are inlined, Scripts themselves are not imported;
// - `enable…/disable…("name")` → gate variables `mudlet_on_<name>` (1/0)
//   wrapping the named items' bodies; gags, highlights and substitutes of
//   a gated item get `${mudlet_gate_<name>}` in their pattern, which is
//   empty when on and a never-matching `%!{(?!)}` when off. One
//   priority-1 `#action {%*}` copies each such gate from `mudlet_on_` at
//   the start of every line, so a trigger that gags its line and then
//   disables itself still gags that line, as in Mudlet (our actions run
//   before gags);
// - every global the rules read gets a start value;
// - what cannot be translated (or is disabled) is kept in the
//   not-translated block as `#nop {<reason> (<kind> <name>): <source>}`.

import { checkBraces } from '../script/doc';
import { compilePattern } from '../script/engine/pattern';
import { type Out, type SourceFile, type Statement, braceSafe, nopLine, regexToPattern } from './common';
import { qtKey } from './keys';
import {
  type BodyOk,
  type LuaEnv,
  type LuaFunction,
  analyseScript,
  checkFunction,
  escapeText,
  lex,
  literalPattern,
  mudletColour,
  rgbCode,
  translateBody,
  translateStmts,
} from './mudlet-lua';
import { type XmlElement, XmlError, childText, parseXml } from './xml';

type Kind = 'Trigger' | 'Alias' | 'Key' | 'Timer' | 'Script' | 'Action';

const SECTIONS: Record<string, Kind> = {
  TriggerPackage: 'Trigger',
  TimerPackage: 'Timer',
  AliasPackage: 'Alias',
  ActionPackage: 'Action',
  ScriptPackage: 'Script',
  KeyPackage: 'Key',
};

/** Built-in replacements for well-known packages (ADR 0076 "Packages"). */
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/^port key library/i, 'WebCockpit has a built-in Key manager'],
  [/^mumespelltimers/i, 'WebCockpit shows spell timers in the Timers pane'],
  [/^comlibrary/i, 'WebCockpit has a Comm pane'],
  [/^xpcounter/i, 'WebCockpit shows XP in the Character pane and Statistics'],
  [/^qc\b/i, 'Not needed: WebCockpit profiles have #alias and #action'],
  [/^(?:run-lua-code|echo|deleteoldprofiles|enable-accessibility|mpkg|gui-drop|generic_mapper)$/i, "Mudlet's own package, not needed"],
];

interface Node {
  kind: Kind;
  el: XmlElement;
  name: string;
  folder: boolean;
  active: boolean;
  /** Own folder ancestors, outermost first. */
  folders: Node[];
  children: Node[];
}

/** One translated or kept item, before it is written out. */
interface Rec {
  st: Statement;
  kind: Kind | 'Variable';
  outcome: 'translated' | 'kept' | 'skipped';
  lines: string[];
  group: string | null;
  reason?: string;
  warnings: string[];
  /** For kept items: the text after `(<kind> <name>): `. */
  keptText?: string;
  sends?: string[];
  reads?: Set<string>;
}

/** `enableTrigger("x")` / `disableAlias("x")` … calls in Lua code (a syntax error finds none). */
function gateCalls(code: string): Array<{ kind: Kind; name: string }> {
  let toks: ReturnType<typeof lex>;
  try {
    toks = lex(code);
  } catch {
    return [];
  }
  const out: Array<{ kind: Kind; name: string }> = [];
  for (let i = 0; i + 2 < toks.length; i++) {
    const m = toks[i]!.t === 'name' ? /^(?:enable|disable)(Trigger|Alias|Key|Timer)$/.exec(toks[i]!.v) : null;
    if (!m) continue;
    const a = toks[i + 1]!;
    const b = toks[i + 2]!;
    if (a.t === 'op' && a.v === '(' && b.t === 'str') out.push({ kind: m[1] as Kind, name: b.v });
    else if (b.t === 'str' && a.t === 'str') out.push({ kind: m[1] as Kind, name: a.v });
  }
  return out;
}

/** Placeholder for the commands of `enable…/disable…("name")`, resolved at the end. */
const GATE_MARK = '\u0000GATE';

const NEVER = '%!{(?!)}';

export interface MudletInfo {
  version: string;
  profileSave: boolean;
}

/** Decodes format 1.001 control pictures (U+FFFC + U+2400…U+2421) in script text. */
export function decodeControls(text: string): string {
  return text.replace(/\uFFFC([\u2400-\u2421])/g, (_m, c: string) => (c === '\u2421' ? '\x7f' : String.fromCharCode(c.charCodeAt(0) - 0x2400)));
}

function replacement(pkg: string): string | null {
  return REPLACEMENTS.find(([re]) => re.test(pkg))?.[1] ?? null;
}

function varName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

/** A folder path as a class name (no braces or `;`). */
function className(folders: Node[]): string | null {
  if (folders.length === 0) return null;
  return folders
    .map((f) => f.name.replace(/[{]/g, '(').replace(/[}]/g, ')').replace(/;/g, ',').trim() || '_')
    .join('/');
}

/** Typed text (`command`/`mCommand`): `;;` separates commands; everything else is literal. */
function commandText(cmd: string): string[] {
  return cmd
    .split(';;')
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .map((c) => c.replace(/[\\{};]/g, '\\$&').replace(/([$&])(?=[A-Za-z_{])/g, '\\$1').replace(/%(?=[0-9])/g, '\\%'));
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

type PatResult = { ok: true; pattern: string } | { ok: false; reason: string };

/**
 * A Mudlet (PCRE) regex as a tt++ pattern: `regexToPattern` when its
 * groups map to arguments; the optional tail `x(?: (.+))?$` is rewritten
 * so its group is one; otherwise, when the body needs no arguments, the
 * whole regex as a not-stored `%!{…}`.
 */
export function mudletRegex(source: string, needArgs: boolean): PatResult {
  let re = source;
  let flags = '';
  if (re.startsWith('(?i)')) {
    flags = 'i';
    re = re.slice(4);
  }
  // `x(?:SEP(Y))?$` → `x(?:SEP|$)((?:Y)?)$`: the group is then top level.
  const tail = /^(.*)\(\?:([^()]*)\(([^()]*)\)\)\?\$$/.exec(re);
  if (tail && !tail[1]!.endsWith('\\')) re = `${tail[1]}(?:${tail[2]}|$)(${tail[3] === '.+' ? '.*' : `(?:${tail[3]})?`})$`;
  const r = regexToPattern(re, flags, true);
  if (r.ok) return { ok: true, pattern: r.pattern };
  if (needArgs) return r;
  try {
    new RegExp(re);
  } catch {
    return r;
  }
  const p = `${flags ? '%i' : ''}%!{${re}}`;
  if (!checkBraces(p).ok) return r;
  return { ok: true, pattern: p };
}

/** Top-level capture groups of a regex: [start, end) of each `(…)`, or null when one has a quantifier. */
function captureSpans(re: string): Array<[number, number]> | null {
  const spans: Array<[number, number]> = [];
  let depth = 0;
  let inClass = false;
  let start = -1;
  for (let i = 0; i < re.length; i++) {
    const c = re[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === '(') {
      if (depth === 0) start = re[i + 1] !== '?' || /^\?<[^=!]/.test(re.slice(i + 1)) ? i : -1;
      depth++;
    } else if (c === ')' && --depth === 0 && start >= 0) {
      if (/^[*+?{]/.test(re.slice(i + 1))) return null;
      spans.push([start, i + 1]);
      start = -1;
    }
  }
  return spans;
}

/**
 * Highlight patterns for a colorizer regex: Mudlet colours the capture
 * groups when there are any, else the whole match. Each group becomes
 * `%!{(?<=before)group(?=after)}`, so only its text is coloured.
 */
function colorizerPatterns(re: string, plain: string): string[] {
  let src = re;
  let flags = '';
  if (src.startsWith('(?i)')) {
    flags = '%i';
    src = src.slice(4);
  }
  const spans = captureSpans(src);
  if (!spans || spans.length === 0) return [plain];
  const out: string[] = [];
  for (const [s, e] of spans) {
    const before = src.slice(0, s);
    const inner = src.slice(s + 1, e - 1).replace(/^\?<[^>]+>/, '');
    const after = src.slice(e);
    const p = `${flags}%!{${before ? `(?<=${before})` : ''}${inner}${after ? `(?=${after})` : ''}}`;
    try {
      new RegExp(p.slice(flags.length + 3, -1));
    } catch {
      return [plain];
    }
    if (!checkBraces(p).ok) return [plain];
    out.push(p);
  }
  return out;
}

const PATTERN_TYPES: Record<number, string> = {
  4: 'Lua function pattern',
  5: 'Line spacer pattern (multiline trigger)',
  6: 'Colour pattern',
  7: 'Prompt pattern',
};

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

class MudletTranslator {
  private readonly recs: Rec[] = [];
  private readonly packages = new Map<string, { line: number; items: number }>();
  private readonly installed: string[];
  private readonly profileSave: boolean;
  /** Gates some translated rule reads (they need a start value). */
  private readonly usedGates = new Set<string>();
  private readonly decode: boolean;
  private readonly own: Node[] = [];
  private readonly env: LuaEnv;
  private readonly functions = new Map<string, LuaFunction>();
  private readonly defined = new Set<string>();
  /** Gated names → the kinds the enable/disable calls name. */
  private readonly gateKinds = new Map<string, Set<Kind>>();
  /** Gated names whose items have gags, highlights or substitutes. */
  private readonly patternGates = new Set<string>();
  /** Start values of gates (first item with the name). */
  private readonly gateStart = new Map<string, boolean>();
  private readonly defaults = new Map<string, { value: string; conditional: boolean }>();
  private readonly variables = new Map<string, string>();
  private readonly aliasPatterns: string[] = [];

  constructor(
    private readonly file: SourceFile,
    private readonly root: XmlElement,
  ) {
    const host = this.root.children.find((c) => c.name === 'HostPackage');
    const hostEl = host?.children.find((c) => c.name === 'Host');
    const list = hostEl?.children.find((c) => c.name === 'mInstalledPackages');
    this.installed = list ? list.children.filter((c) => c.name === 'string').map((c) => c.text) : [];
    this.profileSave = host !== undefined;
    this.decode = Number(root.attrs['version'] ?? '1') > 1.0;
    this.env = {
      functions: this.functions,
      defined: this.defined,
      gate: (name, on) => [`${GATE_MARK}:${on ? 1 : 0}:${name}\u0000`],
    };
  }

  private st(line: number, text: string): Statement {
    return { file: this.file.name, line, text };
  }

  private script(el: XmlElement): string {
    const s = childText(el, 'script');
    return this.decode ? decodeControls(s) : s;
  }

  private command(el: XmlElement): string {
    const s = childText(el, 'command') || childText(el, 'mCommand');
    return this.decode ? decodeControls(s) : s;
  }

  // ------------------------------------------------------------ the tree

  private isPackage(el: XmlElement, folder: boolean): string | null {
    const pkg = childText(el, 'packageName');
    if (pkg === '') return null;
    if (folder && pkg === childText(el, 'name')) return pkg;
    if (this.installed.includes(pkg)) return pkg;
    return null;
  }

  private build(el: XmlElement, kind: Kind, folders: Node[]): Node {
    const folder = el.attrs['isFolder'] === 'yes' || el.name.endsWith('Group');
    const node: Node = {
      kind,
      el,
      name: childText(el, 'name'),
      folder,
      active: el.attrs['isActive'] !== 'no',
      folders,
      children: [],
    };
    const inner = folder ? [...folders, node] : folders;
    for (const c of el.children) if (c.name === kind || c.name === `${kind}Group`) node.children.push(this.build(c, kind, inner));
    return node;
  }

  private countItems(el: XmlElement, kind: string): number {
    let n = 0;
    for (const c of el.children) {
      if (c.name !== kind && c.name !== `${kind}Group`) continue;
      if (!(c.attrs['isFolder'] === 'yes' || c.name.endsWith('Group'))) n++;
      n += this.countItems(c, kind);
    }
    return n;
  }

  /**
   * Splits the top level into packages and own items. A file that is
   * nothing but packages and no profile save (an exported `.mpackage`)
   * is what the user chose to import: its packages are translated, except
   * those WebCockpit replaces.
   */
  private collect(): void {
    const top: Array<{ el: XmlElement; kind: Kind; folder: boolean; pkg: string | null }> = [];
    for (const section of this.root.children) {
      const kind = SECTIONS[section.name];
      if (!kind) continue;
      for (const el of section.children) {
        if (el.name !== kind && el.name !== `${kind}Group`) continue;
        const folder = el.attrs['isFolder'] === 'yes' || el.name.endsWith('Group');
        top.push({ el, kind, folder, pkg: this.isPackage(el, folder) });
      }
    }
    const exported = !this.profileSave && top.length > 0 && top.every((t) => t.pkg !== null);
    for (const { el, kind, folder, pkg } of top) {
      if (pkg !== null && !(exported && !replacement(pkg))) {
        const p = this.packages.get(pkg) ?? { line: el.line, items: 0 };
        p.items += folder ? this.countItems(el, kind) : 1;
        this.packages.set(pkg, p);
        if (kind === 'Script') this.scanPackageScripts(el);
        continue;
      }
      this.own.push(this.build(el, kind, []));
    }
  }

  private scanPackageScripts(el: XmlElement): void {
    if (el.name === 'Script') for (const n of analyseScript(this.script(el)).defined) this.defined.add(n);
    for (const c of el.children) if (c.name === 'Script' || c.name === 'ScriptGroup') this.scanPackageScripts(c);
  }

  private *walk(nodes: Node[]): Generator<Node> {
    for (const n of nodes) {
      yield n;
      yield* this.walk(n.children);
    }
  }

  // ----------------------------------------------------------- pre-passes

  private prepare(): void {
    // Own Scripts: functions to inline and default values.
    for (const n of this.walk(this.own)) {
      if (n.kind !== 'Script' || n.folder) continue;
      const a = analyseScript(this.script(n.el));
      for (const f of a.functions) this.functions.set(f.name, f);
      for (const d of a.defined) this.defined.add(d);
      for (const d of a.defaults) {
        const prev = this.defaults.get(d.name);
        if (!prev || !d.conditional || prev.conditional) this.defaults.set(d.name, { value: d.value, conditional: d.conditional });
      }
    }
    // Gates: names that some own body enables or disables (tokens, so comments do not count).
    for (const n of this.walk(this.own)) {
      for (const g of gateCalls(this.script(n.el))) {
        const set = this.gateKinds.get(g.name) ?? new Set<Kind>();
        set.add(g.kind);
        this.gateKinds.set(g.name, set);
      }
    }
    for (const n of this.walk(this.own)) {
      if (this.gateKinds.get(n.name)?.has(n.kind) && !this.gateStart.has(n.name)) this.gateStart.set(n.name, n.active);
    }
  }

  /** The gates on an item: its folders' and its own, outermost first. */
  private gatesOf(n: Node): string[] {
    return [...n.folders, n].filter((x) => this.gateKinds.get(x.name)?.has(x.kind)).map((x) => x.name);
  }

  /** True when the item or a folder is switched off and nothing switches it on. */
  private disabled(n: Node): boolean {
    return [...n.folders, n].some((x) => !x.active && !this.gateKinds.get(x.name)?.has(x.kind));
  }

  // ---------------------------------------------------------------- items

  run(): void {
    this.collect();
    this.prepare();
    for (const [name, p] of this.packages) {
      const repl = replacement(name) ?? 'Third-party package, not imported';
      this.recs.push({
        st: this.st(p.line, `Package ${name}`),
        kind: 'Script',
        outcome: 'skipped',
        lines: [],
        group: null,
        reason: `${repl} (${p.items} item${p.items === 1 ? '' : 's'})`,
        warnings: [],
      });
    }
    for (const n of this.own) this.item(n);
    this.variablePackage();
  }

  private item(n: Node): void {
    if (n.folder) {
      for (const c of n.children) this.item(c);
      return;
    }
    switch (n.kind) {
      case 'Alias':
        this.alias(n);
        break;
      case 'Trigger':
        this.trigger(n);
        return; // chains handle their own children
      case 'Key':
        this.key(n);
        break;
      case 'Timer':
        this.timer(n);
        break;
      case 'Script':
        this.scriptItem(n);
        break;
      case 'Action':
        this.keep(n, '', 'Toolbar button', [childText(n.el, 'commandButtonUp'), childText(n.el, 'commandButtonDown'), this.script(n.el)].filter(Boolean).join('\n'));
        break;
    }
    for (const c of n.children) this.item(c);
  }

  private source(n: Node, pattern: string): string {
    return `${n.kind} ${n.name}${pattern ? `  ${pattern}` : ''}`;
  }

  private keep(n: Node, pattern: string, reason: string, code?: string): void {
    const body = [pattern, this.command(n.el) ? `command: ${this.command(n.el)}` : '', code ?? this.script(n.el)]
      .filter((s, i, a) => s.trim() !== '' && a.indexOf(s) === i)
      .join('\n');
    this.recs.push({
      st: this.st(n.el.line, this.source(n, pattern)),
      kind: n.kind,
      outcome: 'kept',
      lines: [],
      group: null,
      reason,
      warnings: [],
      keptText: body,
    });
  }

  /** The body (command + script) of an item; null and a kept record when it is not translatable. */
  private body(n: Node, pattern: string, trigger: string[] | null): BodyOk | null {
    const code = this.script(n.el);
    const r = translateBody(code, this.env, trigger ? { patterns: trigger } : null);
    if (!r.ok) {
      this.keep(n, pattern, this.disabled(n) ? `${r.reason}; disabled in Mudlet` : r.reason);
      return null;
    }
    const cmd = commandText(this.command(n.el));
    if (cmd.length > 0) r.commands.unshift(...cmd);
    return r;
  }

  /** Wraps a body in the item's gates. */
  private gated(n: Node, body: string, orelse?: string): string {
    const gates = this.gatesOf(n);
    if (gates.length === 0) return body;
    for (const g of gates) this.usedGates.add(g);
    const cond = gates.map((g) => `$mudlet_on_${varName(g)}`).join(' && ');
    return `#if {${cond}} {${body}}${orelse !== undefined ? ` #else {${orelse}}` : ''}`;
  }

  /** A gag/highlight/substitute pattern with the item's pattern gates. */
  private gatedPattern(n: Node, pattern: string): string {
    const gates = this.gatesOf(n);
    if (gates.length === 0) return pattern;
    for (const g of gates) {
      this.patternGates.add(g);
      this.usedGates.add(g);
    }
    const prefix = gates.map((g) => `\${mudlet_gate_${varName(g)}}`).join('');
    return pattern.startsWith('^') ? `^${prefix}${pattern.slice(1)}` : prefix + pattern;
  }

  private finish(n: Node, pattern: string, lines: string[], r: BodyOk | null, notes: string[] = []): void {
    const warnings = [...notes, ...(r?.warnings ?? [])];
    if (lines.length === 0) {
      this.recs.push({ st: this.st(n.el.line, this.source(n, pattern)), kind: n.kind, outcome: 'skipped', lines: [], group: null, reason: 'Does nothing', warnings: [] });
      return;
    }
    const bad = lines.find((l) => !checkBraces(l).ok);
    if (bad !== undefined) {
      this.keep(n, pattern, 'Unbalanced braces after translation');
      return;
    }
    if (this.disabled(n)) {
      this.recs.push({
        st: this.st(n.el.line, this.source(n, pattern)),
        kind: n.kind,
        outcome: 'kept',
        lines: [],
        group: null,
        reason: 'Disabled in Mudlet',
        warnings: [],
        keptText: lines.join('\n'),
      });
      return;
    }
    const rec: Rec = { st: this.st(n.el.line, this.source(n, pattern)), kind: n.kind, outcome: 'translated', lines, group: className(n.folders), warnings };
    if (r) {
      rec.sends = r.sends;
      rec.reads = r.reads;
    }
    this.recs.push(rec);
  }

  private alias(n: Node): void {
    const regex = childText(n.el, 'regex');
    if (regex === '') {
      this.keep(n, regex, 'Alias without a pattern');
      return;
    }
    const r = this.body(n, regex, null);
    if (!r) return;
    const body = r.commands.join(';');
    const p = mudletRegex(regex, /%0?[1-9]/.test(body.replace(/\\%/g, '')));
    if (!p.ok) {
      this.keep(n, regex, p.reason);
      return;
    }
    this.aliasPatterns.push(p.pattern);
    const notes: string[] = [];
    if (r.gag || r.highlights.length > 0 || r.substitutes.length > 0) notes.push('Line edits in an alias were dropped.');
    const lines = body === '' ? [] : [`#alias {${p.pattern}} {${this.gated(n, body, '%0')}}`];
    this.finish(n, regex, lines, r, notes);
  }

  private trigger(n: Node): void {
    const el = n.el;
    const pats = (el.children.find((c) => c.name === 'regexCodeList')?.children ?? []).map((c) => c.text);
    const types = (el.children.find((c) => c.name === 'regexCodePropertyList')?.children ?? []).map((c) => Number(c.text));
    const shown = pats.join(' | ');
    const keepChain = (reason: string): void => {
      this.keep(n, shown, reason);
      for (const c of this.walk(n.children)) {
        if (c.folder) continue;
        const cp = (c.el.children.find((x) => x.name === 'regexCodeList')?.children ?? []).map((x) => x.text).join(' | ');
        this.keep(c, cp, `Part of the trigger chain ${n.name}`);
      }
    };
    if (n.children.length > 0) return keepChain('Trigger chain (children run only after it fires)');
    if (el.attrs['isMultiline'] === 'yes') return this.keep(n, shown, 'Multiline (AND) trigger');
    if (el.attrs['isFilterTrigger'] === 'yes') return this.keep(n, shown, 'Filter trigger');
    if (el.attrs['isColorTrigger'] === 'yes') return this.keep(n, shown, 'Colour trigger');
    const odd = types.find((t) => PATTERN_TYPES[t]);
    if (odd !== undefined) return this.keep(n, shown, PATTERN_TYPES[odd]!);
    if (pats.length === 0) return this.keep(n, shown, 'Trigger without a pattern');
    const colorizer = el.attrs['isColorizerTrigger'] === 'yes';
    const notes: string[] = [];
    if (el.attrs['isSoundTrigger'] === 'yes') notes.push('The sound is not played.');

    // Patterns without the body's arguments known yet: regex groups are needed when the body uses them.
    const code = this.script(el);
    const usesArgs = /matches\s*\[/.test(code) || /multimatches/.test(code);
    const ttPats: string[] = [];
    for (let i = 0; i < pats.length; i++) {
      const src = pats[i]!;
      const type = types[i] ?? 0;
      if (type === 0) ttPats.push(literalPattern(src));
      else if (type === 2) ttPats.push('^' + literalPattern(src));
      else if (type === 3) ttPats.push('^' + literalPattern(src) + '$');
      else {
        const p = mudletRegex(src, usesArgs);
        if (!p.ok) return this.keep(n, shown, p.reason);
        ttPats.push(p.pattern);
      }
    }
    if (el.attrs['isPerlSlashGOption'] === 'yes' && code.trim() !== '') return this.keep(n, shown, 'Matches every occurrence on the line (/g)');

    const r = this.body(n, shown, ttPats);
    if (!r) return;
    const body = r.commands.join(';');
    const lines: string[] = [];
    if (colorizer) {
      const fg = childText(el, 'mFgColor');
      const bg = childText(el, 'mBgColor');
      const f = fg && fg !== 'transparent' ? mudletColour(fg) : null;
      const b = bg && bg !== 'transparent' ? mudletColour(bg) : null;
      const colour = (f ? rgbCode(true, ...f) : '') + (b ? rgbCode(false, ...b) : '');
      if (colour) {
        pats.forEach((src, i) => {
          const hp = types[i] === 1 ? colorizerPatterns(src, ttPats[i]!) : [ttPats[i]!];
          for (const p of hp) lines.push(`#highlight {${this.gatedPattern(n, p)}} {${colour}}`);
        });
      }
    }
    for (const p of ttPats) {
      if (body !== '') lines.push(`#action {${p}} {${this.gated(n, body)}}`);
      if (r.gag) lines.push(`#gag {${this.gatedPattern(n, p)}}`);
    }
    for (const h of r.highlights) lines.push(`#highlight {${this.gatedPattern(n, h.pattern)}} {${h.colour}}`);
    for (const s of r.substitutes) lines.push(`#substitute {${this.gatedPattern(n, s.pattern)}} {${s.text}}`);
    if (r.highlights.length > 0 && r.highlights.some((h) => !ttPats.some((p) => p.includes(h.pattern)))) {
      notes.push('The selected text is highlighted on every line, not only where the trigger fires.');
    }
    this.finish(n, shown, [...new Set(lines)], r, notes);
  }

  private key(n: Node): void {
    const code = Number(childText(n.el, 'keyCode'));
    const mods = Number(childText(n.el, 'keyModifier'));
    const k = qtKey(code, mods);
    const shown = k.ok ? k.key : `keyCode ${code} keyModifier ${mods}`;
    if (!k.ok) return this.keep(n, shown, k.reason);
    const r = this.body(n, shown, null);
    if (!r) return;
    const body = r.commands.join(';');
    this.finish(n, shown, body === '' ? [] : [`#macro {${k.key}} {${this.gated(n, body)}}`], r, k.warning ? [k.warning] : []);
  }

  private timer(n: Node): void {
    const time = childText(n.el, 'time');
    const m = /^(\d+):(\d+):(\d+)(?:\.(\d+))?$/.exec(time.trim());
    if (n.el.attrs['isTempTimer'] === 'yes') return this.keep(n, time, 'Temporary timer');
    if (n.el.attrs['isOffsetTimer'] === 'yes') return this.keep(n, time, 'Offset timer (runs once after its parent)');
    if (!m) return this.keep(n, time, 'Timer without a time');
    const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4] ?? '0'}`);
    if (secs <= 0) return this.keep(n, time, 'Timer with no interval');
    const r = this.body(n, time, null);
    if (!r) return;
    const body = r.commands.join(';');
    const name = braceSafe(n.name || 'timer').replace(/[{}]/g, '');
    this.finish(n, time, body === '' ? [] : [`#ticker {${name}} {${this.gated(n, body)}} {${String(Math.round(secs * 1000) / 1000)}}`], r);
  }

  private scriptItem(n: Node): void {
    const code = this.script(n.el);
    const st = this.st(n.el.line, this.source(n, ''));
    if (code.trim() === '') {
      this.recs.push({ st, kind: 'Script', outcome: 'skipped', lines: [], group: null, reason: 'Empty script', warnings: [] });
      return;
    }
    const handlers = (n.el.children.find((c) => c.name === 'eventHandlerList')?.children ?? []).map((c) => c.text).filter(Boolean);
    if (handlers.length > 0) return this.keep(n, '', `Event handler script (${handlers.join(', ')})`);
    const a = analyseScript(code);
    if (a.error) return this.keep(n, '', a.error);
    if (a.other.length > 0) {
      const r = translateStmts(a.other, this.env);
      return this.keep(n, '', r.ok ? 'Runs commands when the profile loads' : r.reason);
    }
    for (const f of a.functions) {
      const why = checkFunction(f, this.env);
      if (why) return this.keep(n, '', `Function ${f.name}: ${why}`);
    }
    this.recs.push({ st, kind: 'Script', outcome: 'translated', lines: [], group: null, reason: 'Inlined where its functions are called; defaults become start values', warnings: [] });
  }

  private variablePackage(): void {
    const pkg = this.root.children.find((c) => c.name === 'VariablePackage');
    if (!pkg) return;
    const walk = (el: XmlElement, prefix: string): void => {
      for (const v of el.children) {
        if (v.name !== 'Variable' && v.name !== 'VariableGroup') continue;
        const name = childText(v, 'name');
        const value = childText(v, 'value');
        const type = childText(v, 'valueType');
        const st = this.st(v.line, `Variable ${prefix}${name}  ${value}`);
        if (v.name === 'VariableGroup' || type === '5') {
          this.recs.push({ st, kind: 'Variable', outcome: 'kept', lines: [], group: null, reason: 'Table variable', warnings: [], keptText: `${prefix}${name}` });
          continue;
        }
        if (prefix !== '' || !/^[A-Za-z_]\w*$/.test(name)) {
          this.recs.push({ st, kind: 'Variable', outcome: 'kept', lines: [], group: null, reason: 'Variable name tt++ cannot use', warnings: [], keptText: `${prefix}${name} = ${value}` });
          continue;
        }
        let text = value;
        if (type === '1') text = value === 'true' ? '1' : '0';
        else text = escapeText(value);
        this.variables.set(name, text);
        this.recs.push({ st, kind: 'Variable', outcome: 'translated', lines: [`#variable {${name}} {${text}}`], group: null, warnings: [] });
      }
    };
    walk(pkg, '');
  }

  // --------------------------------------------------------------- output

  /** Resolves gate placeholders in a line. */
  private gateCommands(line: string): string {
    return line.replace(/\u0000GATE:([01]):([^\u0000]*)\u0000/g, (_m, on: string, name: string) => {
      return `#variable {mudlet_on_${varName(name)}} {${on}}`;
    });
  }

  write(out: Out): void {
    // Start values: saved variables, gates, Script defaults, then empty ones.
    const reads = new Set<string>();
    for (const r of this.recs) if (r.outcome === 'translated' && r.reads) for (const v of r.reads) reads.add(v);
    const saved: Rec[] = [];
    const startLines: string[] = [];
    for (const [name, on] of this.gateStart) {
      if (!this.usedGates.has(name)) continue;
      const v = varName(name);
      startLines.push(`#variable {mudlet_on_${v}} {${on ? 1 : 0}}`);
      if (this.patternGates.has(name)) startLines.push(`#variable {mudlet_gate_${v}} {${on ? '' : NEVER}}`);
    }
    for (const r of this.recs) if (r.kind === 'Variable' && r.outcome === 'translated') saved.push(r);
    const empty: string[] = [];
    for (const v of reads) {
      if (v.startsWith('mudlet_')) continue;
      const d = this.defaults.get(v);
      if (d && (!d.conditional || !this.variables.has(v))) startLines.push(`#variable {${v}} {${d.value}}`);
      else if (!this.variables.has(v)) {
        startLines.push(`#variable {${v}} {}`);
        empty.push(v);
      }
    }
    if (empty.length > 0) out.warnFile(`No start value in Mudlet for ${empty.join(', ')}; they start empty.`);
    const synced = [...this.gateStart.keys()].filter((g) => this.patternGates.has(g) && this.usedGates.has(g));
    if (synced.length > 0) {
      const sync = synced.map((g) => {
        const v = varName(g);
        return `#if {$mudlet_on_${v}} {#variable {mudlet_gate_${v}} {}} #else {#variable {mudlet_gate_${v}} {${NEVER}}}`;
      });
      startLines.push(`#action {%*} {${sync.join(';')}} {1}`);
    }
    for (const r of saved) out.translated(r.st, r.lines, {});
    for (const l of startLines) out.raw(l);

    // Alias names: Mudlet's send() skipped aliases, tt++ sends run them.
    const aliasRes = this.aliasPatterns.map((p) => {
      try {
        const c = compilePattern(p);
        return c.anchored ? c.re : new RegExp('^(?:' + c.re.source + ')', c.re.flags);
      } catch {
        return null;
      }
    });
    for (const r of this.recs) {
      if (r.kind === 'Variable' && r.outcome === 'translated') continue;
      if (r.outcome === 'skipped') {
        out.skip(r.st, r.reason ?? 'Skipped');
        continue;
      }
      if (r.outcome === 'kept') {
        const label = r.st.text.split('  ')[0]!;
        out.kept.push(nopLine(`${r.reason} (${label}): ${this.gateCommands(r.keptText ?? '')}`));
        out.item(r.st, 'kept', { reason: r.reason! });
        out.changed = true;
        continue;
      }
      const warnings = [...r.warnings];
      for (const s of r.sends ?? []) {
        const text = s.replace(/\$\{?\w+\}?|%\d+/g, 'x').replace(/\\(.)/g, '$1');
        if (aliasRes.some((re) => re?.test(text))) {
          warnings.push(`Sends "${s}", which an alias here also matches: tt++ runs the alias, Mudlet's send() did not.`);
          break;
        }
      }
      const note: { reason?: string; warning?: string } = {};
      if (r.reason) note.reason = r.reason;
      if (warnings.length > 0) note.warning = [...new Set(warnings)].join(' ');
      out.translated(
        r.st,
        r.lines.map((l) => this.gateCommands(l)),
        note,
        r.group,
      );
    }
    out.setClass(null);
  }
}

/** Parses a Mudlet XML file; null when it is not one. */
export function parseMudlet(text: string): XmlElement | XmlError {
  try {
    const root = parseXml(text);
    if (root.name !== 'MudletPackage') return new XmlError(`root element is <${root.name}>, not <MudletPackage>`);
    return root;
  } catch (err) {
    if (err instanceof XmlError) return err;
    throw err;
  }
}

/** Translates one Mudlet XML file into `out`. */
export function translateMudlet(file: SourceFile, out: Out): void {
  const root = parseMudlet(file.text);
  if (root instanceof XmlError) {
    out.keep({ file: file.name, line: 1, text: file.name }, `Not a readable Mudlet XML file (${root.message})`);
    return;
  }
  const t = new MudletTranslator(file, root);
  t.run();
  t.write(out);
}
