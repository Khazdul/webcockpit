// @vitest-environment happy-dom
// Stage 44b (ADR 0129): the script editor's buffer in the lantern look.
// The doc boxes of the pop-ups (hover, completion info, signature help)
// typeset as small plates, the buffer carrying stage 42's `.wc-code`
// class, API names marked outside comments and strings, and the find row
// reported to the frame (it hides its tools while it is open).

import type { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { apiDoc } from '../../src/editor/lua-api';
import { createLuaBuffer, docDom, sigDom } from '../../src/editor/lua-cm';
import { callContext, signatureFor } from '../../src/editor/lua-sig';
import { closeSearch, openSearch } from '../../src/editor/search';

let views: EditorView[] = [];

afterEach(() => {
  for (const v of views) v.destroy();
  views = [];
  document.body.innerHTML = '';
});

function buffer(text: string, extra: { onSearch?: (open: boolean) => void; readOnly?: boolean } = {}): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const v = createLuaBuffer(host, {
    text,
    readOnly: extra.readOnly ?? false,
    onStatus: () => {},
    onChange: () => {},
    onFocus: () => {},
    ...(extra.onSearch ? { onSearch: extra.onSearch } : {}),
  });
  views.push(v);
  return v;
}

describe('the doc boxes', () => {
  it('typeset an entry: signature, text, labelled parameters and return, a highlighted example', () => {
    const d = apiDoc('string.format')!;
    const el = docDom(d);
    expect(el.className).toBe('wc-lua-doc');
    expect(el.querySelector('.wc-lua-doc-sig')!.textContent).toBe(d.sig);
    expect([...el.querySelectorAll('.wc-lua-doc-label')].map((l) => l.textContent)).toEqual(['Parameters', 'Returns']);
    const p = el.querySelector('.wc-lua-doc-params .wc-lua-doc-p')!;
    expect(p.querySelector('.wc-lua-doc-pname')!.textContent).toBe('fmt');
    expect(p.querySelector('.wc-lua-doc-ptype')!.textContent).toBe('(string)');
    expect(p.textContent).toMatch(/^fmt \(string\) /);
    expect(el.querySelector('.wc-lua-doc-returns')!.textContent).toMatch(/^Returns/);
    // The example's tokens carry the editor's own classes (the lantern code colours).
    const ex = el.querySelector('.wc-lua-doc-example')!;
    expect(ex.textContent).toContain('string.format(');
    const classes = new Set([...ex.querySelectorAll('span')].map((s) => s.className));
    expect([...classes].every((c) => c === '' || c.startsWith('wc-lua-'))).toBe(true);
    expect(classes.has('wc-lua-std')).toBe(true);
  });

  it('mark the current parameter of a signature and describe it', () => {
    const ctx = callContext('tempTimer(3, ')!;
    const el = sigDom(signatureFor(ctx)!);
    expect(el.className).toBe('wc-lua-sig');
    expect(el.querySelector('.wc-lua-sig-active')!.textContent).toBe('fn');
    const text = el.querySelector('.wc-lua-doc-text')!;
    expect(text.querySelector('.wc-lua-doc-pname')!.textContent).toBe('fn');
    expect(text.textContent).toMatch(/^fn \(function\) /);
  });
});

describe('the buffer', () => {
  it('carries the lantern code class', () => {
    const v = buffer('local x = 1\n');
    expect(v.dom.classList.contains('wc-code')).toBe(true);
  });

  it('marks API names, never in a comment or a string', () => {
    const v = buffer('send("send x")\n-- send it\nlocal t = store.get("k")\n');
    const marked = [...v.contentDOM.querySelectorAll('.wc-lua-std')].map((s) => s.textContent);
    expect(marked).toContain('send');
    expect(marked).toContain('store.get');
    expect(marked.filter((m) => m === 'send')).toHaveLength(1);
  });

  it('tells the frame when the find row opens and closes', () => {
    const seen: boolean[] = [];
    const v = buffer('a\nb\n', { onSearch: (open) => seen.push(open) });
    openSearch(v);
    expect(v.dom.querySelector('.wc-lk-search')).not.toBeNull();
    closeSearch(v);
    expect(seen).toEqual([true, false]);
  });

  it('a read-only buffer has no replace row', () => {
    const v = buffer('a\n', { readOnly: true });
    openSearch(v);
    expect(v.dom.querySelector('[data-field="find"]')).not.toBeNull();
    expect(v.dom.querySelector('[data-field="replace"]')).toBeNull();
  });
});
