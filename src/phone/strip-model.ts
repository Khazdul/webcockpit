// The pane strip's pages (ADR 0136 §5). Pure: no DOM.
//
// Pages, in order: the built-in panes of the phone's setting that are on
// (`phone.strip.panes`: Timers, Group, Character, Statistics by default),
// then the script panes that are present, in the order they were added.
// The open page is kept in memory only; which panes take part and their
// order are stored.

/** One built-in pane of the setting (`PhoneStripEntry`). */
export interface StripEntry {
  id: string;
  on: boolean;
}

/** A page of the strip: a pane's id and its name (the hood). */
export interface StripPage {
  id: string;
  label: string;
}

/** The pages for the setting's `entries` and the script panes present; `label` names a built-in pane. */
export function stripPages(entries: readonly StripEntry[], scripts: readonly StripPage[], label: (id: string) => string): StripPage[] {
  const out: StripPage[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.on || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, label: label(e.id) });
  }
  for (const s of scripts) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, label: s.label });
  }
  return out;
}

/**
 * The page a step (`+1` next, `−1` before) from `current` lands on: the
 * strip does not wrap, so a step past an end stays. An unknown `current`
 * is the first page. Null without pages.
 */
export function stepPage(pages: readonly StripPage[], current: string | null, step: number): string | null {
  if (pages.length === 0) return null;
  const i = pages.findIndex((p) => p.id === current);
  if (i < 0) return pages[0]!.id;
  return pages[Math.max(0, Math.min(pages.length - 1, i + Math.sign(step)))]!.id;
}

/**
 * The page to show when the pages changed under an open strip: the same
 * one while it is still there, else the one that took its place (or the
 * last), else null (no page left: the strip closes).
 */
export function keepPage(pages: readonly StripPage[], current: string | null, was: readonly StripPage[]): string | null {
  if (pages.length === 0) return null;
  if (pages.some((p) => p.id === current)) return current;
  const i = was.findIndex((p) => p.id === current);
  return pages[Math.max(0, Math.min(pages.length - 1, i))]!.id;
}

/** The setting's entries with `id` moved one place up (−1) or down (+1); unchanged at an end or for an unknown id. */
export function moveEntry<T extends StripEntry>(entries: readonly T[], id: string, dir: number): T[] {
  const out = entries.slice();
  const i = out.findIndex((e) => e.id === id);
  const j = i + Math.sign(dir);
  if (i < 0 || j < 0 || j >= out.length || j === i) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** The setting's entries with `id` switched on or off. */
export function setEntry<T extends StripEntry>(entries: readonly T[], id: string, on: boolean): T[] {
  return entries.map((e) => (e.id === id ? { ...e, on } : e));
}

/** What a screen reader hears of the strip: `Panes: Timers, 1 of 4`. */
export function stripLabel(pages: readonly StripPage[], current: string | null): string {
  const i = pages.findIndex((p) => p.id === current);
  return i < 0 ? 'Panes' : `Panes: ${pages[i]!.label}, ${i + 1} of ${pages.length}`;
}
