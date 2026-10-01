// The script editor's live errors (stage 10 feedback round 1): Lua and
// header messages mapped to a line and, where the message names a token,
// the columns of that token. Pure; unit tested. lua-lint.ts turns them
// into CodeMirror diagnostics.
//
// Lua's messages read `<name>:<line>: <text>` (the chunk is `@<name>`,
// ADR 0051 P0). A compile error ends in `near '<token>'` or `near <eof>`;
// the token is looked up in the line to underline it. Runtime errors have
// no column: the whole line is marked.

import { apiProblem, parseHeader } from '../scripts/header';

export type DiagnosticSource = 'syntax' | 'header' | 'runtime';

export interface ScriptDiagnostic {
  /** 1-based line. */
  line: number;
  /** 0-based columns in the line; absent: the line's text (indent and trailing blanks left out). */
  from?: number;
  to?: number;
  /** The message without the `name:line:` prefix. */
  message: string;
  source: DiagnosticSource;
}

/** `name:line: text` → the line and the text; null when it is another form or another chunk. */
export function parseLuaError(name: string, text: string): { line: number; message: string } | null {
  const prefix = name + ':';
  if (!text.startsWith(prefix)) return null;
  const m = /^(\d+): ?([\s\S]*)$/.exec(text.slice(prefix.length));
  if (!m) return null;
  return { line: Number(m[1]), message: m[2]! };
}

/** The columns of the token a compile error is `near` in `lineText`, or null (`<eof>`, not found). */
export function nearColumns(lineText: string, message: string): { from: number; to: number } | null {
  const m = /near '([\s\S]*)'$/.exec(message);
  if (!m || m[1] === '') return null;
  const tok = m[1]!;
  // The last one: Lua reads left to right and stops at the token that does not fit (`x = = 1`).
  const at = lineText.lastIndexOf(tok);
  if (at < 0) return null;
  return { from: at, to: at + tok.length };
}

const clampLine = (line: number, lines: readonly string[]): number => Math.max(1, Math.min(line, Math.max(1, lines.length)));

/**
 * A compile error from `LuaRuntime.check` on the lines `lines`. A
 * message without a line (out of memory) goes on line 1.
 */
export function syntaxDiagnostic(name: string, error: string, lines: readonly string[]): ScriptDiagnostic {
  const p = parseLuaError(name, error);
  if (!p) return { line: 1, message: error, source: 'syntax' };
  const line = clampLine(p.line, lines);
  const cols = nearColumns(lines[line - 1] ?? '', p.message);
  return { line, ...(cols ?? {}), message: p.message, source: 'syntax' };
}

/**
 * The header's problems in `source`: a bad tag line (`line N: …` from the
 * parser) on its line, and a missing or other `@api` on the `@api` line
 * (line 1 when there is none).
 */
export function headerDiagnostics(source: string): ScriptDiagnostic[] {
  const { header, problems } = parseHeader(source);
  const out: ScriptDiagnostic[] = [];
  const api = apiProblem(header);
  if (api) {
    const lines = source.split(/\r?\n/);
    const at = lines.findIndex((l) => /^\s*--+\s*@api\b/i.test(l));
    out.push({ line: at >= 0 ? at + 1 : 1, message: `Cannot load: ${api}`, source: 'header' });
  }
  for (const p of problems) {
    const m = /^line (\d+): ([\s\S]*)$/.exec(p);
    out.push(m ? { line: Number(m[1]), message: m[2]!, source: 'header' } : { line: 1, message: p, source: 'header' });
  }
  return out.sort((a, b) => a.line - b.line);
}

/**
 * The library's last error of the running (saved) script as a diagnostic
 * on its line of the saved text, or null when it names no line of it.
 */
export function runtimeDiagnostic(name: string, lastError: string | null, savedLines: readonly string[]): ScriptDiagnostic | null {
  if (!lastError) return null;
  const p = parseLuaError(name, lastError);
  if (!p || p.line < 1 || p.line > savedLines.length) return null;
  return { line: p.line, message: p.message, source: 'runtime' };
}

/** The label a diagnostic's hover and the status row give it. */
export const SOURCE_LABEL: Readonly<Record<DiagnosticSource, string>> = {
  syntax: 'Syntax error',
  header: 'Header',
  runtime: 'Runtime error (saved version)',
};

/** One line for the status row: `Ln 4: Syntax error: '=' expected near 'x'`. */
export function diagnosticText(d: ScriptDiagnostic): string {
  return `Ln ${d.line}: ${SOURCE_LABEL[d.source]}: ${d.message}`;
}
