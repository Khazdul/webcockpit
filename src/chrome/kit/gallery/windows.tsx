// The kit gallery's "Windows" section (stage 42d, ADR 0127): the in-game
// window frame (Lykta) on dark and on Paper, focused and not, over a plain
// backdrop of game text, each with its stack inside: a look frame (which
// sets the window's title and note with `useWindowChrome` and can push a
// sub-page with `InlineBack`) and an old-look frame on its cell grid. The
// windows move and resize as in the game (whole cells); a press focuses
// one. Their stacks take no keys here (the gallery has them).

import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { useCells, useElementSize } from '../hooks';
import { GlassButton, InlineBack, lookFrame, useLookPlace, useWindowChrome } from '../look';
import { useNav } from '../stack';
import { Blank, Line, Page } from '../widgets';
import { WindowFrame, WindowStack } from '../window';
import { type WindowChromeStore, useWindowChromeOf, windowChromeStore } from '../window-chrome';
import { type CellGrid, type CellRect, fitRect, windowBody } from '../window-geom';
import type { KitSection } from './kit';
import './windows.css';

const GAME = [
  '*= HP:Fine> look',
  'The Great East Road',
  'The road runs east and west through the wild lands.',
  'Exits: east, west.',
  '',
  '*= HP:Fine> say ready when you are',
  "You say 'ready when you are'",
  '',
  'Gibur arrives from the east.',
  "Gibur tells you 'more coming, 2 trolls'",
  '',
  'A crow caws somewhere to the north.',
];

// The demo frames draw plain content, not `Box`: the Box section (42a)
// shows how a Box adapts to the place; this one shows the window around
// it.

/** A look frame in a window: its title and note, a sub-page. */
const DemoLook = lookFrame(function DemoLook(): VNode {
  const nav = useNav();
  const place = useLookPlace();
  useWindowChrome({ title: 'Kit', note: 'a look frame' });
  return (
    <div class="wc-kitwin-page">
      <p class="wc-lk-txt">
        A look frame in a window: the place is <b data-place>{place}</b>. It sets the window's title and note
        (<code>useWindowChrome</code>); a sub-page sets its own and the window keeps its frame.
      </p>
      <div class="wc-lk-btns">
        <GlassButton id="SUB" label="Sub-page" icon="next" onClick={() => nav.push(<DemoSub />)} />
      </div>
    </div>
  );
});

const DemoSub = lookFrame(function DemoSub(): VNode {
  useWindowChrome({ title: 'Sub-page', note: 'pushed' });
  return (
    <div class="wc-kitwin-page">
      <InlineBack />
      <p class="wc-lk-txt">A sub-page: Back (or Esc in the game) pops it and the title reverts.</p>
    </div>
  );
});

/** An old-look frame: today's TUI content on its whole-cell grid. */
function DemoGrid(): VNode {
  return (
    <Page title="Scripts" footer={['n New', 'ESC Close']}>
      <Line at={2}>An old-look frame on a whole-cell grid,</Line>
      <Line at={2}>centred in the window's body.</Line>
      <Blank />
      <Line at={2} class="wc-c-section">
        {'> combat.lua'}
      </Line>
      <Line at={4}>travel.lua</Line>
    </Page>
  );
}

interface DemoWin {
  id: string;
  rect: CellRect;
  root: () => VNode;
  chrome: WindowChromeStore;
}

function Stage(p: { paper: boolean; label: string }): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const c = useCells();
  const grid: CellGrid = {
    cols: c.w > 0 ? Math.floor(size.w / c.w + 1e-6) : 0,
    rows: c.h > 0 ? Math.floor(size.h / c.h + 1e-6) : 0,
  };
  const [wins, setWins] = useState<DemoWin[]>(() => [
    { id: 'grid', rect: { x: 2, y: 1, w: 62, h: 18 }, root: () => (p.paper ? <DemoLook /> : <DemoGrid />), chrome: windowChromeStore() },
    { id: 'look', rect: { x: 40, y: 2, w: 66, h: 22 }, root: () => <DemoLook />, chrome: windowChromeStore() },
  ]);
  const [focused, setFocused] = useState('look');
  const focus = (id: string): void => {
    setFocused(id);
    setWins((ws) => [...ws.filter((w) => w.id !== id), ws.find((w) => w.id === id)!]);
  };
  const onRect = (id: string, r: CellRect): void => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, rect: r } : w)));
  return (
    <div class="wc-kitwin-stage" data-bg={p.paper ? 'paper' : 'dark'} ref={ref} aria-label={p.label}>
      <pre class="wc-kitwin-game" aria-hidden="true">
        {GAME.join('\n')}
      </pre>
      <div class="wc-windows" data-light={p.paper ? '' : undefined}>
        {grid.cols > 0 &&
          grid.rows > 0 &&
          wins.map((w, i) => (
            <div key={w.id} onPointerDownCapture={() => focus(w.id)}>
              <DemoWindow w={w} grid={grid} cellW={c.w} cellH={c.h} z={i + 1} focused={focused === w.id} onRect={onRect} />
            </div>
          ))}
      </div>
    </div>
  );
}

function DemoWindow(p: {
  w: DemoWin;
  grid: CellGrid;
  cellW: number;
  cellH: number;
  z: number;
  focused: boolean;
  onRect: (id: string, r: CellRect) => void;
}): VNode {
  const { w } = p;
  const set = useWindowChromeOf(w.chrome);
  const rect = fitRect(w.rect, p.grid);
  const note = set?.note ?? 'old look';
  return (
    <WindowFrame
      id={`kit-${p.w.id}`}
      title={set?.title ?? 'Window'}
      {...(note ? { titleNote: note } : {})}
      rect={rect}
      grid={p.grid}
      cellW={p.cellW}
      cellH={p.cellH}
      z={p.z}
      focused={p.focused}
      onRect={(r) => p.onRect(w.id, r)}
      onClose={() => {}}
    >
      <WindowStack
        body={windowBody(rect, p.cellW, p.cellH)}
        cellW={p.cellW}
        cellH={p.cellH}
        root={w.root()}
        active={false}
        onRootBack={() => {}}
        chrome={w.chrome.sink}
      />
    </WindowFrame>
  );
}

function WindowsSection(): VNode {
  return (
    <div class="wc-kitwin">
      <p class="wc-lk-txt wc-lk-dim">
        The in-game window frame (Lykta), dark and Paper. Drag the bar to move, the edges or the grip to resize (whole
        cells); a press focuses a window, the other dims.
      </p>
      <Stage paper={false} label="Windows on the dark game background" />
      <Stage paper={true} label="Windows on the Paper game background" />
    </div>
  );
}

export default { title: 'Windows', View: WindowsSection } satisfies KitSection;
