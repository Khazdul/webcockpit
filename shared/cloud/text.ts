// The text rules of share links (ADR 0154 "As built (stage 64 B1)"): the
// one place the Worker's check (worker/pub.ts `textOf`, reports, the
// admin's notes) and the client's cleaning (src/share/link.ts for the
// meta, src/watch/model.ts for a report's text) take them from. Tiny and
// free of imports, so the watch page's chunk can carry it without
// shared/cloud/api.ts.
//
// Refused: control characters (C0, DEL, C1; `\n` only where a text allows
// it), lone surrogates, and the bidi embeddings, overrides and isolates
// (U+202A–U+202E, U+2066–U+2069), which could make a title read as
// something else around it. Text is NFC; lengths are in code points.

/** A character the rules refuse (`\n` included: a text that allows it takes it out before the test). */
export const TEXT_FORBIDDEN = /[\p{Cc}\p{Cs}‪-‮⁦-⁩]/u;

const CONTROL = /[\p{Cc}‪-‮⁦-⁩]/gu;
const LONE = /\p{Cs}/gu;

/**
 * `s` as the rules take it: lone surrogates out, NFC, every refused
 * character replaced by `control` (default: taken out), `\n` kept when
 * `newlines`.
 */
export function cleanText(s: string, o: { newlines?: boolean; control?: string } = {}): string {
  const by = o.control ?? '';
  return s
    .replace(LONE, '')
    .normalize('NFC')
    .replace(CONTROL, (c) => (c === '\n' && o.newlines ? c : by));
}

/** True when `v` is text by the rules (NFC, nothing refused; `\n` allowed when `newlines`). */
export function isCleanText(v: string, newlines = false): boolean {
  return v.normalize('NFC') === v && !TEXT_FORBIDDEN.test(newlines ? v.replace(/\n/g, '') : v);
}
