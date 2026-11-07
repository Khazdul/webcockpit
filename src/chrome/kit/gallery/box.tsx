// The kit gallery's "Box" section (stage 42a, ADR 0127): layout B
// "Rummet växer" and the box variants, working. Each button pushes a demo
// page over the gallery: a large box, a capped one (1180 px), a tall
// normal box, a normal → normal change of size, a large → large swap of
// two widths. Every demo page reads `useBoxSettled`, counts the keys it
// gets (`x`, also during the morph) and logs its box's sizes from a
// ResizeObserver (`window.__lkBoxLog`, for tests/e2e/look-kit-box.spec.ts:
// one size, the final one, from the mount). The section also toggles the
// sky pause, switches the large window's glass (as built / blur / flat,
// for the benches) and previews `Box` in its three places side by side.
//
// From the start menu, `k` reopens the gallery while `?kit` is in the
// address (the menu → large box morph, for the benches).

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useSkyPause } from '../../start-surface';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  GlassButton,
  type LookPlace,
  LookPlaceCtx,
  Rule,
  Seg,
  Toggle,
  lookFrame,
  useBoxSettled,
  useLookPlace,
} from '../look';
import { useKeys, useNav } from '../stack';
import type { KitSection } from './kit';
import './box.css';

/** What a demo page's box measured (tests/e2e/look-kit-box.spec.ts). */
interface BoxLog {
  title: string;
  sizes: [number, number][];
  settledAt: number | null;
  mountedAt: number;
  keys: number;
}

declare global {
  interface Window {
    __lkBoxLog?: BoxLog[];
  }
}

const LOREM = [
  'The room grows: the menu panel becomes the page, its items go quiet and the same iron box opens out until it nearly fills the window. The wordmark lifts away; the quote and the almanac fade.',
  'Back, or Esc, reverses it: the content fades, the box shrinks back into the panel, the items return and the wordmark settles.',
  'The page is laid out at its final size from its first frame, hidden, so it measures the real box at mount; an empty iron frame carries the motion and the content fades in when it lands.',
  'Keys go to the new page at once. A Back during the motion turns it round from where the frame is.',
];

