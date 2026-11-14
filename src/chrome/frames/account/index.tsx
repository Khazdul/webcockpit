// The account pages (stage 60, spec §7.2): one lazy chunk, loaded when the
// start menu's Account row is activated (src/chrome/frames/start-main.tsx)
// and never before. It is the only place that imports the account's
// client (src/cloud/account) statically; the heavy crypto is loaded by
// the flows themselves.
//
//   login.tsx          Log in
//   create.tsx         Create account (one page, the six points)
//   recovery-code.tsx  the recovery code, shown once (page and reusable view)
//   recover.tsx        Recovery ("Forgot password")
//   account-page.tsx   the Account page (a placeholder until its own part)
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
import { registerPages } from './form';
import { LoginFrame } from './login';
import { RecoverFrame } from './recover';
import { RecoveryCodeFrame } from './recovery-code';
import './account.css';

registerPages({ login: LoginFrame, create: CreateFrame, recover: RecoverFrame, code: RecoveryCodeFrame, account: AccountFrame });

export { AccountFrame, CreateFrame, LoginFrame, RecoverFrame, RecoveryCodeFrame };

/** The page the Account row opens: the Account page when somebody is logged in here, else Log in. */
export function accountEntry(loggedIn: boolean): VNode {
  return loggedIn ? (h(AccountFrame, {}) as VNode) : (h(LoginFrame, {}) as VNode);
}
