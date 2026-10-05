import { describe, expect, it } from 'vitest';
import { XmlError, child, childText, decodeEntities, parseXml } from '../../../src/import/xml';

describe('parseXml', () => {
  it('reads elements, attributes, text and start lines', () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE MudletPackage>
<MudletPackage version="1.001">
\t<AliasPackage>
\t\t<Alias isActive="yes" isFolder='no'>
\t\t\t<name>k</name>
\t\t\t<regex>^k (.+)$</regex>
\t\t</Alias>
\t\t<Alias isActive="no" isFolder="no" />
\t</AliasPackage>
</MudletPackage>
`);
    expect(root.name).toBe('MudletPackage');
    expect(root.attrs['version']).toBe('1.001');
    expect(root.line).toBe(3);
    const pkg = child(root, 'AliasPackage')!;
    expect(pkg.line).toBe(4);
    const [a, b] = pkg.children;
    expect(a!.attrs).toEqual({ isActive: 'yes', isFolder: 'no' });
    expect(a!.line).toBe(5);
    expect(childText(a!, 'regex')).toBe('^k (.+)$');
    expect(child(a!, 'name')!.line).toBe(6);
    expect(b!.attrs['isActive']).toBe('no');
    expect(b!.children).toEqual([]);
    expect(b!.line).toBe(9);
    expect(childText(b!, 'missing')).toBe('');
  });

  it('decodes entities, character references and CDATA; skips comments', () => {
    const root = parseXml('<a t="&quot;x&quot; &amp; y"><!-- c --><s>cecho(&quot;&lt;red&gt;hi&#33; &#x263A;&apos;&quot;)<![CDATA[ <raw> & ]]></s></a>');
    expect(root.attrs['t']).toBe('"x" & y');
    expect(childText(root, 's')).toBe('cecho("<red>hi! ☺\'") <raw> & ');
    expect(decodeEntities('&unknown; &lt;')).toBe('&unknown; <');
  });

  it('keeps line numbers across multi-line text', () => {
    const root = parseXml('<r>\n<s>a\nb\nc</s>\n<t/>\n</r>');
    expect(root.children.map((c) => c.line)).toEqual([2, 5]);
    expect(childText(root, 's')).toBe('a\nb\nc');
  });

  it('throws XmlError with a line on malformed input', () => {
    expect(() => parseXml('<a>\n<b></c>\n</a>')).toThrow(XmlError);
    expect(() => parseXml('<a>\n<b></c>\n</a>')).toThrow(/line 2/);
    expect(() => parseXml('<a><b></a>')).toThrow(XmlError);
    expect(() => parseXml('<a></a><b></b>')).toThrow(/more than one root/);
    expect(() => parseXml('')).toThrow(/no root/);
    expect(() => parseXml('<a x=1></a>')).toThrow(/bad attribute/);
  });
});
