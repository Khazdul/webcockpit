// Kit gallery section "Code" (stage 42e, ADR 0127): the lantern CodeMirror
// look (an editable tt++ buffer: Ctrl+F opens the lantern find panel at
// the top, with Replace / All), the token colours of both languages, and
// the manual reader (`LookManual`) over the profile manual and the script
// manual, with its contents own or none (then `ManualContents` stands in
// for the host's rail), its find in the head or as a bar, the Lua index's
// links and highlighted examples. Dark and Paper.
//
// The editor parts load lazily (CodeMirror and the manuals stay out of
// the gallery's own chunk), as the pages load the editor chunk.
//
// Hooks: `[data-section=code]`, `.wc-kit-code-buf` (the buffer's host),
// `.wc-kit-code-man` (the manual's host; `data-open-ms` the time from the
// choice to the first frame with the manual), `[data-kit=look|show|
// contents|find] [data-opt]`.

import type { EditorView } from '@codemirror/view';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { HelpSection } from '../../../editor/help';
import type { ManualCtl } from '../../../editor/look-manual';
import type { FindMemory } from '../../../editor/look-manual-find';
import { Seg } from '../look-controls';
import type { KitSection } from './kit';
import { useKitKeys } from './kit';
import './code.css';

type Mods = {
  manual: typeof import('../../../editor/look-manual');
  cm: typeof import('../../../editor/cm');
  search: typeof import('../../../editor/search');
  profile: readonly HelpSection[];
  script: readonly HelpSection[];
  indexLinkOf: typeof import('../../../editor/script-reference').indexLinkOf;
  luaKnown: (name: string) => boolean;
};

let loading: Promise<Mods> | null = null;

/** The editor parts the section shows (one load per page). */
function loadMods(): Promise<Mods> {
  return (loading ??= Promise.all([
    import('../../../editor/look-manual'),
    import('../../../editor/cm'),
    import('../../../editor/search'),
    import('../../../editor/help'),
    import('../../../editor/script-reference'),
    import('../../../editor/lua-api'),
  ]).then(([manual, cm, search, help, ref, api]) => ({
    manual,
    cm,
    search,
    profile: help.helpSections(),
    script: ref.scriptManualSections(),
    indexLinkOf: ref.indexLinkOf,
    luaKnown: (n: string) => api.apiDoc(n) !== null,
  })));
}

const SAMPLE = [
  '#nop Target and attack (a lantern buffer: Ctrl+F finds, Ctrl+H replaces)',
  '#var {target} {orc}',
  '#alias {k %1} {#var target %1; kill $target}',
  '#action {^%1 arrives from the %2.$} {#if {"%1" == "$target"} {#showme <118>Target: %1}}',
  '#highlight {orc} {light red}',
  '#macro {\\eOP} {kill $target}',
  '#ticker {flee} {#if {$hp < 30} {flee}} {2}',
  '#substitute {You are hungry.} {<138>HUNGRY}',
  '#nop orc orc orc',
  '#unknowncmd stays text',
].join('\n');

const LUA_SAMPLE = [
  '-- @name     healer',
  'local last = nil',
  'local function heal(who)',
  '  last = who or last or "me"',
  '  send("cast \'cure light\' " .. last)',
  'end',
  'export("heal", heal)',
  'tempKey("F6", function() heal(nil) end, 2.5)',
];

/** The editable lantern buffer, with its line and column below. */
function Buffer(p: { mods: Mods; view: { current: EditorView | null } }): VNode {
  const host = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState('Ln 1, Col 1');
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const v = p.mods.cm.createBuffer(el, {
      text: SAMPLE,
      eol: '\n',
      look: 'lantern',
      onStatus: (s) => setPos(`Ln ${s.line}, Col ${s.col}` + (s.unclosed || s.stray ? ` · braces ${s.unclosed}/${s.stray}` : '')),
      onScroll: () => {},
      onClipboard: () => {},
      onFocus: () => {},
    });
    p.view.current = v;
    return () => {
      v.destroy();
      if (p.view.current === v) p.view.current = null;
    };
  }, []);
  return (
    <div class="wc-kit-code-bufwrap">
      <div class="wc-kit-code-buf" ref={host} />
      <div class="wc-kit-code-pos wc-lk-dim">{pos}</div>
    </div>
  );
}

