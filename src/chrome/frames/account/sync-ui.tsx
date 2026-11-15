// The account pages' part of the sync (stage 61 part C; the owner's picks
// of round 9, notes/research/start-menu-mockups/round9/):
//
//   SyncSection        the Account page's "Sync" rule (pick 7): the state
//                      with the owner row's mark, Sync now (S), the counts,
//                      the storage bar, what waits, the move's line (1c),
//                      what follows the account (stage 62, round 10 3a)
//   RemoveCopyDialog   the locked copy's Remove (pick 2): "Remove copy",
//                      what is lost, Keep the default
//   intoAccount        after Log in, Recovery and Create account: into the
//                      account's space (a reload), or stage 60's way when
//                      the flag `sync` is off
//
// `data-sync` on the section and `data-dlg="remove-copy"` are what the
// specs look for.

import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { createAccountSpace, enterAccount, forgetCreated, removeLocked, spacesOn } from '../../../cloud/space/flows';
import { type LockedNotice, type SyncView, onSyncView, syncNow, syncView } from '../../../cloud/sync-view';
import { currentSpace } from '../../../core/space';
import { Dialog, GlassButton, Icon, Rule, lookFrame } from '../../kit/look';
import type { Nav } from '../../kit/stack';
import { useNav } from '../../kit/stack';
import { go } from './form';

/** After a login (or Recovery): into the account's space, or to the Account page (flag `sync` off). */
export async function intoAccount(nav: Nav, name: string, message?: string): Promise<void> {
  try {
    if (currentSpace().kind === 'device' && (await spacesOn()) && (await enterAccount(name, message))) return;
  } catch {
    /* the space could not be made: stage 60's way */
  }
  go(nav, 'account');
  if (message) nav.flash(message);
}

/** After Create account's recovery code: the move into the account's space, or to the Account page (flag `sync` off). */
export async function intoNewAccount(nav: Nav, name: string): Promise<void> {
  try {
    if (currentSpace().kind === 'device' && (await spacesOn())) {
      if (await createAccountSpace(name)) return;
    } else forgetCreated();
  } catch {
    /* the move could not start: the next load tries again (`reconcile`) */
  }
  go(nav, 'account');
}

/** The sync's view, live. */
export function useSyncView(): SyncView {
  const [v, setV] = useState<SyncView>(syncView);
  useEffect(() => {
    setV(syncView());
    return onSyncView(setV);
  }, []);
  return v;
}

const KB = 1024;
/** "140 KB", "2 MB", "1.5 MB". */
export function sizeWords(bytes: number): string {
  if (bytes < KB * KB) return `${Math.max(0, Math.round(bytes / KB))} KB`;
  const mb = bytes / (KB * KB);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** "2 minutes ago", "just now", "14:02". */
function agoWords(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  return `at ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const MARK = { synced: 'dot', syncing: 'pulse', offline: 'ring', full: 'diamond', update: 'diamond' } as const;

/** The Account page's sync section; nothing without a sync in this page. */
export function SyncSection(p: { at: string | null }): VNode | null {
  const v = useSyncView();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const s = v.status;
  if (!s) return null;
  const busy = s.state === 'syncing';
  const words: VNode =
    s.state === 'synced' ? (
      <>
        <b>Synced</b>
        {s.lastSynced ? ` · ${agoWords(s.lastSynced, now)}` : ''}
      </>
    ) : s.state === 'syncing' ? (
      <b>Syncing…</b>
    ) : s.state === 'offline' ? (
      <>
        <b>Offline</b>
        {s.lastSynced ? ` · last synced ${agoWords(s.lastSynced, now)}` : ''}
      </>
    ) : s.state === 'full' ? (
      <b>Cloud storage full</b>
    ) : (
      <b>Update the client to read newer data</b>
    );
  const used = s.usage?.itemBytes ?? 0;
  const max = s.limits?.itemBytes ?? 0;
  const frac = max > 0 ? Math.min(1, used / max) : 0;
  const w = s.waiting;
  const note =
    s.state === 'offline' && w > 0
      ? `${w} change${w === 1 ? '' : 's'} wait${w === 1 ? 's' : ''} on this device. They go when the server can be reached.`
      : s.state === 'full'
        ? `${Math.max(1, w)} change${w > 1 ? 's are' : ' is'} kept on this device until there is room. Delete a profile or script you no longer need.`
        : s.state === 'update'
          ? 'Something in the account was saved by a newer version. Reload the page to update; it is left as it is until then.'
          : null;
  return (
    <>
      <Rule title="Sync" id="sync" />
      <div class={'wc-ac-sync' + (s.state === 'full' ? ' is-full' : '')} data-sync={s.state} data-synced-at={s.lastSynced ?? undefined}>
        <div class="wc-ac-sync-st">
          <span class={`wc-so-mark is-${MARK[s.state]}`} aria-hidden="true" />
          <span class="wc-ac-sync-w">{words}</span>
          <GlassButton id="SYNCNOW" label="Sync now" letter="s" icon="reset" small disabled={busy} selected={p.at === 'SYNCNOW'} onClick={() => void syncNow()} />
        </div>
        <div class="wc-ac-sync-n">
          <span>{v.counts ? `${v.counts.profiles} profile${v.counts.profiles === 1 ? '' : 's'} · ${v.counts.scripts} script${v.counts.scripts === 1 ? '' : 's'}` : ''}</span>
          {max > 0 && (
            <span class="wc-ac-sync-kb">
              {sizeWords(used)} of {sizeWords(max)}
            </span>
          )}
        </div>
        {max > 0 && (
          <div class="wc-ac-bar" role="img" aria-label={`${sizeWords(used)} of ${sizeWords(max)}`}>
            <i style={{ width: `${Math.max(frac * 100, 1.5)}%` }} />
          </div>
        )}
        {note && <p class="wc-ac-small wc-ac-sync-note">{note}</p>}
        {v.moved && (
          <p class="wc-ac-sync-move" data-moved="">
            <Icon name="check" />
            <span>{v.moved}</span>
          </p>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------ Remove copy

export const RemoveCopyDialog = lookFrame(function RemoveCopyDialog(p: { notice: LockedNotice }): VNode {
  const nav = useNav();
  const [working, setWorking] = useState(false);
  const n = p.notice;
  const keep = (): void => {
    if (!working) nav.pop();
  };
  const remove = async (): Promise<void> => {
    if (working) return;
    setWorking(true);
    await removeLocked(n.nameKey).catch(() => {});
    nav.pop();
    nav.flash(`The copy of ${n.name} is removed from this device.`);
  };
  return (
    <Dialog
      title="Remove copy"
      dlg="remove-copy"
      width={460}
      onCancel={keep}
      buttons={[
        { id: 'KEEP', label: 'Keep', letter: 'k', primary: true, disabled: working, run: keep },
        { id: 'REMOVE', label: 'Remove', letter: 'r', danger: true, disabled: working, run: () => void remove() },
      ]}
    >
      <div class="wc-ac-dlg">
        <p class="wc-lk-q">
          Remove <b class="wc-ac-who">{n.name}’s</b> copy from this device?
        </p>
        <p class="wc-lk-qn">{n.what} that {/^1 /.test(n.what) && !n.what.includes(' and ') ? 'is' : 'are'} not in the account will be lost:</p>
        {n.lost.length > 0 && (
          <ul class="wc-ac-dlist">
            {n.lost.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        <p class="wc-ac-dnote">To keep them, log in to {n.name} instead.</p>
      </div>
    </Dialog>
  );
});
