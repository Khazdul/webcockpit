import { describe, expect, it } from 'vitest';
import {
  type CommText,
  channelEnabled,
  channelLabel,
  cleanName,
  commPlain,
  commTime,
  formatComm,
  headerCellText,
  headerChannels,
  headerLayout,
  matchVisiblePrefix,
  parseAnsi,
  parseChannelList,
  parseChannelText,
  sameFilters,
  saysToYou,
  soloChannel,
  stripAnsi,
  toggleChannel,
} from '../../src/gmcp/comm';
import { rgb } from '../../src/core/types';

const E = '\x1b';

const LIST = [
  { name: 'tales', caption: 'Narrates', command: 'narrate' },
  { name: 'tells', caption: 'Tells', command: 'tell' },
  { name: 'says', caption: 'Says', command: 'say' },
  { name: 'yells', caption: 'Yells', command: 'yell' },
  { name: 'prayers', caption: 'Prayers', command: 'pray' },
  { name: 'emotes', caption: 'Emotes', command: 'emote' },
  { name: 'whispers', caption: 'Whispers', command: 'whisper' },
  { name: 'questions', caption: 'Questions', command: 'question' },
  { name: 'songs', caption: 'Songs', command: 'sing' },
  { name: 'socials', caption: 'Socials', command: 'social' },
];

/** A message as `parseChannelText` returns it. */
const m = (o: Record<string, unknown>): CommText => parseChannelText(o)!;

describe('channel list and header channels', () => {
  it('parses Comm.Channel.List and ignores junk', () => {
    expect(parseChannelList({})).toBeNull();
    expect(parseChannelList([{ name: 'tells', caption: 'Tells', command: 'tell' }, 3, { caption: 'x' }, { name: 'tells' }])).toEqual([
      { name: 'tells', caption: 'Tells', command: 'tell' },
    ]);
  });

  it('labels: override, caption, title case', () => {
    expect(channelLabel({ name: 'tales', caption: 'Tales' })).toBe('Narrates');
    expect(channelLabel({ name: 'tells', caption: 'Tells' })).toBe('Tells');
    expect(channelLabel({ name: 'auction', caption: '' })).toBe('Auction');
  });

  it('orders the fixed channels first, then unknown ones in server order', () => {
    const adv = [{ name: 'auction', caption: '', command: '' }, ...LIST.slice().reverse(), { name: 'clan', caption: 'Clan', command: '' }];
    expect(headerChannels(adv).map((c) => c.name)).toEqual([
      'tales', 'tells', 'says', 'yells', 'prayers', 'emotes', 'whispers', 'questions', 'songs', 'socials', 'auction', 'clan',
    ]);
    // Filtered to what is advertised.
    expect(headerChannels([LIST[5]!, LIST[1]!]).map((c) => c.label)).toEqual(['Tells', 'Emotes']);
    // No list yet: the ten fixed channels.
    expect(headerChannels(null).map((c) => c.label)).toEqual(
      ['Narrates', 'Tells', 'Says', 'Yells', 'Prayers', 'Emotes', 'Whispers', 'Questions', 'Songs', 'Socials'],
    );
  });
});

