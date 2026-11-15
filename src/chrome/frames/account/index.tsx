// The account pages (stage 60, spec §7.2): one lazy chunk, loaded when the
// start menu's owner row is activated (src/chrome/frames/start-main.tsx)
// and never before. It is the only place that imports the account's
// client (src/cloud/account) statically; the heavy crypto is loaded by
// the flows themselves.
//
//   login.tsx          Log in
//   create.tsx         Create account (one page, the six points)
//   recovery-code.tsx  the recovery code, shown once (page and reusable view)
//   recover.tsx        Recovery ("Forgot password")
//   account-page.tsx   the Account page (devices, password and recovery, leaving)
//   account-dialogs.tsx   its dialogs (log out, end session, change password, new recovery code, delete)
//   account-model.ts   the device list's order and the words of its times (pure)
//   published.tsx      Published runs on the Account page, Edit and Remove (stage 64);
//                      with `gallery` one row there and a view of its own (stage 65)
//   ../share-dialog.tsx  the export editor's share dialog (stage 64): here, so
//                      it adds no chunk of its own (the entry chunk's preload lists)
//   ../community.tsx   the Community page (stage 65 C1): here for the same reason
//
//   form.tsx           the keys of a form, the pages' way to each other (`go`), small pieces
//   words.ts           every error code's words and the shared sentences
//   working.tsx        the Working… bar
//   turnstile.ts       Cloudflare's widget (loader, mount)   turnstile-box.tsx   its hook
//   account.css        the look (`wc-ac-*`), by the box's own width
//
// The pages are siblings: one stands on the start menu at a time and
// `go(nav, …)` replaces it (form.tsx).

import { h } from 'preact';
import type { VNode } from 'preact';
import { AccountFrame } from './account-page';
import { CreateFrame } from './create';
import { heldCode, registerPages } from './form';
import { LoginFrame } from './login';
import { RecoverFrame } from './recover';
import { RecoveryCodeFrame } from './recovery-code';
import { RemoveCopyDialog } from './sync-ui';
import { PublishedFrame } from './published';
import type { LockedNotice } from '../../../cloud/sync-view';
import './account.css';

export { ShareDialog } from '../share-dialog';
export { openCommunity } from '../community';

registerPages({ login: LoginFrame, create: CreateFrame, recover: RecoverFrame, code: RecoveryCodeFrame, account: AccountFrame });

export { AccountFrame, CreateFrame, LoginFrame, RecoverFrame, RecoveryCodeFrame };

/**
 * The page the owner row opens: the Account page when somebody is
 * logged in here, else Log in; `published` (the row marks new reactions,
 * stage 65): the Account page's Published runs view straight away, whose
 * Back returns to the menu. First of all a new account's recovery code
 * that was not confirmed yet (form.tsx `holdCode`).
 */
export function accountEntry(loggedIn: boolean, view?: 'published'): VNode {
  const code = heldCode();
  if (code) return h(RecoveryCodeFrame, code) as VNode;
  if (!loggedIn) return h(LoginFrame, {}) as VNode;
  return view === 'published' ? (h(PublishedFrame, {}) as VNode) : (h(AccountFrame, {}) as VNode);
}

/** Log in with the name filled in (the locked copy's notice, stage 61). */
export function loginFor(name: string): VNode {
  return h(LoginFrame, { name }) as VNode;
}

/** The locked copy's Remove question (stage 61). */
export function removeCopyDialog(notice: LockedNotice): VNode {
  return h(RemoveCopyDialog, { notice }) as VNode;
}
