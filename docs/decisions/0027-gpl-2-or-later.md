# 0027 — GPL-2.0-or-later and MMapper notices

- Status: Accepted
- Date: 2026-09-29
- Supersedes: the licence version in ADR 0001

## Context

ADR 0001 chose GPL-3.0-or-later. Stage 9 then ported MMapper's rendering,
tracking and `.mm2` reading to TypeScript (ADR 0020). MMapper is
GPL-2.0-or-later (SPDX headers in all its sources, `COPYING.txt`), so
GPL-3.0-or-later was allowed, but MMapper could not take WebCockpit code
back without moving to GPL-3.

After the repository went public, MMapper's author reminded us of the
licence terms: keep MMapper's copyright notices and document the changes.
The ported files named their MMapper sources but did not carry MMapper's
copyright line or a modification notice (GPL-2 §2a, GPL-3 §5a).

## Decision

- WebCockpit is licensed GPL-2.0-or-later (owner decision, 2026-09-29),
  MMapper's own licence. `LICENSE` is the GPL-2 text; `package.json`,
  README, About and the replay file notice say version 2 or later.
- Every file derived from MMapper starts with an SPDX line, a WebCockpit
  copyright line, MMapper's copyright line and a dated modification
  notice pointing at `THIRD_PARTY_NOTICES.md`.
- `THIRD_PARTY_NOTICES.md` "MMapper-derived code" lists each derived file,
  the MMapper sources it comes from and what changed.
- New code ported from MMapper gets the same header and a table row.
- About and the replay file notice link the source code
  (github.com/Khazdul/webcockpit), so every copy says where to get it
  (GPL-2 §3).

## Consequences

- Code can move both ways between WebCockpit and MMapper.
- Runtime dependencies must stay GPL-2-compatible. Today they are all MIT
  (Preact, CodeMirror and its dependencies). Apache-2.0 is not
  GPL-2-compatible; build-only tools (Vite, TypeScript, Playwright) are not
  distributed and do not matter.
- TinTin++ (GPL-3) stays a behavioural reference only; no code from it.

## Amendment (2026-09-29): licence text on the site

- The build emits the repository's `LICENSE` as `LICENSE.txt` at the site
  root (`licencePlugin` in `vite.config.ts`; the dev server serves the
  same file). About links it, so every copy of the app carries the GPL
  text (GPL-2 §1). The site-root smoke test checks it.
