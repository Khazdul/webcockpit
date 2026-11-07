// The in-game hosts of the profile editor (stage 30 S8, ADR 0103; stage
// 43b, ADR 0128): the Profile window's root frame (`ProfileRoot`) and the
// page the phone's ESC menu opens at for `#profile` (`ProfileEntry` in
// esc-main.tsx) share `ProfileHome`, and both pass `profileEditOptions`
// (live apply while connected, the head line following the connection).
//
//   ( Profile · default )            ← the window's hood (or the menu box's)
//
//                default
//          Opening default…           ← after 300 ms while the chunk loads
//      Could not open the editor: …   ← a failure (stays until the next try)
//                [Edit]
//
// The root loads the active profile's editor over itself as soon as it
// mounts, so the page itself is seen only while the editor's chunk loads
// (nothing for 300 ms, then a quiet "Opening default…") and after the
// editor left with a failure to show (it could not open, or a save or
// apply failed): then the failure stays, Edit (E, Enter) opens the editor
// again, Esc / X / Back closes. Leaving the editor cleanly closes the
// window (the menu). A new-look frame (`lookFrame`): in a window the
// window's Lykta frame is the box, in the ESC menu the full-screen box.

import './profile-window.css';
import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type AppStatusView, isLive } from '../../app/status';
import type { CommitProfile } from '../../profiles';
import type { WindowsOptions } from '../windows';
import { type EditOptions, editProfile } from './profile-edit';
import { useServices, useSettings } from '../kit/hooks';
import { Box, BoxBody, GlassButton, LookFlash, letterAction, lookFrame } from '../kit/look';
import { type Flash, useFlash, useIsTopFrame, useKeys, useNav } from '../kit/stack';

/** What the in-game hosts know of the session (`EscActions` and `WindowsOptions` both carry it). */
export interface LiveHost {
  status: AppStatusView;
  commitProfile?: CommitProfile | undefined;
  flushWriteBack?: (() => Promise<void>) | undefined;
}

/**
 * The editor options of the ESC menu's Profile, `#profile` on the phone and
 * the Profile window: live apply while connected (ADR 0105), and the head
 * line's "Connected · …" / "Not connected · …" following the connection.
 * `onLiveChange` calls back only when `isLive` flips, not on every status
 * tick (link samples, capture text).
 */
export function profileEditOptions(p: LiveHost, onSaved: ((name: string) => void) | undefined): EditOptions {
  const live = (): boolean => isLive(p.status.get());
  return {
    isLive: live,
    commit: p.commitProfile,
    beforeLoad: p.flushWriteBack,
    onSaved,
    onLiveChange: (fn) => {
      let was = live();
      return p.status.subscribe((s) => {
        const now = isLive(s);
        if (now === was) return;
        was = now;
        fn();
      });
    },
  };
}

/** How long the page stays empty before it says the editor is on its way. */
export const OPENING_MS = 300;

/**
 * The hosts' root page: opens the active profile's editor over itself at
 * once; `close` once the editor is left, unless it left with a failure to
 * show. Shared by the window and the phone's ESC menu.
 */
export function ProfileHome(p: { host: LiveHost; close: () => void }): VNode {
  const nav = useNav();
  const top = useIsTopFrame();
  const flash = useFlash();
  const settings = useSettings();
  const { profiles, onProfileSaved } = useServices();
  const name = settings.profile;
  const [busy, setBusy] = useState(true);
  const [slow, setSlow] = useState(false);
  // The last failure, kept on the page until the next try (the stack's flash fades).
  const [fail, setFail] = useState<Flash | null>(null);
  const left = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const edit = (): void => {
    setBusy(true);
    setSlow(false);
    setFail(null);
    const t = setTimeout(() => alive.current && setSlow(true), OPENING_MS);
    void editProfile(nav, profiles, name, profileEditOptions(p.host, onProfileSaved)).finally(() => {
      clearTimeout(t);
      if (alive.current) setBusy(false);
    });
  };
  useEffect(edit, []);
  useEffect(() => {
    if (flash?.kind === 'fail') setFail(flash);
  }, [flash]);
  useEffect(() => {
    if (!top) left.current = true;
    else if (left.current && flash?.kind !== 'fail') p.close();
  }, [top]);

  useKeys((e, nk) => {
    if (busy) return false;
    if (nk === 'activate') {
      edit();
      return true;
    }
    return letterAction(e, { e: edit });
  });

  return (
    <Box size="large" title="Profile" onBack={() => nav.pop()} winClass="wc-pw-win">
      <BoxBody class="wc-pw" scroll={false}>
        <div class="wc-pw-name">{name}</div>
        {busy ? (
          <p class="wc-pw-opening" aria-live="polite">
            {slow ? `Opening ${name}…` : ''}
          </p>
        ) : (
          <>
            <LookFlash class="wc-pw-flash" flash={fail ?? flash} />
            <div class="wc-pw-btns">
              <GlassButton id="EDIT" label="Edit" letter="e" icon="pencil" primary onClick={edit} />
            </div>
          </>
        )}
      </BoxBody>
    </Box>
  );
}

/**
 * The Profile window's root frame (ADR 0103): `ProfileHome` with the
 * window's options; `close` closes the window.
 */
export const ProfileRoot = lookFrame(function ProfileRoot(p: { opts: WindowsOptions; close: () => void }): VNode {
  return <ProfileHome host={p.opts} close={p.close} />;
});
