import { describe, expect, it } from 'vitest';
import { MAX_OPEN_TAGS } from '../../src/text/assembler';
import { ESC, GA, feed, harness, lines, one } from './text-helpers';

const X = '<xml>';

describe('LineAssembler: XML tags', () => {
  it('removes tags from text and raw and records spans', () => {
    const l = one(`${X}<tell>Gibur tells you 'np'</tell>\r\n`);
    expect(l.text).toBe("Gibur tells you 'np'");
    expect(l.raw).toBe("Gibur tells you 'np'");
    expect(l.tags).toEqual([{ tag: 'tell', start: 0, end: 20 }]);
  });

  it('keeps ANSI in raw while dropping tags', () => {
    const l = one(`${X}<narrate>${ESC}[33mX narrates 'yes'${ESC}[0m</narrate>\n`);
    expect(l.raw).toBe(`${ESC}[33mX narrates 'yes'${ESC}[0m`);
    expect(l.text).toBe("X narrates 'yes'");
    expect(l.runs).toEqual([{ start: 0, end: 16, fg: 3 }]);
    expect(l.tags).toEqual([{ tag: 'narrate', start: 0, end: 16 }]);
  });

  it('decodes entities in text and raw', () => {
    const l = one(`${X}a &lt;b&gt; &amp; &quot;c&quot; &#39;d&apos; &#x41;&nbsp;\n`);
    expect(l.text).toBe('a <b> & "c" \'d\' A ');
    expect(l.raw).toBe(l.text);
  });

  it('leaves unknown or malformed entities literal', () => {
    expect(one(`${X}a &foo; b & c &#xZZ; &constructor;\n`).text).toBe(
      'a &foo; b & c &#xZZ; &constructor;',
    );
  });

  it('does not decode entities before XML mode', () => {
    expect(one('a &lt; b\n').text).toBe('a &lt; b');
  });

  it('nests spans and lists them in start-tag order', () => {
    const l = one(`${X}<room><name>Bree</name> x</room>\n`);
    expect(l.text).toBe('Bree x');
    expect(l.tags).toEqual([
      { tag: 'room', start: 0, end: 6 },
      { tag: 'name', start: 0, end: 4 },
    ]);
  });

  it('splits multi-line elements into one span per line', () => {
    const ls = lines(
      `${X}<room><name>The Road</name>\r\n<description>Line one\r\nline two\r\n</description><exits>Exits: north.</exits>\r\n</room>`,
    );
    expect(ls.map((l) => l.text)).toEqual(['The Road', 'Line one', 'line two', 'Exits: north.']);
    expect(ls.map((l) => l.tags)).toEqual([
      [
        { tag: 'room', start: 0, end: 8 },
        { tag: 'name', start: 0, end: 8 },
      ],
      [
        { tag: 'room', start: 0, end: 8 },
        { tag: 'description', start: 0, end: 8 },
      ],
      [
        { tag: 'room', start: 0, end: 8 },
        { tag: 'description', start: 0, end: 8 },
      ],
      [
        { tag: 'room', start: 0, end: 13 },
        { tag: 'exits', start: 0, end: 13 },
      ],
    ]);
  });

  it('gives no span to an element closed at the very start of a line', () => {
    const ls = lines(`${X}<room>a\r\n</room>b\r\n`);
    expect(ls[1]!.tags).toEqual([]);
    expect(ls[1]!.text).toBe('b');
  });

  it('parses attributes: unquoted, quoted, self-closing, entities', () => {
    const l = one(
      `${X}<movement dir=north/><room terrain="field" area='The Shire' id=123>Road</room>` +
        `<exit dir=east id=5/><highlight type=&quot;x&quot;>h</highlight>\n`,
    );
    expect(l.text).toBe('Roadh');
    expect(l.tags).toEqual([
      { tag: 'movement', start: 0, end: 0, attrs: { dir: 'north' } },
      { tag: 'room', start: 0, end: 4, attrs: { terrain: 'field', area: 'The Shire', id: '123' } },
      { tag: 'exit', start: 4, end: 4, attrs: { dir: 'east', id: '5' } },
      { tag: 'highlight', start: 4, end: 5, attrs: { type: '"x"' } },
    ]);
  });

  it('handles <movement/> without attributes', () => {
    expect(one(`${X}<movement/>You walk.\n`).tags).toEqual([
      { tag: 'movement', start: 0, end: 0 },
    ]);
  });

  it('lower-cases tag names', () => {
    expect(one(`${X}<Tell>x</TELL>\n`).tags).toEqual([{ tag: 'tell', start: 0, end: 1 }]);
  });

  it('closes unclosed children when the parent closes', () => {
    expect(one(`${X}<room><name>a</room>b\n`).tags).toEqual([
      { tag: 'room', start: 0, end: 1 },
      { tag: 'name', start: 0, end: 1 },
    ]);
  });

  it('ignores stray end tags', () => {
    expect(one(`${X}a</say>b\n`)).toMatchObject({ text: 'ab', tags: [] });
  });

  it('gives no span to the xml element', () => {
    expect(one('<xml>a\n').tags).toEqual([]);
  });

  it('emits xml.seen once, and again after reset', () => {
    const h = harness();
    feed(h, '<xml><prompt>a</prompt>' + GA + '<tell>b</tell>\n');
    expect(h.xmlSeen).toBe(1);
    h.asm.reset();
    feed(h, '<prompt>c</prompt>' + GA);
    expect(h.xmlSeen).toBe(2);
  });

  it('turns XML mode off at </xml>', () => {
    const h = harness();
    feed(h, '<xml><say>x &amp;</say>\n</xml><wielded> a &amp;\n');
    expect(h.lines.map((l) => l.text)).toEqual(['x &', '<wielded> a &amp;']);
    expect(h.asm.xmlOn).toBe(false);
  });

  it('handles tags split across chunks', () => {
    const src = `${X}<room terrain="city"><name>Bree</name></room>\n`;
    for (let cut = 1; cut < src.length; cut++) {
      const h = harness();
      h.asm.text(src.slice(0, cut), 1);
      h.asm.text(src.slice(cut), 1);
      expect(h.lines).toEqual(lines(src));
    }
  });
});

