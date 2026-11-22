// The portrait stage (notes/research/portraits/brief.md, step 1): every
// drawing in the card's real round frame, baked as the app bakes it.
// Served by the worktree's Vite dev server:
//   http://localhost:<port>/notes/research/portraits/stage/?g=dwarves
// A drawing module is draw/<group>.ts exporting `portraits: PortraitSet`
// (src/panes/portraits/types.ts). An id with no drawing yet shows the old
// placeholder (portrait-figures.ts), flagged "old".

import '../../../../src/layout/layout.css';
import '../../../../src/panes/character.css';
import { bake, svgUrl } from '../../../../src/panes/portraits/bake';
import type { PortraitId, PortraitSet, Sex } from '../../../../src/panes/portraits/types';
import { figureSvg } from '../../../../src/panes/portrait-figures';

export const GROUPS: Readonly<Record<string, readonly PortraitId[]>> = {
  dwarves: ['dwarf', 'longbeard', 'firebeard', 'broadbeam'],
  men: ['human', 'dunadan', 'eriadorian', 'rohirrim', 'beorning'],
  elves: ['elf', 'noldo', 'sinda', 'silvan', 'halfelf'],
  hobbits: ['hobbit', 'fallohide', 'harfoot', 'stoor'],
  orcs: ['orc', 'tarkhnarb', 'morruhk', 'zaugurz'],
  trolls: ['troll', 'cavetroll', 'hilltroll', 'mountaintroll'],
  dark: ['numenorean', 'neutral'],
};

const MODULES = import.meta.glob<{ portraits: PortraitSet }>('./draw/*.ts');

const q = new URLSearchParams(location.search);
const g = q.get('g') ?? 'all';
const ids: PortraitId[] = q.get('ids')
  ? (q.get('ids')!.split(',') as PortraitId[])
  : g === 'all'
    ? Object.values(GROUPS).flat()
    : [...(GROUPS[g] ?? [])];
const sexes: Sex[] = q.get('sex') ? [q.get('sex') as Sex] : ['male', 'female'];
const showRaw = q.get('raw') !== '0';

/** Each column: the disc's size in px, the ring's, Paper or dark. */
const COLS = [
  { name: 'XL', disc: 180, ring: 58, light: false },
  { name: 'Large', disc: 100, ring: 32, light: false },
  { name: 'Large Paper', disc: 100, ring: 32, light: true },
  { name: 'Medium', disc: 40, ring: 20, light: false },
  { name: 'Medium Paper', disc: 40, ring: 20, light: true },
] as const;
const cols = q.get('medium') ? COLS.filter((c) => c.disc < 70) : COLS;

const DARK_BORDER = '#5c4a30';
const PAPER_BORDER = '#9c8458';

/** The drawings of the groups shown: only their own files, each on its own (a broken file does not stop the others). */
async function drawings(errors: string[]): Promise<Map<PortraitId, PortraitSet[PortraitId]>> {
  const all = new Map<PortraitId, PortraitSet[PortraitId]>();
  const groups = Object.keys(GROUPS).filter((k) => GROUPS[k]!.some((id) => ids.includes(id)));
  for (const k of groups) {
    const load = MODULES[`./draw/${k}.ts`];
    if (!load) continue;
    try {
      const m = await load();
      for (const [id, d] of Object.entries(m.portraits)) all.set(id as PortraitId, d);
    } catch (e) {
      errors.push(`draw/${k}.ts: ${String(e)}`);
    }
  }
  return all;
}

