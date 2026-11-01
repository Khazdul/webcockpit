// Feed builder copied from scripts/screenshots.ts (scratch use only).
import { readFileSync } from 'node:fs';
const ROOT = '/home/ole/proj/webcockpit/';
// ------------------------------------------------------------ telnet feed

export const IAC = 255;
const SB = 250;
const SE = 240;
export const WILL = 251;
const GA = 249;
export const GMCP = 201;

export const gmcpBytes = (body: string): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(body, 'utf8'), Buffer.from([IAC, SE])]);

/** A prompt as replay-socket.ts tells one: visible text ending in `>`, short. */
const isPrompt = (raw: string): boolean => {
  const vis = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
  return vis.length > 0 && vis.length < 80 && vis.endsWith('>');
};

/** One server line: a prompt goes without a newline and ends with GA. */
const lineBytes = (raw: string): Buffer =>
  isPrompt(raw) ? Buffer.concat([Buffer.from(raw, 'utf8'), Buffer.from([IAC, GA])]) : Buffer.from(`${raw}\r\n`, 'utf8');

/** A feed step: bytes from the server, or a command typed into the input line. */
export type Step = { out: Buffer } | { cmd: string };

/** The body of each line of a fixture log (timestamps dropped). */
function fixture(name: string): string[] {
  return readFileSync(`${ROOT}tests/fixtures/${name}`, 'utf8')
    .split('\n')
    .filter((l) => l.length >= 17)
    .map((l) => l.slice(17));
}

/**
 * Fixture lines → steps. GMCP records become telnet GMCP, `> cmd` lines are
 * typed. `descs`: a room's description from its Room.Info is shown under
 * the room name (the fixtures keep only the name; MUME prints both).
 */
function toSteps(lines: readonly string[], o: { descs?: boolean; gmcp?: (pkg: string) => boolean } = {}): Step[] {
  const steps: Step[] = [];
  let buf: Buffer[] = [];
  let desc: string | null = null;
  // Commands typed ahead (`n;n;n`) wait for the prompt before them, so each echo sits on its prompt.
  const ahead: string[] = [];
  const flush = (): void => {
    if (buf.length) steps.push({ out: Buffer.concat(buf) });
    buf = [];
  };
  for (const l of lines) {
    if (l.startsWith('> ')) {
      flush();
      if (steps.length && 'cmd' in steps.at(-1)!) ahead.push(l.slice(2));
      else steps.push({ cmd: l.slice(2) });
    } else if (l.startsWith('\x1bGMCP ')) {
      const body = l.slice(6);
      const pkg = body.split(' ')[0]!;
      if (o.gmcp && !o.gmcp(pkg)) continue;
      if (pkg === 'Room.Info' && o.descs) desc = (JSON.parse(body.slice(pkg.length + 1)) as { desc?: string }).desc ?? null;
      buf.push(gmcpBytes(body));
    } else if (/^\x1b[A-Z]/.test(l)) {
      continue; // other client records (VIEW, SIZE, …)
    } else {
      buf.push(lineBytes(l));
      if (desc !== null && l.startsWith('\x1b[32m')) {
        for (const d of desc.replace(/\n+$/, '').split('\n')) buf.push(lineBytes(d));
        desc = null;
      }
      if (isPrompt(l)) {
        flush();
        const next = ahead.shift();
        if (next !== undefined) steps.push({ cmd: next });
      }
    }
  }
  flush();
  return steps;
}

/** Unsolicited channel text: GMCP, then an empty line, the text, an empty line, the prompt. */
function comm(channel: string, talker: string, text: string, colour = ''): Step {
  const g = gmcpBytes(`Comm.Channel.Text ${JSON.stringify({ channel, talker, 'talker-type': 'player', text })}`);
  const shown = colour ? `\x1b[${colour}m${text}\x1b[0m` : text;
  return { out: Buffer.concat([g, lineBytes(''), lineBytes(shown), lineBytes(''), lineBytes('*=>')]) };
}

