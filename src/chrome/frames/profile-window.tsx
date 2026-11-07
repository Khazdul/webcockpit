// The Profile window's root frame (stage 30 S8, ADR 0103). Moved out of
// src/chrome/windows.tsx unchanged in stage 42d (ADR 0127), so the
// profile stage (43b) owns it without touching the window manager.

import type { VNode } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { WindowsOptions } from '../windows';
import { profileEditOptions } from './esc-main';
import { editProfile } from './profile-edit';
import { useServices, useSettings } from '../kit/hooks';
import { useFlash, useIsTopFrame, useKeys, useNav } from '../kit/stack';
import { Blank, FlashRow, Page } from '../kit/widgets';

/**
 * The Profile window's root frame: it loads the active profile's editor
 * over itself (as ESC → Profile does) and closes the window once the editor
 * is left, unless the editor left with a failure to show (a failed save or
 * apply): then the flash stays, Enter opens the editor again, Esc closes.
 */
export function ProfileRoot(p: { opts: WindowsOptions; close: () => void }): VNode {
  const nav = useNav();
  const top = useIsTopFrame();
  const flash = useFlash();
  const settings = useSettings();
  const { profiles, onProfileSaved } = useServices();
  const left = useRef(false);
  const edit = (): void =>
    void editProfile(nav, profiles, settings.profile, profileEditOptions(p.opts, onProfileSaved));
  useEffect(edit, []);
  useEffect(() => {
    if (!top) left.current = true;
    else if (left.current && flash?.kind !== 'fail') p.close();
  }, [top]);
  useKeys((_e, nk) => {
    if (nk !== 'activate') return false;
    edit();
    return true;
  });
  return (
    <Page title="Profile" footer={[{ text: 'Enter Edit', onClick: edit }, 'ESC Close']}>
      <Blank />
      <FlashRow />
    </Page>
  );
}
