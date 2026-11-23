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

// ------------------------------------------------------------ the sex probe

/** A plain `info` (Rasta's, 2026-09-25, with colour), for `sex`. The blank line inside is MUME's. */
export function plainInfoLines(sex: 'male' | 'female' = 'male', race = 'Tarkhnarb Orc'): string[] {
  return [
    `You are a ${sex} ${race}.`,
    'You are 82 years, 4 months, and 2 days old.',
    'You have played 2 months, 6 days, and 17 hours (real time). Session: 29 secs.',
    `This ranks you as Rasta Fari (level ${G(73)}).`,
    'You are four feet eleven and weigh eight stone and five pounds.',
    `Perception: vision ${G(25)}, hearing ${G(10)}, smell ${G(20)}. Alertness: \x1b[32mnormal\x1b[0m.`,
    'You are totally corrupted by the Evilness of Morgoth!',
    'You are welcome in Goblin-town.',
    'Your equipment weighs ninety pounds. Heavy, but we will manage...',
    `Your base abilities are: Str:${G(17)}(${G(15)}) Int:${G(15)} Wis:${G(17)} Dex:${G(11)} Con:${G(11)} Wil:${G(16)} Per:${G(8)}.`,
    `Offensive Bonus: ${G(74)}%, Dodging Bonus: ${G(9)}%, Parrying Bonus: ${G(95)}%.`,
    `Your armour provides an average protection of ${G(61)}%.`,
    `You have ${G(254)}/${G(254)} hit, ${G(54)}/${G(115)} mana, and ${G(112)}/${G(112)} movement points.`,
    `Your mood is \x1b[32mwimpy\x1b[0m. You will flee if your hit points go below ${G(200)}.`,
    'You have scored \x1b[32m81,483,972\x1b[0m experience points and you have \x1b[32m399,929\x1b[0m travel points.',
    `You have fought a few battles for the forces of the Dark Lord (${G(2)} wp).`,
    'You need \x1b[32m1,016,028\x1b[0m exp. points and \x1b[32m0\x1b[0m travel points to reach the next level.',
    `You have ${G(105)} gold coins, ${G(1)} silver penny, and ${G(52)} copper pennies.`,
    'You are speaking Morbeth.',
    'You will swim if necessary.',
    '',
    'You are subjected to the following temporary effects:',
    '- tiredness',
    '- strength',
  ];
}

/**
 * The probe's three answers, each queued (a blank line before and after),
 * as they follow another answer in the same pulse. No prompt.
 */
export function probeText(nonce: string, o: { sex?: 'male' | 'female'; body?: readonly string[] } = {}): string {
  const body = o.body ?? plainInfoLines(o.sex);
  return [`\r\nWC${nonce}{\r\n\r\n`, `\r\n${body.join('\r\n')}\r\n\r\n`, `\r\n}WC${nonce}\r\n\r\n`].join('');
}

/** The nonce in a sent sex probe, or null. */
export function probeNonce(sent: string): string | null {
  return [...sent.matchAll(/(?:^|\n|[^\x20-\x7e])info WC([a-z0-9]{6})\{/g)].pop()?.[1] ?? null;
}
