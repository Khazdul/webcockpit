// A minimal XML parser for Mudlet packages (ADR 0076 "Input"). No DOM, so
// it runs in node unit tests and in the lazy import chunk alike.
//
// Supported: elements, attributes ('…' and "…"), text, CDATA, comments,
// processing instructions and the DOCTYPE line (both skipped), the five
// predefined entities and numeric character references. Every element
// records the 1-based line its start tag is on, for the import report.
// Namespaces, external entities and DTD internal subsets are not handled.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Character data directly inside the element (text and CDATA, concatenated). */
  text: string;
  /** 1-based line of the start tag. */
  line: number;
}

export class XmlError extends Error {
  override name = 'XmlError';
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Replaces entity and character references. Unknown entities stay as written. */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (m, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ref] ?? m;
  });
}

/** Parses a document and returns its root element. Throws XmlError. */
export function parseXml(src: string): XmlElement {
  let pos = 0;
  let line = 1;
  /** Index up to which newlines have been counted into `line`. */
  let counted = 0;
  const lineAt = (i: number): number => {
    for (; counted < i; counted++) if (src.charCodeAt(counted) === 10) line++;
    return line;
  };
  const fail = (msg: string): never => {
    throw new XmlError(`XML line ${lineAt(Math.min(pos, src.length))}: ${msg}`);
  };
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    const textEnd = lt < 0 ? src.length : lt;
    if (textEnd > pos) {
      const top = stack[stack.length - 1];
      if (top) top.text += decodeEntities(src.slice(pos, textEnd));
      else if (src.slice(pos, textEnd).trim() !== '') fail('text outside the root element');
    }
    if (lt < 0) break;
    pos = lt;
    if (src.startsWith('<!--', pos)) {
      const end = src.indexOf('-->', pos + 4);
      if (end < 0) fail('unclosed comment');
      pos = end + 3;
    } else if (src.startsWith('<![CDATA[', pos)) {
      const end = src.indexOf(']]>', pos + 9);
      if (end < 0) fail('unclosed CDATA section');
      const top = stack[stack.length - 1];
      if (top) top.text += src.slice(pos + 9, end);
      pos = end + 3;
    } else if (src.startsWith('<?', pos)) {
      const end = src.indexOf('?>', pos + 2);
      if (end < 0) fail('unclosed processing instruction');
      pos = end + 2;
    } else if (src.startsWith('<!', pos)) {
      // DOCTYPE (an internal subset in [...] is skipped whole).
      let i = pos + 2;
      let depth = 0;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (i >= src.length) fail('unclosed declaration');
      pos = i + 1;
    } else if (src[pos + 1] === '/') {
      const end = src.indexOf('>', pos);
      if (end < 0) fail('unclosed end tag');
      const name = src.slice(pos + 2, end).trim();
      const top = stack.pop();
      if (!top || top.name !== name) fail(`end tag </${name}> does not match <${top?.name ?? ''}>`);
      pos = end + 1;
    } else {
      const startLine = lineAt(pos);
      const m = /^<([A-Za-z_:][\w:.-]*)/.exec(src.slice(pos, pos + 256));
      if (!m) fail('bad start tag');
      const el: XmlElement = { name: m![1]!, attrs: {}, children: [], text: '', line: startLine };
      let i = pos + m![0].length;
      let selfClose = false;
      for (;;) {
        while (i < src.length && /\s/.test(src[i]!)) i++;
        if (i >= src.length) fail(`unclosed start tag <${el.name}>`);
        if (src[i] === '>') {
          i++;
          break;
        }
        if (src[i] === '/' && src[i + 1] === '>') {
          selfClose = true;
          i += 2;
          break;
        }
        const am = /^([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(i, i + 4096));
        if (!am) fail(`bad attribute in <${el.name}>`);
        el.attrs[am![1]!] = decodeEntities(am![3] ?? am![4] ?? '');
        i += am![0].length;
      }
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else if (root) fail('more than one root element');
      else root = el;
      if (!selfClose) stack.push(el);
      pos = i;
    }
  }
  if (stack.length > 0) fail(`unclosed element <${stack[stack.length - 1]!.name}>`);
  if (!root) fail('no root element');
  return root!;
}

/** The first child element with that name. */
export function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

/** The text of the first child element with that name ('' when absent). */
export function childText(el: XmlElement, name: string): string {
  return child(el, name)?.text ?? '';
}
