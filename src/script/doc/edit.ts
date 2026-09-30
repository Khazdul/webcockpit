// Queries and edits over a ProfileDoc. Every edit returns a new document
// and leaves the input untouched; nodes that are not edited keep their
// exact text (ADR 0015 "Document model contract").
//
// Callers validate first (`validateEntry`, `isSafeArgument`): an edit
// stores what it is given, so a pattern with an unbalanced brace is written
// as is, like Cockpit's "saving is never blocked" (Inv §5.6).

import { type DocNode, type EntryKind, type EntryNode, type ProfileDoc, parseNodeText } from './model';
import { isBraceBalanced } from './text';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Typed entries in document order, optionally of one kind. */
export function listEntries(doc: ProfileDoc, kind?: EntryKind): EntryNode[] {
  const out: EntryNode[] = [];
  for (const n of doc.nodes) if (n.type === 'entry' && (kind === undefined || n.kind === kind)) out.push(n);
  return out;
}

export function findNode(doc: ProfileDoc, id: number): DocNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

/** 1-based line number of the node's first line in `serialize(doc)`, or 0. */
export function nodeLine(doc: ProfileDoc, id: number): number {
  let line = 1;
  for (const n of doc.nodes) {
    if (n.id === id) return line;
    for (let i = n.text.indexOf('\n'); i >= 0; i = n.text.indexOf('\n', i + 1)) line++;
  }
  return 0;
}

/** The top-level `#variable` entry for `name` that wins on load (the last one). */
export function findVariable(doc: ProfileDoc, name: string): EntryNode | undefined {
  let found: EntryNode | undefined;
  for (const n of doc.nodes) if (n.type === 'entry' && n.kind === 'variable' && n.pattern === name) found = n;
  return found;
}

/**
 * True when `text` can sit inside `{…}` without changing the structure:
 * braces balance and it does not end in an unescaped backslash.
 */
