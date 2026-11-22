// The hidden info poll's answer as MUME sends it (stage 77 part C): the
// stage file's one sample ("The raw answer") with the poll's separators and
// a made-up wimpy, wrapped, CRLF, the XML prompt and GA. Used by the unit
// tests and tests/e2e/info-poll.spec.ts.

const G = (n: number): string => `\x1b[32m${n}\x1b[0m`;

/** The sample's fields, and `%y`. */
export const ANSWER_FIELDS: readonly string[] = [
  ...'74|81|13|85|70|16|16|16|11|12|16|8|Str:16 Int:16 Wis:16 Dex:11 Con:12 Wil:16 Per:8|57|7|7'.split('|'),
  'four feet eleven',
  'eight stone and five pounds',
  'ninety-seven pounds',
  'Heavy, but we will manage...',
  'You are totally corrupted by the Evilness of Morgoth!',
  'GoblinTown',
  `${G(380)} gold coins, ${G(5)} silver pennies, and ${G(49)} copper pennies`,
  'warlord (19)',
  '25',
  '10',
  '20',
  '120',
];

export const XML_PROMPT = '<prompt>o&gt;</prompt>';
/** Stands for IAC GA in the texts below (`wire`). */
export const GA = '\x07';

const visible = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length;

/** MUME's wrap: at a space, which the break replaces; colour codes do not count. */
export function wrapAnswer(text: string, cols: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && visible(`${line} ${word}`) > cols) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  out.push(line);
  return out;
}

/** The answer's lines for a poll with `nonce`. */
export function answerLines(nonce: string, cols = 97, fields: readonly string[] = ANSWER_FIELDS): string[] {
  return wrapAnswer(`WC${nonce}[${fields.join(' | ')}]WC${nonce}`, cols);
}

/** An answer with its blank line after, and before when `queued`. No prompt. */
export function answerText(nonce: string, o: { cols?: number; queued?: boolean; fields?: readonly string[] } = {}): string {
  return `${o.queued ? '\r\n' : ''}${answerLines(nonce, o.cols, o.fields).join('\r\n')}\r\n\r\n`;
}

/** An answer that is all its pulse shows. */
export function answerPulse(nonce: string, o: { cols?: number; queued?: boolean; fields?: readonly string[] } = {}): string {
  return answerText(nonce, o) + XML_PROMPT + GA;
}

/** A text with `GA` marks as bytes. */
export function wire(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === GA) out.push(255, 249);
    else out.push(text.charCodeAt(i));
  }
  return out;
}

/** The nonce in a sent poll, or null. */
export function pollNonce(sent: string): string | null {
  return [...sent.matchAll(/(?:^|\n|[^\x20-\x7e])info WC([a-z0-9]{6})\[/g)].pop()?.[1] ?? null;
}
