// The look picker as a page of the phone (stage 80 §10, part F): the same
// selection and the same tabs as the desktop dialog (`usePickerModel`,
// `LibraryTab`, `MineTab` in picker.tsx and mine.tsx), in the phone's
// settings pages' look (src/phone/settings-page.tsx, phone.css): the iron
// band with Back, the hood, a column that scrolls, and a foot of two keys.
//
//   ┌ ‹                                   ┐  band: Back = Cancel
//   │          LOOK FOR RASTA               │  hood
//   │ [portrait] [map bit] [group row]      │  the preview, live
//   │ [Automatic | Library | My images]     │  44 px tabs
//   │  Automatic: the card                  │
//   │  Library: chips (they wrap), search,  │
//   │    the grid (the page scrolls)        │
//   │  My images: the shelf, the crop step  │
//   │    by touch, or the login card        │
//   │ LOOK  [Show my look to …]  ⏻          │  your own character
//   │ [Reset to automatic]                  │  a member
//   │ [ Cancel ]        [ Use this look ]   │  foot
//   └───────────────────────────────────────┘
//
// It is mounted by the phone layer's menu (src/phone/menu-sheet.tsx) inside
// its surface: from the game (a tap on the Character card's portrait or a
// Group token) or from the Character settings' "Look…" row. Back, Esc and
// the back gesture cancel (the look it opened with stays); "Use this look"
// keeps the selection. A tablet shows the same page (ADR 0140: the
// phone's layout), its column wider, and in landscape the preview stands
// beside the tabs. Nothing takes the DOM focus but the search field (our
// keyboard: `data-okb-page`, src/phone/keyboard-pages.ts) and the crop.

import type { VNode } from 'preact';
import { ServicesCtx, type ChromeServices } from '../chrome/kit/hooks';
import { Toggle } from '../chrome/kit/look-controls';
import { AutoImg, type LookPickerOptions, LibraryTab, OwnSrc, TABS, Token, usePicture, usePickerModel } from './picker';
import { MineTab } from './mine';
import { AUTO } from './types';
import type { Look } from './resolve';
import './phone-page.css';

export interface PhoneLookPageOptions extends LookPickerOptions {
  /** The page closed (Cancel, Use, Back): the menu goes back to where it came from. */
  done(): void;
}

/** Presses never move the DOM focus (no keyboard on a tap). */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

function Preview(p: { look: Look; name: string; ring: string; hp: number; mana: number | null; mv: number; tileset: string }): VNode {
  const big = usePicture(p.look, true);
  const ground = `${(import.meta.env?.BASE_URL as string | undefined) ?? '/'}map/tilesets/previews/${p.tileset}.png`;
  const bar = (cls: string, pct: number): VNode => (
    <span class={'wc-looks-bar ' + cls}>
      <i style={{ width: `${Math.round(pct * 100)}%` }} />
    </span>
  );
  return (
    <div class="wc-looks-ph-prev" aria-hidden="true">
      <div class="wc-looks-ph-pv">
        <div class={'wc-looks-frame' + (big.lib ? ' is-lib' : '')}>
          <div class="wc-looks-pimg">{big.src && <img src={big.src} alt="" draggable={false} />}</div>
        </div>
        <span class="wc-looks-sub">Portrait</span>
      </div>
      <div class="wc-looks-ph-pv">
        <div class="wc-looks-mapbit" style={{ backgroundImage: `url("${ground}")` }}>
          <Token look={p.look} d={40} ring={p.ring} />
        </div>
        <span class="wc-looks-sub">Map</span>
      </div>
      <div class="wc-looks-ph-pv is-row">
        <div class="wc-looks-row">
          <Token look={p.look} d={30} ring={p.ring} />
          <span class="wc-looks-row-b">
            <b>{p.name}</b>
            <span class="wc-looks-bars">
              {bar('is-hp', p.hp)}
              {p.mana !== null && bar('is-ma', p.mana)}
              {bar('is-mv', p.mv)}
            </span>
          </span>
        </div>
        <span class="wc-looks-sub">Group</span>
      </div>
    </div>
  );
}

