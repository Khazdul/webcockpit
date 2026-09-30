// Typed settings → profile text (ADR 0038). Pure: no DOM, no storage.
//
// `applyTypedChange(doc, change)` puts one typed command the engine
// accepted (`TypedChange`, from `EngineOptions.onTyped`) into a profile
// document:
//
// - define: the top-level definition with the same kind and key is
//   rewritten in place (the last one, which wins on load); with none, the
//   definition is added after the last one of its kind (`addEntry`,
//   `addCommand`). The written form is always `#<word> {arg} {arg}…`.
// - undefine: every top-level definition of the kind with one of the keys
//   is removed.
// - message (ADR 0039): one `#message {class} {off}` line per class that is
//   off; a class that is on has no line.
//
// Keys are compared as the rule store compares them: the pattern as
// written, a macro's normalised key, an event's upper-cased name.
// Everything that is not touched keeps its exact text.
//
// A change that cannot be written safely changes nothing and returns a
// `problem` for the player: an argument that cannot sit inside braces, or
// a key defined on a line that holds several commands.

import { resolveCommand } from './commands';
import {
  type DocNode,
  ENTRY_KINDS,
  type EntryKind,
  type ProfileDoc,
  addCommand,
  addEntry,
  editEntry,
  isSafeArgument,
  removeEntry,
  rewriteCommand,
  setVariable,
} from './doc';
import type { PersistKind, TypedChange } from './engine/engine';
import { MESSAGE_CLASSES, type MessageClass, resolveMessageClass } from './engine/report';
import { ArgReader, escapeVars, splitCommands } from './engine/text';
import { normalizeKey } from './keys';

export interface PersistResult {
  doc: ProfileDoc;
  /** Why (part of) the change was not written, for the player; else null. */
  problem: string | null;
}

/** The key the rule store files a definition under. */
export function storeKey(kind: PersistKind, written: string): string {
  if (kind === 'macro') return normalizeKey(written) ?? written;
  if (kind === 'event') return written.trim().toUpperCase().replace(/\s+/g, ' ');
  return written;
}

interface Def {
  node: DocNode;
  /** The node holds exactly this one command, so it can be rewritten or removed. */
  single: boolean;
}

function isEntryKind(kind: PersistKind): kind is EntryKind {
  return (ENTRY_KINDS as readonly string[]).includes(kind);
}

/** The first argument of a `#command …` text when it defines `kind`, else null. */
function definedKey(cmd: string, kind: PersistKind): string | null {
  if (cmd.charCodeAt(0) !== 0x23 /* # */) return null;
  let i = 1;
  while (i < cmd.length && !/\s/.test(cmd[i]!) && cmd[i] !== '{') i++;
  const e = resolveCommand(cmd.slice(1, i));
  if (e === null || e === 'ambiguous' || e.kind !== 'define' || e.rule !== kind) return null;
  const first = new ArgReader(cmd.slice(i)).next('one');
  return first === '' ? null : storeKey(kind, first);
}

/** Top-level nodes that define `kind` under `key`, in document order. */
function findDefs(doc: ProfileDoc, kind: PersistKind, key: string): Def[] {
  const out: Def[] = [];
  for (const node of doc.nodes) {
    if (node.type === 'entry') {
      if (node.kind === kind && storeKey(kind, node.pattern) === key) out.push({ node, single: true });
      continue;
    }
    if (node.type !== 'passthrough' || (node.reason !== 'command' && node.reason !== 'malformed')) continue;
    const parts = splitCommands(node.text);
    for (const part of parts) {
      if (definedKey(part, kind) === key) {
        out.push({ node, single: parts.length === 1 });
        break;
      }
    }
  }
  return out;
}

const COMPOUND = 'it is defined on a line with several commands; change that line in the editor.';

