// The admin page's limit helpers (stage 66, ADR 0157): the fields of
// `AccountLimits` with their names and units, shown and typed in human
// units, read back to whole numbers, and checked against 0 … 20 × the
// built-in value before anything is sent. Used by one account's Limits
// (accounts.ts) and the default limits (flags.ts).
//
// Byte limits are binary (50 MB = 50 × 1 048 576 bytes), as the Worker's
// defaults are, and shown exactly (shell.ts `exactSize`); a bare number in
// a byte field means MB; B, KB, MB and GB are understood.

export const LIMITS_CSS = `.limits td input { width: 8em; text-align: right; }
.limits td input.own { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.limits td input.bad { border-color: var(--bad); }
.limits td:nth-child(n+2), .limits th:nth-child(n+2) { text-align: right; }
.limits-help { margin: 6px 0 0; }
@media (max-width: 600px) { .limits td input { width: 5.5em; } .limits td, .limits th { padding: 4px; } }
.changes { padding-left: 1.2em; }
`;

export const LIMITS_JS = String.raw`
  // --- Limits: names, units, reading and checking ---

  /** [field, name, kind (n: a count, b: bytes), the AdminAccountRow field of its use] */
  var LIMITS = [
    ['items', 'Small items', 'n', 'items'],
    ['itemBytes', 'Small items, bytes', 'b', 'itemBytes'],
    ['itemMaxBytes', 'One small item', 'b', null],
    ['runBytes', 'Runs, bytes', 'b', 'runBytes'],
    ['runMaxBytes', 'One run', 'b', null],
    ['payloadMaxBytes', 'One published run', 'b', null],
    ['sharedRuns', 'Published runs', 'n', 'pubs'],
    ['commentsPerHour', 'Comments an hour', 'n', null],
    ['votesPerHour', 'Votes an hour', 'n', null],
    ['notesPerDay', 'Notes a day', 'n', null],
    ['listingsPerDay', 'Hall of Fame listings a day', 'n', null],
  ];
  var LIMIT_MAX = 20;
  var UNITS = { b: 1, kb: KIB, mb: MIB, gb: GIB };

  /**
   * A limit's value in its unit, exactly (review fix CR1): '2,000', '50 MB',
   * '100 KB', '1,000 B'. parseLimit reads it back to the same number, so a
   * field nobody edited sends its stored value unchanged.
   */
  function limitText(kind, v) {
    if (typeof v !== 'number') return '';
    return kind === 'b' ? exactSize(v) : fmt(v);
  }
  /** What an account uses, rounded for reading: '2,000' or '12.3 MB'. */
  function useText(kind, v) {
    return kind === 'b' ? size(v) : fmt(v);
  }
  /** Typed text → {value} or {error}; '' → {value: null}. */
  function parseLimit(kind, text) {
    var s = String(text).replace(/[\s,_]/g, '').toLowerCase();
    if (s === '') return { value: null };
    var m = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/.exec(s);
    if (!m || (kind !== 'b' && m[2])) return { error: kind === 'b' ? 'a size such as 200 MB' : 'a whole number' };
    var n = Number(m[1]) * (kind === 'b' ? UNITS[m[2] || 'mb'] : 1);
    if (kind !== 'b' && n !== Math.floor(n)) return { error: 'a whole number' };
    return { value: Math.round(n) };
  }
  /** An input of a limit: its value or empty, the placeholder the value that holds without it. */
  function limitInput(def, value, placeholder) {
    var i = el('input');
    i.type = 'text';
    i.name = def[0];
    i.spellcheck = false;
    i.autocomplete = 'off';
    i.setAttribute('aria-label', def[1]);
    i.value = typeof value === 'number' ? limitText(def[2], value) : '';
    i.placeholder = limitText(def[2], placeholder);
    i.classList.toggle('own', i.value !== '');
    i.addEventListener('input', function () { i.classList.toggle('own', i.value.trim() !== ''); i.classList.remove('bad'); });
    return i;
  }
  /**
   * Reads the inputs: {values: field → number (empty ones left out), errors: [text]}.
   * builtIn bounds each value (0 … 20 × the built-in value).
   */
  function readLimits(inputs, builtIn) {
    var values = {};
    var errors = [];
    LIMITS.forEach(function (def) {
      var input = inputs[def[0]];
      var r = parseLimit(def[2], input.value);
      var max = LIMIT_MAX * builtIn[def[0]];
      if (r.error) errors.push(def[1] + ': ' + r.error + '.');
      else if (r.value !== null && r.value > max) errors.push(def[1] + ': at most ' + limitText(def[2], max) + ' (20 × the built-in ' + limitText(def[2], builtIn[def[0]]) + ').');
      else if (r.value !== null) values[def[0]] = r.value;
      input.classList.toggle('bad', !!r.error || (r.value !== null && r.value > max));
    });
    return { values: values, errors: errors };
  }
  /** "Runs, bytes 50 MB → 200 MB" for every field whose value changes. */
  function limitChanges(before, after) {
    var out = [];
    LIMITS.forEach(function (def) {
      if (before[def[0]] !== after[def[0]]) out.push(def[1] + ' ' + limitText(def[2], before[def[0]]) + ' → ' + limitText(def[2], after[def[0]]) + (after[def[0]] === 0 ? ' (none allowed)' : ''));
    });
    return out;
  }
  function changeList(lines) {
    var ul = el('ul', null, 'changes');
    lines.forEach(function (t) { ul.append(el('li', t)); });
    return ul;
  }
  function isEmpty(o) { return !o || Object.keys(o).length === 0; }
`;
