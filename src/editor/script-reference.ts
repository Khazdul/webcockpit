// The script MANUAL's content (stage 10 feedback round 1): the guide
// (script-manual.ts, prose) and the A–Z API reference, generated from the
// same table completion and hover read (lua-api.ts). Pure; unit tested.

import { type HelpLayout, type HelpSection, helpLayout } from './help';
import { type ApiDoc, SCRIPT_API, apiDoc } from './lua-api';
import { SCRIPT_GUIDE } from './script-manual';

/** One reference entry: signature, description, parameters, return value, example. */
export function referenceSection(d: ApiDoc): HelpSection {
  const text: string[] = [d.doc, ...(d.more ?? [])];
  if (d.params && d.params.length > 0) {
    text.push('Parameters:');
    for (const p of d.params) text.push(`- ${p.name} (${p.type}): ${p.doc}`);
  }
  if (d.returns) text.push(`Returns: ${d.returns}`);
  return {
    group: 'reference',
    heading: d.name,
    syntax: [d.sig],
    text,
    ...(d.example ? { examples: [{ code: d.example, lang: 'lua' as const }] } : {}),
  };
}

/** The API reference, A–Z (case ignored). */
export function referenceSections(): HelpSection[] {
  return [...SCRIPT_API].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map(referenceSection);
}

let sections: HelpSection[] | null = null;

/** Every section of the script manual: the guide, then the reference. */
export function scriptManualSections(): readonly HelpSection[] {
  return (sections ??= [...SCRIPT_GUIDE, ...referenceSections()]);
}

/** The manual laid out `width` cells wide, with API names coloured in the examples. */
export function scriptManualLayout(width: number): HelpLayout {
  return helpLayout(width, scriptManualSections(), { luaNames: (n) => apiDoc(n) !== null });
}

/**
 * The section for `name`: its reference entry (an API name), the header
 * section (a header tag such as `@setting`), or -1.
 */
export function manualSectionOf(name: string): number {
  const all = scriptManualSections();
  if (name.startsWith('@')) return all.findIndex((s) => s.group === 'guide' && /header/i.test(s.heading));
  return all.findIndex((s) => s.group === 'reference' && s.heading === name);
}