describe('LineAssembler: literal < heuristic', () => {
  it('keeps equipment slots and who flags as text before XML mode', () => {
    const ls = lines(
      '<wielded>            a broadsword\r\n<worn as shield>     a shield\r\n  <WE> Tindomiel\r\n',
    );
    expect(ls.map((l) => l.text)).toEqual([
      '<wielded>            a broadsword',
      '<worn as shield>     a shield',
      '  <WE> Tindomiel',
    ]);
    expect(ls.every((l) => l.tags.length === 0)).toBe(true);
  });

  it('keeps non-XML prompts with < as text', () => {
    const h = harness();
    feed(h, '*<* R Move:Tired>' + GA + '!<~ HP:Fine>' + GA);
    expect(h.lines.map((l) => l.text)).toEqual(['*<* R Move:Tired>', '!<~ HP:Fine>']);
    expect(h.xmlSeen).toBe(0);
  });

  it('treats non-structural tag names as text before XML mode', () => {
    expect(one('tell <name> <message>\n').text).toBe('tell <name> <message>');
  });

  it('switches to XML mode on a structural tag without <xml>', () => {
    const h = harness();
    feed(h, '<prompt>*&gt;</prompt>' + GA + '<tell>x</tell>\n');
    expect(h.lines.map((l) => [l.text, l.prompt])).toEqual([
      ['*>', true],
      ['x', false],
    ]);
    expect(h.xmlSeen).toBe(1);
  });

  it('treats < followed by a non-name char as text even in XML mode', () => {
    expect(one(`${X}a < b <3 <-\n`).text).toBe('a < b <3 <-');
  });

  it('treats an overlong or unclosed tag as text', () => {
    const long = '<a ' + 'x'.repeat(300) + '>';
    expect(one(`${X}${long}\n`).text).toBe(long);
    const h = harness();
    feed(h, `${X}<a b` + GA);
    expect(h.lines.map((l) => l.text)).toEqual(['<a b']);
  });
});