/** How much of the fight on Hill Road the feed plays. */
type Fight = 'none' | 'mid' | 'full';

/**
 * The fight of gmcp-demo.log (`kill scout` to the achievement), moved to
 * Bree: the orc scout becomes a half-orc ruffian who arrives first. Its
 * Group GMCP is dropped (other ids than this feed's group). `mid` stops
 * while the ruffian is wounded.
 */
function fightSteps(fight: Fight): Step[] {
  if (fight === 'none') return [];
  const demo = fixture('gmcp-demo.log').map((l) =>
    l.replace(/an orc scout/g, 'a half-orc ruffian').replace(/An orc scout/g, 'A half-orc ruffian').replace(/scout/g, 'ruffian'),
  );
  const from = demo.indexOf('> kill ruffian');
  const to = fight === 'mid' ? demo.indexOf('Gibur grins at the ruffian wickedly.') - 3 : demo.indexOf('> narrate ruffian down at the ford');
  const arrive: Step = { out: Buffer.concat([lineBytes(''), lineBytes('\x1b[31mA half-orc ruffian arrives from the north.\x1b[0m'), lineBytes(''), lineBytes('*=>')]) };
  return [arrive, ...toSteps(demo.slice(from, to), { gmcp: (pkg) => !pkg.startsWith('Group.') })];
}

/**
 * The gameplay feed: Rasta logs in on the Old East Road in Bree (map-demo),
 * casts his spells (timers-demo, without its login and GMCP), walks Bree
 * with room descriptions while friends talk on the channels, and ends up
 * on Hill Road, where `fight` may add a fight. All names are the fixtures'
 * invented ones.
 */
export function gameFeed(fight: Fight = 'none'): Step[] {
  const map = fixture('map-demo.log');
  const firstMove = map.indexOf('> n');
  const timers = fixture('timers-demo.log');
  const spellsFrom = timers.indexOf('> arm');
  const spellsTo = timers.indexOf('> store fireb');
  const walk = toSteps(map.slice(firstMove), { descs: true });
  const talk: Step[] = [
    comm('tales', 'Gibur', "Gibur narrates 'orcs gathering at the ford'", '33'),
    comm('tells', 'Gibur', "Gibur tells you 'meet me at the Pony, bring the merc'", '32'),
    comm('says', 'Dori', "Dori says 'I can smell them' in Khuzdul.", '36'),
    comm('questions', 'Ecthel', "Ecthel asks 'anyone near Rivendell?'", '33'),
    comm('songs', 'Lindir', "Lindir sings 'A Elbereth Gilthoniel'", '33'),
    comm('tells', 'Gibur', "Gibur tells you 'more coming, 2 trolls'", '32'),
  ];
  // A channel message after every few moves.
  const mixed: Step[] = [];
  let moves = 0;
  for (const s of walk) {
    mixed.push(s);
    if ('cmd' in s && ++moves % 5 === 0 && talk.length) mixed.push(talk.shift()!);
  }
  const friends: Step = {
    out: Buffer.concat([
      gmcpBytes(`Group.Add ${JSON.stringify({ id: 4, type: 'ally', name: 'Dori', label: 0, hp: 118, 'hp-string': 'Fine', maxhp: 150, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 96, 'mp-string': 'Rested', maxmp: 120 })}`),
      gmcpBytes(`Group.Add ${JSON.stringify({ id: 5, type: 'npc', name: 'a sturdy pony', label: 'PONY', hp: 90, 'hp-string': 'Healthy', maxhp: 90, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 40, 'mp-string': 'Tired', maxmp: 120 })}`),
    ]),
  };
  return [
    ...toSteps(map.slice(0, firstMove), { descs: true }),
    friends,
    ...toSteps(timers.slice(spellsFrom, spellsTo), { gmcp: () => false }),
    ...mixed,
    ...talk,
    ...fightSteps(fight),
  ];
}