export function isSafeArgument(text: string): boolean {
  if (!isBraceBalanced(text)) return false;
  let bs = 0;
  for (let i = text.length - 1; i >= 0 && text.charCodeAt(i) === 0x5c; i--) bs++;
  return bs % 2 === 0;
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export interface EntryPatch {
  pattern?: string;
  body?: string;
  /** Raw priority text, or null to drop it. Ignored for macros and variables. */
  priority?: string | null;
}

function canonical(lead: string, word: string, pattern: string, body: string, priority: string | null, eol: string): string {
  return `${lead}#${word} {${pattern}} {${body}}${priority !== null ? ` {${priority}}` : ''}${eol}`;
}

function entryNode(
  id: number,
  kind: EntryKind,
  word: string,
  pattern: string,
  body: string,
  priority: string | null,
  lead: string,
  eol: string,
): EntryNode {
  const text = canonical(lead, word, pattern, body, priority, eol);
  const p0 = lead.length + 1 + word.length + 2;
  const b0 = p0 + pattern.length + 3;
  const args = [
    { start: p0, end: p0 + pattern.length },
    { start: b0, end: b0 + body.length },
  ];
  if (priority !== null) {
    const r0 = b0 + body.length + 3;
    args.push({ start: r0, end: r0 + priority.length });
  }
  return { type: 'entry', id, text, kind, word, pattern, body, priority, lead, eol, args };
}

function replaceNode(doc: ProfileDoc, index: number, node: DocNode): ProfileDoc {
  const nodes = doc.nodes.slice();
  nodes[index] = node;
  return { ...doc, nodes };
}

function noPriority(kind: EntryKind): boolean {
  return kind === 'macro' || kind === 'variable';
}

/**
 * Rewrites one entry in canonical form `#<word> {pattern} {body}[ {priority}]`,
 * keeping its id, command word, leading indent, line break and (unless the
 * patch says otherwise) priority. Returns `doc` itself when the id is not
 * an entry or nothing changes.
 */
export function editEntry(doc: ProfileDoc, id: number, patch: EntryPatch): ProfileDoc {
  const i = doc.nodes.findIndex((n) => n.id === id);
  const e = doc.nodes[i];
  if (!e || e.type !== 'entry') return doc;
  const pattern = patch.pattern ?? e.pattern;
  const body = patch.body ?? e.body;
  const priority = noPriority(e.kind) ? null : patch.priority !== undefined ? patch.priority : e.priority;
  if (pattern === e.pattern && body === e.body && priority === e.priority) return doc;
  return replaceNode(doc, i, entryNode(e.id, e.kind, e.word, pattern, body, priority, e.lead, e.eol));
}

export interface NewEntry {
  kind: EntryKind;
  pattern: string;
  body: string;
  /** Raw priority text. Ignored for macros and variables. */
  priority?: string | null;
  /** Command word without `#`. Default: see `addEntry`. */
  word?: string;
}

function withEol(node: DocNode, eol: string): DocNode {
  if (node.text.endsWith('\n')) return node;
  // Only the last node of a text can lack a line break.
  const { source: _source, ...rest } = node;
  if (rest.type === 'entry') return { ...rest, text: rest.text + eol, eol };
  return { ...rest, text: rest.text + eol };
}

/**
 * Adds an entry. Placement (ADR 0015): after the last entry of the same
 * kind; with none, after the last entry of any kind with a blank line
 * before it (and after it, when text follows); with no entries at all, at
 * the end, after a blank line unless the document is empty or already ends
 * with one. The word defaults to the one the last entry of the kind uses,
 * else the kind's full name, upper-case when the document's entries are
 * written upper-case (`#ALIAS`).
 */
export function addEntry(doc: ProfileDoc, entry: NewEntry): { doc: ProfileDoc; id: number } {
  const nodes = doc.nodes.slice();
  const id = doc.nextId;
  const eol = doc.eol;
  let lastSame = -1;
  let lastAny = -1;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.type !== 'entry') continue;
    lastAny = i;
    if (n.kind === entry.kind) lastSame = i;
  }
  let word = entry.word;
  if (word === undefined) {
    const same = lastSame >= 0 ? (nodes[lastSame] as EntryNode) : null;
    const any = lastAny >= 0 ? (nodes[lastAny] as EntryNode) : null;
    word = same ? same.word : any && /[A-Z]/.test(any.word) && any.word === any.word.toUpperCase() ? entry.kind.toUpperCase() : entry.kind;
  }
  const priority = noPriority(entry.kind) ? null : (entry.priority ?? null);
  const node = entryNode(id, entry.kind, word, entry.pattern, entry.body, priority, '', eol);
  const blank = (bid: number): DocNode => ({ type: 'blank', id: bid, text: eol });
  let nextId = id + 1;

  if (lastSame >= 0) {
    nodes[lastSame] = withEol(nodes[lastSame]!, eol);
    nodes.splice(lastSame + 1, 0, node);
  } else if (lastAny >= 0) {
    nodes[lastAny] = withEol(nodes[lastAny]!, eol);
    const insert: DocNode[] = [blank(nextId++), node];
    const after = nodes[lastAny + 1];
    if (after && after.type !== 'blank') insert.push(blank(nextId++));
    nodes.splice(lastAny + 1, 0, ...insert);
  } else {
    const last = nodes[nodes.length - 1];
    if (last) {
      nodes[nodes.length - 1] = withEol(last, eol);
      if (last.type !== 'blank') nodes.push(blank(nextId++));
    }
    nodes.push(node);
  }
  return { doc: { ...doc, nodes, nextId }, id };
}

/** The rule a node's command defines (`alias`, `gag`, `ticker` …) or the setting it holds (`message`), or null. */
function definedRule(n: DocNode): string | null {
  if (n.type === 'entry') return n.kind;
  if (n.type === 'passthrough' && n.command?.kind === 'define') return n.command.rule ?? null;
  // A setting the profile keeps as a line of its own (ADR 0039).
  if (n.type === 'passthrough' && n.command?.name === 'message') return 'message';
  return null;
}

/**
 * Adds a top-level definition the document does not type as an entry
 * (`#gag`, `#ticker`, `#event`; ADR 0038), or a `#message` setting
 * (ADR 0039), as `#<word> {arg} {arg}…`.
 * Placement follows `addEntry`: after the last command of the same rule;
 * with none, after the last definition of any kind with a blank line
 * before it (and after it, when text follows); with no definitions, at the
 * end. The word copies the last command of the rule, else it is `rule`,
 * upper-cased when the document's definitions are written upper-case.
 */
