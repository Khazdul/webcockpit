// The admin page's graph views (stage 66, ADR 0157, the owner's pick 2b):
// Use, Storage and Sharing, drawn by the page itself as SVG.
//
// Interface with the page's shell (worker/admin/page.ts joins the strings):
// ADMIN_GRAPHS_JS runs inside the page's one IIFE, after the shell's
// helpers and before the boot, and may use only these names of the shell:
//
//   el(tag, text?, cls?)        an element, text by textContent
//   svg(tag, attrs?)            an SVG element (createElementNS), attributes set one by one
//   fmt(n)                      a whole number, en-GB grouping
//   size(bytes)                 '12.3 MB'
//   utc(ms)                     'YYYY-MM-DD HH:MM'
//   api(path)                   GET → Promise of the parsed JSON (rejects with Error(code))
//   registerView(name, view)    view = {title, group, render(root, params)}; root is an
//                               empty element of the main area, params the hash's rest
//
// ADMIN_GRAPHS_CSS is appended to the page's CSS. Until C2 (the graphs)
// lands, this stub registers the three views with a line of text.

export const ADMIN_GRAPHS_JS = `
  ['use', 'storage', 'sharing'].forEach(function (name) {
    registerView(name, {
      title: name.charAt(0).toUpperCase() + name.slice(1),
      group: 'numbers',
      render: function (root) { root.append(el('p', 'Graphs come with stage 66 C2.', 'muted')); },
    });
  });
`;

export const ADMIN_GRAPHS_CSS = '';
