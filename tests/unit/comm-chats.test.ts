import { describe, expect, it } from 'vitest';
import type { CommMessage } from '../../src/gmcp/comm';
import { CommChats, PERSON_COLORS } from '../../src/gmcp/comm-chats';

let t = 1_000_000;
const msg = (channel: string, talker: string, text: string, extra: Partial<CommMessage> = {}): CommMessage => ({
  channel,
  talker,
  talkerType: 'player',
  destination: null,
  text,
  ts: (t += 1000),
  ...extra,
});
const tell = (who: string, text = 'hi') => msg('tells', who, `${who} tells you '${text}'`);
const keys = (c: CommChats, w: number | 'all' = 'all') => c.chats(w, t).map((x) => x.key);

describe('CommChats (ADR 0134)', () => {
  it('near channels open chats, newest last; others are overheard', () => {
    const c = new CommChats();
    c.add(tell('Lindir'));
    c.add(msg('says', 'Haldis', "Haldis says 'hello'"));
    c.add(msg('tales', 'Morwen', "Morwen narrates 'orcs at the ford'"));
    expect(keys(c)).toEqual(['lindir', 'haldis']);
    const r = c.add(msg('emotes', 'Lindir the Elf', 'Lindir grins.'));
    expect(r).toMatchObject({ raised: true, created: false });
    expect(keys(c)).toEqual(['haldis', 'lindir']);
    // Morwen narrated only: a record, no chat; her later tell opens it with the narrate in it.
    c.add(tell('Morwen'));
    const m = c.chat('morwen')!;
    expect(m.entries.map((e) => [e.msg.channel, e.near])).toEqual([
      ['tales', false],
      ['tells', true],
    ]);
    for (const ch of ['whispers', 'socials', 'questions']) {
      const k = new CommChats();
      k.add(msg(ch, 'Ruel', 'Ruel whispers to you something'));
      expect(keys(k)).toEqual(['ruel']);
    }
    const p = new CommChats();
    p.add(msg('prayers', 'Ruel', "Ruel prays 'Elbereth'"));
    p.add(msg('yells', 'Ruel', "Ruel yells 'help'"));
    expect(keys(p)).toEqual([]);
  });

  it('counts unread for near talk to a chat that is not open; your messages and quiet loads do not', () => {
    const c = new CommChats();
    c.add(tell('Lindir'));
    c.add(msg('tales', 'Lindir', "Lindir narrates 'x'"));
    expect(c.chat('lindir')!.unread).toBe(1);
    c.add(msg('tells', 'you', 'back at you', { destination: 'Lindir' }));
    expect(c.chat('lindir')!.unread).toBe(1);
    c.setOpen('lindir');
    expect(c.chat('lindir')!.unread).toBe(0);
    c.add(tell('Lindir'));
    expect(c.chat('lindir')!.unread).toBe(0);
    const q = new CommChats();
    q.add(tell('Haldis'), true);
    expect(q.chat('haldis')!.unread).toBe(0);
    expect(q.publicUnread).toBe(0);
  });

  it('your tells and whispers go to the destination; your emotes to a named chat; your says to Public only', () => {
    const c = new CommChats();
    c.setSelf('Gibur');
    c.add(msg('tells', 'you', 'on my way', { destination: 'Tarnil the Ranger' }));
    expect(keys(c)).toEqual(['tarnil']);
    expect(c.chat('tarnil')!.name).toBe('Tarnil');
    expect(c.chat('tarnil')!.entries[0]!.mine).toBe(true);
    c.add(msg('emotes', 'Gibur', 'You hug Tarnil.'));
    expect(c.chat('tarnil')!.entries).toHaveLength(2);
    const say = c.add(msg('says', 'you', 'hello all'));
    expect(say.entry.person).toBeNull();
    expect(c.publicEntries).toHaveLength(3);
  });

  it('NPC talk stays in Public', () => {
    const c = new CommChats();
    c.add(msg('says', 'Gwaihir the Windlord', "Gwaihir says 'ride me'", { talkerType: 'npc' }));
    expect(keys(c)).toEqual([]);
    expect(c.publicEntries).toHaveLength(1);
  });

  it('group tells go to Group, not to a private chat; your tell group too', () => {
    const c = new CommChats();
    c.setSelf('Gibur');
    c.setRoster(['Gibur', 'Norsy', 'Lindir'], t);
    const g = c.add(msg('tells', 'Norsy', "\x1b[32mNorsy tells the group 'trans'\x1b[0m"));
    expect(g.entry).toMatchObject({ groupTell: true, near: false, group: true, person: 'norsy' });
    expect(keys(c)).toEqual([]);
    expect(c.chat('norsy')!.unread).toBe(0);
    expect(c.groupUnread).toBe(1);
    const mine = c.add(msg('tells', 'you', 'coming', { destination: 'group' }));
    expect(mine.entry).toMatchObject({ groupTell: true, group: true, person: null });
    const mine2 = c.add(msg('tells', 'you', "You tell the group 'ok'"));
    expect(mine2.entry.groupTell).toBe(true);
    expect(keys(c)).toEqual([]);
  });

  it('Group: the roster players and your public lines, joined/left notes, NPCs never', () => {
    const c = new CommChats();
    c.add(msg('says', 'Lindir', "Lindir says 'before'"));
    expect(c.groupView).toHaveLength(0);
    expect(c.setRoster(['Lindir', 'Haldis'], t)).toEqual({ joined: [], left: [] });
    expect(c.hasGroup).toBe(true);
    c.add(msg('says', 'Lindir', "Lindir says 'in'"));
    c.add(msg('says', 'Morwen', "Morwen says 'out'"));
    c.add(msg('says', 'you', 'mine'));
    c.add(msg('tells', 'you', 'private', { destination: 'Morwen' }));
    c.add(msg('tells', 'you', 'to a member', { destination: 'Haldis' }));
    expect(c.setRoster(['Lindir', 'Tarnil'], t)).toEqual({ joined: ['Tarnil'], left: ['Haldis'] });
    const view = c.groupView.map((i) => (i.kind === 'msg' ? i.entry.msg.text : `${i.note.kind}:${i.note.name}`));
    expect(view).toEqual(["Lindir says 'in'", 'mine', 'to a member', 'joined:Tarnil', 'left:Haldis']);
    c.setRoster([], t);
    expect(c.hasGroup).toBe(false);
  });

  it('the window hides old chats but keeps the open one and unread ones', () => {
    const c = new CommChats();
    c.add(tell('Old'), true);
    c.add(tell('Unread'));
    t += 40 * 60_000;
    c.add(tell('New'));
    c.setOpen('new');
    expect(keys(c, 30)).toEqual(['unread', 'new']);
    expect(keys(c, 60)).toEqual(['old', 'unread', 'new']);
    c.setOpen('old');
    expect(keys(c, 30)).toEqual(['old', 'unread', 'new']);
  });

  it('caps the history and drops the oldest from every list', () => {
    const c = new CommChats({ max: 5 });
    c.setRoster(['Lindir'], t);
    for (let i = 0; i < 8; i++) c.add(tell('Lindir', `m${i}`));
    expect(c.publicEntries.map((e) => e.msg.text)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7'].map((x) => `Lindir tells you '${x}'`));
    expect(c.chat('lindir')!.entries).toHaveLength(5);
    expect(c.groupView).toHaveLength(5);
  });

  it('search: people with chats and messages on every channel, case-insensitive', () => {
    const c = new CommChats();
    c.add(tell('Lindir', 'the Ford'));
    c.add(msg('tales', 'Morwen', "Morwen narrates 'ford is clear'"));
    c.add(msg('says', 'Haldis', "Haldis says 'hello'"));
    const r = c.search('FORD');
    expect(r.people).toEqual([]);
    expect(r.messages.map((e) => e.msg.talker)).toEqual(['Lindir', 'Morwen']);
    expect(c.search('lin').people.map((p) => p.key)).toEqual(['lindir']);
    expect(c.search('  ')).toEqual({ people: [], messages: [] });
  });

  it('public unread follows the filter', () => {
    const c = new CommChats();
    c.setOpen('lindir');
    c.setPublicFilter((ch) => ch !== 'tells');
    c.add(tell('Lindir'));
    c.add(msg('says', 'Haldis', "Haldis says 'x'"));
    expect(c.publicUnread).toBe(1);
  });

  it('colours: slots in order, no repeats until used up; you and enemies fixed', () => {
    const c = new CommChats();
    c.setSelf('Gibur');
    const names = Array.from({ length: PERSON_COLORS + 2 }, (_, i) => `P${String.fromCharCode(97 + i)}`);
    for (const n of names) c.add(tell(n));
    const slots = names.slice(0, PERSON_COLORS).map((n) => c.colorOf(n));
    expect(new Set(slots).size).toBe(PERSON_COLORS);
    expect(c.colorOf(names[0]!)).toBe(0);
    expect(c.colorOf('you')).toBe('you');
    expect(c.colorOf('Gibur')).toBe('you');
    expect(c.colorOf('*Ugluk the Orc*')).toBe('enemy');
    expect(typeof c.colorOf('a stranger')).toBe('number');
  });

  it('an empty known roster is no group: none of your lines go to Group', () => {
    const c = new CommChats();
    c.setRoster([], t);
    c.add(msg('says', 'you', 'alone'));
    expect(c.groupView).toHaveLength(0);
  });

  it('a re-added history (noGroup) stays out of Group; group tells too', () => {
    const c = new CommChats();
    c.setRoster(['Lindir'], t);
    c.add(msg('says', 'Lindir', "Lindir says 'old'"), true, true);
    c.add(msg('tells', 'Lindir', "Lindir tells the group 'old'"), true, true);
    expect(c.groupView).toHaveLength(0);
    c.add(msg('says', 'Lindir', "Lindir says 'new'"));
    expect(c.groupView).toHaveLength(1);
  });

  it('colours: dealt when a chat opens (not to a voice only overheard) and kept over reset', () => {
    const c = new CommChats();
    c.add(msg('tales', 'Morwen', "Morwen narrates 'x'"));
    c.add(tell('Lindir'));
    expect(c.colorOf('Lindir')).toBe(0);
    c.reset();
    c.add(tell('Haldis'));
    expect(c.colorOf('Haldis')).toBe(1);
    c.add(tell('Lindir'));
    expect(c.colorOf('Lindir')).toBe(0);
    expect(c.chat('lindir')!.color).toBe(0);
    c.add(tell('Morwen'));
    expect(c.colorOf('Morwen')).toBe(2);
  });

  it('unread carries over a rebuild by snapshot and restore', () => {
    const c = new CommChats();
    c.setOpen('group');
    c.add(tell('Lindir'));
    c.add(msg('says', 'Haldis', "Haldis says 'x'"));
    const snap = c.unreadSnapshot();
    c.reset();
    c.add(tell('Lindir'), true);
    c.add(msg('says', 'Haldis', "Haldis says 'x'"), true);
    c.restoreUnread(snap);
    expect(c.chat('lindir')!.unread).toBe(1);
    expect(c.publicUnread).toBe(2);
  });

  it('a chat whose messages were all trimmed goes, unless it has unread or is open', () => {
    const c = new CommChats({ max: 3 });
    c.add(tell('Read'));
    c.setOpen('read');
    c.add(tell('Unread'));
    c.setOpen('public');
    for (let i = 0; i < 3; i++) c.add(msg('tales', 'Morwen', `Morwen narrates '${i}'`));
    expect(c.chat('read')).toBeUndefined();
    expect(c.chat('unread')).toBeDefined();
    expect(keys(c)).toEqual(['unread']);
  });
});
