// The Help view of the profile editor B (stage 43a, ADR 0128): stage 42's
// `LookManual` over the profile manual (`helpSections()`), with its
// contents in the editor's rail (`ManualContents`, the current heading lit
// and following the scroll) and its find as a bar (Ctrl+F). On a narrow
// editor (the rail as a row) the sections are a dropdown instead of a row
// of sixty headings.

import type { VNode } from 'preact';
import { Select } from '../../chrome/kit/look';
import type { HelpSection } from '../help';
import { type ManualCtl, LookManual, ManualContents, codeLine } from '../look-manual';
import type { FindMemory } from '../look-manual-find';

/** The manual's groups as the rail labels them (the intro gets a label too). */
export const HELP_GROUPS: Readonly<Record<string, string>> = {
  intro: 'Introduction',
  basics: 'Basics',
  commands: 'Commands',
};

/** The rail in Help: the grouped headings (wide), or a dropdown (the rail as a row). */
export function HelpRail(p: {
  sections: readonly HelpSection[];
  current: number;
  /** The keyboard is in the rail. */
  active: boolean;
  onGo(i: number): void;
}): VNode {
  return (
    <>
      <div class="wc-pe-hcont">
        <ManualContents sections={p.sections} groups={HELP_GROUPS} current={p.current} active={p.active} onGo={p.onGo} />
      </div>
      <div class={'wc-pe-hsel' + (p.active ? ' is-cur' : '')}>
        <Select
          id="section"
          label="Section"
          value={String(p.current)}
          options={p.sections.map((s, i) => ({ value: String(i), label: s.heading }))}
          onChange={(v) => p.onGo(Number(v))}
        />
      </div>
    </>
  );
}

/** The manual itself (the find opens as a bar with Ctrl+F). */
export function HelpView(p: {
  sections: readonly HelpSection[];
  initial: number;
  memory: FindMemory;
  onSection(i: number): void;
  ctl(c: ManualCtl | null): void;
}): VNode {
  return (
    <LookManual
      sections={p.sections}
      contents="none"
      find="bar"
      initial={p.initial}
      memory={p.memory}
      onSection={p.onSection}
      ctl={p.ctl}
      example={(line, lang) => codeLine(line, lang)}
    />
  );
}
