// The admin page (spec §7.9, ADR 0148 "The admin page", ADR 0157): its own
// small page, served by the Worker only after the Access check (access.ts).
// A tool, not part of the TUI: plain and readable, nothing from the app, no
// external scripts. Three files, so the CSP can be `'self'` without inline
// code: /admin (this HTML), /admin/admin.css, /admin/admin.js. They are
// strings because the router also runs under Node (the static server),
// where a text import of an .html file does not exist.
//
// Stage 66 splits the script into string modules joined here into one
// IIFE: the shell (helpers, the modal, the views by the hash, the side bar),
// the views (Reports, Accounts and one account, Log, Flags and limits, the
// graphs of graphs.ts), and the shell's boot last. Every text from the API
// goes in by textContent; nothing is ever parsed as HTML.

import { ACCOUNTS_CSS, ACCOUNTS_JS } from './accounts.ts';
import { FLAGS_CSS, FLAGS_JS } from './flags.ts';
import { ADMIN_GRAPHS_CSS, ADMIN_GRAPHS_JS } from './graphs.ts';
import { LIMITS_CSS, LIMITS_JS } from './limits.ts';
import { LOG_CSS, LOG_JS } from './log.ts';
import { REPORTS_CSS, REPORTS_HTML, REPORTS_JS } from './reports.ts';
import { SHELL_BOOT_JS, SHELL_CSS, SHELL_JS } from './shell.ts';

export const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>WebCockpit admin</title>
<link rel="stylesheet" href="/admin/admin.css">
<script src="/admin/admin.js" defer></script>
</head>
<body>
<div class="app">
<nav class="side" aria-label="Views">
  <h1>WebCockpit admin</h1>
  <p class="where"><span id="env"></span> · <span id="online-now">… online</span></p>
  <p id="status">Loading…</p>
  <div class="nav" id="nav"></div>
</nav>
<main class="main" id="main">
<p id="mod-status" class="note" role="status"></p>
${REPORTS_HTML}
<div id="view"></div>
</main>
</div>
</body>
</html>
`;

export const ADMIN_CSS = [SHELL_CSS, REPORTS_CSS, LIMITS_CSS, ACCOUNTS_CSS, LOG_CSS, FLAGS_CSS, ADMIN_GRAPHS_CSS].join('');

/** The script's modules in their order inside the one IIFE (the sink checks walk them all). */
export const ADMIN_JS_MODULES = { shell: SHELL_JS, reports: REPORTS_JS, limits: LIMITS_JS, accounts: ACCOUNTS_JS, log: LOG_JS, flags: FLAGS_JS, graphs: ADMIN_GRAPHS_JS, boot: SHELL_BOOT_JS };

export const ADMIN_JS = `'use strict';
(function () {
${Object.values(ADMIN_JS_MODULES).join('')}
})();
`;
