// Format detection for foreign profile import (ADR 0073 "Detection",
// ADR 0076 "Input").
//
// A Mudlet package (`<!DOCTYPE MudletPackage>` or a `MudletPackage` root in
// the first 1 KB) is decisive: if any chosen file is one, the import is
// Mudlet. Otherwise:
//
// Each format scores the signals it finds (each signal counts once).
// Decisive signals weigh 3, others 1. The best foreign format wins when it
// has a decisive signal or beats tt++ by 2; otherwise the files are tt++
// (which includes plain WebCockpit profiles).

import type { ImportFormat } from './types';

export interface DetectInput {
  name: string;
  text: string;
}

export interface Detection {
  format: ImportFormat;
  /** Up to three signals that decided the format. */
  signals: string[];
  scores: Record<ImportFormat, number>;
}

interface Signal {
  label: string;
  decisive: boolean;
  test: (text: string, name: string) => boolean;
}

const line = (re: RegExp) => (text: string) => re.test(text);

const JMC_COLOUR =
  /^(?:light |b |bold|faint|blink|italic|reverse|black|red|green|brown|blue|magenta|cyan|gr[ae]y|charcoal|yellow|white|\d{1,2}\b)/i;

const POWWOW: Signal[] = [
  { label: 'first line #savefile-version', decisive: true, test: (t) => /^\s*#savefile-version\b/.test(t) },
  { label: '#action with a >/% label and =', decisive: true, test: line(/^#action [>%<=][+-]?\S+ [^\n]*=/m) },
  { label: '#mark pattern=attribute', decisive: true, test: line(/^#mark \S.*=\s*[a-zA-Z]+(?:\s+[a-zA-Z]+)*\s*$/m) },
  { label: '#bind with a ^[ sequence', decisive: true, test: line(/^#bind \S+ \S*(?:\^\[|\\0)\S*=/m) },
  { label: '#(@var = …) / #($var = …)', decisive: true, test: line(/^#\((?:@|\$)\S+ = /m) },
  { label: '#groupdelim / #delim', decisive: true, test: line(/^#(?:groupdelim |delim (?:normal|program|custom))/m) },
  { label: '#option +x -y', decisive: false, test: line(/^#option [+-]\w+ [+-]/m) },
  { label: '#alias name=text', decisive: false, test: line(/^#alias [^ {\n]+=/m) },
  { label: '#host name port', decisive: false, test: line(/^#host \S+ \d+$/m) },
];

const JMC: Signal[] = [
  { label: '.set file name', decisive: true, test: (_t, n) => /\.set$/i.test(n) },
  {
    label: 'JMC state header',
    decisive: true,
    test: line(/^#(?:multiaction|multihighlight|presub|togglesubs|verbat|promptend)\b|^#colon (?:leave|replace)|^#race format|^#codepage \{|^#oob \{GMCP\}|^#broadcast \{port\}|^#ticksize \d+/im),
  },
  { label: '#action TEXT/RAW/COLOR', decisive: true, test: line(/^#act\w* (?:TEXT|RAW|COLOR) \{/m) },
  { label: '#hot/#hotkey with Ctrl+/Alt+', decisive: true, test: line(/^#hot\w* \{?(?:Ctrl|Alt|Shift)\+/im) },
  { label: '#group local/global', decisive: true, test: line(/^#group (?:local|global) /im) },
  { label: '%%n in a body', decisive: false, test: line(/%%\d/) },
  {
    label: '#highlight with the colour first',
    decisive: false,
    test: (t) => {
      for (const m of t.matchAll(/^#hi\w* \{([^}]*)\}\s*\{/gim)) if (JMC_COLOUR.test(m[1]!.trim())) return true;
      return false;
    },
  },
  { label: 'trailing {default} group', decisive: false, test: line(/\} \{default\}\s*$/m) },
];

const TINTIN: Signal[] = [
  { label: '#class', decisive: false, test: line(/^\s*#class\b/im) },
  { label: '#ticker', decisive: false, test: line(/#tick(?:e|er)? \{/i) },
  { label: '#event', decisive: false, test: line(/#event\b/i) },
  { label: '#macro', decisive: false, test: line(/#mac(?:r|ro)?\b/i) },
  { label: '%w / %d / %* patterns', decisive: false, test: line(/%[wd*]/) },
  { label: '<xyz> colour codes', decisive: false, test: line(/<[0-9a-fA-F]{3}>|<[FB][0-9a-fA-F]{3,6}>/) },
  { label: '#config / #session / #split', decisive: false, test: line(/^\s*#(?:config|session|split)\b/im) },
];

/** True when the text is a Mudlet package (XML with a MudletPackage root). */
export function isMudlet(text: string): boolean {
  const head = text.slice(0, 1024);
  return /<!DOCTYPE\s+MudletPackage\b/.test(head) || /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<MudletPackage\b/.test(head);
}

function mudletSignals(files: DetectInput[]): string[] {
  const out: string[] = [];
  const m = files.find((f) => isMudlet(f.text));
  if (!m) return out;
  const v = /<MudletPackage[^>]*\bversion="([^"]*)"/.exec(m.text.slice(0, 2048));
  out.push(v ? `MudletPackage version ${v[1]}` : 'MudletPackage');
  if (files.some((f) => isMudlet(f.text) && /<HostPackage\b/.test(f.text))) out.push('profile save');
  if (files.some((f) => isMudlet(f.text) && /\.(?:mpackage|zip)\b/i.test(f.name))) out.push('package archive');
  return out;
}

function score(signals: Signal[], files: DetectInput[]): { score: number; hits: Signal[] } {
  const hits = signals.filter((s) => files.some((f) => s.test(f.text, f.name)));
  return { score: hits.reduce((n, s) => n + (s.decisive ? 3 : 1), 0), hits };
}

/** Detects the format of a set of files chosen together. */
export function detectFormat(files: DetectInput[]): Detection {
  const pw = score(POWWOW, files);
  const jmc = score(JMC, files);
  const tt = score(TINTIN, files);
  const mud = mudletSignals(files);
  const scores = { powwow: pw.score, jmc: jmc.score, tintin: tt.score, mudlet: mud.length > 0 ? 3 * mud.length : 0 };
  if (mud.length > 0) return { format: 'mudlet', signals: mud, scores };
  const best = pw.score >= jmc.score ? { format: 'powwow' as const, ...pw } : { format: 'jmc' as const, ...jmc };
  const decisive = best.hits.some((s) => s.decisive);
  if (best.score > 0 && (decisive || best.score >= tt.score + 2)) {
    const ordered = [...best.hits.filter((s) => s.decisive), ...best.hits.filter((s) => !s.decisive)];
    return { format: best.format, signals: ordered.slice(0, 3).map((s) => s.label), scores };
  }
  const signals = tt.hits.slice(0, 3).map((s) => s.label);
  return { format: 'tintin', signals: signals.length > 0 ? signals : ['no foreign signals (tt++ syntax)'], scores };
}
