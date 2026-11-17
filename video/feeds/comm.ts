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
export function commStep(m: CommLine, prompt: string): Step {
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

/** Film 2's tells on the way back into Bree (invented names). */
export const BREE_TELLS: CommLine[] = [
  { channel: 'tells', talker: 'Eilwen', text: 'saw your merc at the west gate, wolves again?' },
  { channel: 'tells', talker: 'Hamlin', text: 'Prancing Pony in ten? I owe you a pint' },
  { channel: 'tells', talker: 'Hamlin', text: 'bring the fur, Barliman buys them' },
];