/** The phone's look page for `p.who` (inside the menu's surface; the caller provides the services). */
export function PhoneLookPage(p: PhoneLookPageOptions): VNode {
  const m = usePickerModel(p);
  const { who, looks, sel, tab } = m;
  const press = (run: () => void) => ({
    onMouseDown: keepFocus,
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      run();
    },
  });
  return (
    <OwnSrc.Provider value={(id) => looks.ownSrc(id)}>
      <div class="wc-ph-page wc-looks-ph" role="dialog" aria-label={`Look for ${m.name}`} data-page="look" data-look-who={who.name} data-okb-page="">
        <div class="wc-ph-band">
          <button type="button" class="wc-ph-back" tabIndex={-1} aria-label="Cancel" data-btn="BACK" {...press(() => m.finish(false))}>
            <svg class="wc-ph-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        </div>
        <div class="wc-ph-page-body">
          <span class="wc-ph-hood">Look for {m.name}</span>
          <div class="wc-ph-col wc-looks-ph-col">
            <div class="wc-looks-ph-body">
              <PreviewOf m={m} />
              <div class="wc-looks-ph-main">
                <div class="wc-looks-ph-tabs" role="tablist" aria-label="Where the look comes from">
                  {TABS.map((t) => (
                    <button key={t.id} type="button" role="tab" data-tab={t.id} aria-selected={tab === t.id ? 'true' : 'false'} tabIndex={-1} {...press(() => m.setTab(t.id))}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div class="wc-looks-pane" role="tabpanel" data-pane={tab}>
                  {tab === 'auto' && (
                    <>
                      <button type="button" class="wc-looks-auto" tabIndex={-1} aria-pressed={sel.src === 'auto' ? 'true' : 'false'} {...press(() => m.setSel(AUTO))}>
                        <AutoImg look={m.auto} />
                        <span>
                          <b>{m.autoTitle}</b>
                          <span class="wc-looks-d">{m.autoText}</span>
                        </span>
                      </button>
                      {!who.self && <p class="wc-looks-hint">What you get without choosing anything. Pick from Library or My images to set your own look for this name. It is only shown to you.</p>}
                    </>
                  )}
                  {tab === 'lib' && <LibraryTab lib={m.lib} filter={m.filter} setFilter={m.setFilter} sel={sel} ring={m.ring} choose={m.setSel} />}
                  {tab === 'mine' && (
                    <MineTab
                      looks={looks}
                      sel={sel}
                      choose={m.setSel}
                      keys={m.mineKeys}
                      {...(p.canLeave ? { canLeave: p.canLeave } : {})}
                      onRemoved={(id) => {
                        if (sel.src === 'own' && sel.id === id) m.setSel(AUTO);
                      }}
                    />
                  )}
                </div>
                {who.self ? (
                  <section class="wc-ph-grp wc-looks-ph-share" data-group="look-share">
                    <span class="wc-ph-grp-t">Sharing</span>
                    <div class="wc-ph-card">
                      <div class="wc-ph-srow" data-row="character-share-look">
                        <span class="wc-ph-srow-t">Show my look to other MUME Cockpit players</span>
                        <Toggle label="Show my look to other MUME Cockpit players" on={m.shareOn} only="switch" onChange={() => m.toggleShare()} />
                      </div>
                    </div>
                    <span class="wc-ph-cap">{m.shareNote}</span>
                  </section>
                ) : (
                  <div class="wc-ph-card wc-looks-ph-reset">
                    <button
                      type="button"
                      class="wc-ph-srow is-pick is-action"
                      data-btn="RESET"
                      tabIndex={-1}
                      aria-disabled={sel.src === 'auto' ? 'true' : undefined}
                      {...press(() => {
                        m.setSel(AUTO);
                        m.setTab('auto');
                      })}
                    >
                      <span class="wc-ph-srow-t">Reset to automatic</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div class="wc-looks-ph-foot">
            <button type="button" class="wc-looks-ph-key" data-btn="CANCEL" tabIndex={-1} {...press(() => m.finish(false))}>
              Cancel
            </button>
            <button type="button" class="wc-looks-ph-key is-go" data-btn="USE" tabIndex={-1} {...press(() => m.finish(true))}>
              Use this look
            </button>
          </div>
        </div>
      </div>
    </OwnSrc.Provider>
  );
}

function PreviewOf(p: { m: ReturnType<typeof usePickerModel> }): VNode {
  const { m } = p;
  // (The same scene as the desktop's: the player's tileset, Shimrod's summer one.)
  const tileset = m.tileset.startsWith('shimrod') ? 'shimrod-summer' : m.tileset;
  return <Preview look={m.shown} name={m.name} ring={m.ring} hp={m.hp} mana={m.mana} mv={m.mv} tileset={tileset} />;
}

/** The phone's look page as a node for the menu's surface, under the chrome's services. */
export function phoneLookPage(services: ChromeServices, opts: PhoneLookPageOptions): VNode {
  return (
    <ServicesCtx.Provider value={services}>
      <PhoneLookPage {...opts} />
    </ServicesCtx.Provider>
  );
}