describe('headerLayout (ADR 0098 width regimes)', () => {
  const labels = headerChannels(LIST).map((c) => c.label);
  const render = (w: number): string => {
    const l = headerLayout(labels, w);
    return l.widths.map((cw, i) => headerCellText(labels[i]!, cw)).join(l.sep ? ' ' : '');
  };

  it('full names with one space when they fit', () => {
    const natural = labels.join(' ');
    expect(natural.length).toBe(73);
    expect(render(80)).toBe(natural);
    expect(render(73)).toBe(natural);
    expect(render(72)).not.toBe(natural);
  });

  it('uniform truncation when tighter', () => {
    // budget 60 − 9 = 51 → 5 each, first cell 6.
    const l = headerLayout(labels, 60);
    expect(l.sep).toBe(1);
    expect(l.widths).toEqual([6, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(render(60)).toBe('Narrat Tells Says  Yells Praye Emote Whisp Quest Songs Socia');
    expect(render(60)).toHaveLength(60);
  });

  it('single char plus space, then single char, then dropped channels', () => {
    expect(render(19)).toBe('N T S Y P E W Q S S');
    expect(headerLayout(labels, 19).sep).toBe(1);
    expect(render(18)).toBe('NaTeSaYePrEmWhQuSS');
    expect(render(10)).toBe('NTSYPEWQSS');
    expect(render(4)).toBe('NTSY');
    expect(headerLayout(labels, 4).widths).toHaveLength(4);
    expect(render(0)).toBe('');
  });

  it('never exceeds the width', () => {
    for (let w = 0; w < 100; w++) expect(render(w).length).toBeLessThanOrEqual(w);
  });

  it('natural widths when the share fits the longest', () => {
    expect(headerLayout(['Tells', 'Says'], 30)).toEqual({ widths: [5, 4], sep: 1 });
  });
});

describe('cleanName', () => {
  it('strips a descriptor after a one-word name and capitalises', () => {
    expect(cleanName('Vit the innkeeper')).toBe('Vit');
    expect(cleanName('kormock the orkish armourer')).toBe('Kormock');
    expect(cleanName('a dwarven sergeant')).toBe('A dwarven sergeant');
    expect(cleanName('the gate guard')).toBe('The gate guard');
    expect(cleanName('Grumsh of the Burning Eye')).toBe('Grumsh');
    expect(cleanName('Thrakghash of the Mordor Flame')).toBe('Thrakghash');
    expect(cleanName('Gorbag Snaga the Orc')).toBe('Gorbag Snaga');
    expect(cleanName('you')).toBe('You');
    expect(cleanName('*Orcbane the Zaugurz Orc*')).toBe('*Orcbane*');
    expect(cleanName('*an Elf*')).toBe('*An Elf*');
  });
});

describe('formatComm: quoted channels', () => {
  it('incoming tell: destination filled with you, body between quotes', () => {
    const msg = m({ channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'np :)'" });
    expect(formatComm(msg)).toEqual([
      { role: 'talkerOther', text: 'Gibur' },
      { role: 'verb', text: ' tells' },
      { role: 'talkerYou', text: ' you' },
      { role: 'messageOther', text: " 'np :)'" },
    ]);
  });

  it('own messages: bare text, self verb, destination as sent', () => {
    expect(commPlain(m({ channel: 'tells', talker: 'you', destination: 'Norsa', text: 'dales 3t!' }))).toBe("You tell Norsa 'dales 3t!'");
    expect(commPlain(m({ channel: 'tales', talker: 'you', text: "they're hunting me  east now :)" }))).toBe(
      "You narrate 'they're hunting me  east now :)'",
    );
    expect(commPlain(m({ channel: 'says', talker: 'you', text: 'open' }))).toBe("You say 'open'");
  });

  it('whisper takes the preposition and a cleaned destination', () => {
    const msg = m({ channel: 'whispers', talker: 'you', destination: 'Gwaihir the Windlord', text: 'blue mountains' });
    expect(formatComm(msg)).toEqual([
      { role: 'talkerYou', text: 'You' },
      { role: 'verb', text: ' whisper to' },
      { role: 'talkerOther', text: ' Gwaihir' },
      { role: 'messageSelf', text: " 'blue mountains'" },
    ]);
    expect(commPlain(m({ channel: 'whispers', talker: 'Dori', text: "Dori whispers to you 'hej'" }))).toBe("Dori whispers to you 'hej'");
  });

  it('an incoming whisper or question is to you only when its text says so; a tell always', () => {
    // An undirected whisper is no longer shown as `whispers to you`.
    expect(formatComm(m({ channel: 'whispers', talker: 'A shadow', text: "A shadow whispers 'I won't allow you'" }))).toEqual([
      { role: 'talkerOther', text: 'A shadow' },
      { role: 'verb', text: ' whispers' },
      { role: 'messageOther', text: " 'I won't allow you'" },
    ]);
    expect(formatComm(m({ channel: 'questions', talker: 'Ecthel', text: "Ecthel asks you 'where?'" }))).toEqual([
      { role: 'talkerOther', text: 'Ecthel' },
      { role: 'verb', text: ' asks' },
      { role: 'talkerYou', text: ' you' },
      { role: 'messageOther', text: " 'where?'" },
    ]);
    expect(commPlain(m({ channel: 'questions', talker: 'Ecthel', text: "Ecthel asks 'anyone near Rivendell?'" }))).toBe(
      "Ecthel asks 'anyone near Rivendell?'",
    );
    expect(commPlain(m({ channel: 'whispers', talker: 'Dori', text: `${E}[33mDori whispers to you 'psst'${E}[0m` }))).toBe(
      "Dori whispers to you 'psst'",
    );
    // A tell needs no `you` in its text; other channels never get one.
    expect(commPlain(m({ channel: 'tells', talker: 'Gibur', text: "'np'" }))).toBe("Gibur tells you 'np'");
    expect(commPlain(m({ channel: 'says', talker: 'Gibur', text: "Gibur says to you 'np'" }))).toBe("Gibur says 'np'");
    // Own messages are unchanged.
    expect(commPlain(m({ channel: 'questions', talker: 'you', text: 'where are you?' }))).toBe("You ask 'where are you?'");
    expect(commPlain(m({ channel: 'whispers', talker: 'you', text: 'you there?' }))).toBe("You whisper 'you there?'");
  });
});

describe('saysToYou', () => {
  it('finds the whole word you before the first quote, ANSI stripped, any case', () => {
    expect(saysToYou("Dori whispers to you 'hi'")).toBe(true);
    expect(saysToYou("Ecthel asks you 'where?'")).toBe(true);
    expect(saysToYou("Ecthel asks YOU 'where?'")).toBe(true);
    expect(saysToYou(`${E}[33mDori whispers to ${E}[1myou${E}[0m 'hi'`)).toBe(true);
    expect(saysToYou('Dori whispers something to you.')).toBe(true);
  });

  it('not for undirected talk, a you inside the quote or inside a word', () => {
    expect(saysToYou("Ecthel asks 'anyone near Rivendell?'")).toBe(false);
    expect(saysToYou("A shadow whispers 'I won't allow you'")).toBe(false);
    expect(saysToYou("Ecthel asks 'are you there?'")).toBe(false);
    expect(saysToYou("Young whispers 'hi'")).toBe(false);
    expect(saysToYou("Dori whispers to Youngblood 'hi'")).toBe(false);
    expect(saysToYou('')).toBe(false);
  });

  it('drops server suffixes and the direction of a yell', () => {
    expect(commPlain(m({ channel: 'says', talker: 'Norsa', 'talker-type': 'player', text: "Norsa says 'blockat' in Westron." }))).toBe(
      "Norsa says 'blockat'",
    );
    expect(commPlain(m({ channel: 'yells', talker: 'Kaka', text: "Kaka yells faintly from above 'cmon just drop smth'" }))).toBe(
      "Kaka yells 'cmon just drop smth'",
    );
    expect(
      commPlain(m({ channel: 'yells', talker: 'a Zaugurz orc scout', 'talker-type': 'npc', text: "A Zaugurz orc scout yells 'A Goblin-town Orc is here on the Trail!' in Orkish." })),
    ).toBe("A Zaugurz orc scout yells 'A Goblin-town Orc is here on the Trail!'");
  });

  it('npc tell: descriptor stripped, ANSI kept in the body', () => {
    const msg = m({
      channel: 'tells',
      talker: 'Takhr the orkish warden',
      'talker-type': 'npc',
      text: `Takhr the orkish warden tells you 'It will cost you ${E}[32m21${E}[0m gold coins.'`,
    });
    const segs = formatComm(msg);
    expect(segs[0]).toEqual({ role: 'talkerOther', text: 'Takhr' });
    expect(segs[3]!.text).toBe(` 'It will cost you ${E}[32m21${E}[0m gold coins.'`);
    expect(commPlain(msg)).toBe("Takhr tells you 'It will cost you 21 gold coins.'");
  });

  it('an enemy yell keeps its stars short and its ANSI message', () => {
    const msg = m({
      channel: 'yells',
      talker: '*Indo the Half-Elf*',
      'talker-type': 'enemy',
      text: `${E}[31m*Indo the Half-Elf*${E}[0m yells faintly from the north 'sorting' in Westron.`,
    });
    expect(commPlain(msg)).toBe("*Indo* yells 'sorting'");
  });

  it('keeps apostrophes inside the body and falls back to the whole text', () => {
    expect(commPlain(m({ channel: 'says', talker: 'Dori', text: "Dori says 'it's ok, isn't it'" }))).toBe("Dori says 'it's ok, isn't it'");
    expect(commPlain(m({ channel: 'says', talker: 'Dori', text: 'Dori mumbles' }))).toBe("Dori says 'Dori mumbles'");
  });

  it('an unknown channel uses its name as the verb', () => {
    expect(commPlain(m({ channel: 'auction', talker: 'Bob', text: "Bob auctions 'a sword'" }))).toBe("Bob auction 'a sword'");
  });

  it('every channel verb, self and other', () => {
    const cases: [string, string, string][] = [
      ['tales', 'narrate', 'narrates'],
      ['says', 'say', 'says'],
      ['yells', 'yell', 'yells'],
      ['prayers', 'pray', 'prays'],
      ['songs', 'sing', 'sings'],
      ['questions', 'ask', 'asks'],
    ];
    for (const [ch, self, other] of cases) {
      expect(commPlain(m({ channel: ch, talker: 'you', text: 'x' }))).toBe(`You ${self} 'x'`);
      expect(commPlain(m({ channel: ch, talker: 'Bo', text: "Bo foo 'x'" }))).toBe(`Bo ${other} 'x'`);
    }
  });
});

describe('formatComm: action channels', () => {
  it('own social: You in self colours, the talker field ignored', () => {
    expect(formatComm(m({ channel: 'socials', talker: 'Rasta', 'talker-type': 'player', text: 'You tip your head.' }))).toEqual([
      { role: 'talkerYou', text: 'You ' },
      { role: 'messageSelf', text: 'tip your head.' },
    ]);
  });

  it('talker at the start, any case, descriptor stripped', () => {
    expect(formatComm(m({ channel: 'emotes', talker: 'a hungry warg', text: 'A hungry warg (MIN) licks his chops.' }))).toEqual([
      { role: 'talkerOther', text: 'A hungry warg ' },
      { role: 'messageOther', text: '(MIN) licks his chops.' },
    ]);
    expect(formatComm(m({ channel: 'socials', talker: 'Vit the innkeeper', text: `${E}[1mVit the innkeeper${E}[0m bows before you.` }))).toEqual([
      { role: 'talkerOther', text: 'Vit ' },
      { role: 'messageOther', text: 'bows before you.' },
    ]);
    expect(commPlain(m({ channel: 'emotes', talker: 'Bot', text: 'Bot says:  always is' }))).toBe('Bot says:  always is');
    expect(commPlain(m({ channel: 'socials', talker: 'Someone', 'talker-type': 'enemy', text: 'Someone sighs loudly.' }))).toBe(
      'Someone sighs loudly.',
    );
  });

  it('an enemy whose talker field differs from the text keeps one name', () => {
    const msg = m({
      channel: 'emotes',
      talker: '*Orcbane the Zaugurz Orc*',
      'talker-type': 'enemy',
      text: `${E}[31m*Orcbane the Orc*${E}[0m says:  yoyo`,
    });
    expect(formatComm(msg)).toEqual([
      { role: 'talkerOther', text: '*Orcbane* ' },
      { role: 'messageOther', text: 'says:  yoyo' },
    ]);
    expect(commPlain(m({ channel: 'socials', talker: '*an Elf*', text: `${E}[31m*an Elf*${E}[0m looks around slowly.` }))).toBe(
      '*An Elf* looks around slowly.',
    );
  });

  it('prepends the talker when the text does not start with it', () => {
    expect(formatComm(m({ channel: 'emotes', talker: 'Gibur', text: 'grins.' }))).toEqual([
      { role: 'talkerOther', text: 'Gibur ' },
      { role: 'messageOther', text: 'grins.' },
    ]);
  });
});

describe('ANSI helpers', () => {
  it('strips and matches visible prefixes', () => {
    expect(stripAnsi(`${E}[31mred${E}[0m x`)).toBe('red x');
    expect(matchVisiblePrefix(`${E}[31m*an Elf*${E}[0m looks`, '*AN ELF* ')).toBe(`${E}[31m*an Elf*${E}[0m `.length);
    expect(matchVisiblePrefix('Gibur grins', 'Dori ')).toBe(-1);
    expect(matchVisiblePrefix('Gi', 'Gibur')).toBe(-1);
  });

  it('parses SGR into runs', () => {
    expect(parseAnsi('plain')).toEqual({ text: 'plain', runs: [] });
    expect(parseAnsi(`a ${E}[1;31mred${E}[0m b`)).toEqual({ text: 'a red b', runs: [{ start: 2, end: 5, bold: true, fg: 1 }] });
    expect(parseAnsi(`${E}[92mhi${E}[39m${E}[44mx${E}[m`).runs).toEqual([
      { start: 0, end: 2, fg: 10 },
      { start: 2, end: 3, bg: 4 },
    ]);
    expect(parseAnsi(`${E}[38;5;208mo${E}[38;2;1;2;3mt`).runs).toEqual([
      { start: 0, end: 1, fg: 208 },
      { start: 1, end: 2, fg: rgb(1, 2, 3) },
    ]);
    // Adjacent identical styles merge; other CSI sequences vanish.
    expect(parseAnsi(`${E}[33mab${E}[33mcd${E}[2K`)).toEqual({ text: 'abcd', runs: [{ start: 0, end: 4, fg: 3 }] });
  });
});

describe('filters and solo', () => {
  const chans = ['tales', 'tells', 'says'];

  it('toggles sparsely', () => {
    let s = toggleChannel({ filters: {}, solo: null }, 'tells');
    expect(s.filters).toEqual({ tells: false });
    expect(channelEnabled(s.filters, 'tells')).toBe(false);
    expect(channelEnabled(s.filters, 'says')).toBe(true);
    s = toggleChannel(s, 'tells');
    expect(s.filters).toEqual({});
  });

  it('solo, switch solo, restore the original snapshot', () => {
    const start = { filters: { says: false }, solo: null };
    let s = soloChannel(start, 'tells', chans);
    expect(s.filters).toEqual({ tales: false, says: false });
    expect(s.solo).toEqual({ channel: 'tells', snapshot: { says: false } });
    s = soloChannel(s, 'tales', chans);
    expect(s.filters).toEqual({ tells: false, says: false });
    expect(s.solo!.snapshot).toEqual({ says: false });
    s = soloChannel(s, 'tales', chans);
    expect(s).toEqual({ filters: { says: false }, solo: null });
  });

  it('solo keeps filters of channels outside the list; a left click drops the snapshot', () => {
    let s = soloChannel({ filters: { auction: false }, solo: null }, 'says', chans);
    expect(s.filters).toEqual({ auction: false, tales: false, tells: false });
    s = toggleChannel(s, 'tales');
    expect(s).toEqual({ filters: { auction: false, tells: false }, solo: null });
  });

  it('compares sparse maps', () => {
    expect(sameFilters({ a: false, b: true }, { a: false })).toBe(true);
    expect(sameFilters({ a: false }, { b: false })).toBe(false);
  });
});

describe('commTime', () => {
  it('HH:MM within 24 h, DD/MM when older', () => {
    const now = new Date(2026, 8, 27, 15, 30).getTime();
    expect(commTime(new Date(2026, 8, 27, 9, 5).getTime(), now)).toBe('09:05');
    expect(commTime(new Date(2026, 8, 26, 16, 0).getTime(), now)).toBe('16:00');
    expect(commTime(new Date(2026, 8, 25, 16, 0).getTime(), now)).toBe('25/09');
  });
});