/** The manual, with the time from the choice to its first frame (`data-open-ms`). */
function Manual(p: {
  mods: Mods;
  which: 'profile' | 'script';
  contents: 'own' | 'none';
  find: 'head' | 'bar';
  since: number;
  ctl: { current: ManualCtl | null };
  memory: FindMemory;
}): VNode {
  const { LookManual, ManualContents, codeLine } = p.mods.manual;
  const sections = p.which === 'profile' ? p.mods.profile : p.mods.script;
  const wrap = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  // Parents' layout effects run after the children's: the manual is in the DOM.
  useLayoutEffect(() => {
    const t0 = p.since;
    requestAnimationFrame(() => wrap.current?.setAttribute('data-open-ms', (performance.now() - t0).toFixed(1)));
  }, []);
  const known = p.mods.luaKnown;
  return (
    <div class={'wc-kit-code-man' + (p.contents === 'none' ? ' has-rail' : '')} ref={wrap} data-which={p.which}>
      {p.contents === 'none' && (
        <div class="wc-kit-code-rail">
          <ManualContents sections={sections} current={cur} onGo={(i) => p.ctl.current?.goto(i)} />
        </div>
      )}
      <LookManual
        sections={sections}
        contents={p.contents}
        find={p.find}
        memory={p.memory}
        ctl={(c) => (p.ctl.current = c)}
        onSection={setCur}
        example={(line, lang) => codeLine(line, lang, known)}
        link={p.which === 'script' ? (name) => p.mods.indexLinkOf(`- ${name}:`)?.section ?? null : undefined}
      />
    </div>
  );
}

function CodeSection(): VNode {
  const [mods, setMods] = useState<Mods | null>(null);
  const [light, setLight] = useState('dark');
  const [show, setShow] = useState<'code' | 'profile' | 'script'>('code');
  const [contents, setContents] = useState<'own' | 'none'>('own');
  const [find, setFind] = useState<'head' | 'bar'>('head');
  const since = useRef(performance.now());
  const view = useRef<EditorView | null>(null);
  const ctl = useRef<ManualCtl | null>(null);
  const memory = useRef<FindMemory>({ query: { search: '', caseSensitive: false, wholeWord: false, regexp: false } });

  useEffect(() => {
    let live = true;
    void loadMods().then((m) => live && setMods(m));
    return () => {
      live = false;
    };
  }, []);

  useKitKeys((e, nk) => {
    if (!mods) return false;
    if (show === 'code') {
      const v = view.current;
      if (!v) return false;
      const s = mods.search.searchFrameKey(v, e);
      if (s !== null) return s;
      if (!v.hasFocus) return false;
      if (nk === 'back') {
        v.contentDOM.blur();
        return true;
      }
      // Typing and the keys CodeMirror leaves to the browser stay in the buffer.
      return mods.cm.handleKey(v, e);
    }
    return ctl.current?.key(e, nk) ?? false;
  });

  const pick = <T extends string>(set: (v: T) => void) => (v: string): void => {
    since.current = performance.now();
    set(v as T);
  };

  return (
    <div class="wc-kit-code wc-look" data-light={light === 'paper' ? '' : undefined}>
      <div class="wc-kit-code-bar">
        <span data-kit="look">
          <Seg
            label="Background"
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'paper', label: 'Paper' },
            ]}
            value={light}
            onChange={setLight}
          />
        </span>
        <span data-kit="show">
          <Seg
            label="Show"
            options={[
              { value: 'code', label: 'Code' },
              { value: 'profile', label: 'Profile manual' },
              { value: 'script', label: 'Script manual' },
            ]}
            value={show}
            onChange={pick<'code' | 'profile' | 'script'>((v) => setShow(v))}
          />
        </span>
        {show !== 'code' && (
          <>
            <span data-kit="contents">
              <Seg
                label="Contents"
                options={[
                  { value: 'own', label: 'Contents own' },
                  { value: 'none', label: 'Host rail' },
                ]}
                value={contents}
                onChange={pick<'own' | 'none'>((v) => setContents(v))}
              />
            </span>
            <span data-kit="find">
              <Seg
                label="Find"
                options={[
                  { value: 'head', label: 'Find in head' },
                  { value: 'bar', label: 'Find bar' },
                ]}
                value={find}
                onChange={pick<'head' | 'bar'>((v) => setFind(v))}
              />
            </span>
          </>
        )}
      </div>
      {!mods ? (
        <p class="wc-lk-empty">Loading the editor…</p>
      ) : show === 'code' ? (
        <div class="wc-kit-code-grid">
          <Buffer mods={mods} view={view} />
          <div class="wc-kit-code-tokens">
            <p class="wc-lk-sec">Lua tokens (the script editor's palette)</p>
            <pre class="wc-lk-mcode wc-code" data-lang="lua">
              {LUA_SAMPLE.map((l) => (
                <span class="wc-lk-mline">{mods.manual.codeLine(l, 'lua', mods.luaKnown)}</span>
              ))}
            </pre>
            <p class="wc-lk-sec">tt++ tokens (the profile editor's palette)</p>
            <pre class="wc-lk-mcode wc-code" data-lang="tt">
              {SAMPLE.split('\n')
                .slice(1, 6)
                .map((l) => (
                  <span class="wc-lk-mline">{mods.manual.codeLine(l, 'tt')}</span>
                ))}
            </pre>
          </div>
        </div>
      ) : (
        <Manual
          key={`${show}-${contents}-${find}`}
          mods={mods}
          which={show}
          contents={contents}
          find={find}
          since={since.current}
          ctl={ctl}
          memory={memory.current}
        />
      )}
    </div>
  );
}

export default {
  title: 'Code',
  View: CodeSection,
} satisfies KitSection;
