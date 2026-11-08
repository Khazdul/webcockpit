/* Round 7 · Scripts group · the Scripts page's shared logic (needs common.js). Throwaway mockup code.
   SP.parts(s, ctx) builds the detail's parts for script s (header, problems, settings with Reset all,
   commands, help) and the keyboard rows over them; each direction arranges the parts its own way.
   SP.actions(...) is what the buttons do (New, Import, Manual, Edit, Export, Rename, Delete). */
(() => {
'use strict';
const SP = (window.SP = {});
const { esc, h, I } = SC;

/** The script's buttons: Edit, Export, Rename, Delete (Rename and Delete off for bundled scripts). */
SP.scriptButtons = (s, o = {}) => [
  SC.btn('<u class="sk">E</u>dit', { act: 'edit', icon: 'edit', small: o.small, kind: o.primaryEdit ? 'primary' : '' }),
  SC.btn('E<u class="sk">x</u>port', { act: 'export', icon: 'exp', small: o.small }),
  SC.btn('<u class="sk">R</u>ename', { act: 'rename', icon: 'ren', small: o.small, disabled: !s || s.readonly, title: s && s.readonly ? 'Bundled scripts are read-only' : '' }),
  SC.btn('<u class="sk">D</u>elete', { act: 'delete', icon: 'del', small: o.small, kind: 'danger', disabled: !s || s.readonly, title: s && s.readonly ? 'Bundled scripts are read-only' : '' }),
].join('');
SP.pageButtons = (o = {}) => [
  SC.btn('<u class="sk">N</u>ew', { act: 'new', icon: 'plus', small: o.small }),
  SC.btn('<u class="sk">I</u>mport', { act: 'import', icon: 'imp', small: o.small }),
  SC.btn('<u class="sk">M</u>anual', { act: 'manual', icon: 'book', small: o.small }),
].join('');

/**
 * The detail's parts for s. ctx: { lib, say, onFocus(key), helpOpen, onFold() }.
 * Returns { settings, rule (Settings rule with Reset all), cmds, cmdRule, help, helpRule, problems, keys(), rowEl(key), act(key, dir), type(key, ch), refresh() }
 */
SP.parts = (s, ctx) => {
  const { lib, say } = ctx;
  const p = {};
  p.problems = h(`<div>${SC.problemsHTML(s)}</div>`);
  p.rule = h(`<div class="sc-rule first"><h3>Settings</h3>${s.header.settings.length ? SC.btn('Reset all', { act: 'reset', icon: 'reset', small: true, disabled: !lib.changed(s), title: 'Every setting of this script back to its default' }) : ''}</div>`);
  const resetBtn = p.rule.querySelector('[data-act="reset"]');
  const sets = SC.settings(s, lib, say, { onChange: () => { if (resetBtn) resetBtn.disabled = !lib.changed(s); }, onFocus: ctx.onFocus });
  p.settings = sets.el;
  if (resetBtn) resetBtn.addEventListener('click', () => p.act('reset', 0));
  const cmds = SC.cmdsHTML(s);
  p.cmdRule = cmds ? h('<div class="sc-rule"><h3>Commands</h3></div>') : null;
  p.cmds = cmds ? h(cmds) : null;
  p.helpRule = h(`<div class="sc-rule"><button type="button" class="sc-fold" data-act="fold" aria-expanded="${ctx.helpOpen !== false}">${I.fold}Help</button></div>`);
  p.help = h(`<div class="sc-helpbox">${SC.helpHTML(s.header.help, s)}</div>`);
  p.help.hidden = ctx.helpOpen === false;
  p.helpRule.querySelector('.sc-fold').addEventListener('click', () => p.act('help', 0));
  p.keys = () => ['buttons', ...(s.header.settings.length ? ['reset'] : []), ...sets.rows.map((r) => `set:${r.d.name}`), 'help'];
  p.rowEl = (k) => (k === 'reset' ? resetBtn : k === 'help' ? p.helpRule.querySelector('.sc-fold') : k.startsWith('set:') ? sets.rows.find((r) => `set:${r.d.name}` === k)?.row : null);
  p.fold = (open) => { const f = p.helpRule.querySelector('.sc-fold'); const o = open ?? f.getAttribute('aria-expanded') !== 'true'; f.setAttribute('aria-expanded', String(o)); p.help.hidden = !o; if (ctx.onFold) ctx.onFold(o); };
  p.act = (k, dir) => {
    if (k === 'reset') { if (!lib.changed(s)) return; say(lib.reset(s)); sets.refresh(); if (resetBtn) resetBtn.disabled = true; return; }
    if (k === 'help') { if (dir === 0) p.fold(); return; }
    const r = sets.rows.find((x) => `set:${x.d.name}` === k); if (r) r.ctl.adjust(dir);
  };
  p.type = (k, ch) => { const r = sets.rows.find((x) => `set:${x.d.name}` === k); if (r && r.d.type === 'number') { r.ctl.type(ch); return true; } return false; };
  p.decl = (k) => sets.rows.find((x) => `set:${x.d.name}` === k)?.d;
  p.refresh = () => { sets.refresh(); if (resetBtn) resetBtn.disabled = !lib.changed(s); };
  return p;
};

/** What the buttons do. env: { root, host, lib, say, cur() → s, select(s), file: the direction's file letter } */
SP.actions = (env) => {
  const dlg = SC.dialogs(env.root, env.lib, env.say);
  const editor = `editor-${env.file}.html`;
  return {
    new: () => dlg.name('create', null, (s) => { env.select(s); env.host.go(editor, { sc: s.name, new: '' }); }),
    import: () => dlg.pick((s) => s && env.select(s)),
    manual: () => env.host.go(`manual-${env.file === 'c' ? 'a' : env.file}.html`, { from: `page-${env.file}` }),
    edit: () => { const s = env.cur(); if (s) env.host.go(editor, { sc: s.name }); },
    export: () => { const s = env.cur(); if (s) dlg.exp(s); },
    rename: () => { const s = env.cur(); if (s && !s.readonly) dlg.name('rename', s, (x) => env.select(x)); },
    delete: () => { const s = env.cur(); if (s && !s.readonly) dlg.del(s, (next) => env.select(next)); },
  };
};
SP.LETTERS = { n: 'new', i: 'import', m: 'manual', e: 'edit', x: 'export', r: 'rename', d: 'delete' };

/** The demo panel's extras for the page (empty state, a failed import). */
SP.demo = (say) => {
  const d = WC.demoExtra('<div class="row2">State <button data-x="empty">Empty</button><button data-x="full">Full</button><button data-x="fail">Import fails</button></div>');
  d.querySelector('[data-x="empty"]').addEventListener('click', () => { const u = new URLSearchParams(location.search); u.set('empty', ''); u.set('open', ''); u.set('nointro', ''); location.search = u.toString().replace(/=(&|$)/g, '$1'); });
  d.querySelector('[data-x="full"]').addEventListener('click', () => { const u = new URLSearchParams(location.search); u.delete('empty'); location.search = u.toString().replace(/=(&|$)/g, '$1'); });
  d.querySelector('[data-x="fail"]').addEventListener('click', () => say('Import failed: healer.lua is not a Lua script (no -- @name line).', 'fail'));
};
})();