/** Logs a demo box's sizes from its mount (one entry per distinct size). */
function useBoxLog(title: string, ref: { current: HTMLElement | null }): BoxLog {
  const log = useRef<BoxLog | null>(null);
  if (!log.current) {
    log.current = { title, sizes: [], settledAt: null, mountedAt: performance.now(), keys: 0 };
    (window.__lkBoxLog ??= []).push(log.current);
  }
  useLayoutEffect(() => {
    const box = ref.current?.closest('.wc-lk-box');
    const RO = globalThis.ResizeObserver;
    if (!box || !RO) return;
    const put = (): void => {
      const r = box.getBoundingClientRect();
      const s: [number, number] = [Math.round(r.width), Math.round(r.height)];
      const last = log.current!.sizes.at(-1);
      if (!last || last[0] !== s[0] || last[1] !== s[1]) log.current!.sizes.push(s);
    };
    put();
    const ro = new RO(put);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  return log.current;
}

interface DemoProps {
  title: string;
  size: 'normal' | 'large';
  tall?: boolean;
  maxWidth?: number;
  /** Paragraphs of text (the normal → normal demo changes it). */
  paras?: number;
  /** The next page this one opens with `n` / its button. */
  next?: DemoProps;
}

/** A demo page in a box of the given shape. */
const DemoPage = lookFrame(function DemoPage(p: DemoProps): VNode {
  const nav = useNav();
  const settled = useBoxSettled();
  const mark = useRef<HTMLDivElement>(null);
  const log = useBoxLog(p.title, mark);
  const [keys, setKeys] = useState(0);
  useEffect(() => {
    if (settled && log.settledAt === null) log.settledAt = performance.now() - log.mountedAt;
  }, [settled]);
  const openNext = (): void => {
    if (p.next) nav.push(<DemoPage {...p.next} />);
  };
  useKeys((e) => {
    if (e.key === 'x') {
      log.keys++;
      setKeys((n) => n + 1);
      return true;
    }
    if (e.key === 'n' && p.next) {
      openNext();
      return true;
    }
    return false;
  });
  const paras = LOREM.slice(0, Math.max(1, Math.min(LOREM.length, p.paras ?? LOREM.length)));
  const body = (
    <>
      <p class="wc-kb-line" ref={mark}>
        <span class="wc-kb-settled" data-settled={settled ? '1' : '0'}>
          Settled: {settled ? 'yes' : 'no'}
        </span>
        {' · '}
        <span class="wc-kb-keys" data-keys={keys}>
          Keys: {keys}
        </span>
        {p.maxWidth ? ` · capped at ${p.maxWidth} px` : ''}
      </p>
      {paras.map((t) => (
        <p class="wc-kb-p">{t}</p>
      ))}
      {p.size === 'large' && paras.length === LOREM.length && LOREM.map((t) => <p class="wc-kb-p wc-kb-dim">{t}</p>)}
    </>
  );
  return (
    <Box
      title={p.title}
      size={p.size}
      tall={p.tall}
      maxWidth={p.maxWidth}
      onBack={() => nav.pop()}
      class="wc-kb-demo"
      winClass="wc-kb-demo-win"
    >
      {p.size === 'large' || p.tall ? (
        <>
          <BoxHead class="wc-kb-head">
            <Rule title={p.title} />
          </BoxHead>
          <BoxBody class="wc-kb-body">{body}</BoxBody>
          <BoxFoot class="wc-kb-foot">
            {p.next && <GlassButton id="NEXT" label={`Open ${p.next.title}`} letter="n" onClick={openNext} />}
          </BoxFoot>
        </>
      ) : (
        <>
          {body}
          {p.next && (
            <div class="wc-kb-foot">
              <GlassButton id="NEXT" label={`Open ${p.next.title}`} letter="n" onClick={openNext} />
            </div>
          )}
        </>
      )}
    </Box>
  );
});

/** The demos the section opens (ids are the buttons' `data-btn`). */
export const BOX_DEMOS: Record<string, DemoProps> = {
  large: { title: 'Large', size: 'large' },
  capped: { title: 'Capped', size: 'large', maxWidth: 1180 },
  tall: { title: 'Tall', size: 'normal', tall: true },
  normal: {
    title: 'Short',
    size: 'normal',
    paras: 1,
    next: { title: 'Longer', size: 'normal', paras: 4 },
  },
  swap: {
    title: 'History',
    size: 'large',
    maxWidth: 1180,
    next: { title: 'Export', size: 'large' },
  },
};

const DEMO_LABELS: [id: string, label: string][] = [
  ['large', 'Large box'],
  ['capped', 'Capped 1180'],
  ['tall', 'Tall box'],
  ['normal', 'Normal → normal'],
  ['swap', 'Large → large'],
];

/** The large window's glass for the benches: as built, or forced with or without the blur. */
const GLASS: Record<string, Record<string, string> | null> = {
  built: null,
  blur: { '--lk-large-fill': 'rgba(13, 10, 8, 0.68)', '--lk-large-blur': 'blur(9px) saturate(1.1)' },
  flat: { '--lk-large-fill': 'rgba(13, 10, 8, 0.84)', '--lk-large-blur': 'none' },
};

function setGlass(v: string): void {
  const root = document.querySelector<HTMLElement>('.wc-start');
  if (!root) return;
  for (const k of ['--lk-large-fill', '--lk-large-blur']) root.style.removeProperty(k);
  for (const [k, val] of Object.entries(GLASS[v] ?? {})) root.style.setProperty(k, val);
}

function BoxSection(): VNode {
  const nav = useNav();
  const [pause, setPause] = useState(false);
  const [glass, setGlassNow] = useState('built');
  useSkyPause(pause);
  return (
    <div class="wc-kb">
      <Rule title="Layout B" />
      <div class="wc-lk-btns wc-kb-btns">
        {DEMO_LABELS.map(([id, label]) => (
          <GlassButton id={id} label={label} onClick={() => nav.push(<DemoPage {...BOX_DEMOS[id]!} />)} />
        ))}
      </div>
      <p class="wc-lk-txt wc-kb-dim">
        Each opens a page over the gallery; Back or Esc returns. Press <b>x</b> on a page (also while it grows) to count a key;{' '}
        <b>n</b> opens the next one. From the menu, <b>k</b> opens the gallery again.
      </p>
      <Rule title="Sky" />
      <div class="wc-kb-row">
        <Toggle id="skypause" label="Pause the sky" on={pause} onChange={setPause} />
        <Seg
          label="Large window glass"
          options={[
            { value: 'built', label: 'As built' },
            { value: 'blur', label: 'Blur' },
            { value: 'flat', label: 'Flat' },
          ]}
          value={glass}
          onChange={(v) => {
            setGlassNow(v);
            setGlass(v);
          }}
        />
      </div>
      <Rule title="Places" />
      <div class="wc-kb-places">
        {(['start', 'window', 'menu'] as LookPlace[]).map((place) => (
          <figure class={`wc-kb-place is-${place}`} data-place={place}>
            <figcaption>{place}</figcaption>
            <div class="wc-kb-stage">
              <LookPlaceCtx.Provider value={place}>
                <PlacePreview />
              </LookPlaceCtx.Provider>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}

function PlacePreview(): VNode {
  const place = useLookPlace();
  return (
    <Box title="Preview" size="large" onBack={() => {}}>
      <BoxHead>
        <p class="wc-lk-txt">Place: {place}</p>
      </BoxHead>
      <BoxBody>
        <p class="wc-lk-txt wc-kb-dim">{LOREM[0]}</p>
      </BoxBody>
    </Box>
  );
}

export default { title: 'Box', View: BoxSection } satisfies KitSection;
