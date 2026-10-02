// The script manual (stage 10): every Lua example compiles, every API
// function is documented with parameters and an example, and the guide's
// examples only call functions that exist.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEADER_TAGS, LUA_STD, SCRIPT_API } from "../../src/editor/lua-api";
import { SCRIPT_GUIDE } from "../../src/editor/script-manual";
import { type LuaRuntime, loadLuaRuntime } from "../../src/lua";

let rt: LuaRuntime;

beforeAll(async () => {
  rt = await loadLuaRuntime();
});

afterAll(() => {
  rt?.close();
});

interface Sample {
  where: string;
  code: string;
}

const guideSamples = (): Sample[] =>
  SCRIPT_GUIDE.flatMap((s) =>
    (s.examples ?? [])
      .filter((e) => e.lang === "lua")
      .map((e, i) => ({ where: `${s.heading} #${i + 1}`, code: e.code })),
  );

const apiSamples = (): Sample[] =>
  [...SCRIPT_API, ...HEADER_TAGS]
    .filter((d) => d.example !== undefined)
    .map((d) => ({ where: d.name, code: d.example! }));

const KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "goto",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

/** `src` with comments and string literals blanked out (a light Lua scanner). */
function codeOnly(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const longEnd = (at: number): number => {
    // At `[`, a long bracket `[=*[`: the index after its close, or -1.
    let j = at + 1;
    while (src[j] === "=") j++;
    if (src[j] !== "[") return -1;
    const close = "]" + "=".repeat(j - at - 1) + "]";
    const e = src.indexOf(close, j + 1);
    return e < 0 ? n : e + close.length;
  };
  while (i < n) {
    const c = src[i]!;
    if (c === "-" && src[i + 1] === "-") {
      if (src[i + 2] === "[") {
        const e = longEnd(i + 2);
        if (e >= 0) {
          out += " ";
          i = e;
          continue;
        }
      }
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "[") {
      const e = longEnd(i);
      if (e >= 0) {
        out += '""';
        i = e;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n")
        i += src[i] === "\\" ? 2 : 1;
      i++;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Names `code` defines: local and global functions, locals, parameters and loop variables. */
function definedNames(code: string): Set<string> {
  const names = new Set<string>();
  const add = (list: string): void => {
    for (const w of list.split(",")) {
      const t = w
        .trim()
        .replace(/<\w+>$/, "")
        .trim();
      if (/^[A-Za-z_]\w*$/.test(t)) names.add(t);
    }
  };
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_]\w*)/g))
    names.add(m[1]!);
  for (const m of code.matchAll(
    /\blocal\s+(?!function\b)([A-Za-z_][\w\s,<>]*?)(?:=|\n|$)/g,
  ))
    add(m[1]!);
  for (const m of code.matchAll(/\bfunction\s*(?:[\w.:]+)?\s*\(([^)]*)\)/g))
    add(m[1]!);
  for (const m of code.matchAll(/\bfor\s+([\w\s,]+?)\s+(?:in|=)/g)) add(m[1]!);
  return names;
}

/** Global-looking calls in `code`: an identifier then `(`, not after `.` or `:`. */
function globalCalls(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(^|[^\w.:])([A-Za-z_]\w*)\s*\(/g)) {
    const name = m[2]!;
    if (!KEYWORDS.has(name)) out.push(name);
  }
  return out;
}

const KNOWN = new Set([...SCRIPT_API, ...LUA_STD].map((d) => d.name));

describe("script manual examples", () => {
  it("has the guide sections with short headings and Lua examples", () => {
    expect(SCRIPT_GUIDE.length).toBeGreaterThanOrEqual(12);
    for (const s of SCRIPT_GUIDE) {
      expect(s.group, s.heading).toBe("guide");
      expect(s.heading.length, s.heading).toBeLessThanOrEqual(22);
      expect(s.text.length, s.heading).toBeGreaterThan(0);
      for (const t of [...s.text, ...(s.syntax ?? [])]) {
        expect(t.includes("\t"), s.heading).toBe(false);
        expect(t.includes("`"), `${s.heading}: ${t}`).toBe(false);
      }
    }
    expect(guideSamples().length).toBeGreaterThan(20);
  });

  it("compiles every Lua example in the guide and the API docs", () => {
    const all = [...guideSamples(), ...apiSamples()];
    for (const s of all) {
      const r = rt.check("example", s.code);
      expect(r, `${s.where}:\n${s.code}`).toEqual({ ok: true });
    }
  });

  it("calls only API functions, Lua library functions and names the example defines", () => {
    for (const s of [...guideSamples(), ...apiSamples()]) {
      const code = codeOnly(s.code);
      const defined = definedNames(code);
      for (const name of globalCalls(code)) {
        expect(
          KNOWN.has(name) || defined.has(name),
          `${s.where} calls ${name}`,
        ).toBe(true);
      }
    }
  });

  it("the honesty check itself sees through strings, comments and definitions", () => {
    const code = codeOnly(
      '-- frob()\nlocal function helper(cb) cb() end\nsend("nope(1)")\nfoo(1)\nx:bar()\nstring.format("%d", 1)',
    );
    const calls = globalCalls(code);
    expect(calls).toEqual(["helper", "cb", "send", "foo"]);
    const defined = definedNames(code);
    expect(defined.has("helper") && defined.has("cb")).toBe(true);
    expect(defined.has("foo")).toBe(false);
  });
});

describe("API reference entries", () => {
  it("documents every function with parameters and an example", () => {
    for (const d of SCRIPT_API) {
      expect(d.example, d.name).toBeTruthy();
      if (d.kind !== "function") continue;
      expect(Array.isArray(d.params), d.name).toBe(true);
      for (const p of d.params!) {
        expect(d.sig.includes(p.name), `${d.name}: ${p.name}`).toBe(true);
        expect(p.doc.length, `${d.name}: ${p.name}`).toBeGreaterThan(3);
      }
    }
    for (const t of HEADER_TAGS) {
      expect(t.example, t.name).toBeTruthy();
      expect(
        t.example!.split("\n").every((l) => l.startsWith(`-- ${t.name}`)),
        t.name,
      ).toBe(true);
    }
  });

  it("keeps examples short and free of tabs", () => {
    for (const d of [...SCRIPT_API, ...HEADER_TAGS]) {
      const lines = d.example!.split("\n");
      expect(lines.length, d.name).toBeLessThanOrEqual(8);
      expect(d.example!.includes("\t"), d.name).toBe(false);
    }
  });
});
