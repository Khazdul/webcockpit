// The script MANUAL's content (stage 10 feedback rounds 1 and 3): the
// guide (script-manual.ts, prose), the A–Z API reference and the Lua
// reference, both generated from the tables completion and hover read
// (lua-api.ts, lua-ref.ts). The Lua reference starts with an index, one
// line per name by library. Pure; unit tested.

import { type HelpGroup, type HelpLayout, type HelpSection, helpLayout } from './help';
import { type ApiDoc, SCRIPT_API, apiDoc } from './lua-api';
import { LUA_LIBS, LUA_REF, LUA_REMOVED } from './lua-ref';
import { SCRIPT_GUIDE } from './script-manual';

/** One reference entry: signature, description, parameters, return value, example. */
export function referenceSection(d: ApiDoc, group: HelpGroup = 'reference'): HelpSection {
  const text: string[] = [d.doc, ...(d.more ?? [])];
  if (d.params && d.params.length > 0) {
    text.push('Parameters:');
    for (const p of d.params) text.push(`- ${p.name} (${p.type}): ${p.doc}`);
  }
  if (d.returns) text.push(`Returns: ${d.returns}`);
  return {
    group,
    heading: d.name,
    syntax: d.sig.split('\n'),
    text,
    ...(d.example ? { examples: [{ code: d.example, lang: 'lua' as const }] } : {}),
  };
}

/** The API reference, A–Z (case ignored). */
export function referenceSections(): HelpSection[] {
  return [...SCRIPT_API].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map((d) => referenceSection(d));
}

/** The heading of the Lua reference's index. */
export const LUA_INDEX = 'Lua library';

/** The first sentence of a description. */
const firstSentence = (s: string): string => /^.*?[.!?](?=\s|$)/.exec(s)?.[0] ?? s;

/** The Lua reference's index: one line per name, grouped by library. */
export function luaIndexSection(): HelpSection {
  const text: string[] = [
    'The plain Lua a script can use: the base functions and the string, table, math, utf8 and coroutine libraries. Each name below has its own entry after this index (click it, or pick it in the menu). The keywords and the basics are in Lua basics; patterns in Lua patterns.',
  ];
  const line = (d: ApiDoc): string => `- ${d.name}: ${firstSentence(d.doc)}`;
  text.push('Base functions (print is in the API reference):');
  for (const d of LUA_REF) if (!d.name.includes('.') && d.kind !== 'table') text.push(line(d));
  for (const lib of LUA_LIBS) {
    const t = LUA_REF.find((d) => d.name === lib)!;
    text.push(`${lib}: ${t.doc}`);
    for (const d of LUA_REF) if (d.name.startsWith(`${lib}.`)) text.push(line(d));
  }
  return { group: 'lua', heading: LUA_INDEX, text };
}

/** The Lua reference: the index, then one entry per function or value, by library. */
export function luaReferenceSections(): HelpSection[] {
  return [luaIndexSection(), ...LUA_REF.filter((d) => d.kind !== 'table').map((d) => referenceSection(d, 'lua'))];
}

let sections: HelpSection[] | null = null;

/** Every section of the script manual: the guide, the API reference, the Lua reference. */
export function scriptManualSections(): readonly HelpSection[] {
  return (sections ??= [...SCRIPT_GUIDE, ...referenceSections(), ...luaReferenceSections()]);
}

/** The manual laid out `width` cells wide, with API and Lua names coloured in the examples. */
export function scriptManualLayout(width: number): HelpLayout {
  return helpLayout(width, scriptManualSections(), { luaNames: (n) => apiDoc(n) !== null });
}

const guideSection = (heading: string): number =>
  scriptManualSections().findIndex((s) => s.group === 'guide' && s.heading === heading);

/**
 * The section for `name`: its reference entry (an API or Lua name), the
 * Lua index (a library table), Lua basics (a keyword or operator), the
 * sandbox section (a removed name), the header section (a header tag such
 * as `@setting`), or -1.
 */
export function manualSectionOf(name: string): number {
  const all = scriptManualSections();
  if (name.startsWith('@')) return all.findIndex((s) => s.group === 'guide' && /header/i.test(s.heading));
  const i = all.findIndex((s) => (s.group === 'reference' || s.group === 'lua') && s.heading === name);
  if (i >= 0) return i;
  const d = apiDoc(name);
  if (d?.kind === 'table' && d.lua) return all.findIndex((s) => s.group === 'lua' && s.heading === LUA_INDEX);
  if (d?.kind === 'keyword') return guideSection('Lua basics');
  if (LUA_REMOVED.includes(name)) return guideSection('Sandbox and limits');
  return -1;
}

/** The Lua reference entry a line of the index names (`- string.format: …`), or null. */
export function indexLinkOf(text: string): { name: string; section: number } | null {
  const m = /^- ([A-Za-z_][\w.]*):/.exec(text);
  if (!m) return null;
  const all = scriptManualSections();
  const section = all.findIndex((s) => s.group === 'lua' && s.heading === m[1]);
  return section >= 0 ? { name: m[1]!, section } : null;
}
