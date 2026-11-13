// The Mapper settings as modern controls (stage 30 S5/S6, ADR 0107): one
// component for Settings → Mapper and the map pane's gear popup (30c part
// 2). The logic is in ../mapper-model.ts:
//
//   Show map pane            [toggle]     panes.map.on
//   Room notes               [toggle]     mapper.notes (ADR 0077)
//   Room info on hover       Off|Minimal|Full       mapper.hover (ADR 0080)
//   Hover text size          Small|Medium|Large     mapper.hoverSize
//   Background colour        [dropdown]   mapper.background (ADR 0085)
//   Map file                 [Import map file…] [Use bundled map]
//     arda.mm2 (bundled)  or  my.mm2 · 30 074 rooms · 5.8 MB · imported <date>
//     Checking my.mm2…                   (the result of the last action)
//   Tileset            credit · now Autumn   mapper.tileset (ADR 0082, 0088)
//   [Shimrod][Spring][Summer][Autumn][Winter]   the picker (ADR 0118):
//   [Default][Desert][Gefe & Rik][Gray's Map]   a preview card a choice
//
// Every change goes straight to the settings store (ADR 0010). A tileset
// drawn for a light map switches the background to its own and leaving it
// restores the user's (`chooseTileset`).
//
// The picker is last, so the page's height stays under the Appearance
// tab's (ADR 0118). Each card shows the set's pre-rendered preview
// (public/map/tilesets/previews/); Shimrod (alternating) shows its four
// seasons' previews in quadrants, the year clockwise from spring in the
// north-west, the season it draws now at full strength.

import type { VNode } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { MAP_BACKGROUNDS, MAP_BG_TRANSPARENT } from '../../map/backgrounds';
import { type CurrentMap, mapAssetBase } from '../../map/store';
import { TILESET_CARDS, type TilesetFamily, chooseTileset, tilesetChoice, tilesetPreviewPath } from '../../map/tilesets';
import type { MapHoverMode, MapHoverSize } from '../../settings';
import { useServices, useSettings } from '../kit/hooks';
import {
  BUNDLED_MAP,
  type MapFlash,
  currentMap,
  fmtBytes,
  fmtCount,
  fmtDate,
  importMapFile,
  mapBgChoice,
  seasonNow,
  tilesetCreditNow,
  useBundledMap,
} from '../mapper-model';
import { type CardOption, CardGrid, type Choice, Dropdown, GhostButton, Row, Segmented, Toggle } from './controls';

export const HOVER_CHOICES: readonly Choice<MapHoverMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'full', label: 'Full' },
];