let serial = 0;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function medal(disc: number, ring: number, light: boolean, content: Element): HTMLElement {
  const pane = h('div', 'wc-pane stagepane');
  pane.style.setProperty('--pane-border', light ? PAPER_BORDER : DARK_BORDER);
  if (light) pane.dataset.light = '';
  const cc = h('div', 'wc-cc');
  cc.dataset.portrait = '';
  if (light) cc.dataset.light = '';
  cc.style.setProperty('--disc', `${disc}px`);
  cc.style.setProperty('--ring', `${ring}px`);
  const m = h('div', 'wc-cc-medal');
  const d = h('div', 'wc-cc-disc');
  d.append(content);
  const r = h('span', 'wc-cc-ring');
  r.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="wc-cc-ring-track" cx="16" cy="16" r="14.2"/><circle class="wc-cc-ring-base" cx="16" cy="16" r="14.2" stroke-dasharray="40 95"/><circle class="wc-cc-ring-gain" cx="16" cy="16" r="14.2" stroke-dasharray="12 95" stroke-dashoffset="-40"/><circle class="wc-cc-ring-tp" cx="16" cy="16" r="11" stroke-dasharray="30 80"/></svg>';
  r.append(h('b', 'wc-cc-level', '42'));
  m.append(d, r);
  cc.append(m);
  pane.append(cc);
  return pane;
}

async function main(): Promise<void> {
  const out = document.getElementById('out')!;
  const errors: string[] = [];
  const all = await drawings(errors);
  const dpr = window.devicePixelRatio || 1;
  const table = h('table', 'sheet');
  const head = h('tr');
  head.append(h('th'));
  for (const sex of sexes) {
    head.append(h('th', 'sep'));
    for (const c of cols) head.append(h('th', '', `${sex === 'male' ? '♂' : '♀'} ${c.name}`));
    if (showRaw) head.append(h('th', '', `${sex === 'male' ? '♂' : '♀'} raw`));
  }
  table.append(head);
  const jobs: Promise<void>[] = [];
  for (const id of ids) {
    const tr = h('tr', 'id');
    const lab = h('td', 'lab', id);
    const draw = all.get(id);
    lab.append(h('small', '', draw ? 'drawn' : 'old placeholder'));
    tr.append(lab);
    for (const sex of sexes) {
      tr.append(h('td', 'sep'));
      if (id === 'neutral' && sex === 'female') {
        for (const c of cols) tr.append(h('td', `cell ${c.light ? 'paper' : 'dark'}`, c === cols[0] ? '(one figure)' : ''));
        if (showRaw) tr.append(h('td'));
        continue;
      }
      for (const c of cols) {
        const td = h('td', `cell ${c.light ? 'paper' : 'dark'}`);
        tr.append(td);
        if (!draw) {
          td.append(medal(c.disc, c.ring, c.light, figureSvg(document, id)), h('span', 'flag', 'old'));
          continue;
        }
        const img = h('img', 'wc-cc-photo');
        img.alt = '';
        td.append(medal(c.disc, c.ring, c.light, img));
        const size = c.disc >= 70 ? 'large' : 'medium';
        jobs.push(
          (async () => {
            const svg = draw({ sex, size, uid: `p${++serial}` });
            img.src = await bake(document, svg, c.disc * dpr);
          })().catch((e: unknown) => {
            errors.push(`${id} ${sex} ${c.name}: ${String(e)}`);
          }),
        );
      }
      if (showRaw) {
        const td = h('td');
        tr.append(td);
        if (draw) {
          const img = h('img', 'raw');
          img.alt = '';
          try {
            img.src = svgUrl(draw({ sex, size: 'large', uid: `r${++serial}` }));
          } catch (e) {
            errors.push(`${id} ${sex} raw: ${String(e)}`);
          }
          td.append(img);
        }
      }
    }
    table.append(tr);
  }
  out.append(table);
  await Promise.all(jobs);
  await Promise.all([...document.images].map((i) => i.decode().catch(() => errors.push(`decode failed: ${i.closest('tr')?.firstChild?.textContent}`))));
  if (errors.length) {
    const pre = h('pre', 'err', errors.join('\n'));
    out.prepend(pre);
    console.error(errors.join('\n'));
  }
  document.body.dataset.ready = errors.length ? 'errors' : 'ok';
}

void main();