export function addCommand(doc: ProfileDoc, rule: string, args: readonly string[]): { doc: ProfileDoc; id: number } {
  const nodes = doc.nodes.slice();
  const id = doc.nextId;
  const eol = doc.eol;
  let lastSame = -1;
  let lastAny = -1;
  for (let i = 0; i < nodes.length; i++) {
    const r = definedRule(nodes[i]!);
    if (r === null) continue;
    lastAny = i;
    if (r === rule) lastSame = i;
  }
  const wordOf = (i: number): string => (nodes[i] as { word: string | null }).word ?? '';
  let word = rule;
  if (lastSame >= 0 && wordOf(lastSame) !== '') word = wordOf(lastSame);
  else if (lastAny >= 0 && /[A-Z]/.test(wordOf(lastAny)) && wordOf(lastAny) === wordOf(lastAny).toUpperCase()) word = rule.toUpperCase();
  const node = parseNodeText(commandText('', word, args, eol), id);
  const blank = (bid: number): DocNode => ({ type: 'blank', id: bid, text: eol });
  let nextId = id + 1;
  if (lastSame >= 0) {
    nodes[lastSame] = withEol(nodes[lastSame]!, eol);
    nodes.splice(lastSame + 1, 0, node);
  } else if (lastAny >= 0) {
    nodes[lastAny] = withEol(nodes[lastAny]!, eol);
    const insert: DocNode[] = [blank(nextId++), node];
    const after = nodes[lastAny + 1];
    if (after && after.type !== 'blank') insert.push(blank(nextId++));
    nodes.splice(lastAny + 1, 0, ...insert);
  } else {
    const last = nodes[nodes.length - 1];
    if (last) {
      nodes[nodes.length - 1] = withEol(last, eol);
      if (last.type !== 'blank') nodes.push(blank(nextId++));
    }
    nodes.push(node);
  }
  return { doc: { ...doc, nodes, nextId }, id };
}

/** `lead#word {arg} {arg}…eol`: the canonical text of a command. */
export function commandText(lead: string, word: string, args: readonly string[], eol: string): string {
  return `${lead}#${word}${args.map((a) => ` {${a}}`).join('')}${eol}`;
}

/**
 * Rewrites one command node as `#<word> {arg} {arg}…`, keeping its id,
 * command word, leading indent and line break. For commands that are not
 * typed entries, and for entries written in a form the document does not
 * type (`#var x 1`). Returns `doc` itself when the id is unknown, the node
 * is not a command, or nothing changes.
 */
export function rewriteCommand(doc: ProfileDoc, id: number, args: readonly string[]): ProfileDoc {
  const i = doc.nodes.findIndex((n) => n.id === id);
  const n = doc.nodes[i];
  if (!n || (n.type !== 'entry' && n.type !== 'passthrough') || !n.word) return doc;
  const lead = /^[ \t]*/.exec(n.text)![0];
  const eol = n.text.endsWith('\r\n') ? '\r\n' : n.text.endsWith('\n') ? '\n' : '';
  const text = commandText(lead, n.word, args, eol);
  if (text === n.text) return doc;
  return replaceNode(doc, i, parseNodeText(text, n.id));
}

/**
 * Removes a node (normally an entry). Blank-line rule: when the node sits
 * between a blank line and a blank line or the end of the text, the blank
 * line before it goes too; when it is the first node and a blank line
 * follows, that blank line goes. So entries separated by one blank line
 * stay separated by exactly one, and no leading or trailing gap is left.
 * Returns `doc` itself when the id is unknown.
 */
export function removeEntry(doc: ProfileDoc, id: number): ProfileDoc {
  const i = doc.nodes.findIndex((n) => n.id === id);
  if (i < 0) return doc;
  const nodes = doc.nodes.slice();
  const prev = nodes[i - 1];
  const next = nodes[i + 1];
  if (prev?.type === 'blank' && (next === undefined || next.type === 'blank')) {
    nodes.splice(i - 1, 2);
  } else if (i === 0 && next?.type === 'blank') {
    nodes.splice(0, 2);
  } else {
    nodes.splice(i, 1);
  }
  return { ...doc, nodes };
}

/**
 * Sets the value of the existing top-level `#variable` entry for `name`
 * (the last one, which wins on load), rewriting only the text between its
 * value braces. Returns `doc` itself when there is no such entry, the value
 * is unchanged, or the value is not a safe argument (`isSafeArgument`).
 */
export function setVariable(doc: ProfileDoc, name: string, value: string): ProfileDoc {
  const e = findVariable(doc, name);
  if (!e || e.body === value || !isSafeArgument(value)) return doc;
  const i = doc.nodes.indexOf(e);
  const v = e.args[1]!;
  const text = e.text.slice(0, v.start) + value + e.text.slice(v.end);
  const delta = value.length - (v.end - v.start);
  const args = e.args.map((a, k) => (k < 1 ? a : k === 1 ? { start: a.start, end: a.end + delta } : { start: a.start + delta, end: a.end + delta }));
  const node: EntryNode = { type: 'entry', id: e.id, text, kind: e.kind, word: e.word, pattern: e.pattern, body: value, priority: e.priority, lead: e.lead, eol: e.eol, args };
  return replaceNode(doc, i, node);
}