export const HOVER_SIZE_CHOICES: readonly Choice<MapHoverSize>[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

/** A see-through swatch for Transparent: the checkerboard of image editors. */
const TRANSPARENT_SWATCH = 'repeating-conic-gradient(var(--sf-off) 0 25%, var(--sf-field) 0 50%) 50% / 6px 6px';

/** The map file line: `arda.mm2 (bundled)`, `my.mm2 · 30 074 rooms · 5.8 MB · imported 2026-10-31 12:00`. */
export function mapFileLine(m: CurrentMap | null): string {
  if (!m) return '…';
  if (m.kind === 'bundled') return `${m.name} (bundled)`;
  return [m.name, ...(m.rooms !== undefined ? [`${fmtCount(m.rooms)} rooms`] : []), fmtBytes(m.size), `imported ${fmtDate(m.date)}`].join(' · ');
}

/** The picker's cards a row (ADR 0118). */
export const TILESET_COLS = 5;

/** The year clockwise from the north-west quadrant (ADR 0118). */
const QUADRANTS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** A set's preview image (decorative: the card names it). */
function previewImg(id: string, cls = 'wc-sp-tpv'): VNode {
  return <img class={cls} src={mapAssetBase() + tilesetPreviewPath(id)} alt="" draggable={false} />;
}

/** A family's preview: its seasons in quadrants, the one drawn now lit. */
function familyPreview(f: TilesetFamily): VNode {
  const now = seasonNow();
  return (
    <>
      {QUADRANTS.map((s) => previewImg(f.seasons[s], `wc-sp-tpv wc-sp-tq wc-sp-tq-${s}${s === now ? ' is-now' : ''}`))}
      <span class="wc-sp-tseam" />
    </>
  );
}

/** The picker's cards, in `TILESET_CARDS` order. */
export function tilesetCards(): CardOption<string>[] {
  return TILESET_CARDS.map((c) => {
    const choice = tilesetChoice(c.id);
    return {
      value: c.id,
      label: c.label,
      name: choice.name,
      preview: choice.family ? familyPreview(choice.family) : previewImg(c.id),
    };
  });
}

/** The current map, following the store (the bundled one without a store). */
function useCurrentMap(): CurrentMap | null {
  const { maps } = useServices();
  const [cur, setCur] = useState<CurrentMap | null>(maps ? null : BUNDLED_MAP);
  useEffect(() => {
    if (!maps) return;
    let live = true;
    const refresh = (): void => void currentMap(maps).then((m) => live && setCur(m));
    refresh();
    const off = maps.subscribe(refresh);
    return () => {
      live = false;
      off();
    };
  }, [maps]);
  return cur;
}

export function MapperSettings(): VNode {
  const { settings, maps } = useServices();
  const s = useSettings();
  const m = s.mapper;
  const cur = useCurrentMap();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [note, setNote] = useState<{ text: string; fail: boolean } | null>(null);
  const flash: MapFlash = (text, kind) => setNote({ text, fail: kind === 'fail' });

  const run = async (f: () => Promise<void>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      await f();
    } finally {
      busy.current = false;
    }
  };
  const onFile = (): Promise<void> =>
    run(async () => {
      const input = fileRef.current;
      const file = input?.files?.[0];
      if (!input || !file) return;
      input.value = '';
      await importMapFile(maps, file, flash);
    });

  const tilesetLabel = `wc-sp-tl-${useId()}`;
  const tileset = tilesetChoice(m.tileset);
  const bg = mapBgChoice(m.background);
  return (
    <div class="wc-sp-mapper">
      <Row label="Show map pane">
        <Toggle label="Show map pane" on={s.panes.map.on} onChange={(on) => settings.update({ panes: { map: { on } } })} />
      </Row>
      <Row label="Room notes">
        <Toggle label="Room notes" on={m.notes} onChange={(notes) => settings.update({ mapper: { notes } })} />
      </Row>
      <Row label="Room info on hover">
        <Segmented label="Room info on hover" value={m.hover} options={HOVER_CHOICES} onChange={(hover) => settings.update({ mapper: { hover } })} />
      </Row>
      <Row label="Hover text size">
        <Segmented
          label="Hover text size"
          value={m.hoverSize}
          options={HOVER_SIZE_CHOICES}
          onChange={(hoverSize) => settings.update({ mapper: { hoverSize } })}
        />
      </Row>
      <Row label="Background colour">
        <Dropdown
          label="Background colour"
          value={bg}
          options={MAP_BACKGROUNDS.map((c) => ({
            value: c.hex,
            label: c.name,
            swatch: c.hex === MAP_BG_TRANSPARENT ? TRANSPARENT_SWATCH : c.hex,
          }))}
          onChange={(background) => settings.update({ mapper: { background } })}
        />
      </Row>
      <Row label="Map file" top help={<span class="wc-sp-mapfile">{mapFileLine(cur)}</span>} class="wc-sp-maprow">
        <span class="wc-ck-btns">
          <GhostButton
            class="wc-sp-import"
            onClick={() => {
              if (!maps) return flash('Map import is not available here.', 'fail');
              fileRef.current?.click();
            }}
          >
            Import map file…
          </GhostButton>
          <GhostButton class="wc-sp-bundled" disabled={cur?.kind !== 'imported'} onClick={() => void run(() => useBundledMap(maps, cur, flash))}>
            Use bundled map
          </GhostButton>
        </span>
      </Row>
      <div class={`wc-ck-note wc-sp-mapnote${note?.fail ? ' is-fail' : ''}`} aria-live="polite">
        {note?.text ?? ''}
      </div>
      <input ref={fileRef} type="file" accept=".mm2" hidden class="wc-sp-mapfile-input" onChange={() => void onFile()} />
      <div class="wc-sp-tileset">
        <div class="wc-sp-thead">
          <span class="wc-ck-l" id={tilesetLabel}>
            Tileset
          </span>
          <small class="wc-ck-help">{tilesetCreditNow(m.tileset)}</small>
        </div>
        <CardGrid
          class="wc-sp-tcards"
          labelledBy={tilesetLabel}
          value={tileset.id}
          options={tilesetCards()}
          cols={TILESET_COLS}
          onChange={(id) => settings.update({ mapper: chooseTileset(settings.get().mapper, id) })}
        />
      </div>
    </div>
  );
}