function define(doc: ProfileDoc, kind: PersistKind, key: string, typedArgs: readonly string[]): PersistResult {
  // A variable's name and value are expanded when the profile loads.
  const args = kind === 'variable' ? typedArgs.map(escapeVars) : typedArgs;
  if (!args.every(isSafeArgument)) {
    return { doc, problem: `#${kind} {${key}} has braces or a backslash that cannot be written.` };
  }
  const defs = findDefs(doc, kind, kind === 'variable' ? args[0]! : key);
  if (defs.some((d) => !d.single)) return { doc, problem: `#${kind} {${key}}: ${COMPOUND}` };
  const last = defs[defs.length - 1]?.node;
  if (!last) {
    if (isEntryKind(kind)) {
      return { doc: addEntry(doc, { kind, pattern: args[0]!, body: args[1] ?? '', priority: args[2] ?? null }).doc, problem: null };
    }
    return { doc: addCommand(doc, kind, args).doc, problem: null };
  }
  if (last.type === 'entry') {
    // Only the value of a variable changes: its line keeps its formatting.
    if (kind === 'variable') return { doc: setVariable(doc, last.pattern, args[1] ?? ''), problem: null };
    // A key written another way (`f5`, `\eOt`) keeps the file's spelling.
    return { doc: editEntry(doc, last.id, { body: args[1] ?? '', priority: args[2] ?? null }), problem: null };
  }
  return { doc: rewriteCommand(doc, last.id, args), problem: null };
}

function undefine(doc: ProfileDoc, kind: PersistKind, keys: readonly string[]): PersistResult {
  let out = doc;
  let problem: string | null = null;
  for (const key of keys) {
    for (const d of findDefs(out, kind, key)) {
      if (d.single) out = removeEntry(out, d.node.id);
      else problem ??= `#${kind} {${key}}: ${COMPOUND}`;
    }
  }
  return { doc: out, problem };
}

interface MessageLine {
  node: DocNode;
  single: boolean;
  /** The class the line sets; null when it cannot be read. */
  cls: MessageClass | 'all' | null;
  /** null: a toggle (`#message {x}`) or an unreadable state. */
  state: 'on' | 'off' | null;
}

/** Top-level `#message` lines that name a class, in document order. */
function messageLines(doc: ProfileDoc): MessageLine[] {
  const out: MessageLine[] = [];
  for (const node of doc.nodes) {
    if (node.type !== 'passthrough' || node.reason !== 'command') continue;
    const parts = splitCommands(node.text);
    for (const part of parts) {
      if (part.charCodeAt(0) !== 0x23 /* # */) continue;
      let i = 1;
      while (i < part.length && !/\s/.test(part[i]!) && part[i] !== '{') i++;
      const e = resolveCommand(part.slice(1, i));
      if (e === null || e === 'ambiguous' || e.name !== 'message') continue;
      const r = new ArgReader(part.slice(i));
      const word = r.next('one').trim();
      if (word === '') continue;
      const arg = r.next('one').trim().toLowerCase();
      out.push({ node, single: parts.length === 1, cls: resolveMessageClass(word), state: arg === 'on' || arg === 'off' ? arg : null });
      break;
    }
  }
  return out;
}

/**
 * A typed `#message` (ADR 0039). The profile holds only what differs from
 * the default: one `#message {class} {off}` line per class that is off, or
 * `#message {all} {off}` when all are. Lines for other classes keep their
 * text; when the profile sets classes in a way that cannot be edited line
 * by line (`all`, a toggle), its `#message` lines are written anew.
 */
function setMessages(doc: ProfileDoc, changed: readonly MessageClass[], off: readonly MessageClass[]): PersistResult {
  const lines = messageLines(doc);
  if (lines.some((l) => !l.single)) return { doc, problem: `#message: ${COMPOUND.replace('defined', 'set')}` };
  let out = doc;
  const everything = off.length === MESSAGE_CLASSES.length;
  if (everything || lines.some((l) => l.cls === 'all' || l.cls === null || l.state === null)) {
    for (const l of lines) out = removeEntry(out, l.node.id);
    if (everything) return { doc: addCommand(out, 'message', ['all', 'off']).doc, problem: null };
    for (const c of off) out = addCommand(out, 'message', [c, 'off']).doc;
    return { doc: out, problem: null };
  }
  for (const c of changed) {
    const mine = lines.filter((l) => l.cls === c);
    const keep = off.includes(c) ? mine[mine.length - 1] : undefined;
    for (const l of mine) if (l !== keep) out = removeEntry(out, l.node.id);
    if (!off.includes(c)) continue;
    out = keep ? rewriteCommand(out, keep.node.id, [c, 'off']) : addCommand(out, 'message', [c, 'off']).doc;
  }
  return { doc: out, problem: null };
}

/** Applies one typed change to a profile document. */
export function applyTypedChange(doc: ProfileDoc, change: TypedChange): PersistResult {
  if (change.op === 'message') return setMessages(doc, change.changed, change.off);
  if (change.op === 'define') return define(doc, change.kind, change.key, change.args);
  return undefine(doc, change.kind, change.keys);
}