describe('LineAssembler: XML prompts', () => {
  it('marks a <prompt> line as a prompt and emits it once with GA', () => {
    const h = harness();
    feed(h, `${X}<prompt>${ESC}[32m*${ESC}[0m R Mana:Hot&gt;</prompt>` + GA);
    expect(h.lines.length).toBe(1);
    expect(h.lines[0]).toMatchObject({
      text: '* R Mana:Hot>',
      prompt: true,
      raw: `${ESC}[32m*${ESC}[0m R Mana:Hot>`,
      tags: [{ tag: 'prompt', start: 0, end: 13 }],
    });
  });

  it('shows the XML prompt as a partial before GA', () => {
    const h = harness();
    feed(h, `${X}<prompt>*&gt;</prompt>`);
    expect(h.lines).toEqual([]);
    expect(h.partials.at(-1)).toMatchObject({ text: '*>', prompt: true });
    feed(h, GA);
    expect(h.lines.map((l) => [l.text, l.prompt])).toEqual([['*>', true]]);
  });

  it('marks a <prompt> line as a prompt even without GA', () => {
    expect(lines(`${X}<prompt>*&gt;</prompt>\r\n`).map((l) => l.prompt)).toEqual([true]);
  });

  it('produces exactly one prompt line for a full room + prompt frame', () => {
    const h = harness();
    feed(
      h,
      `${X}<movement dir=north/><room><name>Road</name>\r\n<exits>Exits: south.</exits>\r\n</room>` +
        `<prompt>*&gt;</prompt>` +
        GA +
        '\r\nYou say hi\r\n<prompt>*&gt;</prompt>' +
        GA,
    );
    expect(h.lines.map((l) => [l.text, l.prompt])).toEqual([
      ['Road', false],
      ['Exits: south.', false],
      ['*>', true],
      ['', false],
      ['You say hi', false],
      ['*>', true],
    ]);
  });

  it('does not let an empty prompt element mark the next line', () => {
    const h = harness();
    feed(h, `${X}<prompt></prompt>` + GA + 'text\n');
    expect(h.lines).toEqual([
      { text: 'text', runs: [], tags: [], prompt: false, raw: 'text', ts: 1 },
    ]);
  });
});

describe('LineAssembler: open tag cap', () => {
  it('closes the oldest open element when one more opens, so lines carry at most MAX_OPEN_TAGS', () => {
    const h = harness();
    let src = X;
    for (let k = 0; k < MAX_OPEN_TAGS + 8; k++) src += `<t${k}>x${k}\r\n`;
    feed(h, src);
    const last = h.lines[h.lines.length - 1]!;
    expect(last.tags.length).toBe(MAX_OPEN_TAGS);
    expect(last.tags[0]!.tag).toBe('t8');
    expect(last.tags[MAX_OPEN_TAGS - 1]!.tag).toBe(`t${MAX_OPEN_TAGS + 7}`);
    expect(Math.max(...h.lines.map((l) => l.tags.length))).toBe(MAX_OPEN_TAGS);
  });

  it('closes the dropped element where the new one opens, mid-line', () => {
    let src = X;
    for (let k = 0; k < MAX_OPEN_TAGS; k++) src += `<a${k}>`;
    const l = one(src + 'ab<new>cd</new>\r\n');
    expect(l.tags[0]).toEqual({ tag: 'a0', start: 0, end: 2 });
    expect(l.tags.find((t) => t.tag === 'new')).toEqual({ tag: 'new', start: 2, end: 4 });
    expect(l.tags.find((t) => t.tag === 'a1')).toEqual({ tag: 'a1', start: 0, end: 4 });
  });

  it('a dropped element that only continued onto the line gets no span there', () => {
    let src = X + '<prompt>';
    for (let k = 1; k < MAX_OPEN_TAGS; k++) src += `<a${k}>`;
    const ls = lines(src + 'p\r\n<new>q\r\n');
    expect(ls[0]!.prompt).toBe(true);
    expect(ls[1]!.tags.some((t) => t.tag === 'prompt')).toBe(false);
    expect(ls[1]!.prompt).toBe(false);
    expect(ls[1]!.tags.length).toBe(MAX_OPEN_TAGS);
  });

  it('a well-formed stream is unaffected', () => {
    const l = one(`${X}<room><name>N</name><description>D</description></room>\r\n`);
    expect(l.tags.map((t) => t.tag)).toEqual(['room', 'name', 'description']);
  });
});
