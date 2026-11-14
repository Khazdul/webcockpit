// The kit gallery's "Menu" section (stage 67, ADR 0149): the start menu's
// owner row in every state of `ownerRow` (start-menu-model.ts), drawn by
// the menu's own row, at the panel's width with Profile under it; and the
// Community row with and without its counter. The sync states, the locked
// copy and the reactions mark have no source until stages 61 and 65: this
// is where they can be seen. Dev only (the gallery is not in a normal
// build).
//
// Keys (outside text fields): C toggles the cursor on every owner row.
// `?kit=menu` opens it (screenshots).

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { MenuRow, startItem } from '../../frames/start-main';
import { type OwnerInput, communityCount, ownerRow } from '../../frames/start-menu-model';
import { Check } from '../look';
import { type KitSection, useKitKeys } from './kit';
import './menu.css';

const STATES: { title: string; input: OwnerInput }[] = [
  { title: 'guest', input: { name: null } },
  { title: 'name only (before sync exists)', input: { name: 'ole' } },
  { title: 'synced', input: { name: 'ole', sync: 'synced' } },
  { title: 'syncing', input: { name: 'ole', sync: 'syncing' } },
  { title: 'offline', input: { name: 'ole', sync: 'offline' } },
  { title: 'needs attention', input: { name: 'ole', sync: 'full' } },
  { title: 'needs attention (update)', input: { name: 'ole', sync: 'update' } },
  { title: 'a locked copy, logged out here', input: { name: null, locked: 'ole' } },
  { title: 'with a reactions mark', input: { name: 'ole', sync: 'synced', news: 2 } },
  { title: 'the longest text', input: { name: 'olevongertten', sync: 'full', news: 2 } },
  { title: 'the longest name allowed (20)', input: { name: 'olevongertten_arda20', sync: 'synced' } },
];

const noop = (): void => {};

function Sample(p: { title: string; children: VNode | VNode[] }): VNode {
  return (
    <figure class="wc-km-sample">
      <figcaption>{p.title}</figcaption>
      <div class="wc-km-panel">
        <ul class="wc-sm" role="menu" aria-label={p.title}>
          {p.children}
        </ul>
      </div>
    </figure>
  );
}

export default {
  title: 'Menu',
  View: function MenuSection(): VNode {
    const [cursor, setCursor] = useState(false);
    useKitKeys((e) => {
      if (e.key !== 'c' || e.ctrlKey || e.altKey || e.metaKey) return false;
      setCursor((c) => !c);
      return true;
    });
    const profile = startItem('profile', { note: 'default' });
    return (
      <div class="wc-km">
        <div class="wc-km-bar">
          <Check label="The cursor on the owner row (C)" id="cursor" checked={cursor} onChange={setCursor} />
        </div>
        <h3 class="wc-km-h">The owner row</h3>
        <div class="wc-km-grid">
          {STATES.map((s) => (
            <Sample key={s.title} title={s.title}>
              <MenuRow item={startItem('owner', { owner: ownerRow(s.input) })} selected={cursor} active={false} onSelect={noop} />
              <MenuRow item={profile} selected={false} active={false} onSelect={noop} />
            </Sample>
          ))}
        </div>
        <h3 class="wc-km-h">Community</h3>
        <div class="wc-km-grid">
          {[3, 0].map((n) => (
            <Sample key={n} title={n ? `${n} new` : 'no news'}>
              <li class="wc-sm-sep" role="separator" aria-hidden="true" />
              <MenuRow item={startItem('community', { count: communityCount(n) })} selected={false} active={false} onSelect={noop} />
              <MenuRow item={startItem('about')} selected={false} active={false} onSelect={noop} />
            </Sample>
          ))}
        </div>
      </div>
    );
  },
} satisfies KitSection;
