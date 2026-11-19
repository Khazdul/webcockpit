// Simulated Comm for the film (owner, stage 70: Comm is staged, with
// invented names; never a real player's). A line goes out as MUME sends
// it (the owner's runs, 2026-09/10): an empty line, the coloured text, an
// empty line, then `Comm.Channel.Text` and the prompt. The client files it
// as it would a real one (src/gmcp/comm-chats.ts): a tell that is not a
// group tell opens the talker's private chat and counts as unread.
import { type Step, gmcpBytes, lineBytes } from '../../scripts/lib/mume-feed.ts';

/** MUME's colours of a channel's text (as in the runs). */
const COLOUR: Record<string, string> = { tells: '32', tales: '33', says: '36', yells: '33', questions: '33' };

/** The verb of a channel: `Name <verb> '…'`. */
const VERB: Record<string, string> = { tells: 'tells you', tales: 'narrates', says: 'says', yells: 'yells', questions: 'asks' };

export interface CommLine {
  channel: 'tells' | 'tales' | 'says' | 'yells' | 'questions';
  /** An invented name. */
  talker: string;
  /** What they say, without quotes. */
  text: string;
}

/** One staged message as MUME sends it, ending in `prompt`. */
export function commStep(m: CommLine, prompt: string): Step & { out: Buffer } {
  const text = `${m.talker} ${VERB[m.channel]} '${m.text}'`;
  const body = { channel: m.channel, talker: m.talker, 'talker-type': 'player', text: `\x1b[${COLOUR[m.channel]}m${text}\x1b[0m` };
  return {
    out: Buffer.concat([
      lineBytes(''),
      lineBytes(`\x1b[${COLOUR[m.channel]}m${text}\x1b[0m`),
      lineBytes(''),
      gmcpBytes(`Comm.Channel.Text ${JSON.stringify(body)}`),
      lineBytes(prompt),
    ]),
  };
}

/**
 * Your own tell as MUME answers `tell <name> …` (the owner's runs): `Ok.` in
 * the game, then `Comm.Channel.Text` with talker `you`, the `destination`
 * and the bare text, so the client files it in that person's chat as yours.
 */
export function commMine(to: string, text: string, prompt: string): Step & { out: Buffer } {
  const body = { channel: 'tells', destination: to, talker: 'you', text };
  return { out: Buffer.concat([lineBytes('Ok.'), lineBytes(''), gmcpBytes(`Comm.Channel.Text ${JSON.stringify(body)}`), lineBytes(prompt)]) };
}

/** Film 2, act 1 (in Bree, before the mercenary): a narrate on Public and Eilwen's first tell (invented names). */
export const BREE_ARRIVAL_COMM: CommLine[] = [
  { channel: 'tales', talker: 'Oswin', text: 'anyone selling arrows in Bree?' },
  { channel: 'tells', talker: 'Eilwen', text: 'evening! heading out tonight?' },
];

/**
 * Film 2, act 1 (owner round 3): Gittan answers Eilwen in the Comm pane's own
 * reply line (before the mercenary is hired, so no name for him), and
 * Eilwen's two answers.
 */
export const BREE_REPLY = { to: 'Eilwen', text: 'heading out to hunt wolves, hoping for a wolf fur!' } as const;
export const BREE_REPLY_ANSWERS: CommLine[] = [
  { channel: 'tells', talker: 'Eilwen', text: 'saw a pack just outside the west gate earlier' },
  { channel: 'tells', talker: 'Eilwen', text: 'be safe!' },
];

/** Act 1's talk in order, as the takes that start later send it off camera (their Messages hold it too). */
export function breeAct1Comm(prompt: string): (Step & { out: Buffer })[] {
  return [
    ...BREE_ARRIVAL_COMM.map((m) => commStep(m, prompt)),
    commMine(BREE_REPLY.to, BREE_REPLY.text, prompt),
    ...BREE_REPLY_ANSWERS.map((m) => commStep(m, prompt)),
  ];
}

/** Film 2's tells on the way back into Bree (invented names). */
export const BREE_TELLS: CommLine[] = [
  { channel: 'tells', talker: 'Eilwen', text: 'back already? any luck with the furs?' },
  { channel: 'tells', talker: 'Hamlin', text: 'Prancing Pony in ten? I owe you a pint' },
  { channel: 'tells', talker: 'Hamlin', text: 'bring the fur, Barliman buys them' },
];
